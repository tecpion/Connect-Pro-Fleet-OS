// Connect Pro Fleet — expense store shared helpers (Build #14).
// Common utilities: event logging, activity logging, expense patching,
// staff/vendor/vehicle label resolution. Split out to keep implementation
// files under the line limit.

import type {
  ExpenseEvent,
  ExpenseEventType,
  ExpenseTransaction,
} from "../expenseTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

/** Synchronous expense-number generator. Reads s.expenses (stale within a
 *  batched act) AND the synchronous ref registry to guarantee uniqueness for
 *  rapid sequential creation. Shared by the lifecycle + the WO sync. */
export function allocExpenseNumber(s: StoreState): string {
  const year = new Date().getFullYear();
  const fromState = s.expenses
    .map((e) => {
      const m = e.expense_number.match(/^EXP-(\d{4})-(\d+)$/);
      return m && m[1] === String(year) ? Number(m[2]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  let max = fromState;
  for (const key of s.expenseNumberKeys.current) {
    const m = key.match(/^EXP-(\d{4})-(\d+)$/);
    if (m && m[1] === String(year)) max = Math.max(max, Number(m[2]));
  }
  const num = `EXP-${year}-${String(max + 1).padStart(6, "0")}`;
  s.expenseNumberKeys.current.add(num);
  return num;
}

export interface ExpenseShared {
  logEvent: (
    expenseId: string,
    type: ExpenseEventType,
    label: string,
    opts?: {
      actorId?: string | null;
      actorIsSystem?: boolean;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
    },
  ) => void;
  logAct: (
    label: string,
    tone?: "neutral" | "available" | "maintenance" | "out",
  ) => void;
  patchExpense: (id: string, patch: Partial<ExpenseTransaction>) => void;
  staffName: (id: string | null) => string;
  vendorName: (id: string | null) => string;
  vehicleLabel: (id: string | null) => string;
}

export function buildExpenseShared(s: StoreState): ExpenseShared {
  function logEvent(
    expenseId: string,
    type: ExpenseEventType,
    label: string,
    opts?: {
      actorId?: string | null;
      actorIsSystem?: boolean;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
    },
  ) {
    const ev: ExpenseEvent = {
      id: uid("eev"),
      tenant_id: TENANT_ID,
      expense_id: expenseId,
      event_type: type,
      label,
      actor_user_id:
        opts?.actorId === undefined ? s.currentStaffId : opts.actorId,
      actor_is_system: opts?.actorIsSystem ?? false,
      old_value: opts?.oldValue ?? null,
      new_value: opts?.newValue ?? null,
      note: opts?.note ?? null,
      created_at: new Date().toISOString(),
    };
    s.setExpenseEvents((es) => [ev, ...es]);
  }

  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "neutral",
  ) {
    s.setActivity((a) =>
      [
        { id: uid("act"), at: new Date().toISOString(), label, tone },
        ...a,
      ].slice(0, 30),
    );
  }

  function patchExpense(id: string, patch: Partial<ExpenseTransaction>) {
    s.setExpenses((es) =>
      es.map((e) =>
        e.id === id
          ? { ...e, ...patch, updated_at: new Date().toISOString() }
          : e,
      ),
    );
  }

  function staffName(id: string | null): string {
    if (!id) return "System";
    const st = s.staff.find((x) => x.id === id);
    return st ? st.full_name : "—";
  }

  function vendorName(id: string | null): string {
    if (!id) return "—";
    const v = s.maintenanceVendors.find((x) => x.id === id);
    return v ? v.name : "—";
  }

  function vehicleLabel(id: string | null): string {
    if (!id) return "—";
    const v = s.vehicles.find((x) => x.id === id);
    return v ? `${v.make} ${v.model} · ${v.license_plate}` : "vehicle";
  }

  return {
    logEvent,
    logAct,
    patchExpense,
    staffName,
    vendorName,
    vehicleLabel,
  };
}
