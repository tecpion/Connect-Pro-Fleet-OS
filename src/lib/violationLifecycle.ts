// Connect Pro Fleet — violation lifecycle mutations (Build #25).
//
// assignResponsibility / assignStaff / setStatus / reverseCustomerCharge /
// linkExistingExpense / openDispute / resolveDispute / resolveViolation /
// cancelViolation. Split from violationMutations.ts to stay under the
// per-file line limit.

import { fmtMoney } from "./format";
import type { Violation, ViolationStatus } from "./violationTypes";
import type {
  ViolationResponsibility,
  ResponsibilityReason,
} from "./violationTypes";
import type { DisputeInput } from "./violationStoreInterface";
import {
  makeViolationHelpers,
  type ViolationMutationDeps,
} from "./violationMutationHelpers";

export function makeViolationLifecycle(deps: ViolationMutationDeps) {
  const h = makeViolationHelpers(deps);
  const { store, violationsRef } = deps;

  function assignResponsibility(
    id: string,
    responsibility: ViolationResponsibility,
    reason: ResponsibilityReason | null,
    notes?: string | null,
  ) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return;
    const wasSuggested = v.responsibility_decided_by === null;
    h.patchViolation(id, {
      responsibility,
      responsibility_reason: reason,
      responsibility_notes: notes ?? null,
      responsibility_decided_by: store.currentStaffId,
      responsibility_decided_at: new Date().toISOString(),
      status: v.status === "needs_review" ? "assigned" : v.status,
    });
    h.logEvent(
      id,
      wasSuggested ? "responsibility_overridden" : "responsibility_assigned",
      `Responsibility set: ${responsibility}${reason ? ` — ${reason}` : ""}`,
      { responsibility, reason },
    );
  }

  function assignStaff(id: string, staffId: string | null) {
    h.patchViolation(id, { assigned_staff_id: staffId });
    const name = staffId
      ? (store.staff.find((s) => s.id === staffId)?.full_name ?? "—")
      : "Unassigned";
    h.logEvent(id, "assignment_changed", `Assignment changed — ${name}`, {
      staff_id: staffId,
    });
  }

  function setStatus(id: string, status: ViolationStatus) {
    h.patchViolation(id, { status });
    h.logEvent(id, "status_changed", `Status changed — ${status}`, { status });
  }

  /** Generic patch — exposes Partial<Violation> updates for callers that need
   *  to set arbitrary fields (e.g. due_at, amounts) without a dedicated method. */
  function updateViolation(id: string, patch: Partial<Violation>) {
    h.patchViolation(id, patch);
  }

  function reverseCustomerCharge(id: string, reason: string) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v || !v.customer_charge_transaction_id) return;
    store.voidTransaction(v.customer_charge_transaction_id, reason);
    h.patchViolation(id, {
      customer_charge_transaction_id: null,
      customer_charge_status: "reversed",
    });
    h.logEvent(id, "charge_reversed", `Charge reversed — ${reason}`);
  }

  function linkExistingExpense(id: string, expenseId: string) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return;
    store.tagExpenseMetadata(expenseId, { violation_id: id });
    h.patchViolation(id, {
      linked_expense_id: expenseId,
      company_payment_status: "paid",
      status:
        v.status === "needs_review" || v.status === "new"
          ? "paid_by_company"
          : v.status,
    });
    h.logEvent(
      id,
      "company_expense_linked",
      `Linked existing expense ${expenseId}`,
      { expenseId },
    );
  }

  function openDispute(id: string, input: DisputeInput) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return;
    h.patchViolation(id, {
      dispute_status: input.status ?? "customer_disputed",
      dispute_reason: input.reason,
      dispute_opened_at: new Date().toISOString(),
      dispute_decision_note: input.decision_note ?? null,
      status: "disputed",
    });
    h.logEvent(id, "dispute_opened", `Dispute opened — ${input.reason}`, {
      reason: input.reason,
    });
  }

  function resolveDispute(
    id: string,
    status: Violation["dispute_status"],
    decisionNote?: string | null,
    reducedAmount?: number | null,
  ) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return;
    h.patchViolation(id, {
      dispute_status: status,
      dispute_decision_note: decisionNote ?? null,
      dispute_resolved_at: new Date().toISOString(),
      reduced_amount: reducedAmount ?? null,
    });
    h.logEvent(
      id,
      "dispute_resolved",
      `Dispute resolved — ${status}${reducedAmount != null ? ` (reduced to ${fmtMoney(reducedAmount)})` : ""}`,
      { status, reducedAmount: reducedAmount ?? null },
    );
  }

  function resolveViolation(id: string) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return;
    const now = new Date().toISOString();
    h.patchViolation(id, { status: "resolved", resolved_at: now });
    h.logEvent(id, "resolved", "Violation resolved", null);
    deps.logAct(`Violation resolved — ${v.violation_number}`, "available");
  }

  function cancelViolation(id: string, reason?: string | null) {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return;
    h.patchViolation(id, { status: "cancelled", notes: reason ?? v.notes });
    h.logEvent(
      id,
      "status_changed",
      `Cancelled${reason ? ` — ${reason}` : ""}`,
      null,
    );
  }

  return {
    assignResponsibility,
    assignStaff,
    setStatus,
    updateViolation,
    reverseCustomerCharge,
    linkExistingExpense,
    openDispute,
    resolveDispute,
    resolveViolation,
    cancelViolation,
  };
}
