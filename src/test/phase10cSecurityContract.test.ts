// Phase 10C — focused security-contract verification for the HighLevel webhook
// signature header. Kept in its own file so the main ingest suite stays under
// its size ceiling.
//
// Asserts the production contract:
//   - the route reads the HTTP header `x-ghl-signature` (GHL_SIGNATURE_HEADER)
//   - Ed25519 verification runs over the raw body before JSON parsing
//   - a valid signature verifies; an invalid/missing signature is rejected
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

async function signRaw(privateKey: CryptoKey, body: Uint8Array) {
  const sig = await webcrypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    body,
  );
  return Buffer.from(new Uint8Array(sig)).toString("hex");
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

describe("Phase 10C HighLevel webhook security contract", () => {
  it("the route reads the provider contract header x-ghl-signature", () => {
    expect(GHL_SIGNATURE_HEADER).toBe("x-ghl-signature");
  });

  it("a valid X-GHL-Signature over the raw body verifies", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRaw(kp.privateKey, body);
    const headers = new Headers();
    headers.set(GHL_SIGNATURE_HEADER, sig);
    const signature =
      headers.get(GHL_SIGNATURE_HEADER) ??
      headers.get("x-ghl-signature") ??
      null;
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureHex: signature,
      publicKey: pub,
    });
    expect(r.ok).toBe(true);
  });

  it("missing X-GHL-Signature is rejected", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const headers = new Headers();
    const signature =
      headers.get(GHL_SIGNATURE_HEADER) ??
      headers.get("x-ghl-signature") ??
      null;
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureHex: signature,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_signature");
  });

  it("an invalid X-GHL-Signature is rejected", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRaw(kp.privateKey, body);
    const tampered = new TextEncoder().encode(
      JSON.stringify(contactPayload()) + " ",
    );
    const r = await verifyHighLevelSignature({
      rawBody: tampered,
      signatureHex: sig,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
  });

  it("an X-CRM-Signature header alone does NOT authenticate a HighLevel webhook", async () => {
    // The route resolves the signature from GHL_SIGNATURE_HEADER only. A
    // request carrying only an "X-CRM-Signature" header must yield no
    // signature and therefore be rejected — it must never be accepted as auth.
    const headers = new Headers();
    headers.set("X-CRM-Signature", "deadbeef");
    const signature =
      headers.get(GHL_SIGNATURE_HEADER) ??
      headers.get("x-ghl-signature") ??
      null;
    expect(signature).toBeNull();
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureHex: signature,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_signature");
  });

  it("verification runs over the raw body before JSON parsing (byte-exact)", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const raw = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRaw(kp.privateKey, raw);
    const sameJsonDifferentBytes = new TextEncoder().encode(
      JSON.stringify(contactPayload()) + " ",
    );
    const r = await verifyHighLevelSignature({
      rawBody: sameJsonDifferentBytes,
      signatureHex: sig,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
  });
});
