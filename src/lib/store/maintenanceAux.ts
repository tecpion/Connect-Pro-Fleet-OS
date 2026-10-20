// Connect Pro Fleet — maintenance receipts, vendors, cost & notes (Build #13).
// Split from the lifecycle methods to stay under the line limit. Receipts are
// never hard-deleted (voided_at preserves history). Cost correction works after
// completion. Vendors are operational service providers (no payables).

import type {
  MaintenanceWorkOrder,
  MaintenanceVendor,
  MaintenanceReceipt,
  VendorType,
  ReceiptType,
} from "../maintenanceTypes";
import { TENANT_ID, uid } from "./ids";
import {
  persistMaintenanceVendorInsert,
  persistMaintenanceVendorUpdate,
  persistMaintenanceReceiptInsert,
  persistMaintenanceReceiptUpdate,
} from "../supabase/maintenanceAdapters";
import type { StoreState } from "./storeState";
import type { MaintenanceShared } from "./maintenanceShared";

export function buildMaintenanceAux(s: StoreState, h: MaintenanceShared) {
  return {
    updateWorkOrderCost: (input: {
      id: string;
      actual_cost?: number | null;
      labor_cost?: number | null;
      parts_cost?: number | null;
      tax_cost?: number | null;
      other_cost?: number | null;
      note?: string | null;
    }) => {
      const wo = s.workOrders.find((w) => w.id === input.id);
      if (!wo) return;
      const patch: Partial<MaintenanceWorkOrder> = {};
      if (input.actual_cost !== undefined)
        patch.actual_cost = input.actual_cost;
      if (input.labor_cost !== undefined) patch.labor_cost = input.labor_cost;
      if (input.parts_cost !== undefined) patch.parts_cost = input.parts_cost;
      if (input.tax_cost !== undefined) patch.tax_cost = input.tax_cost;
      if (input.other_cost !== undefined) patch.other_cost = input.other_cost;
      h.patchWO(input.id, patch);
      h.logEvent(input.id, "cost_updated", "Cost updated", {
        oldValue: String(wo.actual_cost ?? "—"),
        newValue: String(input.actual_cost ?? "—"),
        note: input.note,
      });
    },

    setNextService: (
      id: string,
      next: { date?: string | null; odometer?: number | null },
    ) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo) return;
      const patch: Partial<MaintenanceWorkOrder> = {};
      if (next.date !== undefined) patch.next_service_due_date = next.date;
      if (next.odometer !== undefined)
        patch.next_service_due_odometer = next.odometer;
      h.patchWO(id, patch);
      h.logEvent(id, "next_service_set", "Next service due updated");
    },

    addReceipt: (input: {
      work_order_id: string;
      file_name: string;
      file_url: string;
      mime_type?: string | null;
      receipt_type?: ReceiptType;
      amount?: number | null;
      vendor_id?: string | null;
      note?: string | null;
    }): string => {
      const now = new Date().toISOString();
      const id = uid("mrc");
      const receipt: MaintenanceReceipt = {
        id,
        tenant_id: TENANT_ID,
        work_order_id: input.work_order_id,
        file_name: input.file_name,
        file_url: input.file_url,
        mime_type: input.mime_type ?? null,
        receipt_type: input.receipt_type ?? "receipt",
        amount: input.amount ?? null,
        vendor_id: input.vendor_id ?? null,
        uploaded_by: s.currentStaffId,
        uploaded_at: now,
        note: input.note ?? null,
        voided_at: null,
      };
      s.setMaintenanceReceipts((rs) => [receipt, ...rs]);
      persistMaintenanceReceiptInsert(receipt);
      h.logEvent(
        input.work_order_id,
        "receipt_added",
        `Receipt added — ${input.file_name}`,
      );
      return id;
    },

    voidReceipt: (receiptId: string, reason?: string) => {
      const receipt = s.maintenanceReceipts.find((r) => r.id === receiptId);
      if (!receipt || receipt.voided_at) return;
      const now = new Date().toISOString();
      const voided: MaintenanceReceipt = { ...receipt, voided_at: now };
      s.setMaintenanceReceipts((rs) =>
        rs.map((r) => (r.id === receiptId ? voided : r)),
      );
      persistMaintenanceReceiptUpdate(voided.tenant_id, receiptId, {
        voided_at: now,
      });
      h.logEvent(
        receipt.work_order_id,
        "receipt_voided",
        `Receipt voided — ${receipt.file_name}`,
        { note: reason ?? null },
      );
    },

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
    }): string => {
      const now = new Date().toISOString();
      const id = uid("vnv");
      const vendor: MaintenanceVendor = {
        id,
        tenant_id: TENANT_ID,
        name: input.name,
        contact_name: input.contact_name ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postal: input.postal ?? null,
        vendor_type: input.vendor_type ?? null,
        notes: input.notes ?? null,
        active: true,
        created_at: now,
        updated_at: now,
      };
      s.setMaintenanceVendors((vs) => [vendor, ...vs]);
      persistMaintenanceVendorInsert(vendor);
      return id;
    },

    updateVendor: (id: string, patch: Partial<MaintenanceVendor>) => {
      const existing = s.maintenanceVendors.find((v) => v.id === id);
      s.setMaintenanceVendors((vs) =>
        vs.map((v) =>
          v.id === id
            ? { ...v, ...patch, updated_at: new Date().toISOString() }
            : v,
        ),
      );
      if (existing)
        persistMaintenanceVendorUpdate(existing.tenant_id, id, patch);
    },

    deactivateVendor: (id: string) => {
      const existing = s.maintenanceVendors.find((v) => v.id === id);
      s.setMaintenanceVendors((vs) =>
        vs.map((v) =>
          v.id === id
            ? { ...v, active: false, updated_at: new Date().toISOString() }
            : v,
        ),
      );
      if (existing)
        persistMaintenanceVendorUpdate(existing.tenant_id, id, {
          active: false,
        });
    },

    addWorkOrderNote: (id: string, text: string) => {
      h.logEvent(id, "note_added", "Note added", { note: text });
    },
  };
}
