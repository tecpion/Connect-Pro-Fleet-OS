// Connect Pro Fleet — Phase 3 row types for the 9 live compliance/verification
// tables. These mirror the LIVE Cloud schema exactly (verified against
// information_schema). The generated types.ts already has these tables, but
// the repository layer uses these focused row types for mapping clarity.

// ── Compliance ──────────────────────────────────────────────────

export interface ComplianceDocumentRow {
  id: string;
  organization_id: string;
  document_type: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  document_number: string | null;
  issuer: string | null;
  state_jurisdiction: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  status: string;
  verification_status: string;
  file_reference: string | null;
  original_filename: string | null;
  mime_type: string | null;
  notes: string | null;
  source: string;
  uploaded_by: string | null;
  uploaded_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejected_reason: string | null;
  archived_at: string | null;
  supersedes_document_id: string | null;
  superseded_by_document_id: string | null;
  location_id: string | null;
  assigned_staff_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceRequirementRow {
  id: string;
  organization_id: string;
  entity_type: string;
  document_type: string;
  required: boolean;
  blocks_operation_if_missing: boolean;
  blocks_operation_if_expired: boolean;
  requires_verification: boolean;
  warning_days: number;
  active: boolean;
  block_behavior: string | null;
  manager_override_allowed: boolean;
  source: string;
  applies_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceOverrideRow {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  requirement_id: string | null;
  reason: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  active: boolean;
}

export interface ComplianceEventRow {
  id: string;
  organization_id: string;
  document_id: string | null;
  event_type: string;
  label: string;
  actor_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

// ── Verification ─────────────────────────────────────────────────

export interface VerificationRequestRow {
  id: string;
  organization_id: string;
  customer_id: string | null;
  booking_request_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  verification_type: string;
  provider: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  requested_by: string | null;
  external_reference: string | null;
  expires_at: string | null;
  usage_charge_id: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationRequirementRow {
  id: string;
  organization_id: string;
  verification_type: string;
  customer_id: string | null;
  booking_request_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  required_by_staff_id: string | null;
  required_at: string;
  reason: string | null;
  removed: boolean;
  removed_by_staff_id: string | null;
  removed_at: string | null;
}

export interface VerificationOverrideRow {
  id: string;
  organization_id: string;
  verification_request_id: string;
  decision: string;
  reason: string;
  staff_id: string | null;
  created_at: string;
}

export interface VerificationAuditEventRow {
  id: string;
  organization_id: string;
  verification_type: string;
  customer_id: string | null;
  rental_id: string | null;
  reservation_id: string | null;
  booking_request_id: string | null;
  event_type: string;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface VerificationUsageChargeRow {
  id: string;
  organization_id: string;
  verification_request_id: string;
  service_type: string;
  provider: string;
  provider_cost_mock: number | null;
  platform_price_mock: number;
  currency: string;
  status: string;
  created_at: string;
}
