// Connect Pro Fleet — private storage helpers (Build #22).
//
// Uploads to private Supabase Storage buckets with organization-scoped paths
// and returns short-lived signed URLs for viewing. Paths are structured as
// {organization_id}/{entity_type}/{entity_id}/{uuid}-{filename} so the storage
// RLS policy (which checks the first path segment against membership) enforces
// tenant isolation. We persist `storage_path` (never a permanent public URL)
// and generate a signed URL on demand.
//
// In memory mode (no Supabase config) uploads return a placeholder path so
// the existing seeded/mock display keeps working without a backend.

import { getSupabase } from "./client";

export const STORAGE_BUCKETS = [
  "vehicle-documents",
  "inspection-evidence",
  "damage-evidence",
  "expense-receipts",
  "maintenance-receipts",
  "rental-agreements",
  "customer-documents",
  "avatars",
] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

export interface UploadResult {
  storagePath: string;
  bucket: StorageBucket;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export class StorageError extends Error {
  constructor(
    message: string,
    public code:
      | "unauthorized"
      | "invalid_file"
      | "too_large"
      | "upload_failed"
      | "not_configured",
  ) {
    super(message);
  }
}

/** Build the organization-scoped storage path. Never trust the filename for
 *  security — the org id is the first segment and enforced by RLS. */
export function buildStoragePath(
  organizationId: string,
  entityType: string,
  entityId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uid = Math.random().toString(36).slice(2, 10);
  return `${organizationId}/${entityType}/${entityId}/${uid}-${safeName}`;
}

/** Validate file type/size client-side (server validation is the authority). */
export function validateFile(file: File): void {
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new StorageError("Unsupported file type.", "invalid_file");
  }
  if (file.size > MAX_BYTES) {
    throw new StorageError("File exceeds 10 MB limit.", "too_large");
  }
}

/** Upload a file to a private bucket. Returns the storage path + metadata.
 *  In memory mode returns a placeholder path (no real upload). */
export async function uploadPrivateFile(args: {
  bucket: StorageBucket;
  organizationId: string;
  entityType: string;
  entityId: string;
  file: File;
}): Promise<UploadResult> {
  validateFile(args.file);
  const supabase = getSupabase();
  const storagePath = buildStoragePath(
    args.organizationId,
    args.entityType,
    args.entityId,
    args.file.name,
  );
  if (!supabase) {
    // Memory mode: return placeholder path so mock display keeps working.
    return {
      storagePath,
      bucket: args.bucket,
      fileName: args.file.name,
      mimeType: args.file.type,
      sizeBytes: args.file.size,
    };
  }
  const { error } = await supabase.storage
    .from(args.bucket)
    .upload(storagePath, args.file, {
      contentType: args.file.type,
      upsert: false,
    });
  if (error) {
    throw new StorageError(error.message, "upload_failed");
  }
  return {
    storagePath,
    bucket: args.bucket,
    fileName: args.file.name,
    mimeType: args.file.type,
    sizeBytes: args.file.size,
  };
}

/** Generate a short-lived signed URL for viewing a private file. Returns null
 *  in memory mode (the placeholder path is not fetchable). */
export async function createSignedUrl(
  bucket: StorageBucket,
  storagePath: string,
  expiresInSec = 60,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Remove a file (admin only via storage policy). Soft-delete via DB metadata
 *  is preferred; this is for explicit cleanup. */
export async function removePrivateFile(
  bucket: StorageBucket,
  storagePath: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.storage.from(bucket).remove([storagePath]);
}
