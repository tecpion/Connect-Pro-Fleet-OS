// Connect Pro Fleet — Phase 4 row ↔ domain mappers for telematics +
// tolls/violations + case center.
//
// The live schema uses `organization_id`; the frozen domain models use
// `tenant_id`. The mappers translate that boundary so the rest of the app
// (selectors, release gate, UI) keeps working unchanged.

import type {
  TelematicsDevice,
  TelematicsDeviceAssignment,
  TelematicsPosition,
  TelematicsEvent,
  TelematicsTrip,
  TelematicsAlert,
  TelematicsGeofence,
  TelematicsProviderId,
  TelematicsDeviceStatus,
  TelematicsEventType,
  TelematicsAlertType,
  TelematicsAlertStatus,
  TelematicsAlertSeverity,
  GeofenceType,
  IgnitionStatus,
} from "../telematicsTypes";
import type {
  Violation,
  ViolationType,
  ViolationStatus,
  ViolationResponsibility,
  ResponsibilityReason,
  DisputeStatus,
  CompanyPaymentStatus,
  CustomerChargeStatus,
  ReimbursementStatus,
  ViolationSource,
  MatchingConfidence,
  ViolationEvidence,
  ViolationEvidenceType,
  ViolationEvent,
  ViolationEventType,
} from "../violationTypes";
import type {
  CaseRecord,
  CaseEvent,
  CaseCategory,
  CaseStatus,
  CasePriority,
  CaseResponsibilityDetermination,
  CaseResponsibility,
  CaseFinancialLinks,
  CaseEvidenceLinks,
  CaseOutcome,
  TollTicketDetail,
  RoadsideDetail,
  DisputeDetail,
  CaseEventType,
} from "../caseCenterTypes";
import type {
  TelematicsDeviceRow,
  TelematicsDeviceAssignmentRow,
  TelematicsPositionRow,
  TelematicsEventRow,
  TelematicsTripRow,
  TelematicsAlertRow,
  TelematicsGeofenceRow,
  ViolationRow,
  ViolationEvidenceRow,
  ViolationEventRow,
  CaseRow,
  CaseEventRow,
} from "./dbTypesPhase4";
import { toMoney } from "./repository";

// ── Telematics: Device ───────────────────────────────────────────

export function rowToDevice(r: TelematicsDeviceRow): TelematicsDevice {
  return {
    id: r.id,
    organization_id: r.organization_id,
    provider: r.provider as TelematicsProviderId,
    external_device_id: r.external_device_id,
    imei_or_serial: r.imei_or_serial,
    vehicle_id: r.vehicle_id,
    status: r.status as TelematicsDeviceStatus,
    installed_at: r.installed_at,
    last_connected_at: r.last_connected_at,
    battery_voltage: r.battery_voltage,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  };
}

export function deviceToRow(d: TelematicsDevice): TelematicsDeviceRow {
  return {
    id: d.id,
    organization_id: d.organization_id,
    provider: d.provider,
    external_device_id: d.external_device_id,
    imei_or_serial: d.imei_or_serial,
    vehicle_id: d.vehicle_id,
    status: d.status,
    installed_at: d.installed_at,
    last_connected_at: d.last_connected_at,
    battery_voltage: d.battery_voltage,
    metadata: (d.metadata as never) ?? null,
    created_at: d.installed_at,
    updated_at: d.installed_at,
  };
}

export function devicePatchToRow(
  patch: Partial<TelematicsDevice>,
): Partial<TelematicsDeviceRow> {
  const out: Partial<TelematicsDeviceRow> = {};
  if (patch.vehicle_id !== undefined) out.vehicle_id = patch.vehicle_id;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.last_connected_at !== undefined)
    out.last_connected_at = patch.last_connected_at;
  if (patch.battery_voltage !== undefined)
    out.battery_voltage = patch.battery_voltage;
  if (patch.metadata !== undefined) out.metadata = patch.metadata as never;
  return out;
}

// ── Telematics: DeviceAssignment ──────────────────────────────────

export function rowToAssignment(
  r: TelematicsDeviceAssignmentRow,
): TelematicsDeviceAssignment {
  return {
    id: r.id,
    device_id: r.device_id,
    vehicle_id: r.vehicle_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    reason: r.reason,
  };
}

export function assignmentToRow(
  a: TelematicsDeviceAssignment,
  orgId: string,
): TelematicsDeviceAssignmentRow {
  return {
    id: a.id,
    organization_id: orgId,
    device_id: a.device_id,
    vehicle_id: a.vehicle_id,
    started_at: a.started_at,
    ended_at: a.ended_at,
    reason: a.reason,
    created_at: a.started_at,
  };
}

// ── Telematics: Position ──────────────────────────────────────────

export function rowToPosition(r: TelematicsPositionRow): TelematicsPosition {
  return {
    device_id: r.device_id,
    vehicle_id: r.vehicle_id,
    latitude: r.latitude,
    longitude: r.longitude,
    recorded_at: r.recorded_at,
    provider_timestamp: r.provider_timestamp,
    heading: r.heading,
    speed: r.speed,
    ignition_status: (r.ignition_status as IgnitionStatus) ?? null,
    odometer: r.odometer,
    battery_voltage: r.battery_voltage,
    gps_signal_status: (r.gps_signal_status as never) ?? null,
  };
}

// ── Telematics: Event ─────────────────────────────────────────────

export function rowToTelematicsEvent(r: TelematicsEventRow): TelematicsEvent {
  return {
    id: r.id,
    organization_id: r.organization_id,
    device_id: r.device_id,
    vehicle_id: r.vehicle_id,
    type: r.type as TelematicsEventType,
    occurred_at: r.occurred_at,
    latitude: r.latitude,
    longitude: r.longitude,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  };
}

// ── Telematics: Trip ──────────────────────────────────────────────

export function rowToTrip(r: TelematicsTripRow): TelematicsTrip {
  return {
    id: r.id,
    organization_id: r.organization_id,
    vehicle_id: r.vehicle_id,
    device_id: r.device_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    start_location: r.start_location,
    end_location: r.end_location,
    distance: r.distance,
    duration_minutes: r.duration_minutes,
    max_speed: r.max_speed,
    average_speed: r.average_speed,
    rental_id: r.rental_id,
  };
}

// ── Telematics: Alert ─────────────────────────────────────────────

export function rowToAlert(r: TelematicsAlertRow): TelematicsAlert {
  return {
    id: r.id,
    organization_id: r.organization_id,
    vehicle_id: r.vehicle_id,
    rental_id: r.rental_id,
    event_id: r.event_id,
    severity: r.severity as TelematicsAlertSeverity,
    type: r.type as TelematicsAlertType,
    occurred_at: r.occurred_at,
    location: r.location,
    status: r.status as TelematicsAlertStatus,
    assigned_to: r.assigned_to,
    acknowledged_at: r.acknowledged_at,
    acknowledged_by: r.acknowledged_by,
    resolution_notes: r.resolution_notes,
  };
}

export function alertToRow(a: TelematicsAlert): TelematicsAlertRow {
  return {
    id: a.id,
    organization_id: a.organization_id,
    vehicle_id: a.vehicle_id,
    rental_id: a.rental_id,
    event_id: a.event_id,
    severity: a.severity,
    type: a.type,
    occurred_at: a.occurred_at,
    location: a.location,
    status: a.status,
    assigned_to: a.assigned_to,
    acknowledged_at: a.acknowledged_at,
    acknowledged_by: a.acknowledged_by,
    resolution_notes: a.resolution_notes,
    created_at: a.occurred_at,
    updated_at: a.occurred_at,
  };
}

export function alertPatchToRow(
  patch: Partial<TelematicsAlert>,
): Partial<TelematicsAlertRow> {
  const out: Partial<TelematicsAlertRow> = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.assigned_to !== undefined) out.assigned_to = patch.assigned_to;
  if (patch.acknowledged_at !== undefined)
    out.acknowledged_at = patch.acknowledged_at;
  if (patch.acknowledged_by !== undefined)
    out.acknowledged_by = patch.acknowledged_by;
  if (patch.resolution_notes !== undefined)
    out.resolution_notes = patch.resolution_notes;
  return out;
}

// ── Telematics: Geofence ──────────────────────────────────────────

export function rowToGeofence(r: TelematicsGeofenceRow): TelematicsGeofence {
  return {
    id: r.id,
    organization_id: r.organization_id,
    name: r.name,
    type: r.type as GeofenceType,
    active: r.active,
    center_latitude: r.center_latitude,
    center_longitude: r.center_longitude,
    radius_meters: r.radius_meters,
    applies_to_all: r.applies_to_all,
    applies_to_class_id: r.applies_to_class_id,
    applies_to_vehicle_ids: (r.applies_to_vehicle_ids as string[] | null) ?? null,
    alert_on_enter: r.alert_on_enter,
    alert_on_exit: r.alert_on_exit,
    created_at: r.created_at,
  };
}

export function geofenceToRow(g: TelematicsGeofence): TelematicsGeofenceRow {
  return {
    id: g.id,
    organization_id: g.organization_id,
    name: g.name,
    type: g.type,
    active: g.active,
    center_latitude: g.center_latitude,
    center_longitude: g.center_longitude,
    radius_meters: g.radius_meters,
    applies_to_all: g.applies_to_all,
    applies_to_class_id: g.applies_to_class_id,
    applies_to_vehicle_ids: (g.applies_to_vehicle_ids as never) ?? null,
    alert_on_enter: g.alert_on_enter,
    alert_on_exit: g.alert_on_exit,
    created_at: g.created_at,
  };
}

// ── Violations ───────────────────────────────────────────────────

export function rowToViolation(r: ViolationRow): Violation {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    violation_number: r.violation_number,
    violation_type: r.violation_type as ViolationType,
    status: r.status as ViolationStatus,
    vehicle_id: r.vehicle_id,
    rental_id: r.rental_id,
    customer_id: r.customer_id,
    occurred_at: r.occurred_at,
    received_at: r.received_at,
    due_at: r.due_at,
    issuing_authority: r.issuing_authority,
    citation_number: r.citation_number,
    plate_number_snapshot: r.plate_number_snapshot,
    state_jurisdiction: r.state_jurisdiction,
    location_description: r.location_description,
    description: r.description,
    base_amount: toMoney(r.base_amount),
    penalties_amount: toMoney(r.penalties_amount),
    admin_fee_amount: toMoney(r.admin_fee_amount),
    total_amount: toMoney(r.total_amount),
    responsibility: r.responsibility as ViolationResponsibility,
    responsibility_reason: (r.responsibility_reason as ResponsibilityReason) ?? null,
    responsibility_notes: r.responsibility_notes,
    responsibility_decided_by: r.responsibility_decided_by,
    responsibility_decided_at: r.responsibility_decided_at,
    dispute_status: r.dispute_status as DisputeStatus,
    dispute_reason: r.dispute_reason,
    dispute_opened_at: r.dispute_opened_at,
    dispute_resolved_at: r.dispute_resolved_at,
    dispute_decision_note: r.dispute_decision_note,
    reduced_amount: r.reduced_amount == null ? null : toMoney(r.reduced_amount),
    company_payment_status: r.company_payment_status as CompanyPaymentStatus,
    customer_charge_status: r.customer_charge_status as CustomerChargeStatus,
    reimbursement_status: r.reimbursement_status as ReimbursementStatus,
    linked_expense_id: r.linked_expense_id,
    customer_charge_transaction_id: r.customer_charge_transaction_id,
    charge_idempotency_key: r.charge_idempotency_key,
    assigned_staff_id: r.assigned_staff_id,
    notes: r.notes,
    source: r.source as ViolationSource,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    resolved_at: r.resolved_at,
    provider: r.provider,
    external_event_id: r.external_event_id,
    matching_confidence: (r.matching_confidence as MatchingConfidence) ?? null,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
  };
}

export function violationToRow(v: Violation): ViolationRow {
  return {
    id: v.id,
    organization_id: v.tenant_id,
    violation_number: v.violation_number,
    violation_type: v.violation_type,
    status: v.status,
    vehicle_id: v.vehicle_id,
    rental_id: v.rental_id,
    customer_id: v.customer_id,
    occurred_at: v.occurred_at,
    received_at: v.received_at,
    due_at: v.due_at,
    issuing_authority: v.issuing_authority,
    citation_number: v.citation_number,
    plate_number_snapshot: v.plate_number_snapshot,
    state_jurisdiction: v.state_jurisdiction,
    location_description: v.location_description,
    description: v.description,
    base_amount: v.base_amount,
    penalties_amount: v.penalties_amount,
    admin_fee_amount: v.admin_fee_amount,
    total_amount: v.total_amount,
    responsibility: v.responsibility,
    responsibility_reason: v.responsibility_reason,
    responsibility_notes: v.responsibility_notes,
    responsibility_decided_by: v.responsibility_decided_by,
    responsibility_decided_at: v.responsibility_decided_at,
    dispute_status: v.dispute_status,
    dispute_reason: v.dispute_reason,
    dispute_opened_at: v.dispute_opened_at,
    dispute_resolved_at: v.dispute_resolved_at,
    dispute_decision_note: v.dispute_decision_note,
    reduced_amount: v.reduced_amount,
    company_payment_status: v.company_payment_status,
    customer_charge_status: v.customer_charge_status,
    reimbursement_status: v.reimbursement_status,
    linked_expense_id: v.linked_expense_id,
    customer_charge_transaction_id: v.customer_charge_transaction_id,
    charge_idempotency_key: v.charge_idempotency_key,
    assigned_staff_id: v.assigned_staff_id,
    notes: v.notes,
    source: v.source,
    created_by: v.created_by,
    created_at: v.created_at,
    updated_at: v.updated_at,
    resolved_at: v.resolved_at,
    provider: v.provider,
    external_event_id: v.external_event_id,
    matching_confidence: v.matching_confidence,
    reviewed_by: v.reviewed_by,
    reviewed_at: v.reviewed_at,
  };
}

export function violationPatchToRow(
  patch: Partial<Violation>,
): Partial<ViolationRow> {
  const out: Partial<ViolationRow> = {};
  for (const [k, val] of Object.entries(patch)) {
    if (k === "tenant_id") {
      out.organization_id = val as string;
    } else if (k in violationToRow(patch as Violation)) {
      (out as Record<string, unknown>)[k] = val;
    }
  }
  return out;
}

// ── Violation evidence ────────────────────────────────────────────

export function rowToViolationEvidence(
  r: ViolationEvidenceRow,
): ViolationEvidence {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    violation_id: r.violation_id,
    type: r.type as ViolationEvidenceType,
    file_ref: r.file_ref,
    source: r.source,
    description: r.description,
    uploaded_by: r.uploaded_by,
    uploaded_at: r.uploaded_at,
  };
}

export function violationEvidenceToRow(
  e: ViolationEvidence,
): ViolationEvidenceRow {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    violation_id: e.violation_id,
    type: e.type,
    file_ref: e.file_ref,
    source: e.source,
    description: e.description,
    uploaded_by: e.uploaded_by,
    uploaded_at: e.uploaded_at,
  };
}

// ── Violation events ──────────────────────────────────────────────

export function rowToViolationEvent(r: ViolationEventRow): ViolationEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    violation_id: r.violation_id,
    type: r.type as ViolationEventType,
    label: r.label,
    at: r.at,
    actor_id: r.actor_id,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
  };
}

export function violationEventToRow(e: ViolationEvent): ViolationEventRow {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    violation_id: e.violation_id,
    type: e.type,
    label: e.label,
    at: e.at,
    actor_id: e.actor_id,
    meta: (e.meta as never) ?? null,
    created_at: e.at,
  };
}

// ── Cases ─────────────────────────────────────────────────────────

export function rowToCase(r: CaseRow): CaseRecord {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    case_number: r.case_number,
    category: r.category as CaseCategory,
    status: r.status as CaseStatus,
    priority: r.priority as CasePriority,
    title: r.title,
    description: r.description,
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    rental_id: r.rental_id,
    event_date: r.event_date,
    assigned_staff_id: r.assigned_staff_id,
    location_id: r.location_id,
    due_date: r.due_date,
    responsibility:
      (r.responsibility as unknown as CaseResponsibilityDetermination) ?? {
        determination: "unreviewed" as CaseResponsibility,
        reason: null,
        determined_by: null,
        determined_at: null,
      },
    amount_at_issue: toMoney(r.amount_at_issue),
    toll_detail: (r.toll_detail as unknown as TollTicketDetail | null) ?? null,
    roadside_detail:
      (r.roadside_detail as unknown as RoadsideDetail | null) ?? null,
    dispute_detail:
      (r.dispute_detail as unknown as DisputeDetail | null) ?? null,
    financial_links:
      (r.financial_links as unknown as CaseFinancialLinks) ?? {
        customer_charge_ids: [],
        payment_ids: [],
        deposit_application_ids: [],
        refund_ids: [],
        expense_ids: [],
        insurance_claim_refs: [],
      },
    evidence_links:
      (r.evidence_links as unknown as CaseEvidenceLinks) ?? {
        rental_id: null,
        incident_id: null,
        violation_id: null,
        damage_claim_id: null,
        inspection_ids: [],
        vault_doc_refs: [],
        uploaded_file_refs: [],
      },
    outcome: (r.outcome as unknown as CaseOutcome | null) ?? null,
    notes: r.notes,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    last_activity_at: r.last_activity_at,
    resolved_at: r.resolved_at,
    closed_at: r.closed_at,
  };
}

export function caseToRow(c: CaseRecord): CaseRow {
  return {
    id: c.id,
    organization_id: c.tenant_id,
    case_number: c.case_number,
    category: c.category,
    status: c.status,
    priority: c.priority,
    title: c.title,
    description: c.description,
    customer_id: c.customer_id,
    vehicle_id: c.vehicle_id,
    rental_id: c.rental_id,
    event_date: c.event_date,
    assigned_staff_id: c.assigned_staff_id,
    location_id: c.location_id,
    due_date: c.due_date,
    responsibility: c.responsibility as never,
    amount_at_issue: c.amount_at_issue,
    toll_detail: (c.toll_detail as never) ?? null,
    roadside_detail: (c.roadside_detail as never) ?? null,
    dispute_detail: (c.dispute_detail as never) ?? null,
    financial_links: c.financial_links as never,
    evidence_links: c.evidence_links as never,
    outcome: (c.outcome as never) ?? null,
    notes: c.notes,
    created_by: c.created_by,
    created_at: c.created_at,
    updated_at: c.updated_at,
    last_activity_at: c.last_activity_at,
    resolved_at: c.resolved_at,
    closed_at: c.closed_at,
  };
}

export function casePatchToRow(patch: Partial<CaseRecord>): Partial<CaseRow> {
  const out: Partial<CaseRow> = {};
  for (const [k, val] of Object.entries(patch)) {
    if (k === "tenant_id") {
      out.organization_id = val as string;
    } else {
      (out as Record<string, unknown>)[k] = val;
    }
  }
  return out;
}

// ── Case events ───────────────────────────────────────────────────

export function rowToCaseEvent(r: CaseEventRow): CaseEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    case_id: r.case_id,
    type: r.type as CaseEventType,
    label: r.label,
    at: r.at,
    actor_id: r.actor_id,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
  };
}

export function caseEventToRow(e: CaseEvent): CaseEventRow {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    case_id: e.case_id,
    type: e.type,
    label: e.label,
    at: e.at,
    actor_id: e.actor_id,
    meta: (e.meta as never) ?? null,
    created_at: e.at,
  };
}
