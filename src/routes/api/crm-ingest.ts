// Connect Pro Fleet — Phase 10C HighLevel → Fleet Lead inbound webhook route.
//
// POST /api/crm-ingest
//
// The production server-side path:
//   1. accept POST only
//   2. read the RAW request body before any JSON parsing
//   3. verify the HighLevel Ed25519 signature (X-GHL-Signature) over the raw
//      bytes using the provider public key (server env, never client code)
//   4. parse JSON only after a valid signature
//   5. resolve the HighLevel locationId → Fleet org SERVER-SIDE from the
//      stored CRM location mapping (never an incoming organization_id)
//   6. reject unknown/disabled mappings
//   7. build the durable event_key + idempotency identity
//   8. create/update the corresponding Fleet Lead (never a Customer /
//      BookingRequest / Reservation / Rental)
//   9. preserve integration event evidence + review/failure state
//  10. return an appropriate status without exposing internal secrets/errors
//
// Authentication failures are rejected (401) and do NOT become trusted
// integration records. Unknown/disabled locations are rejected (404/403).

import { createFileRoute } from "@tanstack/react-router";
import {
  verifyHighLevelSignature,
  GHL_SIGNATURE_HEADER,
} from "@/lib/supabase/ghlWebhookVerify";
import {
  ingestCrmContactEvent,
  isSupportedEventType,
} from "@/lib/supabase/phase10Ingest";
import type { Lead } from "@/lib/leadTypes";

const GHL_PUBLIC_KEY = () =>
  (typeof process !== "undefined"
    ? process.env?.GHL_WEBHOOK_PUBLIC_KEY
    : undefined) ?? undefined;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/crm-ingest")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // 1. POST only (this handler is only mounted on POST).
        // 2. Read the raw body as bytes before JSON parsing.
        let rawBytes: Uint8Array;
        try {
          rawBytes = new Uint8Array(await request.arrayBuffer());
        } catch {
          return json(400, { ok: false, error: "unreadable_body" });
        }
        const signature =
          request.headers.get(GHL_SIGNATURE_HEADER) ??
          request.headers.get("x-ghl-signature") ??
          null;
        const publicKey = GHL_PUBLIC_KEY();
        // 3. Verify the signature over the raw bytes.
        const verify = await verifyHighLevelSignature({
          rawBody: rawBytes,
          signatureBase64: signature,
          publicKey,
        });
        if (!verify.ok) {
          // Authentication failure: reject, do not record a trusted event.
          return json(401, { ok: false, error: "invalid_signature" });
        }
        // 4. Parse JSON only after successful verification.
        let payload: unknown;
        try {
          payload = JSON.parse(new TextDecoder().decode(rawBytes));
        } catch {
          return json(400, { ok: false, error: "invalid_json" });
        }
        if (!payload || typeof payload !== "object") {
          return json(400, { ok: false, error: "invalid_payload" });
        }
        const envelope = payload as Record<string, unknown>;
        const eventType =
          (envelope.eventType as string | undefined) ??
          (envelope.type as string | undefined) ??
          null;
        if (!isSupportedEventType(eventType)) {
          return json(202, {
            ok: true,
            ignored: true,
            reason: "unsupported_event",
          });
        }
        // 5–9. Resolve org, run the idempotent lead ingest pipeline.
        const deps = await buildIngestDeps();
        const result = await ingestCrmContactEvent({
          eventType: eventType as string,
          rawPayload: payload,
          deps,
        });
        // 10. Never leak internal secrets/errors; return a safe envelope.
        if (!result.ok) {
          if (
            result.reason === "unknown_location" ||
            result.reason === "ambiguous_location"
          ) {
            return json(404, { ok: false, reason: result.reason });
          }
          if (result.reason === "mapping_disabled") {
            return json(403, { ok: false, reason: result.reason });
          }
          return json(202, {
            ok: false,
            reason: result.reason ?? "processing_failed",
          });
        }
        return json(200, {
          ok: true,
          duplicate: result.duplicate,
          lead_id: result.lead_id,
          created: result.created,
        });
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Ingest dependency wiring. In Cloud mode the lookups go through Supabase
// repositories under RLS; in memory mode (no Cloud config) there is no live
// CRM mapping to resolve, so the route reports unknown_location — the route is
// a server contract, not a dev fixture. Importing the admin client lazily
// inside the handler keeps it out of the client bundle.
// ---------------------------------------------------------------------------

async function buildIngestDeps() {
  const { createRepositories } = await import("@/lib/supabase/repository");
  const { getBackendMode } = await import("@/lib/supabase/client");
  const repos = getBackendMode() === "supabase" ? createRepositories() : null;
  const leadRepo = repos?.leads ?? null;
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  // The Phase 10 CRM integration tables are not yet in the generated Database
  // type (types.ts regenerates after migration). Route them through a loose
  // permissive surface so the route compiles without modifying the read-only
  // generated types. RLS remains the final data boundary; the admin client is
  // only used for server-side tenant resolution + event evidence.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as unknown as { from: (table: string) => any };

  async function resolveOrgByLocation(locationId: string) {
    const res = await db
      .from("connect_pro_integration_config")
      .select("organization_id, enabled, external_location_id")
      .eq("external_location_id", locationId)
      .maybeSingle();
    const data = res?.data as {
      organization_id: string | null;
      enabled: boolean | null;
    } | null;
    const error = res?.error as unknown;
    if (error || !data) {
      return { ok: false as const, reason: "unknown_location" as const };
    }
    if (!data.enabled) {
      return { ok: false as const, reason: "mapping_disabled" as const };
    }
    return {
      ok: true as const,
      organization_id: data.organization_id as string,
    };
  }

  return {
    resolveOrgByLocation,
    findExternalContactRef: async (
      orgId: string,
      externalContactId: string,
    ) => {
      const res = await db
        .from("external_entity_references")
        .select("internal_entity_id, external_id")
        .eq("organization_id", orgId)
        .eq("external_id", externalContactId)
        .maybeSingle();
      const data = res?.data as {
        internal_entity_id: string | null;
        external_id: string | null;
      } | null;
      return data?.internal_entity_id
        ? {
            internal_id: data.internal_entity_id as string,
            external_id: externalContactId,
          }
        : null;
    },
    upsertExternalContactRef: async (
      orgId: string,
      externalContactId: string,
      internalId: string,
      metadata?: Record<string, unknown> | null,
    ) => {
      await db.from("external_entity_references").upsert(
        {
          organization_id: orgId,
          external_id: externalContactId,
          internal_entity_id: internalId,
          internal_entity_type: "lead",
          status: "active",
          metadata: (metadata ?? null) as never,
        },
        { onConflict: "organization_id,external_id" },
      );
    },
    listLeads: async (orgId: string) => (leadRepo ? leadRepo.list(orgId) : []),
    insertLead: async (lead: Lead) => {
      if (!leadRepo) return lead;
      return leadRepo.insert(lead);
    },
    updateLead: async (orgId: string, id: string, patch: Partial<Lead>) => {
      if (!leadRepo) return { ...patch, id } as Lead;
      return leadRepo.update(orgId, id, patch);
    },
    recordEvent: async (input: {
      orgId: string;
      eventKey: string;
      externalContactId: string;
      externalEventId: string | null;
      eventType: string;
      payload: unknown;
    }) => {
      const res = await db
        .from("integration_events")
        .select("id")
        .eq("event_key", input.eventKey)
        .maybeSingle();
      if (res?.data) return { id: res.data.id as string, duplicate: true };
      const id = crypto.randomUUID();
      const ins = await db.from("integration_events").insert({
        id,
        organization_id: input.orgId,
        provider: "connect_pro",
        direction: "inbound",
        event_type: input.eventType,
        entity_type: "contact",
        entity_id: null,
        external_entity_id: input.externalContactId,
        event_key: input.eventKey,
        payload: input.payload as never,
        status: "processing",
        attempts: 1,
        origin_system: "connect_pro",
        origin_event_id: input.externalEventId,
        schema_version: 1,
      });
      if (ins?.error) {
        // A concurrent insert (duplicate event_key) → treat as duplicate.
        return { id, duplicate: true };
      }
      return { id, duplicate: false };
    },
    markEventProcessed: async (
      eventId: string,
      ok: boolean,
      message?: string,
    ) => {
      await db
        .from("integration_events")
        .update({
          status: ok ? "succeeded" : "failed",
          processed_at: new Date().toISOString(),
          error_message: ok ? null : (message ?? null),
        })
        .eq("id", eventId);
    },
    claimIdempotency: async (orgId: string, key: string, _scope: string) => {
      const res = await db
        .from("idempotency_keys")
        .select("key")
        .eq("organization_id", orgId)
        .eq("key", key)
        .maybeSingle();
      if (res?.data) return false;
      await db.from("idempotency_keys").insert({
        organization_id: orgId,
        key,
        scope: _scope,
        status: "claimed",
      });
      return true;
    },
    createReview: async (input: {
      orgId: string;
      eventId: string | null;
      reviewType: string;
      reason: string;
      severity?: string;
      candidateEntityIds?: Record<string, string[]>;
      metadata?: Record<string, unknown> | null;
    }) => {
      const id = crypto.randomUUID();
      await db.from("integration_review_items").insert({
        id,
        organization_id: input.orgId,
        event_id: input.eventId,
        review_type: input.reviewType,
        severity: input.severity ?? "warning",
        status: "open",
        reason: input.reason,
        candidate_entity_ids: input.candidateEntityIds ?? {},
        metadata: input.metadata ?? null,
      });
      return id;
    },
  };
}
