// Connect Pro Fleet — row <-> domain mappers: Maintenance work orders, events,
// vendors, receipts (Phase 7 / Build #22 family).
//
// Maps between the Supabase row types declared in dbTypesMaintenance.ts and
// the existing domain objects in maintenanceTypes.ts so the repository adapter
// stays focused. Money columns (numeric in SQL, returned as strings) are
// normalized to rounded numbers via toMoney.
//
// Shape notes:
// - Row `description`/`mime_type` are NOT nullable; domain allows null, so we
//   coerce with `?? ""` when writing and pass through (string is assignable to
//   string|null) when reading.
// - Row has `damage_claim_id`; the domain work order does not surface it, so it
//   is omitted from the domain object and left null on write.
// - Domain `cancellation_reason`/`voided_at` have no row column; they are kept
//   out of the row payload (read-side returns null).

import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
  WorkOrderStatus,
  WorkOrderPriority,
  MaintenanceType,
  WorkOrderSource,
  WorkOrderEventType,
  VendorType,
  ReceiptType,
} from "../maintenanceTypes";
import type {
  MaintenanceWorkOrderRow,
  MaintenanceWorkOrderEventRow,
  MaintenanceVendorRow,
  MaintenanceReceiptRow,
} from "./database.types";
import { toMoney } from "./repository";

export function rowToWorkOrder(
  r: MaintenanceWorkOrderRow,
): MaintenanceWorkOrder {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    work_order_number: r.work_order_number,
    vehicle_id: r.vehicle_id,
    location_id: r.location_id,
    status: r.status as WorkOrderStatus,
    priority: r.priority as WorkOrderPriority,
    maintenance_type: r.maintenance_type as MaintenanceType,
    source: r.source as WorkOrderSource,
    title: r.title,
    description: r.description,
    reported_issue: r.reported_issue,
    diagnosis: r.diagnosis,
    work_performed: r.work_performed,
    vendor_id: r.vendor_id,
    assigned_user_id: r.assigned_user_id,
    opened_by_user_id: r.opened_by_user_id,
    opened_at: r.opened_at,
    scheduled_start_at: r.scheduled_start_at,
    actual_start_at: r.actual_start_at,
    completed_at: r.completed_at,
    cancelled_at: r.cancelled_at,
    cancellation_reason: null,
    expected_ready_at: r.expected_ready_at,
    actual_ready_at: r.actual_ready_at,
    odometer_in: r.odometer_in,
    odometer_out: r.odometer_out,
    fuel_level_in: r.fuel_level_in,
    notes: r.notes,
    internal_notes: r.internal_notes,
    estimated_cost: r.estimated_cost != null ? toMoney(r.estimated_cost) : null,
    actual_cost: r.actual_cost != null ? toMoney(r.actual_cost) : null,
    labor_cost: r.labor_cost != null ? toMoney(r.labor_cost) : null,
    parts_cost: r.parts_cost != null ? toMoney(r.parts_cost) : null,
    tax_cost: r.tax_cost != null ? toMoney(r.tax_cost) : null,
    other_cost: r.other_cost != null ? toMoney(r.other_cost) : null,
    blocks_vehicle_use: r.blocks_vehicle_use,
    downtime_started_at: r.downtime_started_at,
    downtime_ended_at: r.downtime_ended_at,
    next_service_due_date: r.next_service_due_date,
    next_service_due_odometer: r.next_service_due_odometer,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function workOrderToRow(
  w: MaintenanceWorkOrder,
): Partial<MaintenanceWorkOrderRow> {
  return {
    id: w.id,
    organization_id: w.tenant_id,
    work_order_number: w.work_order_number,
    vehicle_id: w.vehicle_id,
    location_id: w.location_id,
    status: w.status,
    priority: w.priority,
    maintenance_type: w.maintenance_type,
    source: w.source,
    title: w.title,
    description: w.description ?? "",
    reported_issue: w.reported_issue,
    diagnosis: w.diagnosis,
    work_performed: w.work_performed,
    vendor_id: w.vendor_id,
    assigned_user_id: w.assigned_user_id,
    opened_by_user_id: w.opened_by_user_id ?? undefined,
    opened_at: w.opened_at,
    scheduled_start_at: w.scheduled_start_at,
    actual_start_at: w.actual_start_at,
    completed_at: w.completed_at,
    cancelled_at: w.cancelled_at,
    expected_ready_at: w.expected_ready_at,
    actual_ready_at: w.actual_ready_at,
    odometer_in: w.odometer_in,
    odometer_out: w.odometer_out,
    fuel_level_in: w.fuel_level_in,
    notes: w.notes,
    internal_notes: w.internal_notes,
    estimated_cost: w.estimated_cost,
    actual_cost: w.actual_cost,
    labor_cost: w.labor_cost,
    parts_cost: w.parts_cost,
    tax_cost: w.tax_cost,
    other_cost: w.other_cost,
    downtime_started_at: w.downtime_started_at,
    downtime_ended_at: w.downtime_ended_at,
    next_service_due_date: w.next_service_due_date,
    next_service_due_odometer: w.next_service_due_odometer,
    blocks_vehicle_use: w.blocks_vehicle_use,
    created_at: w.created_at,
    updated_at: w.updated_at,
  };
}

export function workOrderPatchToRow(
  patch: Partial<MaintenanceWorkOrder>,
): Partial<MaintenanceWorkOrderRow> {
  return workOrderToRow({ ...({} as MaintenanceWorkOrder), ...patch });
}

export function rowToWorkOrderEvent(
  r: MaintenanceWorkOrderEventRow,
): MaintenanceWorkOrderEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    work_order_id: r.work_order_id,
    event_type: r.event_type as WorkOrderEventType,
    label: r.new_value ?? r.note ?? r.event_type,
    actor_user_id: r.actor_user_id,
    actor_is_system: r.actor_is_system,
    old_value: r.old_value,
    new_value: r.new_value,
    note: r.note,
    created_at: r.created_at,
  };
}

export function workOrderEventToRow(
  e: MaintenanceWorkOrderEvent,
): Partial<MaintenanceWorkOrderEventRow> {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    work_order_id: e.work_order_id,
    event_type: e.event_type,
    actor_user_id: e.actor_user_id,
    actor_is_system: e.actor_is_system,
    old_value: e.old_value,
    new_value: e.new_value,
    note: e.note,
    created_at: e.created_at,
  };
}

export function rowToMaintenanceVendor(
  r: MaintenanceVendorRow,
): MaintenanceVendor {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    contact_name: r.contact_name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    city: r.city,
    state: r.state,
    postal: r.postal,
    vendor_type: (r.vendor_type as VendorType | null) ?? null,
    notes: r.notes,
    active: r.active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function maintenanceVendorToRow(
  v: MaintenanceVendor,
): Partial<MaintenanceVendorRow> {
  return {
    id: v.id,
    organization_id: v.tenant_id,
    name: v.name,
    contact_name: v.contact_name,
    phone: v.phone,
    email: v.email,
    address: v.address,
    city: v.city,
    state: v.state,
    postal: v.postal,
    vendor_type: v.vendor_type,
    notes: v.notes,
    active: v.active,
    created_at: v.created_at,
    updated_at: v.updated_at,
  };
}

export function rowToMaintenanceReceipt(
  r: MaintenanceReceiptRow,
): MaintenanceReceipt {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    work_order_id: r.work_order_id,
    file_name: r.file_name,
    file_url: r.storage_path,
    mime_type: r.mime_type,
    receipt_type: (r.receipt_type as ReceiptType) ?? "other",
    amount: r.amount != null ? toMoney(r.amount) : null,
    vendor_id: r.vendor_id,
    uploaded_by: r.uploaded_by,
    uploaded_at: r.uploaded_at,
    note: r.note,
    voided_at: null,
  };
}

export function maintenanceReceiptToRow(
  rc: MaintenanceReceipt,
): Partial<MaintenanceReceiptRow> {
  return {
    id: rc.id,
    organization_id: rc.tenant_id,
    work_order_id: rc.work_order_id,
    file_name: rc.file_name,
    storage_path: rc.file_url,
    mime_type: rc.mime_type ?? "",
    amount: rc.amount,
    vendor_id: rc.vendor_id,
    receipt_type: rc.receipt_type,
    uploaded_by: rc.uploaded_by,
    uploaded_at: rc.uploaded_at,
    note: rc.note,
  };
}
