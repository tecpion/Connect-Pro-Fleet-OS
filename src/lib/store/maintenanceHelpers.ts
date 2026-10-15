// Connect Pro Fleet — maintenance work order helpers interface (Build #13).
// The interface is split from the implementation to keep files under the line
// limit. The implementation lives in maintenanceHelpersImpl.ts.

import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
  WorkOrderStatus,
  MaintenanceType,
  WorkOrderSource,
  WorkOrderPriority,
  VendorType,
  ReceiptType,
} from "../maintenanceTypes";

export interface MaintenanceHelpers {
  eventsFor: (workOrderId: string) => MaintenanceWorkOrderEvent[];
  activeReceipts: (workOrderId: string) => MaintenanceReceipt[];
  allReceipts: (workOrderId: string) => MaintenanceReceipt[];
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
  startDowntime: (id: string) => void;
  markVehicleReady: (id: string) => void;
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
  addWorkOrderNote: (id: string, text: string) => void;
}
