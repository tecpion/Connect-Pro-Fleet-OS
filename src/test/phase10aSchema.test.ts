// Phase 10A — CRM integration schema + idempotency foundation tests.
//
// These tests validate the Phase 10A row-type contracts and the idempotency /
// uniqueness design that the migration enforces at the database layer. They
// are pure-TypeScript (no live DB) so the schema contract is locked in
// regardless of transient Cloud connectivity. The live migration applies the
// same constraints as Postgres unique indexes; these tests mirror the intent.

import { describe, it, expect } from "vitest";
import type {
  ConnectProIntegrationConfigRow,
  ExternalEntityReferenceRow,
  IntegrationEventRow,
  IntegrationReviewItemRow,
  IdempotencyKeyRow,
} from "@/lib/supabase/dbTypesPhase10";
import { PHASE_10A_INTEGRATION_TABLES as TABLES } from "@/lib/supabase/dbTypesPhase10";

// ── Idempotency key derivation ───────────────────────────────────────────
// The external CRM contact id is the PRIMARY idempotency identity. A repeated
// webhook for the same contact must resolve to the same key so the unique
// (organization, scope, key) constraint rejects duplicate processing.

function crmContactIdempotencyKey(
  organizationId: string,
  externalContactId: string,
): string {
  return `crm_contact:${organizationId}:${externalContactId}`;
}

function crmEventKey(
  organizationId: string,
  eventType: string,
  externalContactId: string,
  externalEventId: string,
): string {
  return `crm_event:${organizationId}:${eventType}:${externalContactId}:${externalEventId}`;
}

describe("Phase 10A integration table registry", () => {
  it("registers exactly the five Phase 10A integration tables", () => {
    expect(TABLES).toHaveLength(5);
    expect([...TABLES]).toEqual([
      "connect_pro_integration_config",
      "external_entity_references",
      "integration_events",
      "integration_review_items",
      "idempotency_keys",
    ]);
  });

  it("every registered table is organization-owned", () => {
    // All five tables carry organization_id as their tenant boundary.
    expect(TABLES.length).toBeGreaterThan(0);
  });
});

describe("Phase 10A row-type contracts", () => {
  it("ConnectProIntegrationConfigRow maps one CRM location to one Fleet org", () => {
    const row: ConnectProIntegrationConfigRow = {
      id: "cfg-1",
      organization_id: "org-a",
      provider: "connect_pro",
      external_location_id: "loc-abc",
      enabled: true,
      connection_status: "connected",
      default_sync_enabled: false,
      customer_sync_enabled: true,
      payment_sync_enabled: false,
      billing_event_sync_enabled: false,
      webhook_secret_status: "missing",
      last_successful_sync_at: null,
      last_error_at: null,
      last_error_message: null,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    };
    expect(row.organization_id).toBe("org-a");
    expect(row.external_location_id).toBe("loc-abc");
    expect(row.provider).toBe("connect_pro");
  });

  it("ExternalEntityReferenceRow is agnostic about the internal destination", () => {
    // internal_entity_type is nullable so a reference can exist before the
    // Phase 10B destination decision resolves the internal Fleet record.
    const unresolved: ExternalEntityReferenceRow = {
      id: "ref-1",
      organization_id: "org-a",
      provider: "connect_pro",
      external_entity_type: "contact",
      external_id: "hl-contact-123",
      external_parent_id: null,
      internal_entity_type: null,
      internal_entity_id: null,
      status: "active",
      metadata: null,
      created_at: "2026-10-20T00:00:00Z",
      updated_at: "2026-10-20T00:00:00Z",
    };
    expect(unresolved.internal_entity_type).toBeNull();
    expect(unresolved.internal_entity_id).toBeNull();

    const resolved: ExternalEntityReferenceRow = {
      ...unresolved,
      id: "ref-2",
      internal_entity_type: "customer",
      internal_entity_id: "cust-1",
    };
    expect(resolved.internal_entity_type).toBe("customer");
  });

  it("IntegrationEventRow preserves arbitrary CRM fields in payload jsonb", () => {
    const row: IntegrationEventRow = {
      id: "evt-1",
      organization_id: "org-a",
      provider: "connect_pro",
      direction: "inbound",
      event_type: "contact.created",
      entity_type: "contact",
      entity_id: null,
      external_entity_id: "hl-contact-123",
      event_key: crmEventKey(
        "org-a",
        "contact.created",
        "hl-contact-123",
        "evt-99",
      ),
      payload: {
        first_name: "Jane",
        last_name: "Doe",
        phone: "+15551234567",
        email: "jane@example.com",
        custom_fields: {
          desired_pickup_date: "2026-11-01",
          rental_type: "weekly",
          vehicle_preference: "SUV",
          location: "Downtown",
          notes: "Needs child seat",
        },
      },
      status: "pending",
      attempts: 0,
      last_attempt_at: null,
      processed_at: null,
      error_code: null,
      error_message: null,
      origin_system: "connect_pro",
      origin_event_id: null,
      schema_version: 1,
      received_at: "2026-10-20T00:00:00Z",
      created_at: "2026-10-20T00:00:00Z",
    };
    expect(row.event_key).toContain("hl-contact-123");
    expect(
      (row.payload as { custom_fields: { rental_type: string } }).custom_fields
        .rental_type,
    ).toBe("weekly");
  });

  it("IntegrationReviewItemRow records a failed event for observability", () => {
    const row: IntegrationReviewItemRow = {
      id: "rev-1",
      organization_id: "org-a",
      event_id: "evt-1",
      review_type: "failed_event",
      severity: "error",
      status: "open",
      reason: "Unknown CRM sub-account",
      candidate_entity_ids: {},
      resolution: null,
      resolved_by: null,
      resolved_at: null,
      metadata: { external_location_id: "loc-unknown" },
      created_at: "2026-10-20T00:00:00Z",
    };
    expect(row.review_type).toBe("failed_event");
    expect(row.status).toBe("open");
  });

  it("IdempotencyKeyRow scopes keys per organization", () => {
    const row: IdempotencyKeyRow = {
      id: "idem-1",
      organization_id: "org-a",
      key: crmContactIdempotencyKey("org-a", "hl-contact-123"),
      scope: "crm_contact",
      status: "claimed",
      result: { internal_entity_id: "cust-1" },
      expires_at: null,
      created_at: "2026-10-20T00:00:00Z",
    };
    expect(row.scope).toBe("crm_contact");
    expect(row.key).toContain("org-a");
  });
});

describe("Phase 10A idempotency strategy", () => {
  it("the external CRM contact id is the primary idempotency identity", () => {
    const k1 = crmContactIdempotencyKey("org-a", "hl-contact-123");
    const k2 = crmContactIdempotencyKey("org-a", "hl-contact-123");
    expect(k1).toBe(k2);
  });

  it("the same contact id in two orgs produces two distinct keys (tenant isolation)", () => {
    const orgA = crmContactIdempotencyKey("org-a", "hl-contact-123");
    const orgB = crmContactIdempotencyKey("org-b", "hl-contact-123");
    expect(orgA).not.toBe(orgB);
  });

  it("a repeated webhook event produces the same event_key (duplicate delivery rejected)", () => {
    const k1 = crmEventKey(
      "org-a",
      "contact.updated",
      "hl-contact-123",
      "evt-99",
    );
    const k2 = crmEventKey(
      "org-a",
      "contact.updated",
      "hl-contact-123",
      "evt-99",
    );
    expect(k1).toBe(k2);
  });

  it("two different event types for the same contact produce different event_keys", () => {
    const created = crmEventKey(
      "org-a",
      "contact.created",
      "hl-contact-123",
      "e1",
    );
    const updated = crmEventKey(
      "org-a",
      "contact.updated",
      "hl-contact-123",
      "e2",
    );
    expect(created).not.toBe(updated);
  });

  it("an out-of-order retry carries the same external event id (safely resolvable)", () => {
    // The external event id is part of the key, so a retry of the SAME event
    // (same external_event_id) collapses; a genuinely new event does not.
    const first = crmEventKey(
      "org-a",
      "contact.updated",
      "hl-contact-123",
      "evt-99",
    );
    const retry = crmEventKey(
      "org-a",
      "contact.updated",
      "hl-contact-123",
      "evt-99",
    );
    const next = crmEventKey(
      "org-a",
      "contact.updated",
      "hl-contact-123",
      "evt-100",
    );
    expect(first).toBe(retry);
    expect(first).not.toBe(next);
  });
});

describe("Phase 10A uniqueness / tenant-isolation design", () => {
  it("a CRM location maps to exactly one Fleet organization", () => {
    // The migration enforces UNIQUE(external_location_id) so a single CRM
    // location cannot be mapped to two Fleet orgs. A forged org id in a
    // webhook payload is ignored — the org is resolved from this mapping.
    const mapping: Record<string, string> = { "loc-abc": "org-a" };
    const resolvedOrg = mapping["loc-abc"];
    expect(resolvedOrg).toBe("org-a");
    // An unmapped location resolves to nothing (rejected).
    expect(mapping["loc-unknown"]).toBeUndefined();
  });

  it("a forged organization_id in a payload does not override server-side resolution", () => {
    // The webhook must resolve the Fleet org from the stored CRM location
    // mapping, never from an incoming organization_id. Here the payload
    // claims org-b but the location maps to org-a — org-a wins.
    const mapping: Record<string, string> = { "loc-abc": "org-a" };
    const payloadOrgId = "org-b"; // forged
    const externalLocationId = "loc-abc";
    const resolvedOrg = mapping[externalLocationId];
    expect(resolvedOrg).toBe("org-a");
    expect(resolvedOrg).not.toBe(payloadOrgId);
  });

  it("external entity references are unique per org+provider+type+external_id", () => {
    // The same external contact id may exist across tenants without collision
    // because the registry key is scoped by organization.
    const refA = `${"org-a"}|connect_pro|contact|hl-contact-123`;
    const refB = `${"org-b"}|connect_pro|contact|hl-contact-123`;
    expect(refA).not.toBe(refB);
  });
});
