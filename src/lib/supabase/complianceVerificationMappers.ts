// Connect Pro Fleet — Phase 3 row ↔ domain mappers for compliance + verification.
//
// The live schema uses `organization_id`; the frozen domain models use
// `tenant_id`. The mappers translate that boundary so the rest of the app
// (selectors, release gate, UI) keeps working unchanged. Compliance events
// also rename `type`→`event_type` and `at`→`created_at`.

import type {
  DocumentRecord,
  DocumentStatus,
  DocumentSource,
  DocumentEntityType,
  DocumentType,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceEvent,
  ComplianceEventType,
  ComplianceBlockBehavior,
} from "../complianceTypes";
import type { VerificationStatus } from "../complianceTypes";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationAuditEvent,
  VerificationUsageCharge,
  VerificationType,
  VerificationProviderId,
  VerificationRequestStatus,
  VerificationResult,
  VerificationAuditEventType,
  UsageChargeStatus,
} from "../verificationTypes";
import type {
  ComplianceDocumentRow,
  ComplianceRequirementRow,
  ComplianceOverrideRow,
  ComplianceEventRow,
  VerificationRequestRow,
  VerificationRequirementRow,
  VerificationOverrideRow,
  VerificationAuditEventRow,
  VerificationUsageChargeRow,
} from "./dbTypesComplianceVerification";

// ── Compliance: DocumentRecord ──────────────────────────────────

export function rowToDocumentRecord(r: ComplianceDocumentRow): DocumentRecord {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    document_type: r.document_type as DocumentType,
    entity_type: r.entity_type as DocumentEntityType,
    entity_id: r.entity_id,
    entity_label: r.entity_label,
    document_number: r.document_number,
    issuer: r.issuer,
    state_jurisdiction: r.state_jurisdiction,
    effective_date: r.effective_date,
    expiration_date: r.expiration_date,
    status: r.status as DocumentStatus,
    verification_status: r.verification_status as VerificationStatus,
    file_reference: r.file_reference,
    original_filename: r.original_filename,
    mime_type: r.mime_type,
    notes: r.notes,
    source: r.source as DocumentSource,
    uploaded_by: r.uploaded_by,
    uploaded_at: r.uploaded_at,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    rejected_reason: r.rejected_reason,
    archived_at: r.archived_at,
    supersedes_document_id: r.supersedes_document_id,
    superseded_by_document_id: r.superseded_by_document_id,
    location_id: r.location_id,
    assigned_staff_id: r.assigned_staff_id,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function documentRecordToRow(
  d: DocumentRecord,
): Omit<ComplianceDocumentRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<ComplianceDocumentRow, "id" | "created_at" | "updated_at">> {
  return {
    id: d.id,
    organization_id: d.tenant_id,
    document_type: d.document_type,
    entity_type: d.entity_type,
    entity_id: d.entity_id,
    entity_label: d.entity_label,
    document_number: d.document_number,
    issuer: d.issuer,
    state_jurisdiction: d.state_jurisdiction,
    effective_date: d.effective_date,
    expiration_date: d.expiration_date,
    status: d.status,
    verification_status: d.verification_status,
    file_reference: d.file_reference,
    original_filename: d.original_filename,
    mime_type: d.mime_type,
    notes: d.notes,
    source: d.source,
    uploaded_by: d.uploaded_by,
    uploaded_at: d.uploaded_at,
    reviewed_by: d.reviewed_by,
    reviewed_at: d.reviewed_at,
    rejected_reason: d.rejected_reason,
    archived_at: d.archived_at,
    supersedes_document_id: d.supersedes_document_id,
    superseded_by_document_id: d.superseded_by_document_id,
    location_id: d.location_id,
    assigned_staff_id: d.assigned_staff_id,
    created_by: d.created_by,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

export function documentRecordPatchToRow(
  patch: Partial<DocumentRecord>,
): Partial<ComplianceDocumentRow> {
  const row: Partial<ComplianceDocumentRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.document_type !== undefined) row.document_type = patch.document_type;
  if (patch.entity_type !== undefined) row.entity_type = patch.entity_type;
  if (patch.entity_id !== undefined) row.entity_id = patch.entity_id;
  if (patch.entity_label !== undefined) row.entity_label = patch.entity_label;
  if (patch.document_number !== undefined) row.document_number = patch.document_number;
  if (patch.issuer !== undefined) row.issuer = patch.issuer;
  if (patch.state_jurisdiction !== undefined) row.state_jurisdiction = patch.state_jurisdiction;
  if (patch.effective_date !== undefined) row.effective_date = patch.effective_date;
  if (patch.expiration_date !== undefined) row.expiration_date = patch.expiration_date;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.verification_status !== undefined) row.verification_status = patch.verification_status;
  if (patch.file_reference !== undefined) row.file_reference = patch.file_reference;
  if (patch.original_filename !== undefined) row.original_filename = patch.original_filename;
  if (patch.mime_type !== undefined) row.mime_type = patch.mime_type;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.uploaded_by !== undefined) row.uploaded_by = patch.uploaded_by;
  if (patch.uploaded_at !== undefined) row.uploaded_at = patch.uploaded_at;
  if (patch.reviewed_by !== undefined) row.reviewed_by = patch.reviewed_by;
  if (patch.reviewed_at !== undefined) row.reviewed_at = patch.reviewed_at;
  if (patch.rejected_reason !== undefined) row.rejected_reason = patch.rejected_reason;
  if (patch.archived_at !== undefined) row.archived_at = patch.archived_at;
  if (patch.supersedes_document_id !== undefined) row.supersedes_document_id = patch.supersedes_document_id;
  if (patch.superseded_by_document_id !== undefined) row.superseded_by_document_id = patch.superseded_by_document_id;
  if (patch.location_id !== undefined) row.location_id = patch.location_id;
  if (patch.assigned_staff_id !== undefined) row.assigned_staff_id = patch.assigned_staff_id;
  if (patch.created_by !== undefined) row.created_by = patch.created_by;
  return row;
}

// ── Compliance: ComplianceRequirement ─────────────────────────────

export function rowToComplianceRequirement(
  r: ComplianceRequirementRow,
): ComplianceRequirement {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    entity_type: r.entity_type as DocumentEntityType,
    document_type: r.document_type as DocumentType,
    required: r.required,
    blocks_operation_if_missing: r.blocks_operation_if_missing,
    blocks_operation_if_expired: r.blocks_operation_if_expired,
    requires_verification: r.requires_verification,
    warning_days: r.warning_days,
    active: r.active,
    block_behavior: r.block_behavior as ComplianceBlockBehavior | null,
    manager_override_allowed: r.manager_override_allowed,
    source: r.source as "policy" | "custom",
    applies_to: r.applies_to,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function complianceRequirementToRow(
  r: ComplianceRequirement,
): Omit<ComplianceRequirementRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<ComplianceRequirementRow, "id" | "created_at" | "updated_at">> {
  return {
    id: r.id,
    organization_id: r.tenant_id,
    entity_type: r.entity_type,
    document_type: r.document_type,
    required: r.required,
    blocks_operation_if_missing: r.blocks_operation_if_missing,
    blocks_operation_if_expired: r.blocks_operation_if_expired,
    requires_verification: r.requires_verification,
    warning_days: r.warning_days,
    active: r.active,
    block_behavior: r.block_behavior ?? null,
    manager_override_allowed: r.manager_override_allowed ?? false,
    source: r.source,
    applies_to: r.applies_to,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ── Compliance: ComplianceOverride ────────────────────────────────

export function rowToComplianceOverride(
  r: ComplianceOverrideRow,
): ComplianceOverride {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    entity_type: r.entity_type as DocumentEntityType,
    entity_id: r.entity_id,
    document_type: r.document_type as DocumentType,
    requirement_id: r.requirement_id,
    reason: r.reason,
    created_by: r.created_by,
    created_at: r.created_at,
    expires_at: r.expires_at,
    active: r.active,
  };
}

export function complianceOverrideToRow(
  o: ComplianceOverride,
): Omit<ComplianceOverrideRow, "id" | "created_at"> &
  Partial<Pick<ComplianceOverrideRow, "id" | "created_at">> {
  return {
    id: o.id,
    organization_id: o.tenant_id,
    entity_type: o.entity_type,
    entity_id: o.entity_id,
    document_type: o.document_type,
    requirement_id: o.requirement_id,
    reason: o.reason,
    created_by: o.created_by,
    created_at: o.created_at,
    expires_at: o.expires_at,
    active: o.active,
  };
}

// ── Compliance: ComplianceEvent ──────────────────────────────────

export function rowToComplianceEvent(r: ComplianceEventRow): ComplianceEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    document_id: r.document_id,
    type: r.event_type as ComplianceEventType,
    label: r.label,
    at: r.created_at,
    actor_id: r.actor_id,
    meta: r.meta,
  };
}

export function complianceEventToRow(
  e: ComplianceEvent,
): Omit<ComplianceEventRow, "id" | "created_at"> &
  Partial<Pick<ComplianceEventRow, "id" | "created_at">> {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    document_id: e.document_id,
    event_type: e.type,
    label: e.label,
    actor_id: e.actor_id,
    meta: e.meta,
    created_at: e.at,
  };
}

// ── Verification: VerificationRequest ─────────────────────────────

export function rowToVerificationRequest(
  r: VerificationRequestRow,
): VerificationRequest {
  return {
    id: r.id,
    organization_id: r.organization_id,
    customer_id: r.customer_id,
    booking_request_id: r.booking_request_id,
    reservation_id: r.reservation_id,
    rental_id: r.rental_id,
    verification_type: r.verification_type as VerificationType,
    provider: r.provider as VerificationProviderId,
    status: r.status as VerificationRequestStatus,
    requested_at: r.requested_at,
    completed_at: r.completed_at,
    requested_by: r.requested_by,
    external_reference: r.external_reference,
    expires_at: r.expires_at,
    usage_charge_id: r.usage_charge_id,
    result: (r.result as unknown as VerificationResult | null) ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function verificationRequestToRow(
  v: VerificationRequest,
): Omit<VerificationRequestRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<VerificationRequestRow, "id" | "created_at" | "updated_at">> {
  return {
    id: v.id,
    organization_id: v.organization_id,
    customer_id: v.customer_id,
    booking_request_id: v.booking_request_id,
    reservation_id: v.reservation_id,
    rental_id: v.rental_id,
    verification_type: v.verification_type,
    provider: v.provider,
    status: v.status,
    requested_at: v.requested_at,
    completed_at: v.completed_at,
    requested_by: v.requested_by,
    external_reference: v.external_reference,
    expires_at: v.expires_at,
    usage_charge_id: v.usage_charge_id,
    result: (v.result as unknown as Record<string, unknown>) ?? null,
    created_at: v.created_at,
    updated_at: v.updated_at,
  };
}

// ── Verification: VerificationRequirement ─────────────────────────

export function rowToVerificationRequirement(
  r: VerificationRequirementRow,
): VerificationRequirement {
  return {
    id: r.id,
    organization_id: r.organization_id,
    verification_type: r.verification_type as VerificationType,
    customer_id: r.customer_id,
    booking_request_id: r.booking_request_id,
    reservation_id: r.reservation_id,
    rental_id: r.rental_id,
    required_by_staff_id: r.required_by_staff_id ?? "",
    required_at: r.required_at,
    reason: r.reason,
    removed: r.removed,
    removed_by_staff_id: r.removed_by_staff_id,
    removed_at: r.removed_at,
  };
}

export function verificationRequirementToRow(
  r: VerificationRequirement,
): Omit<VerificationRequirementRow, "id" | "required_at"> &
  Partial<Pick<VerificationRequirementRow, "id" | "required_at">> {
  return {
    id: r.id,
    organization_id: r.organization_id,
    verification_type: r.verification_type,
    customer_id: r.customer_id,
    booking_request_id: r.booking_request_id,
    reservation_id: r.reservation_id,
    rental_id: r.rental_id,
    required_by_staff_id: r.required_by_staff_id || null,
    required_at: r.required_at,
    reason: r.reason,
    removed: r.removed,
    removed_by_staff_id: r.removed_by_staff_id,
    removed_at: r.removed_at,
  };
}

// ── Verification: VerificationOverride ────────────────────────────

export function rowToVerificationOverride(
  r: VerificationOverrideRow,
): VerificationOverride {
  return {
    id: r.id,
    organization_id: r.organization_id,
    verification_request_id: r.verification_request_id,
    decision: r.decision as "approved" | "denied",
    reason: r.reason,
    staff_id: r.staff_id ?? "",
    created_at: r.created_at,
  };
}

export function verificationOverrideToRow(
  o: VerificationOverride,
): Omit<VerificationOverrideRow, "id" | "created_at"> &
  Partial<Pick<VerificationOverrideRow, "id" | "created_at">> {
  return {
    id: o.id,
    organization_id: o.organization_id,
    verification_request_id: o.verification_request_id,
    decision: o.decision,
    reason: o.reason,
    staff_id: o.staff_id || null,
    created_at: o.created_at,
  };
}

// ── Verification: VerificationAuditEvent ─────────────────────────

export function rowToVerificationAuditEvent(
  r: VerificationAuditEventRow,
): VerificationAuditEvent {
  return {
    id: r.id,
    organization_id: r.organization_id,
    verification_type: r.verification_type as VerificationType,
    customer_id: r.customer_id,
    rental_id: r.rental_id,
    reservation_id: r.reservation_id,
    booking_request_id: r.booking_request_id,
    event_type: r.event_type as VerificationAuditEventType,
    detail: r.detail,
    actor_id: r.actor_id,
    created_at: r.created_at,
  };
}

export function verificationAuditEventToRow(
  e: VerificationAuditEvent,
): Omit<VerificationAuditEventRow, "id" | "created_at"> &
  Partial<Pick<VerificationAuditEventRow, "id" | "created_at">> {
  return {
    id: e.id,
    organization_id: e.organization_id,
    verification_type: e.verification_type,
    customer_id: e.customer_id,
    rental_id: e.rental_id,
    reservation_id: e.reservation_id,
    booking_request_id: e.booking_request_id,
    event_type: e.event_type,
    detail: e.detail,
    actor_id: e.actor_id,
    created_at: e.created_at,
  };
}

// ── Verification: VerificationUsageCharge ────────────────────────

export function rowToVerificationUsageCharge(
  r: VerificationUsageChargeRow,
): VerificationUsageCharge {
  return {
    id: r.id,
    organization_id: r.organization_id,
    verification_request_id: r.verification_request_id,
    service_type: r.service_type as VerificationType,
    provider: r.provider as VerificationProviderId,
    provider_cost_mock: r.provider_cost_mock == null ? null : Number(r.provider_cost_mock),
    platform_price_mock: Number(r.platform_price_mock),
    currency: r.currency,
    status: r.status as UsageChargeStatus,
    created_at: r.created_at,
  };
}

export function verificationUsageChargeToRow(
  c: VerificationUsageCharge,
): Omit<VerificationUsageChargeRow, "id" | "created_at"> &
  Partial<Pick<VerificationUsageChargeRow, "id" | "created_at">> {
  return {
    id: c.id,
    organization_id: c.organization_id,
    verification_request_id: c.verification_request_id,
    service_type: c.service_type,
    provider: c.provider,
    provider_cost_mock: c.provider_cost_mock,
    platform_price_mock: c.platform_price_mock,
    currency: c.currency,
    status: c.status,
    created_at: c.created_at,
  };
}
