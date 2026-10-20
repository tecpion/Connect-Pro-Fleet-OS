// Connect Pro Fleet — Phase 10A typed Database row types: CRM integration.
//
// Mirrors the Phase 10A migration (20261020160000_phase_10a_crm_integration_schema_rls.sql).
// All tables are organization-scoped with is_org_member RLS, authenticated +
// service_role grants, and no anon access. The future webhook resolves the
// Fleet org server-side from the stored CRM location mapping — it must never
// trust an incoming organization_id.
//
// These row types are deliberately agnostic about the internal Fleet
// destination for a synced CRM contact (Customer vs. a future Lead model).
// That is a Phase 10B product decision; external_entity_references.internal_entity_type
// lets the registry point at whichever internal entity is chosen.

import type { Json } from "./dbTypesCore";

// ── connect_pro_integration_config ──────────────────────────────────────
// One CRM location → one Fleet organization. Server-side tenant resolution.

export interface ConnectProIntegrationConfigRow {
  id: string;
  organization_id: string;
  provider: string;
  external_location_id: string;
  enabled: boolean;
  connection_status: string;
  default_sync_enabled: boolean;
  customer_sync_enabled: boolean;
  payment_sync_enabled: boolean;
  billing_event_sync_enabled: boolean;
  /** Mock-only status of the webhook secret; never the secret itself. */
  webhook_secret_status: string;
  last_successful_sync_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ── external_entity_references ──────────────────────────────────────────
// CRM contact id → Fleet internal person/contact. The primary idempotency
// identity is (organization + provider + external_entity_type + external_id).
// internal_entity_type is nullable so a reference can be recorded before the
// Phase 10B destination decision resolves the internal Fleet record.

export interface ExternalEntityReferenceRow {
  id: string;
  organization_id: string;
  provider: string;
  external_entity_type: string;
  external_id: string;
  external_parent_id: string | null;
  /** e.g. "customer" or a future "lead" — chosen in Phase 10B. */
  internal_entity_type: string | null;
  internal_entity_id: string | null;
  status: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ── integration_events ───────────────────────────────────────────────────
// Durable inbound event evidence (inbox). event_key is the idempotency key —
// repeated delivery never duplicates the effect. Arbitrary CRM custom/intake
// fields are preserved in payload jsonb (no per-field columns).

export interface IntegrationEventRow {
  id: string;
  organization_id: string;
  provider: string;
  direction: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  external_entity_id: string | null;
  event_key: string;
  payload: Json;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  processed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  origin_system: string | null;
  origin_event_id: string | null;
  schema_version: number;
  received_at: string;
  created_at: string;
}

// ── integration_review_items ─────────────────────────────────────────────
// Durable review/error queue. Failed webhook processing is observable; events
// are never silently dropped.

export interface IntegrationReviewItemRow {
  id: string;
  organization_id: string;
  event_id: string | null;
  review_type: string;
  severity: string;
  status: string;
  reason: string;
  candidate_entity_ids: Json;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  metadata: Json | null;
  created_at: string;
}

// ── idempotency_keys ─────────────────────────────────────────────────────
// Durable retry protection for processed webhook effects. Scoped to
// organization so cross-tenant keys never collide.

export interface IdempotencyKeyRow {
  id: string;
  organization_id: string;
  key: string;
  scope: string;
  status: string;
  result: Json | null;
  expires_at: string | null;
  created_at: string;
}

// ── Phase 10A table registry ────────────────────────────────────────────
// The set of organization-owned CRM integration tables created by Phase 10A.
// Used by isolation probes and cleanup in later phases.

export const PHASE_10A_INTEGRATION_TABLES = [
  "connect_pro_integration_config",
  "external_entity_references",
  "integration_events",
  "integration_review_items",
  "idempotency_keys",
] as const;

export type Phase10aIntegrationTable =
  (typeof PHASE_10A_INTEGRATION_TABLES)[number];
