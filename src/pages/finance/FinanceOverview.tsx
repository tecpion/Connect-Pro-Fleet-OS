// Connect Pro Fleet — Finance workspace Overview tab.
//
// A financial command center that COMPOSES authoritative expense + banking
// selectors. It never duplicates financial logic or creates a second ledger.
// KPIs reuse expenseSelectors/expenseRuleSelectors/bankingAttention. Each
// attention item deep-links into the correct Finance sub-tab. Permission-gated:
// a viewer without banking permission sees only expense-side data, and vice
// versa — no permission leakage through totals.

import { useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Kpi } from "@/components/Kpi";
import { EmptyState } from "@/components/ui-bits";
import { fmtMoney } from "@/lib/format";
import {
  netExpenseTotal,
  getExpensesMissingReceipts,
  getOutstandingReimbursementTotal,
  getCompanyOverheadExpenses,
} from "@/lib/expenseSelectors";
import {
  getUnallocatedExpenses,
  monthEndChecklist,
} from "@/lib/expenseRuleSelectors";
import {
  getBankingKpiSummary,
  getTransactionAttention,
  getStatementAttention,
} from "@/lib/bankingAttention";
import {
  Receipt,
  Landmark,
  Wallet,
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
} from "lucide-react";

function AttentionRow({
  label,
  count,
  amount,
  deepLink,
  navigate,
  canViewBalances,
}: {
  label: string;
  count: number;
  amount?: number;
  deepLink: string;
  navigate: (to: string) => void;
  canViewBalances?: boolean;
}) {
  if (count === 0) return null;
  return (
    <button
      onClick={() => navigate(deepLink)}
      className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex items-center gap-2 text-sm text-foreground">
        <AlertCircle size={14} className="text-status-out" />
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="rounded-full bg-status-out/10 px-2 py-0.5 font-mono text-xs tabular text-status-out">
          {count}
        </span>
        {amount != null && canViewBalances && (
          <span className="font-mono text-xs tabular text-muted-foreground">
            {fmtMoney(amount)}
          </span>
        )}
      </span>
    </button>
  );
}

export function FinanceOverview({
  canViewExpenses,
  canViewBanking,
  canViewCosts,
  canViewBalances,
  canViewOverhead,
}: {
  canViewExpenses: boolean;
  canViewBanking: boolean;
  canViewCosts: boolean;
  canViewBalances: boolean;
  canViewOverhead: boolean;
}) {
  const store = useStore();
  const navigate = useNavigate();

  const monthKey = new Date().toISOString().slice(0, 7);

  const expenseKpis = useMemo(() => {
    if (!canViewExpenses) return null;
    const monthExpenses = store.expenses.filter(
      (e) =>
        e.transaction_date.slice(0, 7) === monthKey && e.status === "posted",
    );
    const missingReceipts = getExpensesMissingReceipts(
      store.expenses,
      store.expenseReceipts,
    );
    const reimbursementsOwed = getOutstandingReimbursementTotal(
      store.expenseReimbursements,
    );
    const overhead = canViewOverhead
      ? netExpenseTotal(getCompanyOverheadExpenses(store.expenses))
      : 0;
    const vehicleExpenses = store.expenses.filter(
      (e) =>
        e.status === "posted" && (e.vehicle_id || e.maintenance_work_order_id),
    );
    const lineItemIds = new Set(
      store.expenseLineItems.map((l) => l.expense_id),
    );
    const unallocated = getUnallocatedExpenses(store.expenses, lineItemIds);
    return {
      thisMonth: netExpenseTotal(monthExpenses),
      unallocated: unallocated.length,
      missingReceipts: missingReceipts.length,
      reimbursementsOwed,
      vehicle: netExpenseTotal(vehicleExpenses),
      overhead,
    };
  }, [store, monthKey, canViewExpenses, canViewOverhead]);

  const bankingKpis = useMemo(() => {
    if (!canViewBanking) return null;
    return getBankingKpiSummary(store.importedTransactions, store.statements);
  }, [store, canViewBanking]);

  const bankAttention = useMemo(() => {
    if (!canViewBanking) return { txns: [], statements: [] };
    const accountName = (id: string) =>
      store.financialAccountById(id)?.name ?? null;
    return {
      txns: getTransactionAttention(
        store.importedTransactions,
        store.reconciliationMatches,
        accountName,
      ),
      statements: getStatementAttention(
        store.statements,
        store.importedTransactions,
        accountName,
      ),
    };
  }, [store, canViewBanking]);

  const monthEnd = useMemo(() => {
    if (!canViewExpenses) return null;
    const lineItemIds = new Set(
      store.expenseLineItems.map((l) => l.expense_id),
    );
    return monthEndChecklist(
      monthKey,
      store.expenses,
      store.expenseReceipts,
      store.expenseReimbursements,
      store.receiptInbox ?? [],
      store.importedTransactions.map((t) => ({
        matched_expense_id:
          (t as { matched_expense_id?: string | null }).matched_expense_id ??
          null,
        ignored: t.review_status === "ignored",
      })),
      lineItemIds,
    );
  }, [store, monthKey, canViewExpenses]);

  if (!canViewExpenses && !canViewBanking) {
    return (
      <EmptyState
        title="Finance restricted"
        hint="You don't have permission to view expense or banking data."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row — only permitted domains contribute. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {canViewExpenses && (
          <Kpi
            label="Expenses This Month"
            value={canViewCosts ? fmtMoney(expenseKpis!.thisMonth) : "—"}
            tone="maintenance"
            icon={<Wallet size={14} />}
          />
        )}
        {canViewExpenses && (
          <Kpi
            label="Unallocated"
            value={String(expenseKpis!.unallocated)}
            tone={expenseKpis!.unallocated > 0 ? "maintenance" : "neutral"}
          />
        )}
        {canViewExpenses && (
          <Kpi
            label="Missing Receipts"
            value={String(expenseKpis!.missingReceipts)}
            tone={expenseKpis!.missingReceipts > 0 ? "maintenance" : "neutral"}
            icon={<Receipt size={14} />}
          />
        )}
        {canViewBanking && (
          <Kpi
            label="Unmatched Bank Txns"
            value={String(
              bankingKpis!.unmatched_in_count +
                bankingKpis!.unmatched_out_count,
            )}
            tone={
              bankingKpis!.unmatched_in_count +
                bankingKpis!.unmatched_out_count >
              0
                ? "maintenance"
                : "neutral"
            }
            icon={<Landmark size={14} />}
          />
        )}
        {canViewExpenses && (
          <Kpi
            label="Reimbursements Owed"
            value={
              canViewCosts ? fmtMoney(expenseKpis!.reimbursementsOwed) : "—"
            }
            tone={
              expenseKpis!.reimbursementsOwed > 0 ? "maintenance" : "neutral"
            }
          />
        )}
        {canViewBanking && (
          <Kpi
            label="Statements Need Attention"
            value={String(bankingKpis!.statements_need_attention)}
            tone={
              bankingKpis!.statements_need_attention > 0 ? "out" : "neutral"
            }
          />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Needs Attention */}
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Needs Attention
          </h2>
          <div className="mt-3 space-y-2">
            {canViewExpenses && (
              <AttentionRow
                label="Unallocated expenses"
                count={expenseKpis!.unallocated}
                deepLink="/finance?tab=expenses"
                navigate={navigate}
              />
            )}
            {canViewExpenses && (
              <AttentionRow
                label="Missing receipts"
                count={expenseKpis!.missingReceipts}
                deepLink="/finance?tab=expenses&subtab=receipts"
                navigate={navigate}
              />
            )}
            {canViewExpenses && (
              <AttentionRow
                label="Reimbursements owed"
                count={
                  store.expenseReimbursements.filter(
                    (r) => r.status === "owed" || r.status === "approved",
                  ).length
                }
                amount={expenseKpis!.reimbursementsOwed}
                canViewBalances={canViewCosts}
                deepLink="/finance?tab=expenses&subtab=reimbursements"
                navigate={navigate}
              />
            )}
            {canViewBanking && (
              <AttentionRow
                label="Unmatched bank transactions"
                count={
                  bankingKpis!.unmatched_in_count +
                  bankingKpis!.unmatched_out_count
                }
                deepLink="/finance?tab=banking&subtab=inbox"
                navigate={navigate}
              />
            )}
            {canViewBanking && (
              <AttentionRow
                label="Statements needing attention"
                count={bankingKpis!.statements_need_attention}
                deepLink="/finance?tab=reconciliation&subfilter=needs_attention"
                navigate={navigate}
              />
            )}
            {!canViewExpenses && !canViewBanking && (
              <p className="text-sm text-muted-foreground">
                No attention items for your permissions.
              </p>
            )}
            {canViewExpenses &&
              canViewBanking &&
              expenseKpis!.unallocated === 0 &&
              expenseKpis!.missingReceipts === 0 &&
              bankingKpis!.unmatched_in_count +
                bankingKpis!.unmatched_out_count ===
                0 &&
              bankingKpis!.statements_need_attention === 0 && (
                <div className="flex items-center gap-2 text-sm text-status-available">
                  <CheckCircle2 size={14} /> All caught up — no attention items.
                </div>
              )}
          </div>
        </section>

        {/* Money Movement */}
        {canViewBanking && (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Money Movement
            </h2>
            <div className="mt-3 space-y-2">
              {bankAttention.txns.slice(0, 5).map((t) => (
                <button
                  key={t.imported_transaction_id}
                  onClick={() =>
                    navigate(
                      `/finance?tab=banking&subtab=inbox&txn=${t.imported_transaction_id}`,
                    )
                  }
                  className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {t.description}
                    </span>
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {t.transaction_date} · {t.account_name ?? "—"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-mono text-sm tabular ${t.direction === "money_in" ? "text-status-available" : "text-foreground"}`}
                  >
                    {canViewBalances
                      ? `${t.direction === "money_in" ? "+" : "−"}${fmtMoney(t.amount)}`
                      : "—"}
                  </span>
                </button>
              ))}
              {bankAttention.txns.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No recent bank activity needing review.
                </p>
              )}
              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <ArrowLeftRight size={12} />
                {bankingKpis!.transfer_count} transfer
                {bankingKpis!.transfer_count !== 1 ? "s" : ""} ·{" "}
                {bankingKpis!.matched_count} matched
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Month-End Expense Check */}
      {canViewExpenses && monthEnd && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Month-End Expense Check
            </h2>
            <button
              onClick={() => navigate("/finance?tab=expenses&subtab=monthend")}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open Month-End →
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-muted-foreground">Missing receipts</p>
              <p className="font-mono text-sm tabular text-foreground">
                {monthEnd.missing_receipts}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-muted-foreground">Unallocated</p>
              <p className="font-mono text-sm tabular text-foreground">
                {monthEnd.unallocated_expenses}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-muted-foreground">Unmatched bank</p>
              <p className="font-mono text-sm tabular text-foreground">
                {monthEnd.unmatched_bank_transactions}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-muted-foreground">Unmatched receipts</p>
              <p className="font-mono text-sm tabular text-foreground">
                {monthEnd.unmatched_receipts}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-muted-foreground">Reimbursements owed</p>
              <p className="font-mono text-sm tabular text-foreground">
                {monthEnd.reimbursements_owed}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <p className="text-muted-foreground">Awaiting review</p>
              <p className="font-mono text-sm tabular text-foreground">
                {monthEnd.expenses_awaiting_review}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
