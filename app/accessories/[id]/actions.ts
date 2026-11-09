"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteAccessory(form: FormData) {
  const id = String(form.get("id"));
  await prisma.accessory.delete({ where: { id } });
  revalidatePath("/accessories");
  redirect(`/inventory?tab=aksesoris`);
}

export async function deleteAccessoryTransaction(form: FormData) {
  const id = String(form.get("id"));
  const trx = await prisma.accessoryTransaction.findUnique({
    where: { id },
    include: { accessory: true },
  });
  if (!trx) return;

  await prisma.$transaction(async (tx) => {
    if (trx.type === "PURCHASE") {
      await tx.accessory.update({
        where: { id: trx.accessoryId },
        data: { stock: { decrement: trx.quantity } },
      });
      const cash = await tx.cashTransaction.findFirst({
        where: { type: "EXPENSE", expense: trx.totalPrice, paymentMethod: trx.paymentMethod },
        orderBy: { createdAt: "desc" },
      });
      if (cash) await tx.cashTransaction.delete({ where: { id: cash.id } });
    } else if (trx.type === "SALE") {
      await tx.accessory.update({
        where: { id: trx.accessoryId },
        data: { stock: { increment: trx.quantity } },
      });
      if (trx.paymentMethod === "PAYLATER") {
        const income = await tx.otherIncome.findFirst({
          where: { amount: trx.totalPrice, paymentMethod: "PAYLATER", source: { contains: trx.accessory.name } },
          orderBy: { createdAt: "desc" },
        });
        if (income) await tx.otherIncome.delete({ where: { id: income.id } });
      } else {
        const cash = await tx.cashTransaction.findFirst({
          where: { type: "OTHER_INCOME", income: trx.totalPrice, paymentMethod: trx.paymentMethod },
          orderBy: { createdAt: "desc" },
        });
        if (cash) await tx.cashTransaction.delete({ where: { id: cash.id } });
      }
    }
    await tx.accessoryTransaction.delete({ where: { id } });
  });

  revalidatePath(`/accessories/${trx.accessoryId}`);
  revalidatePath("/inventory");
}
