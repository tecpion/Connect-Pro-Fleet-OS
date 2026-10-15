// Connect Pro Fleet — typed Database row types: maintenance + damage (Build #22).

import type { Json } from "./dbTypesCore";

export interface MaintenanceWorkOrderRow {
  id: string;
  organization_id: string;
  work_order_number: string;
  vehicle_id: string;
  location_id: string | null;
  status: string;
  priority: string;
  maintenance_type: string;
  source: string;
  title: string;
  description: string;
  reported_issue: string | null;
  diagnosis: string | null;
  work_performed: string | null;
  vendor_id: string | null;
  assigned_user_id: string | null;
  opened_by_user_id: string;
  opened_at: string;
  scheduled_start_at: string | null;
  actual_start_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expected_ready_at: string | null;
  actual_ready_at: string | null;
  odometer_in: number | null;
  odometer_out: number | null;
  fuel_level_in: number | null;
  notes: string | null;
  internal_notes: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  tax_cost: number | null;
  other_cost: number | null;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  next_service_due_date: string | null;
  next_service_due_odometer: number | null;
  blocks_vehicle_use: boolean;
  damage_claim_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceVendorRow {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  vendor_type: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceReceiptRow {
  id: string;
  organization_id: string;
  work_order_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  amount: number | null;
  vendor_id: string | null;
  receipt_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
  note: string | null;
}

export interface MaintenanceWorkOrderEventRow {
  id: string;
  organization_id: string;
  work_order_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_is_system: boolean;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export interface DamageClaimRow {
  id: string;
  organization_id: string;
  claim_number: string;
  vehicle_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  customer_id: string | null;
  inspection_id: string | null;
  incident_id: string | null;
  claim_status: string;
  damage_source: string;
  discovered_at: string;
  discovered_by_user_id: string | null;
  damage_date: string | null;
  location_id: string | null;
  responsibility_status: string;
  responsible_party_type: string | null;
  customer_responsibility_percent: number | null;
  description: string;
  severity: string;
  pre_existing: string | null;
  blocks_vehicle_use: boolean;
  estimated_repair_cost: number | null;
  approved_repair_cost: number | null;
  actual_repair_cost: number | null;
  customer_charge_amount: number | null;
  insurance_recovery_amount: number | null;
  other_recovery_amount: number | null;
  maintenance_work_order_id: string | null;
  insurance_claim_id: string | null;
  external_reference: string | null;
  assigned_user_id: string | null;
  closed_at: string | null;
  closed_by_user_id: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export interface DamageEvidenceRow {
  id: string;
  organization_id: string;
  damage_claim_id: string;
  evidence_type: string;
  storage_path: string;
  inspection_photo_id: string | null;
  description: string | null;
  captured_at: string | null;
  uploaded_by_user_id: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface DamageClaimEventRow {
  id: string;
  organization_id: string;
  damage_claim_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_is_system: boolean;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export interface DamageInsuranceClaimRow {
  id: string;
  organization_id: string;
  damage_claim_id: string;
  insurer_name: string;
  policy_reference: string | null;
  claim_reference: string;
  claim_status: string;
  deductible_amount: number | null;
  claimed_amount: number | null;
  approved_amount: number | null;
  paid_amount: number | null;
  filed_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  adjuster_name: string | null;
  adjuster_contact: string | null;
  notes: string | null;
  created_at: string;
}

export interface DamageRecoveryRow {
  id: string;
  organization_id: string;
  damage_claim_id: string;
  recovery_type: string;
  amount: number;
  date: string;
  source_reference: string | null;
  ledger_transaction_id: string | null;
  deposit_transaction_id: string | null;
  insurance_claim_id: string | null;
  notes: string | null;
  created_at: string;
  reversed_at: string | null;
}
