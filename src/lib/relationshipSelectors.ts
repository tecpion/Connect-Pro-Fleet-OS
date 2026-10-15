// Connect Pro Fleet — relationship selectors (Build #27, spec §53).
//
// Lightweight structured relationship access for future AI. No visual graph UI.
// These return ids + labels only — sensitive/financial values are resolved by
// the caller under permission checks (spec §84, §90).

import type { FleetStore } from "./store/storeContext";
import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type { DocumentRecord } from "./complianceTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type { Task } from "./taskTypes";
import type { OperationalStaffAssignment } from "./staffTypes";
import type { InvestorVehicle } from "./investorTypes";

export interface RelatedRef {
  id: string;
  label: string;
  type: string;
}

/** Customer → related entities (spec §53). */
export function getCustomerRelationships(
  customerId: string,
  store: FleetStore,
  damageClaims: DamageClaim[],
  violations: Violation[],
  documents: DocumentRecord[],
  tasks: Task[],
  assignments: OperationalStaffAssignment[],
): {
  rentals: RelatedRef[];
  vehicles: RelatedRef[];
  payments: RelatedRef[];
  damage: RelatedRef[];
  violations: RelatedRef[];
  documents: RelatedRef[];
  tasks: RelatedRef[];
  staff: RelatedRef[];
} {
  const rentals = store.rentals
    .filter((r) => r.customer_id === customerId)
    .map((r) => ({ id: r.id, label: r.agreement_number, type: "rental" }));
  const vehicles = store.rentals
    .filter((r) => r.customer_id === customerId)
    .map((r) => {
      const v = store.vehicles.find((x) => x.id === r.vehicle_id);
      return v
        ? { id: v.id, label: `${v.make} ${v.model}`, type: "vehicle" }
        : null;
    })
    .filter((x): x is RelatedRef => x !== null);
  const payments = store.transactions
    .filter((t) => t.customer_id === customerId && t.category === "payment")
    .map((t) => ({ id: t.id, label: t.description, type: "payment" }));
  const damage = damageClaims
    .filter((c) => c.customer_id === customerId)
    .map((c) => ({ id: c.id, label: c.claim_number, type: "damage_claim" }));
  const viols = violations
    .filter((v) => v.customer_id === customerId)
    .map((v) => ({ id: v.id, label: v.violation_number, type: "violation" }));
  const docs = documents
    .filter((d) => d.entity_type === "customer" && d.entity_id === customerId)
    .map((d) => ({ id: d.id, label: d.document_type, type: "document" }));
  const tsk = tasks
    .filter((t) => t.entity_type === "customer" && t.entity_id === customerId)
    .map((t) => ({ id: t.id, label: t.title, type: "task" }));
  const staff = assignments
    .filter(
      (a) =>
        a.entity_type === "customer" &&
        a.entity_id === customerId &&
        a.status === "active",
    )
    .map((a) => {
      const s = store.staff.find((x) => x.id === a.staff_id);
      return s ? { id: s.id, label: s.full_name, type: "staff" } : null;
    })
    .filter((x): x is RelatedRef => x !== null);
  return {
    rentals,
    vehicles,
    payments,
    damage,
    violations: viols,
    documents: docs,
    tasks: tsk,
    staff,
  };
}

/** Vehicle → related entities (spec §53). */
export function getVehicleRelationships(
  vehicleId: string,
  store: FleetStore,
  damageClaims: DamageClaim[],
  violations: Violation[],
  documents: DocumentRecord[],
  expenses: ExpenseTransaction[],
  tasks: Task[],
  assignments: OperationalStaffAssignment[],
  investorVehicles: InvestorVehicle[],
): {
  rentals: RelatedRef[];
  customers: RelatedRef[];
  maintenance: RelatedRef[];
  damage: RelatedRef[];
  violations: RelatedRef[];
  expenses: RelatedRef[];
  compliance: RelatedRef[];
  investor: RelatedRef | null;
} {
  const rentals = store.rentals
    .filter((r) => r.vehicle_id === vehicleId)
    .map((r) => ({ id: r.id, label: r.agreement_number, type: "rental" }));
  const customers = store.rentals
    .filter((r) => r.vehicle_id === vehicleId)
    .map((r) => ({
      id: r.customer_id,
      label: store.customerName(r.customer_id),
      type: "customer",
    }));
  const maintenance = store.workOrders
    .filter((w) => w.vehicle_id === vehicleId)
    .map((w) => ({ id: w.id, label: w.work_order_number, type: "work_order" }));
  const damage = damageClaims
    .filter((c) => c.vehicle_id === vehicleId)
    .map((c) => ({ id: c.id, label: c.claim_number, type: "damage_claim" }));
  const viols = violations
    .filter((v) => v.vehicle_id === vehicleId)
    .map((v) => ({ id: v.id, label: v.violation_number, type: "violation" }));
  const exp = expenses
    .filter((e) => e.vehicle_id === vehicleId)
    .map((e) => ({ id: e.id, label: e.expense_number, type: "expense" }));
  const comp = documents
    .filter((d) => d.entity_type === "vehicle" && d.entity_id === vehicleId)
    .map((d) => ({ id: d.id, label: d.document_type, type: "document" }));
  const tsk = tasks
    .filter((t) => t.entity_type === "vehicle" && t.entity_id === vehicleId)
    .map((t) => ({ id: t.id, label: t.title, type: "task" }));
  void tsk;
  const staff = assignments
    .filter(
      (a) =>
        a.entity_type === "vehicle" &&
        a.entity_id === vehicleId &&
        a.status === "active",
    )
    .map((a) => {
      const s = store.staff.find((x) => x.id === a.staff_id);
      return s ? { id: s.id, label: s.full_name, type: "staff" } : null;
    })
    .filter((x): x is RelatedRef => x !== null);
  void staff;
  const pairing = investorVehicles.find(
    (iv) => iv.vehicle_id === vehicleId && iv.active,
  );
  const investor = pairing
    ? (() => {
        const inv = store.staff; // investors are not staff; resolve via store if available
        void inv;
        return { id: pairing.investor_id, label: "Investor", type: "investor" };
      })()
    : null;
  return {
    rentals,
    customers,
    maintenance,
    damage,
    violations: viols,
    expenses: exp,
    compliance: comp,
    investor,
  };
}
