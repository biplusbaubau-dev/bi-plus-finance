"use server";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function createPayLaterDebt(accessoryId: string, totalLiability: number, tenorMonths: number, label: string) {
  const code = `PL-ACC-${accessoryId.slice(-6).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;
  const debt = await prisma.payLaterDebt.create({
    data: { code, totalLiability, tenorMonths, startDate: new Date(), accessoryId },
  });
  const monthly = Math.floor(totalLiability / tenorMonths);
  const remainder = totalLiability - monthly * tenorMonths;
  for (let i = 0; i < tenorMonths; i++) {
    const due = new Date();
    due.setMonth(due.getMonth() + i + 1);
    due.setDate(25);
    await prisma.payLaterInstallment.create({
      data: { debtId: debt.id, installmentNo: i + 1, dueDate: due, amount: monthly + (i === tenorMonths - 1 ? remainder : 0), status: "PENDING" },
    });
  }
}

export async function createAccessory(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "").trim() || "Umum";
  const purchasePrice = Number(form.get("purchasePrice") ?? 0);
  const sellingPrice = Number(form.get("sellingPrice") ?? 0);
  const stock = Number(form.get("stock") ?? 0);
  const notes = String(form.get("notes") ?? "").trim() || null;
  const paymentMethod = (String(form.get("paymentMethod") ?? "CASH")) as any;

  const accessory = await prisma.accessory.create({
    data: { name, category, purchasePrice, sellingPrice, stock, notes },
  });

  if (stock > 0 && purchasePrice > 0) {
    const totalPrice = stock * purchasePrice;
    await prisma.accessoryTransaction.create({
      data: { accessoryId: accessory.id, type: "PURCHASE", quantity: stock, unitPrice: purchasePrice, totalPrice, paymentMethod, description: `Stok awal: ${name}` },
    });
    if (paymentMethod === "PAYLATER") {
      const formLiability = Number(form.get("totalLiability"));
      const totalLiability = isNaN(formLiability) || formLiability <= 0 ? totalPrice : formLiability;
      const formTenor = Number(form.get("tenorMonths"));
      const tenorMonths = isNaN(formTenor) || formTenor < 1 || formTenor > 12 ? 3 : formTenor;
      if (totalLiability < totalPrice) throw new Error("Total kewajiban PayLater tidak boleh kurang dari total harga.");
      await createPayLaterDebt(accessory.id, totalLiability, tenorMonths, name);
    } else {
      await prisma.cashTransaction.create({ data: { date: new Date(), type: "EXPENSE", description: `Beli ${name} (${stock}x)`, expense: totalPrice, paymentMethod } });
    }
  }

  revalidatePath("/inventory");
  redirect(`/inventory?tab=aksesoris`);
}

export async function purchaseAccessory(form: FormData) {
  const accessoryId = String(form.get("accessoryId"));
  const quantity = Number(form.get("quantity") ?? 0);
  const unitPrice = Number(form.get("unitPrice") ?? 0);
  const paymentMethod = (String(form.get("paymentMethod") ?? "CASH")) as any;
  const description = String(form.get("description") ?? "").trim() || null;

  if (quantity <= 0 || unitPrice <= 0) throw new Error("Qty dan harga harus > 0");

  const totalPrice = quantity * unitPrice;

  await prisma.$transaction(async (tx) => {
    await tx.accessoryTransaction.create({
      data: { accessoryId, type: "PURCHASE", quantity, unitPrice, totalPrice, paymentMethod, description },
    });
    await tx.accessory.update({
      where: { id: accessoryId },
      data: { stock: { increment: quantity }, purchasePrice: unitPrice },
    });
    if (paymentMethod === "PAYLATER") {
      const formLiability = Number(form.get("totalLiability"));
      const totalLiability = isNaN(formLiability) || formLiability <= 0 ? totalPrice : formLiability;
      const formTenor = Number(form.get("tenorMonths"));
      const tenorMonths = isNaN(formTenor) || formTenor < 1 || formTenor > 12 ? 3 : formTenor;
      if (totalLiability < totalPrice) throw new Error("Total kewajiban PayLater tidak boleh kurang dari total harga.");
      await createPayLaterDebt(accessoryId, totalLiability, tenorMonths, "restock");
    } else {
      await tx.cashTransaction.create({
        data: { date: new Date(), type: "EXPENSE", description: `Beli aksesoris (${quantity}x)`, expense: totalPrice, paymentMethod },
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory?tab=aksesoris`);
}

export async function sellAccessory(form: FormData) {
  const accessoryId = String(form.get("accessoryId"));
  const quantity = Number(form.get("quantity") ?? 0);
  const unitPrice = Number(form.get("unitPrice") ?? 0);
  const paymentMethod = (String(form.get("paymentMethod") ?? "CASH")) as any;
  const description = String(form.get("description") ?? "").trim() || null;

  if (quantity <= 0 || unitPrice <= 0) throw new Error("Qty dan harga harus > 0");

  const accessory = await prisma.accessory.findUnique({ where: { id: accessoryId } });
  if (!accessory) throw new Error("Aksesoris tidak ditemukan");
  if (accessory.stock < quantity) throw new Error(`Stok hanya ${accessory.stock}`);

  const totalPrice = quantity * unitPrice;

  await prisma.$transaction(async (tx) => {
    await tx.accessoryTransaction.create({
      data: { accessoryId, type: "SALE", quantity, unitPrice, totalPrice, paymentMethod, description },
    });
    await tx.accessory.update({
      where: { id: accessoryId },
      data: { stock: { decrement: quantity } },
    });
    if (paymentMethod === "PAYLATER") {
      const totalLiability = Number(form.get("totalLiability") ?? totalPrice);
      const tenorMonths = Number(form.get("tenorMonths") ?? 3);
      await tx.otherIncome.create({
        data: {
          date: new Date(),
          source: `Piutang aksesoris: ${accessory.name} (${quantity}x)`,
          amount: totalLiability,
          paymentMethod: "PAYLATER",
          notes: `Tenor ${tenorMonths} bulan. ${description ?? ""}`,
        },
      });
    } else {
      await tx.cashTransaction.create({
        data: { date: new Date(), type: "OTHER_INCOME", description: `Jual aksesoris (${quantity}x)`, income: totalPrice, paymentMethod },
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory?tab=aksesoris`);
}

export async function deleteAccessory(form: FormData) {
  const id = String(form.get("id"));
  await prisma.accessory.delete({ where: { id } });
  revalidatePath("/accessories");
  redirect(`/inventory?tab=aksesoris`);
}
