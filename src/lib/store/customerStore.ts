// Connect Pro Fleet — customer domain methods (Build #5).
//
// Build #21 cleanup: addCustomer/updateCustomer now emit
// CUSTOMER_CREATED_OR_UPDATED so Connect Pro can map/create a contact and
// store the stable external reference. The declared outbound event type is no
// longer advertised-but-never-emitted. Emission is a safe no-op when the
// integration is disabled.
//
// Build #24 finalization: updateStaff now enforces the last-active-Owner guard
// at the authoritative mutation layer (not just the UI). A direct call that
// would deactivate/suspend the last active Owner is refused (silent no-op).

import type { Customer, Staff } from "../types";
import type { StoreState } from "./storeState";
import { emitCustomerUpserted } from "./customerIntegrationEmission";
import { guardStaffStatus, guardStaffRoleChange } from "./staffGuard";

export function buildCustomerMethods(s: StoreState) {
  return {
    addCustomer: (c: Customer) => {
      s.setCustomers((cs) => [c, ...cs]);
      emitCustomerUpserted(c);
    },
    updateCustomer: (id: string, patch: Partial<Customer>) => {
      const existing = s.customers.find((c) => c.id === id);
      const now = new Date().toISOString();
      s.setCustomers((cs) =>
        cs.map((c) => (c.id === id ? { ...c, ...patch, updated_at: now } : c)),
      );
      // Emit from the constructed updated record (s.customers is stale until
      // React flushes, so we build the post-update shape synchronously).
      if (existing)
        emitCustomerUpserted({ ...existing, ...patch, updated_at: now });
    },
    // Staff lives in the customer module grouping (people) for now.
    addStaff: (st: Staff) => s.setStaff((ss) => [...ss, st]),
    updateStaff: (id: string, patch: Partial<Staff>) => {
      // Authoritative last-active-Owner guard. Refuses to deactivate/suspend
      // the last active Owner, or change the last active Owner's role away
      // from Owner, regardless of caller (UI, tests, future backend).
      if (patch.status) {
        const guard = guardStaffStatus(s, id, patch.status);
        if (!guard.ok) return; // fail closed — no mutation.
      }
      if (
        patch.role_id &&
        patch.role_id !== s.staff.find((x) => x.id === id)?.role_id
      ) {
        const guard = guardStaffRoleChange(s, id, patch.role_id);
        if (!guard.ok) return; // fail closed — no mutation.
      }
      s.setStaff((ss) => ss.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
  };
}
