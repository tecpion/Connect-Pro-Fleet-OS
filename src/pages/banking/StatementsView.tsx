// Connect Pro Fleet — statements view (Build #15).
// List statements with opening/closing balance, calculated difference,
// reconciliation status, and reconcile action. Difference is permission-gated.

import type { FleetStore } from "@/lib/store/storeContext";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-bits";
import {
  fmtMoney,
  fmtDate,
  fmtMoneyExact,
  statusToneClasses,
} from "@/lib/format";
import {
  calculateStatementClosing,
  getStatementDifference,
  deriveStatementStatus,
  getStatementTransactions,
} from "@/lib/reconciliationSelectors";
import { STATEMENT_RECON_STATUS_LABELS } from "@/lib/bankingTypes";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export function StatementsView({
  store,
  canReconcile,
  canViewBalances,
}: {
  store: FleetStore;
  canReconcile: boolean;
  canViewBalances: boolean;
}) {
  const statements = store.statements;
  if (statements.length === 0) {
    return (
      <EmptyState
        title="No statements"
        hint="Import a CSV statement to create a statement record."
      />
    );
  }
  return (
    <div className="space-y-3">
      {statements.map((s) => {
        const account = store.financialAccountById(s.financial_account_id);
        const calc = calculateStatementClosing(s, store.importedTransactions);
        const diff = getStatementDifference(s, store.importedTransactions);
        const status = deriveStatementStatus(s, store.importedTransactions);
        const stmtTxns = getStatementTransactions(
          store.importedTransactions,
          s.id,
        );
        const unreviewed = stmtTxns.filter(
          (t) => t.review_status === "unreviewed",
        ).length;
        const balanced = diff == null || Math.abs(diff) < 0.005;
        const tone =
          status === "reconciled"
            ? statusToneClasses.available
            : status === "needs_attention"
              ? statusToneClasses.out
              : statusToneClasses.maintenance;
        return (
          <div
            key={s.id}
            className={`rounded-md border border-border bg-surface p-4 ${tone.border} border-l-2`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {account?.name ?? "—"} · {fmtDate(s.statement_start_date)} →{" "}
                  {fmtDate(s.statement_end_date)}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {s.source_file_name}
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {STATEMENT_RECON_STATUS_LABELS[status]}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Opening</p>
                <p className="font-mono tabular text-foreground">
                  {canViewBalances
                    ? s.opening_balance != null
                      ? fmtMoney(s.opening_balance)
                      : "—"
                    : "Restricted"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Closing (reported)</p>
                <p className="font-mono tabular text-foreground">
                  {canViewBalances
                    ? s.closing_balance != null
                      ? fmtMoney(s.closing_balance)
                      : "—"
                    : "Restricted"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Calculated</p>
                <p className="font-mono tabular text-foreground">
                  {canViewBalances
                    ? calc != null
                      ? fmtMoney(calc)
                      : "—"
                    : "Restricted"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Difference</p>
                <p
                  className={`font-mono tabular ${balanced ? "text-available" : "text-out"}`}
                >
                  {canViewBalances
                    ? diff != null
                      ? fmtMoneyExact(diff)
                      : "—"
                    : "Restricted"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {stmtTxns.length} transactions · {unreviewed} unreviewed
              </p>
              {canReconcile && status !== "reconciled" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!balanced || unreviewed > 0}
                  onClick={() => {
                    store.reconcileStatement(s.id);
                    toast.success("Statement reconciled.");
                  }}
                >
                  <CheckCircle2 size={13} className="mr-1" /> Reconcile
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
