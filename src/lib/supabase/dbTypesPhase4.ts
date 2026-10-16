// Connect Pro Fleet — Phase 4 typed Database row types:
// telematics + tolls/violations + case center.

import type { Json } from "./dbTypesCore";

// =========================================================================
// TELEMATICS
// =========================================================================

export interface TelematicsDeviceRow {
  id: string;
  organization_id: string;
  provider: string;
  external_device_id: string;
  imei_or_serial: string | null;
  vehicle_id: string | null;
  status: string;
  installed_at: string;
  last_connected_at: string | null;
  battery_voltage: number | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export interface TelematicsDeviceAssignmentRow {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  reason: string | null;
  created_at: string;
}

export interface TelematicsPositionRow {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  provider_timestamp: string | null;
  heading: number | null;
  speed: number | null;
  ignition_status: string | null;
  odometer: number | null;
  battery_voltage: number | null;
  gps_signal_status: string | null;
  created_at: string;
}

export interface TelematicsEventRow {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string;
  type: string;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  metadata: Json | null;
  created_at: string;
}

export interface TelematicsTripRow {
  id: string;
  organization_id: string;
  vehicle_id: string;
  device_id: string;
  started_at: string;
  ended_at: string;
  start_location: string;
  end_location: string;
  distance: number | null;
  duration_minutes: number | null;
  max_speed: number | null;
  average_speed: number | null;
  rental_id: string | null;
  created_at: string;
}

export interface TelematicsAlertRow {
  id: string;
  organization_id: string;
  vehicle_id: string;
  rental_id: string | null;
  event_id: string | null;
  severity: string;
  type: string;
  occurred_at: string;
  location: string | null;
  status: string;
  assigned_to: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelematicsGeofenceRow {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  active: boolean;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number | null;
  applies_to_all: boolean;
  applies_to_class_id: string | null;
  applies_to_vehicle_ids: Json | null;
  alert_on_enter: boolean;
  alert_on_exit: boolean;
  created_at: string;
}

// =========================================================================
// TOLLS / VIOLATIONS
// =========================================================================

export interface ViolationRow {
  id: string;
  organization_id: string;
  violation_number: string;
  violation_type: string;
  status: string;
  vehicle_id: string;
  rental_id: string | null;
  customer_id: string | null;
  occurred_at: string;
  received_at: string | null;
  due_at: string | null;
  issuing_authority: string | null;
  citation_number: string | null;
  plate_number_snapshot: string | null;
  state_jurisdiction: string | null;
  location_description: string | null;
  description: string | null;
  base_amount: number;
  penalties_amount: number;
  admin_fee_amount: number;
  total_amount: number;
  responsibility: string;
  responsibility_reason: string | null;
  responsibility_notes: string | null;
  responsibility_decided_by: string | null;
  responsibility_decided_at: string | null;
  dispute_status: string;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  dispute_resolved_at: string | null;
  dispute_decision_note: string | null;
  reduced_amount: number | null;
  company_payment_status: string;
  customer_charge_status: string;
  reimbursement_status: string;
  linked_expense_id: string | null;
  customer_charge_transaction_id: string | null;
  charge_idempotency_key: string | null;
  assigned_staff_id: string | null;
  notes: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  provider: string | null;
  external_event_id: string | null;
  matching_confidence: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface ViolationEvidenceRow {
  id: string;
  organization_id: string;
  violation_id: string;
  type: string;
  file_ref: string | null;
  source: string | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ViolationEventRow {
  id: string;
  organization_id: string;
  violation_id: string;
  type: string;
  label: string;
  at: string;
  actor_id: string | null;
  meta: Json | null;
  created_at: string;
}

// =========================================================================
// CASE CENTER
// =========================================================================

export interface CaseRow {
  id: string;
  organization_id: string;
  case_number: string;
  category: string;
  status: string;
  priority: string;
  title: string;
  description: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  rental_id: string | null;
  event_date: string | null;
  assigned_staff_id: string | null;
  location_id: string | null;
  due_date: string | null;
  responsibility: Json;
  amount_at_issue: number;
  toll_detail: Json | null;
  roadside_detail: Json | null;
  dispute_detail: Json | null;
  financial_links: Json;
  evidence_links: Json;
  outcome: Json | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface CaseEventRow {
  id: string;
  organization_id: string;
  case_id: string;
  type: string;
  label: string;
  at: string;
  actor_id: string | null;
  meta: Json | null;
  created_at: string;
}
