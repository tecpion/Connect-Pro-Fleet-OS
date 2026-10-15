import { useRef, useState } from "react";
import type { VehicleFile } from "@/lib/types";
import { X, Upload, FileText, ImageIcon } from "lucide-react";
import { toast } from "sonner";

// Mock: object URLs; swap for Supabase storage uploads later.
function filesToVehicleFiles(files: FileList | null): VehicleFile[] {
  return files
    ? Array.from(files).map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        size: f.size,
        type: f.type,
      }))
    : [];
}

export function VehicleFileUploads({
  images,
  documents,
  onChange,
}: {
  images: VehicleFile[];
  documents: VehicleFile[];
  onChange: (patch: {
    images?: VehicleFile[];
    documents?: VehicleFile[];
  }) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const addImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onChange({ images: [...images, ...filesToVehicleFiles(files)] });
    toast.success(`${files.length} image${files.length > 1 ? "s" : ""} added.`);
  };
  const addDocuments = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onChange({ documents: [...documents, ...filesToVehicleFiles(files)] });
    toast.success(`${files.length} file${files.length > 1 ? "s" : ""} added.`);
  };

  return (
    <>
      {/* Vehicle images */}
      <div>
        <label className="text-sm font-medium">Vehicle images</label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          Upload multiple photos — exterior, interior, any angle.
        </p>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addImages(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <ImageIcon size={16} />
          {images.length > 0
            ? `Add more (${images.length} added)`
            : "Click to upload images"}
        </button>
        {images.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img) => (
              <div
                key={img.url}
                className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      images: images.filter((i) => i.url !== img.url),
                    })
                  }
                  className="absolute right-1 top-1 rounded-full bg-night/80 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Remove ${img.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div>
        <label className="text-sm font-medium">Documents & files</label>
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
          Registration, insurance, title, inspection reports — any file type.
        </p>
        <input
          ref={docInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addDocuments(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => docInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Upload size={16} />
          {documents.length > 0
            ? `Add more (${documents.length} added)`
            : "Click to upload documents"}
        </button>
        {documents.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {documents.map((doc) => (
              <li
                key={doc.url}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2 text-sm text-foreground hover:text-primary"
                >
                  <FileText
                    size={14}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{doc.name}</span>
                  <span className="shrink-0 font-mono text-xs tabular text-muted-foreground">
                    {(doc.size / 1024).toFixed(0)} KB
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      documents: documents.filter((d) => d.url !== doc.url),
                    })
                  }
                  className="shrink-0 text-muted-foreground hover:text-out"
                  aria-label={`Remove ${doc.name}`}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
