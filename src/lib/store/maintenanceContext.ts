// Connect Pro Fleet — MaintenanceMethods interface (Build #13).
// Extracted from storeContext to keep it under the line limit.

import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
  WorkOrderStatus,
  WorkOrderPriority,
  MaintenanceType,
  WorkOrderSource,
  VendorType,
  ReceiptType,
} from "../maintenanceTypes";

export interface MaintenanceMethods {
  // --- work order selectors ------------------------------------------------
  workOrderById: (id: string) => MaintenanceWorkOrder | undefined;
  workOrderEvents: (workOrderId: string) => MaintenanceWorkOrderEvent[];
  workOrderReceipts: (workOrderId: string) => MaintenanceReceipt[];
  allWorkOrderReceipts: (workOrderId: string) => MaintenanceReceipt[];
  vehicleWorkOrders: (vehicleId: string) => MaintenanceWorkOrder[];

  // --- work order lifecycle ------------------------------------------------
  createWorkOrder: (input: {
    vehicle_id: string;
    title: string;
    maintenance_type: MaintenanceType;
    priority?: WorkOrderPriority;
    source?: WorkOrderSource;
    description?: string | null;
    reported_issue?: string | null;
    vendor_id?: string | null;
    assigned_user_id?: string | null;
    location_id?: string | null;
    scheduled_start_at?: string | null;
    expected_ready_at?: string | null;
    estimated_cost?: number | null;
    blocks_vehicle_use?: boolean;
    notes?: string | null;
  }) => string;
  updateWorkOrder: (
    id: string,
    patch: Partial<
      Pick<
        MaintenanceWorkOrder,
        | "title"
        | "description"
        | "reported_issue"
        | "diagnosis"
        | "work_performed"
        | "priority"
        | "maintenance_type"
        | "location_id"
        | "scheduled_start_at"
        | "expected_ready_at"
        | "estimated_cost"
        | "notes"
        | "internal_notes"
        | "fuel_level_in"
        | "blocks_vehicle_use"
      >
    >,
  ) => void;
  transitionWorkOrder: (id: string, to: WorkOrderStatus) => void;
  assignWorkOrder: (id: string, userId: string | null) => void;
  setWorkOrderVendor: (id: string, vendorId: string | null) => void;
  startWorkOrder: (id: string) => void;
  completeWorkOrder: (input: {
    id: string;
    work_performed?: string | null;
    actual_cost?: number | null;
    labor_cost?: number | null;
    parts_cost?: number | null;
    tax_cost?: number | null;
    other_cost?: number | null;
    odometer_out?: number | null;
    next_service_due_date?: string | null;
    next_service_due_odometer?: number | null;
    note?: string | null;
  }) => void;
  reopenWorkOrder: (id: string) => void;
  cancelWorkOrder: (id: string, reason: string) => void;

  // --- downtime ------------------------------------------------------------
  startDowntime: (id: string) => void;
  markVehicleReady: (id: string) => void;

  // --- cost correction (after completion) ----------------------------------
  updateWorkOrderCost: (input: {
    id: string;
    actual_cost?: number | null;
    labor_cost?: number | null;
    parts_cost?: number | null;
    tax_cost?: number | null;
    other_cost?: number | null;
    note?: string | null;
  }) => void;
  setNextService: (
    id: string,
    next: { date?: string | null; odometer?: number | null },
  ) => void;

  // --- receipts ------------------------------------------------------------
  addReceipt: (input: {
    work_order_id: string;
    file_name: string;
    file_url: string;
    mime_type?: string | null;
    receipt_type?: ReceiptType;
    amount?: number | null;
    vendor_id?: string | null;
    note?: string | null;
  }) => string;
  voidReceipt: (receiptId: string, reason?: string) => void;

  // --- vendors -------------------------------------------------------------
  addVendor: (input: {
    name: string;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postal?: string | null;
    vendor_type?: VendorType | null;
    notes?: string | null;
  }) => string;
  updateVendor: (id: string, patch: Partial<MaintenanceVendor>) => void;
  deactivateVendor: (id: string) => void;
  vendorById: (id: string) => MaintenanceVendor | undefined;

  // --- notes ---------------------------------------------------------------
  addWorkOrderNote: (id: string, text: string) => void;
}
