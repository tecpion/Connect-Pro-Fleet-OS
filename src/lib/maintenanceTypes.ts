// Connect Pro Fleet — Maintenance Work Orders domain types (Build #13).
//
// A MaintenanceWorkOrder is the repair/service lifecycle for a vehicle: what's
// wrong, what work needs doing, who's handling it, where the vehicle is, what it
// cost, how long it was down, and what was completed. It is NOT a financial
// transaction, a task, a notification, or a vehicle-expense-ledger entry — it may
// LINK to those records. Work-order EVENT history is append-oriented; the work
// order record itself is mutable operational state.
//
// Vehicle blocking is explicit (blocks_vehicle_use), never inferred from status
// or type. A nonblocking work order (e.g. an oil change scheduled next week) does
// not remove a vehicle from availability; a blocking one (engine failure) does.
// Restoring a vehicle to AVAILABLE only happens when no blocking active work
// order remains — completing one of several blocking orders never restores early.
//
// Cost is operational maintenance cost, structured to flow cleanly into the
// future Vehicle Expense Ledger (Build #14). It does NOT create rental ledger
// transactions, change customer balance, or affect investor settlement.

export type WorkOrderStatus =
  | "open"
  | "scheduled"
  | "in_progress"
  | "waiting_for_parts"
  | "waiting_for_approval"
  | "completed"
  | "cancelled";

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Open",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  waiting_for_parts: "Waiting for Parts",
  waiting_for_approval: "Waiting for Approval",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const WORK_ORDER_STATUS_TONE: Record<
  WorkOrderStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  open: "maintenance",
  scheduled: "maintenance",
  in_progress: "rented",
  waiting_for_parts: "maintenance",
  waiting_for_approval: "maintenance",
  completed: "available",
  cancelled: "neutral",
};

/** Active statuses — open or in progress (not completed/cancelled). */
export const WORK_ORDER_ACTIVE_STATUSES: WorkOrderStatus[] = [
  "open",
  "scheduled",
  "in_progress",
  "waiting_for_parts",
  "waiting_for_approval",
];

export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";

export const WORK_ORDER_PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const WORK_ORDER_PRIORITY_TONE: Record<
  WorkOrderPriority,
  "available" | "maintenance" | "out" | "neutral"
> = {
  low: "neutral",
  normal: "neutral",
  high: "maintenance",
  urgent: "out",
};

export type MaintenanceType =
  | "routine_service"
  | "oil_change"
  | "tires"
  | "brakes"
  | "battery"
  | "engine"
  | "transmission"
  | "electrical"
  | "body"
  | "glass"
  | "ac_heat"
  | "recall"
  | "inspection"
  | "detailing"
  | "other";

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  routine_service: "Routine Service",
  oil_change: "Oil Change",
  tires: "Tires",
  brakes: "Brakes",
  battery: "Battery",
  engine: "Engine",
  transmission: "Transmission",
  electrical: "Electrical",
  body: "Body",
  glass: "Glass",
  ac_heat: "AC / Heat",
  recall: "Recall",
  inspection: "Inspection",
  detailing: "Detailing",
  other: "Other",
};

export type WorkOrderSource =
  | "manual"
  | "system"
  | "inspection"
  | "damage"
  | "incident"
  | "vehicle_alert"
  | "return"
  | "other";

export const WORK_ORDER_SOURCE_LABELS: Record<WorkOrderSource, string> = {
  manual: "Manual",
  system: "System",
  inspection: "Inspection",
  damage: "Damage",
  incident: "Incident",
  vehicle_alert: "Vehicle Alert",
  return: "Return",
  other: "Other",
};

export type WorkOrderEventType =
  | "created"
  | "status_changed"
  | "assigned"
  | "reassigned"
  | "vendor_changed"
  | "cost_updated"
  | "receipt_added"
  | "receipt_voided"
  | "started"
  | "completed"
  | "reopened"
  | "cancelled"
  | "downtime_started"
  | "downtime_ended"
  | "next_service_set"
  | "vehicle_blocked"
  | "vehicle_restored"
  | "note_added";

export interface MaintenanceWorkOrderEvent {
  id: string;
  tenant_id: string;
  work_order_id: string;
  event_type: WorkOrderEventType;
  /** Human-readable summary of the event (e.g. "Work order completed"). */
  label: string;
  actor_user_id: string | null; // staff id, or null for SYSTEM
  actor_is_system: boolean;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  tenant_id: string;
  work_order_number: string; // WO-2026-000001
  vehicle_id: string;
  location_id: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  maintenance_type: MaintenanceType;
  source: WorkOrderSource;
  title: string;
  description: string | null;
  reported_issue: string | null;
  diagnosis: string | null;
  work_performed: string | null;
  vendor_id: string | null;
  assigned_user_id: string | null;
  opened_by_user_id: string | null;
  opened_at: string;
  scheduled_start_at: string | null;
  actual_start_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
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
  /** Explicit flag: does this work order take the vehicle out of service?
   *  Blocking is never inferred from status or type. */
  blocks_vehicle_use: boolean;
  downtime_started_at: string | null;
  downtime_ended_at: string | null;
  next_service_due_date: string | null;
  next_service_due_odometer: number | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Maintenance vendors
// ---------------------------------------------------------------------------

export type VendorType =
  | "repair_shop"
  | "dealership"
  | "tire_shop"
  | "body_shop"
  | "mobile_mechanic"
  | "detailer"
  | "glass"
  | "towing"
  | "other";

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  repair_shop: "Repair Shop",
  dealership: "Dealership",
  tire_shop: "Tire Shop",
  body_shop: "Body Shop",
  mobile_mechanic: "Mobile Mechanic",
  detailer: "Detailer",
  glass: "Glass",
  towing: "Towing",
  other: "Other",
};

export interface MaintenanceVendor {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal: string | null;
  vendor_type: VendorType | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Maintenance receipts / documents
// ---------------------------------------------------------------------------

export type ReceiptType =
  "receipt" | "invoice" | "estimate" | "warranty" | "other";

export const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  estimate: "Estimate",
  warranty: "Warranty",
  other: "Other",
};

export interface MaintenanceReceipt {
  id: string;
  tenant_id: string;
  work_order_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  receipt_type: ReceiptType;
  amount: number | null;
  vendor_id: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  note: string | null;
  /** Voided receipts remain in history (never hard-deleted). */
  voided_at: string | null;
}
