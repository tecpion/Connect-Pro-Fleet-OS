// Connect Pro Fleet — typed Database row types: investor/JV + migration +
// integration + infrastructure (Build #22).

import type { Json } from "./dbTypesCore";

export interface InvestorRow {
  id: string;
  organization_id: string;
  name: string;
  partner_type: string;
  contact_name: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  status: string;
  notes: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestorVehicleRow {
  id: string;
  organization_id: string;
  investor_id: string;
  vehicle_id: string;
  status: string;
  effective_date: string;
  end_date: string | null;
  compensation_type: string;
  percentage: number | null;
  basis: string | null;
  fixed_amount: number | null;
  fixed_frequency: string | null;
  guaranteed_when_not_rented: boolean | null;
  guaranteed_during_downtime: boolean | null;
  custom_terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnershipExpenseRuleRow {
  id: string;
  organization_id: string;
  pairing_id: string;
  category: string;
  treatment: string;
  responsible_party: string | null;
  deduct_before_split: boolean;
  notes: string | null;
}

export interface InvestorSettlementRow {
  id: string;
  organization_id: string;
  investor_id: string;
  pairing_id: string | null;
  vehicle_id: string | null;
  period_start: string;
  period_end: string;
  status: string;
  gross_revenue: number;
  expenses: number;
  investor_amount: number;
  operator_amount: number;
  finalized_at: string | null;
  finalized_by: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface MigrationImportBatchRow {
  id: string;
  organization_id: string;
  import_type: string;
  source_name: string;
  source_file_name: string | null;
  imported_by_user_id: string;
  imported_at: string;
  row_count: number;
  success_count: number;
  skipped_count: number;
  warning_count: number;
  error_count: number;
  rollback_status: string;
  metadata: Json | null;
}

export interface MigrationIssueRow {
  id: string;
  organization_id: string;
  batch_id: string;
  row_number: number | null;
  entity_type: string | null;
  severity: string;
  code: string;
  message: string;
  resolution: string | null;
  resolved_at: string | null;
}

export interface HistoricalFinancialPeriodRow {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  granularity: string;
  source_system: string;
  revenue: number;
  collections: number | null;
  expenses: number | null;
  net_profit: number | null;
  rental_count: number | null;
  vehicle_count: number | null;
  notes: string | null;
  import_batch_id: string | null;
  created_at: string;
}

export interface ConnectProIntegrationConfigRow {
  id: string;
  organization_id: string;
  enabled: boolean;
  connection_status: string;
  external_location_id: string | null;
  default_sync_enabled: boolean;
  payment_sync_enabled: boolean;
  billing_event_sync_enabled: boolean;
  customer_sync_enabled: boolean;
  webhook_secret_status: string;
  last_successful_sync_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationEventRow {
  id: string;
  organization_id: string;
  integration: string;
  event_type: string;
  direction: string;
  entity_type: string | null;
  entity_id: string | null;
  external_entity_id: string | null;
  payload: Json;
  event_key: string;
  schema_version: number;
  origin_system: string;
  origin_event_id: string | null;
  caused_by_event_id: string | null;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  processed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ExternalEntityReferenceRow {
  id: string;
  organization_id: string;
  system: string;
  entity_type: string;
  internal_id: string;
  external_id: string;
  external_parent_id: string | null;
  status: string;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationReviewItemRow {
  id: string;
  organization_id: string;
  event_id: string;
  review_type: string;
  severity: string;
  status: string;
  reason: string;
  candidate_entity_ids: Json | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface IdempotencyKeyRow {
  organization_id: string;
  scope: string;
  request_key: string;
  entity_id: string | null;
  created_at: string;
}

export interface DocumentSequenceRow {
  organization_id: string;
  sequence_type: string;
  year: number;
  current_value: number;
}

export interface ActivityLogRow {
  id: string;
  organization_id: string;
  at: string;
  label: string;
  tone: string;
  staff_id: string | null;
}

export interface FileObjectRow {
  id: string;
  organization_id: string;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  entity_type: string | null;
  entity_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}
