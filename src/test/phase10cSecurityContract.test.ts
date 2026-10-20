// Phase 10C — focused security-contract verification for the HighLevel webhook
// signature header + encoding. Kept in its own file so the main ingest suite
// stays under its size ceiling.
//
// Asserts the production contract:
//   - the route reads the HTTP header `x-ghl-signature` (GHL_SIGNATURE_HEADER)
//   - the signature is Ed25519, base64-encoded (NOT hex)
//   - Ed25519 verification runs over the raw body before JSON parsing
//   - a valid signature verifies; an invalid/missing/malformed signature is rejected
//   - an `X-CRM-Signature` header alone does NOT authenticate a HighLevel
//     webhook (it is not the provider contract header)

import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  verifyHighLevelSignature,
  GHL_SIGNATURE_HEADER,
} from "@/lib/supabase/ghlWebhookVerify";

async function makeKeyPair(): Promise<CryptoKeyPair> {
  return (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
}

async function signRawBase64(privateKey: CryptoKey, body: Uint8Array) {
  const sig = await webcrypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    body,
  );
  return Buffer.from(new Uint8Array(sig)).toString("base64");
}

async function exportPublicKeyHex(kp: CryptoKeyPair) {
  const raw = await webcrypto.subtle.exportKey("raw", kp.publicKey);
  return Buffer.from(new Uint8Array(raw)).toString("hex");
}

function contactPayload() {
  return {
    contactId: "hl-contact-sec",
    locationId: "loc-a",
    firstName: "Jane",
    lastName: "Doe",
    phone: "+15551234567",
    email: "jane@example.com",
  };
}

/** Resolve the signature exactly as the route does (header -> null). */
function routeSignature(headers: Headers): string | null {
  return (
    headers.get(GHL_SIGNATURE_HEADER) ?? headers.get("x-ghl-signature") ?? null
  );
}

describe("Phase 10C HighLevel webhook security contract", () => {
  it("the route reads the provider contract header x-ghl-signature", () => {
    expect(GHL_SIGNATURE_HEADER).toBe("x-ghl-signature");
  });

  it("a valid X-GHL-Signature (base64 Ed25519) over the raw body verifies", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRawBase64(kp.privateKey, body);
    const headers = new Headers();
    headers.set(GHL_SIGNATURE_HEADER, sig);
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureBase64: routeSignature(headers),
      publicKey: pub,
    });
    expect(r.ok).toBe(true);
  });

  it("missing X-GHL-Signature is rejected", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const headers = new Headers();
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureBase64: routeSignature(headers),
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_signature");
  });

  it("a malformed (non-base64) X-GHL-Signature is rejected", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const headers = new Headers();
    headers.set(GHL_SIGNATURE_HEADER, "!!!not-base64!!!");
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureBase64: routeSignature(headers),
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_signature");
  });

  it("a correctly base64-encoded but cryptographically invalid signature is rejected", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    // Valid base64 of 64 zero bytes — right shape, wrong signature.
    const forged = Buffer.alloc(64).toString("base64");
    const headers = new Headers();
    headers.set(GHL_SIGNATURE_HEADER, forged);
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureBase64: routeSignature(headers),
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_signature");
  });

  it("an X-CRM-Signature header alone does NOT authenticate a HighLevel webhook", async () => {
    // The route resolves the signature from GHL_SIGNATURE_HEADER only. A
    // request carrying only an "X-CRM-Signature" header must yield no
    // signature and therefore be rejected — it must never be accepted as auth.
    const headers = new Headers();
    headers.set("X-CRM-Signature", "deadbeef");
    expect(routeSignature(headers)).toBeNull();
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureBase64: routeSignature(headers),
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_signature");
  });

  it("verification runs over the raw body before JSON parsing (byte-exact)", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const raw = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRawBase64(kp.privateKey, raw);
    // Same JSON, different bytes (trailing space) — must fail.
    const sameJsonDifferentBytes = new TextEncoder().encode(
      JSON.stringify(contactPayload()) + " ",
    );
    const r = await verifyHighLevelSignature({
      rawBody: sameJsonDifferentBytes,
      signatureBase64: sig,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
  });

  it("tampering one byte of the raw body causes verification failure", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const raw = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRawBase64(kp.privateKey, raw);
    // Flip one byte in the middle of the raw stream.
    const tampered = new Uint8Array(raw);
    const i = Math.floor(tampered.length / 2);
    tampered[i] = tampered[i] === 0x20 ? 0x21 : 0x20;
    const r = await verifyHighLevelSignature({
      rawBody: tampered,
      signatureBase64: sig,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_signature");
  });
});
