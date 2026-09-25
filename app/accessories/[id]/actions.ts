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
