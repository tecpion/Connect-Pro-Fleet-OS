// Connect Pro Fleet — banking store shared helpers (Build #15).
// Common utilities: event logging, account tender defaults, local re-exports
// of csvImport helpers to avoid circular imports. Split out to keep the
// banking store files under the line limit.

import type { FinancialAccount, ReconciliationEvent } from "../bankingTypes";
import type { TenderMethod, PaymentProcessor } from "../paymentMethodTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

/** Log a reconciliation event (append-oriented audit). */
export function logReconEvent(
  s: StoreState,
  input: {
    imported_transaction_id?: string | null;
    statement_id?: string | null;
    event_type: ReconciliationEvent["event_type"];
    label: string;
    actorIsSystem?: boolean;
    note?: string | null;
  },
) {
  const ev: ReconciliationEvent = {
    id: uid("rev"),
    tenant_id: TENANT_ID,
    imported_transaction_id: input.imported_transaction_id ?? null,
    statement_id: input.statement_id ?? null,
    event_type: input.event_type,
    label: input.label,
    actor_user_id: input.actorIsSystem ? null : s.currentStaffId,
    actor_is_system: input.actorIsSystem ?? false,
    note: input.note ?? null,
    created_at: new Date().toISOString(),
  };
  s.setReconciliationEvents((es) => [ev, ...es]);
}

/** Default tender inferred from an account type for create-expense-from-import. */
export function defaultTenderForAccount(
  account: FinancialAccount,
): TenderMethod {
  if (account.account_type === "credit_card") return "credit_card";
  if (account.account_type === "debit_account") return "debit_card";
  return "bank_transfer";
}

/** Default processor for an account type. */
export function defaultProcessorForAccount(
  account: FinancialAccount,
): PaymentProcessor | null {
  if (account.account_type === "credit_card") return "manual";
  return null;
}
