// Connect Pro Fleet — Phase 7 Cloud store hydration + persistence sync for
// Maintenance (work orders + events + vendors + receipts).
//
// Mirrors the established Phase 1/2/5 storeSync pattern: the frozen in-memory
// store keeps its useState arrays as the UI cache; this module hydrates them
// from Cloud on auth/org change and persists mutations through the repository
// abstraction (UI → store method → repository → Cloud). In memory mode (no
// Cloud config) every function is a no-op so the seeded demo experience is
// unchanged.
//
// The row<->domain mappers live in maintenanceMappers.ts; this module owns
// the repository interface + Supabase adapter + hydration + persistence hooks.

import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
} from "../maintenanceTypes";
import type {
  MaintenanceWorkOrderRow,
  MaintenanceWorkOrderEventRow,
  MaintenanceVendorRow,
  MaintenanceReceiptRow,
} from "./database.types";
import type { getSupabase } from "./client";
import { getBackendMode } from "./client";
import { createRepositories } from "./repository";
import { normalizeError, toMoney } from "./repository";
import {
  rowToWorkOrder,
  workOrderToRow,
  workOrderPatchToRow,
  rowToWorkOrderEvent,
  workOrderEventToRow,
  rowToMaintenanceVendor,
  maintenanceVendorToRow,
  rowToMaintenanceReceipt,
  maintenanceReceiptToRow,
} from "./maintenanceMappers";

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface MaintenanceRepository {
  listWorkOrders(orgId: string): Promise<MaintenanceWorkOrder[]>;
  getWorkOrder(orgId: string, id: string): Promise<MaintenanceWorkOrder | null>;
  insertWorkOrder(w: MaintenanceWorkOrder): Promise<MaintenanceWorkOrder>;
  updateWorkOrder(
    orgId: string,
    id: string,
    patch: Partial<MaintenanceWorkOrder>,
  ): Promise<MaintenanceWorkOrder>;

  listWorkOrderEvents(
    orgId: string,
    workOrderId: string,
  ): Promise<MaintenanceWorkOrderEvent[]>;
  insertWorkOrderEvent(
    e: MaintenanceWorkOrderEvent,
  ): Promise<MaintenanceWorkOrderEvent>;

  listVendors(orgId: string): Promise<MaintenanceVendor[]>;
  insertVendor(v: MaintenanceVendor): Promise<MaintenanceVendor>;
  updateVendor(
    orgId: string,
    id: string,
    patch: Partial<MaintenanceVendor>,
  ): Promise<MaintenanceVendor>;

  listReceipts(orgId: string): Promise<MaintenanceReceipt[]>;
  insertReceipt(rc: MaintenanceReceipt): Promise<MaintenanceReceipt>;
  updateReceipt(
    orgId: string,
    id: string,
    patch: Partial<MaintenanceReceipt>,
  ): Promise<MaintenanceReceipt>;
}

// ---------------------------------------------------------------------------
// Supabase adapter
// ---------------------------------------------------------------------------

type Db = NonNullable<ReturnType<typeof getSupabase>>;

export class SupabaseMaintenanceRepository implements MaintenanceRepository {
  constructor(private db: Db) {}

  async listWorkOrders(orgId: string): Promise<MaintenanceWorkOrder[]> {
    const { data, error } = await this.db
      .from("maintenance_work_orders")
      .select("*")
      .eq("organization_id", orgId)
      .order("opened_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map((r) =>
      rowToWorkOrder(r as MaintenanceWorkOrderRow),
    );
  }

  async getWorkOrder(
    orgId: string,
    id: string,
  ): Promise<MaintenanceWorkOrder | null> {
    const { data, error } = await this.db
      .from("maintenance_work_orders")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToWorkOrder(data as MaintenanceWorkOrderRow) : null;
  }

  async insertWorkOrder(
    w: MaintenanceWorkOrder,
  ): Promise<MaintenanceWorkOrder> {
    const { data, error } = await this.db
      .from("maintenance_work_orders")
      .insert(workOrderToRow(w))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToWorkOrder(data as MaintenanceWorkOrderRow);
  }

  async updateWorkOrder(
    orgId: string,
    id: string,
    patch: Partial<MaintenanceWorkOrder>,
  ): Promise<MaintenanceWorkOrder> {
    const { data, error } = await this.db
      .from("maintenance_work_orders")
      .update(workOrderPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToWorkOrder(data as MaintenanceWorkOrderRow);
  }

  async listWorkOrderEvents(
    orgId: string,
    workOrderId: string,
  ): Promise<MaintenanceWorkOrderEvent[]> {
    const { data, error } = await this.db
      .from("maintenance_work_order_events")
      .select("*")
      .eq("organization_id", orgId)
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map((r) =>
      rowToWorkOrderEvent(r as MaintenanceWorkOrderEventRow),
    );
  }

  async insertWorkOrderEvent(
    e: MaintenanceWorkOrderEvent,
  ): Promise<MaintenanceWorkOrderEvent> {
    const { data, error } = await this.db
      .from("maintenance_work_order_events")
      .insert(workOrderEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToWorkOrderEvent(data as MaintenanceWorkOrderEventRow);
  }

  async listVendors(orgId: string): Promise<MaintenanceVendor[]> {
    const { data, error } = await this.db
      .from("maintenance_vendors")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map((r) =>
      rowToMaintenanceVendor(r as MaintenanceVendorRow),
    );
  }

  async insertVendor(v: MaintenanceVendor): Promise<MaintenanceVendor> {
    const { data, error } = await this.db
      .from("maintenance_vendors")
      .insert(maintenanceVendorToRow(v))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToMaintenanceVendor(data as MaintenanceVendorRow);
  }

  async updateVendor(
    orgId: string,
    id: string,
    patch: Partial<MaintenanceVendor>,
  ): Promise<MaintenanceVendor> {
    const { data, error } = await this.db
      .from("maintenance_vendors")
      .update(
        maintenanceVendorToRow({ ...({} as MaintenanceVendor), ...patch }),
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToMaintenanceVendor(data as MaintenanceVendorRow);
  }

  async listReceipts(orgId: string): Promise<MaintenanceReceipt[]> {
    const { data, error } = await this.db
      .from("maintenance_receipts")
      .select("*")
      .eq("organization_id", orgId)
      .order("uploaded_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map((r) =>
      rowToMaintenanceReceipt(r as MaintenanceReceiptRow),
    );
  }

  async insertReceipt(rc: MaintenanceReceipt): Promise<MaintenanceReceipt> {
    const { data, error } = await this.db
      .from("maintenance_receipts")
      .insert(maintenanceReceiptToRow(rc))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToMaintenanceReceipt(data as MaintenanceReceiptRow);
  }

  async updateReceipt(
    orgId: string,
    id: string,
    patch: Partial<MaintenanceReceipt>,
  ): Promise<MaintenanceReceipt> {
    const base = maintenanceReceiptToRow({
      ...({} as MaintenanceReceipt),
      ...patch,
    });
    const { data, error } = await this.db
      .from("maintenance_receipts")
      .update(base)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToMaintenanceReceipt(data as MaintenanceReceiptRow);
  }
}

// ---------------------------------------------------------------------------
// Hydration + persistence sync (mirrors storeSync / phase5StoreSync)
// ---------------------------------------------------------------------------

export interface MaintenanceSyncHandles {
  setWorkOrders: (
    updater: (prev: MaintenanceWorkOrder[]) => MaintenanceWorkOrder[],
  ) => void;
  setWorkOrderEvents: (
    updater: (prev: MaintenanceWorkOrderEvent[]) => MaintenanceWorkOrderEvent[],
  ) => void;
  setMaintenanceVendors: (
    updater: (prev: MaintenanceVendor[]) => MaintenanceVendor[],
  ) => void;
  setMaintenanceReceipts: (
    updater: (prev: MaintenanceReceipt[]) => MaintenanceReceipt[],
  ) => void;
}

export interface MaintenanceRepoHandle {
  maintenance: MaintenanceRepository | null;
}

function maintenanceRepo(): MaintenanceRepository | null {
  if (getBackendMode() !== "supabase") return null;
  const r = createRepositories();
  return r.maintenance;
}

/**
 * Hydrate the Maintenance slices (work orders, events, vendors, receipts)
 * from Cloud into the store cache. Work-order events are per-work-order in the
 * repository; hydrate across every work order to restore the full audit
 * trail after relogin. Returns true when Cloud mode is active and hydration
 * ran; on failure the seeded in-memory cache stays.
 */
export async function hydrateMaintenance(
  orgId: string,
  handles: MaintenanceSyncHandles,
  repository?: MaintenanceRepository | null,
): Promise<boolean> {
  const r = repository !== undefined ? repository : maintenanceRepo();
  if (!r) return false;
  try {
    const [workOrders, vendors, receipts] = await Promise.all([
      r.listWorkOrders(orgId),
      r.listVendors(orgId),
      r.listReceipts(orgId),
    ]);
    // Work-order events are per-work-order; hydrate each work order's events.
    const events: MaintenanceWorkOrderEvent[] = [];
    for (const wo of workOrders) {
      const evs = await r.listWorkOrderEvents(orgId, wo.id);
      events.push(...evs);
    }
    handles.setWorkOrders(() => workOrders);
    handles.setWorkOrderEvents(() => events);
    handles.setMaintenanceVendors(() => vendors);
    handles.setMaintenanceReceipts(() => receipts);
    return true;
  } catch (e) {
    console.error("[phase7Sync] maintenance hydration failed", e);
    return false;
  }
}

export function persistWorkOrderInsert(w: MaintenanceWorkOrder): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .insertWorkOrder(w)
    .catch((e: unknown) =>
      console.error("[phase7Sync] work order insert failed", e),
    );
}

export function persistWorkOrderUpdate(
  orgId: string,
  id: string,
  patch: Partial<MaintenanceWorkOrder>,
): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .updateWorkOrder(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase7Sync] work order update failed", e),
    );
}

export function persistWorkOrderEventInsert(
  e: MaintenanceWorkOrderEvent,
): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .insertWorkOrderEvent(e)
    .catch((err: unknown) =>
      console.error("[phase7Sync] work order event insert failed", err),
    );
}

export function persistMaintenanceVendorInsert(v: MaintenanceVendor): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .insertVendor(v)
    .catch((e: unknown) =>
      console.error("[phase7Sync] maintenance vendor insert failed", e),
    );
}

export function persistMaintenanceVendorUpdate(
  orgId: string,
  id: string,
  patch: Partial<MaintenanceVendor>,
): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .updateVendor(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase7Sync] maintenance vendor update failed", e),
    );
}

export function persistMaintenanceReceiptInsert(rc: MaintenanceReceipt): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .insertReceipt(rc)
    .catch((e: unknown) =>
      console.error("[phase7Sync] maintenance receipt insert failed", e),
    );
}

export function persistMaintenanceReceiptUpdate(
  orgId: string,
  id: string,
  patch: Partial<MaintenanceReceipt>,
): void {
  const r = maintenanceRepo();
  if (!r) return;
  void r
    .updateReceipt(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase7Sync] maintenance receipt update failed", e),
    );
}

// Keep toMoney re-exported so consumers that build numeric patches can round.
export { toMoney };
