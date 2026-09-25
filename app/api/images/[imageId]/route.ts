import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import { join } from "path";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  const image = await prisma.unitImage.findUnique({ where: { id: imageId } });
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filepath = join(process.cwd(), "public", "uploads", "units", image.filename);
  try { await unlink(filepath); } catch {}

  await prisma.unitImage.delete({ where: { id: imageId } });
  return NextResponse.json({ success: true });
}
