// Phase 10C — HighLevel → Fleet Lead inbound webhook + idempotent sync tests.
//
// Pure-TypeScript (no live DB) so the Phase 10C contract is locked in
// regardless of transient Cloud connectivity. Covers:
//   - Ed25519 signature verification (valid/invalid/missing/raw-before-parse)
//   - contact.created → new Lead; contact.updated → same Lead (no dup)
//   - same webhook twice → no duplicate; same contact through different
//     events → same Lead
//   - external contact reference creation + reuse
//   - normalized email + phone fallback; ambiguous fallback → review + new Lead
//   - custom intake JSON preserved; missing custom fields accepted
//   - unknown location rejected; disabled integration rejected; forged Fleet
//     organization_id ignored/rejected
//   - tenant isolation (Org A location cannot write Org B Lead)
//   - CRM update does not reset staff Lead status
//   - CRM event cannot overwrite rental-operational fields
//   - no automatic Customer / BookingRequest created
//   - failure/review item recorded; partial-failure retry converges idempotently

import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import {
  verifyHighLevelSignature,
  decodeHighLevelPublicKey,
  GHL_SIGNATURE_HEADER,
} from "@/lib/supabase/ghlWebhookVerify";
import {
  ingestCrmContactEvent,
  crmEventKey,
  crmContactIdempotencyKey,
  normalizeHighLevelContact,
  type LeadIngestDeps,
  type LeadIngestResult,
} from "@/lib/supabase/phase10Ingest";
import type { Lead } from "@/lib/leadTypes";

// ── Ed25519 test fixtures ──────────────────────────────────────────────
async function makeKeyPair(): Promise<CryptoKeyPair> {
  return (await webcrypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
}

async function signRaw(privateKey: CryptoKey, body: Uint8Array) {
  const sig = await webcrypto.subtle.sign({ name: "Ed25519" }, privateKey, body);
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

async function exportPublicKeyHex(kp: CryptoKeyPair) {
  const raw = await webcrypto.subtle.exportKey("raw", kp.publicKey);
  return Buffer.from(new Uint8Array(raw)).toString("hex");
}

// ── In-memory ingest fixture (a fake CRM location → Fleet org map + a
//    lead store + event/review/idempotency records). Mirrors what the route
//    would persist through Supabase under RLS in production.
interface FixtureState {
  orgByLocation: Map<string, { orgId: string; enabled: boolean }>;
  leads: Map<string, Lead>;
  refs: Map<string, string>; // `${orgId}:${externalId}` -> leadId
  events: Map<string, { id: string; status: string; duplicate: boolean }>;
  reviews: Array<{ orgId: string; reason: string; type: string }>;
  idem: Set<string>;
  insertFailNext: boolean;
  updateFailNext: boolean;
}

function makeFixture(): FixtureState {
  return {
    orgByLocation: new Map([
      ["loc-a", { orgId: "org-a", enabled: true }],
      ["loc-b", { orgId: "org-b", enabled: true }],
      ["loc-disabled", { orgId: "org-c", enabled: false }],
    ]),
    leads: new Map(),
    refs: new Map(),
    events: new Map(),
    reviews: [],
    idem: new Set(),
    insertFailNext: false,
    updateFailNext: false,
  };
}

function deps(state: FixtureState): LeadIngestDeps {
  return {
    async resolveOrgByLocation(loc) {
      const m = state.orgByLocation.get(loc);
      if (!m) return { ok: false, reason: "unknown_location" };
      if (!m.enabled) return { ok: false, reason: "mapping_disabled" };
      return { ok: true, organization_id: m.orgId };
    },
    async findExternalContactRef(orgId, externalId) {
      const id = state.refs.get(`${orgId}:${externalId}`);
      return id ? { internal_id: id, external_id: externalId } : null;
    },
    async upsertExternalContactRef(orgId, externalId, internalId) {
      state.refs.set(`${orgId}:${externalId}`, internalId);
    },
    async listLeads(orgId) {
      return [...state.leads.values()].filter((l) => l.organization_id === orgId);
    },
    async insertLead(lead) {
      if (state.insertFailNext) {
        state.insertFailNext = false;
        throw new Error("insert failed");
      }
      state.leads.set(lead.id, lead);
      return lead;
    },
    async updateLead(orgId, id, patch) {
      if (state.updateFailNext) {
        state.updateFailNext = false;
        throw new Error("update failed");
      }
      const ex = state.leads.get(id);
      if (!ex) throw new Error("not found");
      const next = { ...ex, ...patch, id };
      state.leads.set(id, next);
      return next;
    },
    async recordEvent(input) {
      const existing = state.events.get(input.eventKey);
      if (existing) return { id: existing.id, duplicate: true };
      const id = `evt_${input.eventKey}`;
      state.events.set(input.eventKey, { id, status: "processing", duplicate: false });
      return { id, duplicate: false };
    },
    async markEventProcessed(eventId, ok) {
      for (const e of state.events.values()) {
        if (e.id === eventId) e.status = ok ? "succeeded" : "failed";
      }
    },
    async claimIdempotency(orgId, key) {
      const k = `${orgId}:${key}`;
      if (state.idem.has(k)) return false;
      state.idem.add(k);
      return true;
    },
    async createReview(input) {
      state.reviews.push({
        orgId: input.orgId,
        reason: input.reason,
        type: input.reviewType,
      });
      return `rev_${input.reason}`;
    },
  };
}

function contactPayload(over: Record<string, unknown> = {}) {
  return {
    contactId: "hl-contact-123",
    locationId: "loc-a",
    firstName: "Jane",
    lastName: "Doe",
    phone: "+15551234567",
    email: "jane@example.com",
    tags: ["rideshare"],
    ...over,
  };
}

// ── Signature verification ─────────────────────────────────────────────

describe("Phase 10C HighLevel Ed25519 signature verification", () => {
  it("valid signature verifies", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRaw(kp.privateKey, body);
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureHex: sig,
      publicKey: pub,
    });
    expect(r.ok).toBe(true);
  });

  it("invalid signature is rejected", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode(JSON.stringify(contactPayload()));
    const sig = await signRaw(kp.privateKey, body);
    const r = await verifyHighLevelSignature({
      rawBody: new TextEncoder().encode(JSON.stringify(contactPayload({ email: "x@y.com" }))),
      signatureHex: sig,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
  });

  it("missing signature is rejected (not a crash)", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    const body = new TextEncoder().encode("x");
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureHex: null,
      publicKey: pub,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_signature");
  });

  it("missing key is rejected", async () => {
    const body = new TextEncoder().encode("x");
    const r = await verifyHighLevelSignature({
      rawBody: body,
      signatureHex: "deadbeef",
      publicKey: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_key");
  });

  it("verification runs over the raw body before parsing (byte-exact)", async () => {
    const kp = await makeKeyPair();
    const pub = await exportPublicKeyHex(kp);
    // The provider signs the EXACT byte stream. A single whitespace difference
    // must fail verification even though the parsed JSON is identical.
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

  it("decodeHighLevelPublicKey accepts hex + base64 key encodings", () => {
    const hex = "a".repeat(64);
    expect(decodeHighLevelPublicKey(hex).length).toBe(32);
    // base64 of 32 zero bytes
    const b64 = Buffer.alloc(32).toString("base64");
    expect(decodeHighLevelPublicKey(b64).length).toBe(32);
  });

  it("the signature header name matches the provider contract", () => {
    expect(GHL_SIGNATURE_HEADER).toBe("x-ghl-signature");
  });
});

// ── Normalization ──────────────────────────────────────────────────────

describe("Phase 10C payload normalization", () => {
  it("maps standard contact fields + preserves custom intake JSON", () => {
    const r = normalizeHighLevelContact({
      contactId: "c1",
      locationId: "loc-a",
      firstName: "Jane",
      lastName: "Doe",
      phone: "+1",
      email: "JANE@Example.com",
      tags: ["a", "b"],
      desired_pickup_date: "2026-11-01",
      rental_type: "weekly",
      rideshare_platform: "Uber",
      custom_question_42: "yes",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.contact.external_contact_id).toBe("c1");
    expect(r.contact.email).toBe("jane@example.com");
    expect(r.contact.intake_data).toMatchObject({
      desired_pickup_date: "2026-11-01",
      rental_type: "weekly",
      rideshare_platform: "Uber",
      custom_question_42: "yes",
    });
    // Standard mapped fields are excluded from intake_data.
    expect(r.contact.intake_data).not.toHaveProperty("firstName");
  });

  it("missing custom fields are accepted (no fabrication)", () => {
    const r = normalizeHighLevelContact({
      contactId: "c1",
      firstName: "A",
      lastName: "B",
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.contact.intake_data).toEqual({});
    expect(r.contact.crm_opportunity_id).toBeNull();
  });

  it("rejects a payload missing the contact id", () => {
    expect(normalizeHighLevelContact({ firstName: "x" }).ok).toBe(false);
  });
});

// ── Ingest pipeline ─────────────────────────────────────────────────────

describe("Phase 10C contact.created → new Lead", () => {
  it("creates one Lead with status new in the resolved org", async () => {
    const f = makeFixture();
    const res = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    expect(res.ok).toBe(true);
    expect(res.created).toBe(true);
    expect(res.lead_id).toBeTruthy();
    const lead = f.leads.get(res.lead_id!);
    expect(lead?.status).toBe("new");
    expect(lead?.organization_id).toBe("org-a");
    expect(lead?.source).toBe("connect_pro_crm");
  });
});

describe("Phase 10C contact.updated → same Lead (no duplicate)", () => {
  it("a created then updated contact converges to one Lead", async () => {
    const f = makeFixture();
    const c1 = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    const c2 = await ingestCrmContactEvent({
      eventType: "contact.updated",
      rawPayload: contactPayload({ email: "jane2@example.com", external_event_id: "evt2" }),
      deps: deps(f),
    });
    expect(c1.lead_id).toBe(c2.lead_id);
    expect(f.leads.size).toBe(1);
    expect(f.leads.get(c1.lead_id!)?.email).toBe("jane2@example.com");
  });
});

describe("Phase 10C idempotency", () => {
  it("same webhook delivered twice → no duplicate Lead", async () => {
    const f = makeFixture();
    const payload = contactPayload();
    const first = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: payload,
      deps: deps(f),
    });
    const second = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: payload,
      deps: deps(f),
    });
    expect(second.duplicate).toBe(true);
    expect(f.leads.size).toBe(1);
    expect(second.lead_id).toBe(first.lead_id);
  });

  it("same contact through different events → same Lead", async () => {
    const f = makeFixture();
    const payload1 = { ...contactPayload(), eventId: "e1" };
    const payload2 = { ...contactPayload(), eventId: "e2" };
    const a = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: payload1,
      deps: deps(f),
    });
    const b = await ingestCrmContactEvent({
      eventType: "contact.updated",
      rawPayload: payload2,
      deps: deps(f),
    });
    expect(a.lead_id).toBe(b.lead_id);
  });

  it("event key derivation is stable per (org, type, contact, event)", () => {
    const k = crmEventKey("org-a", "contact.created", "c1", "e1");
    expect(k).toBe(crmEventKey("org-a", "contact.created", "c1", "e1"));
    expect(k).not.toBe(crmEventKey("org-a", "contact.updated", "c1", "e1"));
    expect(crmContactIdempotencyKey("org-a", "c1")).not.toBe(
      crmContactIdempotencyKey("org-b", "c1"),
    );
  });
});

describe("Phase 10C external contact reference", () => {
  it("creates the reference on first ingest and reuses it on the next", async () => {
    const f = makeFixture();
    await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    expect(f.refs.get("org-a:hl-contact-123")).toBeTruthy();
    // A second event for the same contact resolves via the reference.
    const r2 = await ingestCrmContactEvent({
      eventType: "contact.updated",
      rawPayload: { ...contactPayload(), eventId: "e2" },
      deps: deps(f),
    });
    expect(r2.lead_id).toBe(f.refs.get("org-a:hl-contact-123"));
  });
});

describe("Phase 10C normalized fallback matching", () => {
  it("email fallback resolves to the existing Lead", async () => {
    const f = makeFixture();
    // Seed a Lead with the same email but NO external reference (simulating a
    // pre-existing manual lead).
    const seed: Lead = {
      id: "lead_seed",
      organization_id: "org-a",
      first_name: "Jane",
      last_name: "Doe",
      phone: "",
      email: "jane@example.com",
      source: "manual",
      status: "new",
      tags: [],
      crm_opportunity_id: null,
      crm_pipeline_stage: null,
      lead_source: null,
      intake_data: {},
      notes: "",
      converted_booking_request_id: null,
      converted_at: null,
      created_by: null,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    };
    f.leads.set(seed.id, seed);
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ phone: "+15559990000" }),
      deps: deps(f),
    });
    expect(r.lead_id).toBe("lead_seed");
  });

  it("phone fallback resolves to the existing Lead", async () => {
    const f = makeFixture();
    const seed: Lead = {
      id: "lead_seed",
      organization_id: "org-a",
      first_name: "Jane",
      last_name: "Doe",
      phone: "+15551234567",
      email: "",
      source: "manual",
      status: "new",
      tags: [],
      crm_opportunity_id: null,
      crm_pipeline_stage: null,
      lead_source: null,
      intake_data: {},
      notes: "",
      converted_booking_request_id: null,
      converted_at: null,
      created_by: null,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    };
    f.leads.set(seed.id, seed);
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ email: "other@example.com" }),
      deps: deps(f),
    });
    expect(r.lead_id).toBe("lead_seed");
  });

  it("ambiguous fallback creates a review item + a distinct new Lead (no unsafe merge)", async () => {
    const f = makeFixture();
    const a: Lead = {
      id: "lead_a",
      organization_id: "org-a",
      first_name: "A",
      last_name: "Z",
      phone: "+15551234567",
      email: "a@x.com",
      source: "manual",
      status: "new",
      tags: [],
      crm_opportunity_id: null,
      crm_pipeline_stage: null,
      lead_source: null,
      intake_data: {},
      notes: "",
      converted_booking_request_id: null,
      converted_at: null,
      created_by: null,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    };
    const b: Lead = { ...a, id: "lead_b", phone: "+1999", email: "jane@example.com" };
    f.leads.set(a.id, a);
    f.leads.set(b.id, b);
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(), // phone matches a, email matches b
      deps: deps(f),
    });
    expect(r.ok).toBe(true);
    expect(f.leads.size).toBe(3); // a + b + new distinct
    expect(f.reviews.length).toBe(1);
    expect(f.reviews[0].type).toBe("ambiguous_contact_match");
  });
});

describe("Phase 10C unknown / disabled / forged org resolution", () => {
  it("unknown location is rejected (no Lead, no ref)", async () => {
    const f = makeFixture();
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ locationId: "loc-unknown" }),
      deps: deps(f),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unknown_location");
    expect(f.leads.size).toBe(0);
  });

  it("disabled integration is rejected", async () => {
    const f = makeFixture();
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ locationId: "loc-disabled" }),
      deps: deps(f),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("mapping_disabled");
  });

  it("a forged Fleet organization_id in the payload is ignored — org comes from the location map", async () => {
    const f = makeFixture();
    // Payload claims org-b but the location maps to org-a.
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ organization_id: "org-b", locationId: "loc-a" }),
      deps: deps(f),
    });
    expect(r.ok).toBe(true);
    expect(f.leads.get(r.lead_id!)?.organization_id).toBe("org-a");
  });

  it("Org A CRM location cannot write a Lead into Org B", async () => {
    const f = makeFixture();
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ locationId: "loc-a" }), // loc-a -> org-a
      deps: deps(f),
    });
    expect(r.ok).toBe(true);
    // A second contact from loc-b lands in org-b, never touching org-a.
    const r2 = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ contactId: "hl-contact-b", locationId: "loc-b" }),
      deps: deps(f),
    });
    const a = f.leads.get(r.lead_id!)!;
    const b = f.leads.get(r2.lead_id!)!;
    expect(a.organization_id).toBe("org-a");
    expect(b.organization_id).toBe("org-b");
    // A loc-b contact cannot resolve to a loc-a lead id.
    expect(f.refs.has(`org-a:hl-contact-b`)).toBe(false);
  });
});

describe("Phase 10C status preservation + operational isolation", () => {
  it("a CRM update does NOT reset a staff-set Lead status back to new", async () => {
    const f = makeFixture();
    const created = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    const id = created.lead_id!;
    f.leads.get(id)!.status = "qualified";
    f.leads.get(id)!.converted_booking_request_id = "brq_x";
    await ingestCrmContactEvent({
      eventType: "contact.updated",
      rawPayload: { ...contactPayload(), eventId: "e2", email: "new@example.com" },
      deps: deps(f),
    });
    const lead = f.leads.get(id)!;
    expect(lead.status).toBe("qualified"); // preserved
    expect(lead.email).toBe("new@example.com"); // contact field updated
    expect(lead.converted_booking_request_id).toBe("brq_x"); // untouched
  });

  it("a CRM event never writes rental-operational fields (no balance/vehicle/rental)", async () => {
    const f = makeFixture();
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload({ vehicle_id: "veh1", balance: 500, active_rental: true }),
      deps: deps(f),
    });
    const lead = f.leads.get(r.lead_id!);
    expect(lead).not.toHaveProperty("balance");
    expect(lead).not.toHaveProperty("vehicle_id");
    expect(lead).not.toHaveProperty("active_rental");
  });

  it("ingest never creates a Customer or BookingRequest", async () => {
    const f = makeFixture();
    await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    // The fixture exposes no customer/booking stores; the lead store is the
    // only effect. Assert the only keys are the Lead ids.
    expect([...f.leads.keys()].every((k) => k.startsWith("lead"))).toBe(true);
    expect(f.refs.size).toBe(1);
  });
});

describe("Phase 10C failure + partial-failure retry", () => {
  it("a processing failure after a valid auth records a review/failure state", async () => {
    const f = makeFixture();
    f.insertFailNext = true;
    const r = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("processing_failed");
    // Event should be marked failed (observable, not silently dropped).
    expect([...f.events.values()].some((e) => e.status === "failed")).toBe(true);
  });

  it("a partial-failure retry converges idempotently on one Lead", async () => {
    const f = makeFixture();
    // First delivery: Lead insert succeeds, but the external reference write is
    // lost (simulate a partial by clearing the ref after the first run).
    const first = await ingestCrmContactEvent({
      eventType: "contact.created",
      rawPayload: contactPayload(),
      deps: deps(f),
    });
    f.refs.delete("org-a:hl-contact-123");
    // A LATER contact.updated event (different event_key) must converge on the
    // SAME Lead — it finds the existing Lead by external contact id (primary)
    // or by a conservative phone/email fallback, never creating a duplicate.
    const retry = await ingestCrmContactEvent({
      eventType: "contact.updated",
      rawPayload: { ...contactPayload(), eventId: "e2" },
      deps: deps(f),
    });
    expect(retry.ok).toBe(true);
    expect(retry.lead_id).toBe(first.lead_id);
    expect(f.leads.size).toBe(1);
    expect(f.refs.get("org-a:hl-contact-123")).toBe(first.lead_id);
  });
});