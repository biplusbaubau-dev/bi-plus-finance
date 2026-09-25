import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const caption = (formData.get("caption") as string) || null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Verify unit exists
  const unit = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });

  // Validate type
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const uploadDir = join(process.cwd(), "public", "uploads", "units");
  if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${id}_${Date.now()}.${ext}`;
  const filepath = join(uploadDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  const image = await prisma.unitImage.create({
    data: {
      inventoryItemId: id,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      caption,
    },
  });

  return NextResponse.json(image);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const images = await prisma.unitImage.findMany({
    where: { inventoryItemId: id },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json(images);
}
