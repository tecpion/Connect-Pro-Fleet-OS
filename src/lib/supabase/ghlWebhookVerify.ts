// Connect Pro Fleet — Phase 10C HighLevel webhook signature verification.
//
// Server-only utility. HighLevel standard platform webhooks are signed with
// Ed25519: the provider signs the raw request body and attaches the signature
// in the X-GHL-Signature header as a lowercase hex string. Verification uses
// the provider's Ed25519 public key (configurable per environment) over the
// RAW request bytes BEFORE any JSON parsing — the byte stream the provider
// signed must match the byte stream we verify exactly.
//
// This module deliberately depends only on the standard WebCrypto API
// (globalThis.crypto.subtle, available in Node >= 16 and the Edge runtime) so
// it is testable in vitest without a third-party crypto package. The public key
// and header name are injected (never hardcoded) so verification material is
// never present in the client bundle.

/**
 * The header HighLevel attaches the Ed25519 signature to (lowercase hex).
 * Exported so tests/routes can assert the contract without a magic string.
 */
export const GHL_SIGNATURE_HEADER = "x-ghl-signature";

/** Result of verifying a webhook signature. */
export interface VerifyResult {
  ok: boolean;
  reason?: "missing_signature" | "missing_key" | "invalid_signature";
}

/**
 * Decode a hex string to a Uint8Array. Throws on malformed hex so the caller
 * surfaces a clean verification failure rather than a silent accept.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error("invalid hex length");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = hex.charCodeAt(i * 2);
    const lo = hex.charCodeAt(i * 2 + 1);
    out[i] = (nibble(hi) << 4) | nibble(lo);
  }
  return out;
}

/** Decode a single hex char (0-9, a-f, A-F) to its 0-15 value. */
function nibble(c: number): number {
  if (c >= 48 && c <= 57) return c - 48; // 0-9
  if (c >= 97 && c <= 102) return c - 97 + 10; // a-f
  if (c >= 65 && c <= 70) return c - 65 + 10; // A-F
  throw new Error("invalid hex character");
}

/**
 * Decode the Ed25519 public key. The key may be supplied as:
 *   - a base64 string (HighLevel commonly publishes the key base64-encoded)
 *   - a hex string (32 bytes / 64 hex chars)
 * Returns the 32 raw key bytes.
 */
export function decodeHighLevelPublicKey(key: string): Uint8Array {
  const trimmed = key.trim();
  if (trimmed.length === 0) throw new Error("empty key");
  // 32 raw bytes encoded as 64 hex chars.
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  // Base64 (url-safe tolerant) of 32 raw bytes -> ~43-44 chars.
  const b64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/**
 * Verify a HighLevel webhook signature against the RAW request body.
 *
 * Contract (per HighLevel platform webhooks):
 *   - `rawBody` MUST be the exact bytes received (read before JSON.parse).
 *   - `signatureHex` is the value of the X-GHL-Signature header (lowercase hex).
 *   - `publicKey` is the provider's Ed25519 public key (hex or base64).
 *
 * Returns `{ ok: true }` on a valid signature and a categorized failure
 * otherwise. Never throws — a verification failure is a verification failure,
 * not a crash.
 */
export async function verifyHighLevelSignature(args: {
  rawBody: Uint8Array;
  signatureHex: string | null | undefined;
  publicKey: string | null | undefined;
}): Promise<VerifyResult> {
  const { rawBody, signatureHex, publicKey } = args;
  if (!publicKey) return { ok: false, reason: "missing_key" };
  if (!signatureHex) return { ok: false, reason: "missing_signature" };
  let sigBytes: Uint8Array;
  try {
    sigBytes = hexToBytes(signatureHex.trim().toLowerCase());
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeHighLevelPublicKey(publicKey);
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, reason: "invalid_signature" };
  // Copy into a fresh ArrayBuffer-backed view so the DOM lib's BufferSource
  // accepts it regardless of whether the source buffer is SharedArrayBuffer
  // (the TS lib variance error on Uint8Array<ArrayBufferLike>).
  const keySrc = new Uint8Array(keyBytes);
  const sigSrc = new Uint8Array(sigBytes);
  const bodySrc = new Uint8Array(rawBody);
  try {
    const cryptoKey = await subtle.importKey(
      "raw",
      keySrc,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const ok = await subtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      sigSrc,
      bodySrc,
    );
    return ok ? { ok: true } : { ok: false, reason: "invalid_signature" };
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
}
