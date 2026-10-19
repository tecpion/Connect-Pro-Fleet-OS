import type { SupabaseClient } from "@supabase/supabase-js";

function accessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error))
    return false;
  return [400, 401, 403, 404].includes(Number(error.statusCode));
}

/** Live storage proof requires a successful owner control AND denied foreign reads. */
export async function verifyPhase5PrivateDocument(
  owner: Pick<SupabaseClient, "storage">,
  foreign: Pick<SupabaseClient, "storage">,
  bucket: string,
  path: string,
): Promise<boolean> {
  const upload = await owner.storage
    .from(bucket)
    .upload(path, new Blob(["%PDF-1.4\n% Phase5 isolation fixture\n%%EOF"]), {
      contentType: "application/pdf",
    });
  if (upload.error) throw upload.error;
  const own = await owner.storage.from(bucket).download(path);
  const ownUrl = await owner.storage.from(bucket).createSignedUrl(path, 60);
  const other = await foreign.storage.from(bucket).download(path);
  const otherUrl = await foreign.storage.from(bucket).createSignedUrl(path, 60);
  const leakedUrl = otherUrl.data?.signedUrl;
  return (
    !own.error &&
    !!own.data &&
    !ownUrl.error &&
    !!ownUrl.data?.signedUrl &&
    accessDenied(other.error) &&
    !other.data &&
    accessDenied(otherUrl.error) &&
    !leakedUrl
  );
}
