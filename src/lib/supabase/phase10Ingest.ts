// Connect Pro Fleet — Phase 10C CRM lead ingest pipeline.
//
// The production server-side path for a HighLevel Contact event:
//   authenticate webhook → resolve CRM location → Fleet org → idempotently
//   create/update a Fleet Lead (never a Customer / BookingRequest / Rental).
//
// This module is pure, injectable domain logic so it is fully testable without
// a live DB. The route layer (src/routes/api/crm-ingest.ts) owns raw-body
// capture + signature verification; this module owns the resolution + Lead
// effect + integration-event/review evidence. A `LeadIngestDeps` interface is
// injected so tests supply in-memory reads/writes and production supplies
// Supabase-backed repositories. RLS remains the final authority in production:
// the org is resolved SERVER-SIDE from the stored CRM location mapping, never
// from an incoming organization_id, so a forged payload cannot write to Org B.
//
// Idempotency: event_key (org + event type + external contact id + external
// event id) + a durable idempotency_key over the external contact id. A
// repeated delivery produces no duplicate Lead; a later contact update resolves
// to the same Lead by external_entity_reference first, then a conservative
// phone/email fallback, and a new Lead only if no safe match exists.

import type { Lead, LeadSource, LeadStatus } from "../leadTypes";
import { resolveLeadMatchByPhoneOrEmail } from "../leadMatch";
import { normalizePhone, normalizeEmail } from "../bookingRequestCustomerMatch";

/** CRM location → Fleet org resolution result. */
export interface LocationResolution {
  ok: boolean;
  organization_id?: string;
  reason?: "unknown_location" | "mapping_disabled" | "ambiguous_location";
}

/** Supported Phase 10C inbound HighLevel Contact event types. */
export type Phase10cEventType = "contact.created" | "contact.updated";

const SUPPORTED_EVENT_TYPES: Phase10cEventType[] = [
  "contact.created",
  "contact.updated",
];

export function isSupportedEventType(
  t: string | null | undefined,
): t is Phase10cEventType {
  return !!t && (SUPPORTED_EVENT_TYPES as string[]).includes(t);
}

/** The normalized contact payload we extract from a HighLevel event. */
export interface NormalizedContact {
  external_contact_id: string;
  location_id?: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  tags: string[];
  /** CRM opportunity/pipeline metadata carried where safely available. */
  crm_opportunity_id: string | null;
  crm_pipeline_stage: string | null;
  /** Free-form source label (e.g. "Facebook Lead Form"). */
  lead_source: string | null;
  /** Arbitrary custom-form / intake fields preserved as flexible CRM data. */
  intake_data: Record<string, unknown>;
  /** A provider webhook/event id when supplied. */
  external_event_id: string | null;
}

/**
 * Parse + normalize a verified HighLevel webhook JSON payload into the
 * NormalizedContact the pipeline consumes. Standard contact fields are mapped;
 * arbitrary custom-form / intake fields are preserved verbatim in
 * `intake_data` (no per-field columns, no fabricated values).
 *
 * HighLevel contact events nest the contact under `payload.contact` or at the
 * top level; both shapes are tolerated. `location_id` comes from the contact
 * (or the webhook envelope) and is used only to resolve the Fleet org — never
 * trusted as the Fleet organization_id.
 */
export function normalizeHighLevelContact(
  raw: unknown,
): { ok: true; contact: NormalizedContact } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "payload_not_object" };
  }
  const root = raw as Record<string, unknown>;
  // HighLevel envelopes may wrap the contact in `payload` or `contact`.
  const contactRaw =
    (root.contact as Record<string, unknown> | undefined) ??
    (root.payload as Record<string, unknown> | undefined) ??
    root;
  if (!contactRaw || typeof contactRaw !== "object") {
    return { ok: false, reason: "contact_not_object" };
  }
  const id = str(contactRaw.contactId ?? contactRaw.id ?? root.contactId);
  if (!id) return { ok: false, reason: "missing_contact_id" };

  const strOr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const firstName = strOr(contactRaw.firstName ?? contactRaw.first_name);
  const lastName = strOr(contactRaw.lastName ?? contactRaw.last_name);
  // Phone OR email is the contact identity; both may be absent on a new lead.
  const phone = strOr(contactRaw.phone);
  const email = strOr(contactRaw.email).toLowerCase();

  const tagsRaw = contactRaw.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((t): t is string => typeof t === "string")
    : typeof tagsRaw === "string" && tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

  const locationId = strOr(
    contactRaw.locationId ?? contactRaw.location_id ?? root.locationId,
  );

  // Opportunity / pipeline metadata where safely available (informational).
  const crmOpportunityId =
    strOrNull(contactRaw.opportunityId ?? contactRaw.opportunity_id) ??
    strOrNull(root.opportunityId);
  const crmPipelineStage =
    strOrNull(contactRaw.pipelineStage ?? contactRaw.pipeline_stage) ??
    strOrNull(root.pipelineStage);
  const leadSource =
    strOrNull(contactRaw.source ?? contactRaw.leadSource) ??
    strOrNull(root.source);

  // Preserve arbitrary custom-form / intake fields verbatim. We exclude the
  // standard fields we already mapped so they do not shadow themselves, but we
  // keep everything else (custom questions, answers, form metadata) as flexible
  // CRM intake data — never as operational rental columns.
  const intake_data = extractIntake(contactRaw, [
    "contactId",
    "id",
    "firstName",
    "first_name",
    "lastName",
    "last_name",
    "phone",
    "email",
    "tags",
    "locationId",
    "location_id",
    "opportunityId",
    "opportunity_id",
    "pipelineStage",
    "pipeline_stage",
    "source",
    "leadSource",
  ]);

  const externalEventId =
    strOrNull(root.eventId ?? root.event_id ?? root.id) ?? null;

  return {
    ok: true,
    contact: {
      external_contact_id: id,
      location_id: locationId || null,
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      tags,
      crm_opportunity_id: crmOpportunityId,
      crm_pipeline_stage: crmPipelineStage,
      lead_source: leadSource,
      intake_data,
      external_event_id: externalEventId,
    },
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s || null;
}

function extractIntake(
  obj: Record<string, unknown>,
  exclude: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (exclude.includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v as unknown;
  }
  return out;
}

// ---------------------------------------------------------------------------
// External reference registry + Lead persistence (injected so tests run in
// memory and production uses Supabase-backed repositories under RLS).
// ---------------------------------------------------------------------------

export interface ExternalContactRef {
  internal_id: string;
  external_id: string;
}

export interface LeadIngestDeps {
  /** Resolve a Fleet org from a CRM location id (server-side authority). */
  resolveOrgByLocation(locationId: string): Promise<LocationResolution>;
  /** Look up an existing external contact reference → internal Fleet Lead id. */
  findExternalContactRef(
    orgId: string,
    externalContactId: string,
  ): Promise<ExternalContactRef | null>;
  /** Record the external contact reference (idempotent on retry). */
  upsertExternalContactRef(
    orgId: string,
    externalContactId: string,
    internalId: string,
    metadata?: Record<string, unknown> | null,
  ): Promise<void>;
  /** Read existing Leads in the org (for conservative phone/email fallback). */
  listLeads(orgId: string): Promise<Lead[]>;
  /** Create a new Lead. Returns the persisted Lead. */
  insertLead(lead: Lead): Promise<Lead>;
  /** Update an existing Lead (contact / CRM fields only — never operational). */
  updateLead(orgId: string, id: string, patch: Partial<Lead>): Promise<Lead>;
  /** Record durable inbound event evidence. Idempotent on event_key. */
  recordEvent(input: {
    orgId: string;
    eventKey: string;
    externalContactId: string;
    externalEventId: string | null;
    eventType: string;
    payload: unknown;
  }): Promise<{ id: string; duplicate: boolean }>;
  /** Mark an event processed (ok or not) with an error message. */
  markEventProcessed(
    eventId: string,
    ok: boolean,
    message?: string,
  ): Promise<void>;
  /** Claim an idempotency key; returns true if this caller owns it (first). */
  claimIdempotency(orgId: string, key: string, scope: string): Promise<boolean>;
  /** Create a review item for human handling. */
  createReview(input: {
    orgId: string;
    eventId: string | null;
    reviewType: string;
    reason: string;
    severity?: string;
    candidateEntityIds?: Record<string, string[]>;
    metadata?: Record<string, unknown> | null;
  }): Promise<string>;
}

/** The effect a ingest run had. */
export interface LeadIngestResult {
  ok: boolean;
  duplicate: boolean;
  lead_id: string | null;
  created: boolean;
  reason?:
    | "unknown_location"
    | "mapping_disabled"
    | "ambiguous_location"
    | "invalid_payload"
    | "unsupported_event"
    | "ambiguous_match"
    | "processing_failed";
  event_id?: string;
}

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Derive the durable event_key for a contact event (idempotency identity). */
export function crmEventKey(
  orgId: string,
  eventType: string,
  externalContactId: string,
  externalEventId: string | null,
): string {
  const evt = externalEventId ?? externalContactId;
  return `crm_event:${orgId}:${eventType}:${externalContactId}:${evt}`;
}

/** Derive the durable contact-scoped idempotency key. */
export function crmContactIdempotencyKey(
  orgId: string,
  externalContactId: string,
): string {
  return `crm_contact:${orgId}:${externalContactId}`;
}

/**
 * Apply a CRM contact event as a Fleet Lead. CRM owns pre-rental contact
 * information; Fleet remains authoritative for rental operations. Never
 * creates a Customer / BookingRequest / Reservation / Rental.
 *
 * Status preservation: a `contact.created` enters a Lead as `new`. A
 * `contact.updated` updates contact / CRM / intake fields but NEVER resets a
 * staff-set lifecycle status (contacted/qualified/waitlisted/disqualified/
 * converted) back to `new`.
 */
export async function ingestCrmContactEvent(args: {
  eventType: string;
  rawPayload: unknown;
  deps: LeadIngestDeps;
}): Promise<LeadIngestResult> {
  const { eventType, rawPayload, deps } = args;
  if (!isSupportedEventType(eventType)) {
    return {
      ok: false,
      duplicate: false,
      lead_id: null,
      created: false,
      reason: "unsupported_event",
    };
  }
  const parsed = normalizeHighLevelContact(rawPayload);
  if (!parsed.ok) {
    return {
      ok: false,
      duplicate: false,
      lead_id: null,
      created: false,
      reason: "invalid_payload",
    };
  }
  const contact = parsed.contact;
  const locationId = contact.location_id;
  if (!locationId) {
    return {
      ok: false,
      duplicate: false,
      lead_id: null,
      created: false,
      reason: "unknown_location",
    };
  }
  const resolution = await deps.resolveOrgByLocation(locationId);
  if (!resolution.ok || !resolution.organization_id) {
    return {
      ok: false,
      duplicate: false,
      lead_id: null,
      created: false,
      reason: resolution.reason ?? "unknown_location",
    };
  }
  const orgId = resolution.organization_id;
  const eventKey = crmEventKey(
    orgId,
    eventType,
    contact.external_contact_id,
    contact.external_event_id,
  );

  // Idempotency on the event first: a repeated delivery of the SAME event is a
  // no-op (returns the already-processed Lead id without re-running effects).
  const record = await deps.recordEvent({
    orgId,
    eventKey,
    externalContactId: contact.external_contact_id,
    externalEventId: contact.external_event_id,
    eventType,
    payload: rawPayload,
  });
  if (record.duplicate) {
    // Find the already-linked Lead via the external reference.
    const ref = await deps.findExternalContactRef(
      orgId,
      contact.external_contact_id,
    );
    return {
      ok: true,
      duplicate: true,
      lead_id: ref?.internal_id ?? null,
      created: false,
      event_id: record.id,
    };
  }

  // Primary identity: external contact id via external_entity_references.
  const existingRef = await deps.findExternalContactRef(
    orgId,
    contact.external_contact_id,
  );

  if (existingRef) {
    // Update the existing Lead. Preserve staff lifecycle status — a CRM update
    // must not undo contacted/qualified/waitlisted/disqualified/converted.
    const leads = await deps.listLeads(orgId);
    const existing = leads.find((l) => l.id === existingRef.internal_id);
    if (existing) {
      const preserve: LeadStatus[] = [
        "contacted",
        "qualified",
        "waitlisted",
        "disqualified",
        "converted",
      ];
      const nextStatus: LeadStatus = preserve.includes(existing.status)
        ? existing.status
        : "new";
      const patch: Partial<Lead> = {
        first_name: contact.first_name || existing.first_name,
        last_name: contact.last_name || existing.last_name,
        phone: contact.phone || existing.phone,
        email: contact.email || existing.email,
        tags: contact.tags.length ? contact.tags : existing.tags,
        crm_opportunity_id: contact.crm_opportunity_id,
        crm_pipeline_stage: contact.crm_pipeline_stage,
        lead_source: contact.lead_source ?? existing.lead_source,
        intake_data: { ...existing.intake_data, ...contact.intake_data },
        status: nextStatus,
      };
      try {
        await deps.updateLead(orgId, existing.id, patch);
        await deps.markEventProcessed(record.id, true);
        return {
          ok: true,
          duplicate: false,
          lead_id: existing.id,
          created: false,
          event_id: record.id,
        };
      } catch {
        await deps.markEventProcessed(record.id, false, "lead update failed");
        return {
          ok: false,
          duplicate: false,
          lead_id: existing.id,
          created: false,
          reason: "processing_failed",
          event_id: record.id,
        };
      }
    }
  }

  // No external mapping yet — conservative phone/email fallback. Only when
  // EXACTLY ONE unambiguous Lead matches; otherwise create a review item and a
  // new Lead (never silently merge distinct people).
  const fallback = resolveLeadMatchByPhoneOrEmail({
    leads: await deps.listLeads(orgId),
    phone: contact.phone,
    email: contact.email,
  });

  if (fallback.kind === "ambiguous") {
    // Create a review item but still create a distinct new Lead so the contact
    // is not lost; a human resolves the potential duplicate later.
    const lead = buildLead(orgId, contact, "new");
    try {
      await deps.insertLead(lead);
    } catch {
      await deps.markEventProcessed(record.id, false, "lead insert failed");
      return {
        ok: false,
        duplicate: false,
        lead_id: null,
        created: false,
        reason: "processing_failed",
        event_id: record.id,
      };
    }
    await deps.upsertExternalContactRef(
      orgId,
      contact.external_contact_id,
      lead.id,
      { match: "ambiguous_fallback" },
    );
    await deps.createReview({
      orgId,
      eventId: record.id,
      reviewType: "ambiguous_contact_match",
      reason: "Ambiguous phone/email fallback match; possible duplicate Lead.",
      severity: "warning",
      candidateEntityIds: { lead: fallback.candidate_ids },
      metadata: {
        external_contact_id: contact.external_contact_id,
        created_lead_id: lead.id,
      },
    });
    await deps.markEventProcessed(record.id, true, "ambiguous — reviewed");
    return {
      ok: true,
      duplicate: false,
      lead_id: lead.id,
      created: true,
      event_id: record.id,
    };
  }

  if (fallback.kind === "matched") {
    const leads = await deps.listLeads(orgId);
    const existing = leads.find((l) => l.id === fallback.lead_id);
    if (existing) {
      const patch: Partial<Lead> = {
        first_name: contact.first_name || existing.first_name,
        last_name: contact.last_name || existing.last_name,
        phone: contact.phone || existing.phone,
        email: contact.email || existing.email,
        tags: contact.tags.length ? contact.tags : existing.tags,
        crm_opportunity_id: contact.crm_opportunity_id,
        crm_pipeline_stage: contact.crm_pipeline_stage,
        lead_source: contact.lead_source ?? existing.lead_source,
        intake_data: { ...existing.intake_data, ...contact.intake_data },
      };
      try {
        await deps.updateLead(orgId, existing.id, patch);
      } catch {
        await deps.markEventProcessed(record.id, false, "lead update failed");
        return {
          ok: false,
          duplicate: false,
          lead_id: existing.id,
          created: false,
          reason: "processing_failed",
          event_id: record.id,
        };
      }
      await deps.upsertExternalContactRef(
        orgId,
        contact.external_contact_id,
        existing.id,
      );
      await deps.markEventProcessed(record.id, true);
      return {
        ok: true,
        duplicate: false,
        lead_id: existing.id,
        created: false,
        event_id: record.id,
      };
    }
  }

  // No safe match — create a new Lead + external reference.
  const lead = buildLead(orgId, contact, "new");
  try {
    await deps.insertLead(lead);
  } catch {
    await deps.markEventProcessed(record.id, false, "lead insert failed");
    return {
      ok: false,
      duplicate: false,
      lead_id: null,
      created: false,
      reason: "processing_failed",
      event_id: record.id,
    };
  }
  await deps.upsertExternalContactRef(
    orgId,
    contact.external_contact_id,
    lead.id,
  );
  await deps.markEventProcessed(record.id, true);
  return {
    ok: true,
    duplicate: false,
    lead_id: lead.id,
    created: true,
    event_id: record.id,
  };
}

function buildLead(
  orgId: string,
  c: NormalizedContact,
  status: LeadStatus,
): Lead {
  const at = nowISO();
  const source: LeadSource = "connect_pro_crm";
  return {
    id: uid("lead"),
    organization_id: orgId,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    email: c.email,
    source,
    status,
    tags: c.tags,
    crm_opportunity_id: c.crm_opportunity_id,
    crm_pipeline_stage: c.crm_pipeline_stage,
    lead_source: c.lead_source,
    intake_data: c.intake_data,
    notes: "",
    converted_booking_request_id: null,
    converted_at: null,
    created_by: null,
    created_at: at,
    updated_at: at,
  };
}

export { normalizePhone, normalizeEmail };
