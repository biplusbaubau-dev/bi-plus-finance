"use client";
import { useState, useRef } from "react";

type Image = {
  id: string;
  filename: string;
  originalName: string;
  caption: string | null;
  uploadedAt: Date | string;
  size: number;
};

export function UnitImageGallery({ unitId, images }: { unitId: string; images: Image[] }) {
  const [imgs, setImgs] = useState<Image[]>(images);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Image | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("caption", "");

      try {
        const res = await fetch(`/api/units/${unitId}/images`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const newImg = await res.json();
          setImgs((prev) => [newImg, ...prev]);
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    setUploading(false);
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm("Hapus foto ini?")) return;
    const res = await fetch(`/api/images/${imageId}`, { method: "DELETE" });
    if (res.ok) {
      setImgs((prev) => prev.filter((i) => i.id !== imageId));
      if (preview?.id === imageId) setPreview(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleUpload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />
        <p className="text-xs font-medium text-zinc-600">
          {uploading ? "Uploading..." : "Tap atau drag foto 3uTools"}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          JPG, PNG, HEIC · max 10MB · bisa banyak sekaligus
        </p>
      </div>

      {/* Gallery grid */}
      {imgs.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {imgs.map((img) => (
            <div
              key={img.id}
              className="group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-200"
              onClick={() => setPreview(img)}
            >
              <img
                src={`/uploads/units/${img.filename}`}
                alt={img.originalName}
                className="h-20 w-full object-cover"
              />
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                className="absolute right-1 top-1 hidden rounded-full bg-red-500 p-1 text-white group-hover:block"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-zinc-400">
          Belum ada screenshot
        </p>
      )}

      {/* Full preview */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreview(null)}
        >
          <div className="max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={`/uploads/units/${preview.filename}`}
              alt={preview.originalName}
              className="max-h-[85vh] rounded-lg object-contain"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-300">
              <span>{preview.originalName} · {formatSize(preview.size)}</span>
              <button
                onClick={() => handleDelete(preview.id)}
                className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
