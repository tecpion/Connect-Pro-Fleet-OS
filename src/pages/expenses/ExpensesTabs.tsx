// Connect Pro Fleet — Expenses tab views (Build #14).
// Split from Expenses.tsx to stay under the line limit. Contains the expenses
// list, reimbursements list, petty cash view, and categories view.

import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { EmptyState } from "@/components/ui-bits";
import { fmtMoney, fmtMoneyExact, fmtDate } from "@/lib/format";
import {
  PAID_BY_LABELS,
  REIMBURSEMENT_STATUS_LABELS,
  RECEIPT_STATUS_LABELS,
  CASH_ENTRY_TYPE_LABELS,
} from "@/lib/expenseTypes";
import {
  netExpenseTotal,
  isReversal,
  getCashAccountBalance,
} from "@/lib/expenseSelectors";
import { TENDER_METHOD_LABELS } from "@/lib/paymentMethodTypes";
import { Receipt as ReceiptIcon, Wallet, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function ExpensesList({
  expenses,
  canViewCosts,
  canViewOverhead,
  canReverse,
  query,
  scopeFilter,
  methodFilter,
  receiptFilter,
  setQuery,
  setScopeFilter,
  setMethodFilter,
  setReceiptFilter,
  onReverse,
  vendorName,
  vehicleLabel,
  categories,
}: any) {
  const visible = expenses
    .filter((e: any) => e.status === "posted")
    .filter((e: any) =>
      canViewOverhead
        ? true
        : e.vehicle_id !== null || e.maintenance_work_order_id !== null,
    )
    .filter((e: any) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        e.expense_number.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        vendorName(e.vendor_id).toLowerCase().includes(q) ||
        vehicleLabel(e.vehicle_id).toLowerCase().includes(q)
      );
    })
    .filter((e: any) =>
      scopeFilter === "vehicle"
        ? e.vehicle_id !== null || e.maintenance_work_order_id !== null
        : scopeFilter === "overhead"
          ? e.vehicle_id === null && e.maintenance_work_order_id === null
          : true,
    )
    .filter((e: any) =>
      methodFilter === "all" ? true : e.payment_method === methodFilter,
    )
    .filter((e: any) =>
      receiptFilter === "missing" ? e.receipt_status === "missing" : true,
    )
    .sort((a: any, b: any) =>
      a.transaction_date < b.transaction_date ? 1 : -1,
    );

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Search expenses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-w-xs rounded-md border border-border bg-surface px-2 text-sm"
        />
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="all">All scopes</option>
          <option value="vehicle">Vehicle</option>
          {canViewOverhead && <option value="overhead">Overhead</option>}
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="all">All methods</option>
          {Object.entries(TENDER_METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={receiptFilter}
          onChange={(e) => setReceiptFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="all">All receipts</option>
          <option value="missing">Missing receipt</option>
        </select>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          hint="Record a cash purchase, vendor invoice, or overhead cost to start tracking business spending."
          icon={<ReceiptIcon size={24} />}
        />
      ) : (
        <>
          {/* Desktop table */}
          <ul className="hidden divide-y divide-border rounded-md border border-border bg-surface lg:block">
            {visible.map((e: any) => {
              const cat = e.expense_category_id
                ? categories.find((c: any) => c.id === e.expense_category_id)
                : null;
              const isRev = isReversal(e);
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular text-muted-foreground">
                        {e.expense_number}
                      </span>
                      {isRev && (
                        <span className="rounded bg-status-out/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-status-out">
                          Reversal
                        </span>
                      )}
                      {e.source === "maintenance_work_order" && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                          WO
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-foreground">
                      {e.description}
                    </p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {fmtDate(e.transaction_date)} ·{" "}
                      {cat?.name ?? "Uncategorized"} ·{" "}
                      {vehicleLabel(e.vehicle_id) !== "—"
                        ? vehicleLabel(e.vehicle_id)
                        : "Overhead"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      tone={
                        e.receipt_status === "missing"
                          ? "maintenance"
                          : "neutral"
                      }
                    >
                      {
                        RECEIPT_STATUS_LABELS[
                          e.receipt_status as keyof typeof RECEIPT_STATUS_LABELS
                        ]
                      }
                    </StatusPill>
                    {canViewCosts && (
                      <span
                        className={`font-mono text-sm tabular ${isRev ? "text-status-out" : "text-foreground"}`}
                      >
                        {isRev ? "-" : ""}
                        {fmtMoneyExact(e.amount)}
                      </span>
                    )}
                    {canReverse && !isRev && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onReverse(e.id)}
                      >
                        <RotateCcw size={13} />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Mobile stacked cards */}
          <div className="space-y-2 lg:hidden">
            {visible.map((e: any) => {
              const cat = e.expense_category_id
                ? categories.find((c: any) => c.id === e.expense_category_id)
                : null;
              const isRev = isReversal(e);
              return (
                <div
                  key={e.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {e.description}
                      </p>
                      <p className="font-mono text-xs tabular text-muted-foreground">
                        {e.expense_number}
                        {isRev && " · Reversal"}
                        {e.source === "maintenance_work_order" && " · WO"}
                      </p>
                    </div>
                    {canViewCosts && (
                      <span
                        className={`shrink-0 font-mono text-sm tabular ${isRev ? "text-status-out" : "text-foreground"}`}
                      >
                        {isRev ? "-" : ""}
                        {fmtMoneyExact(e.amount)}
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Date
                      </dt>
                      <dd className="font-mono text-xs tabular text-foreground">
                        {fmtDate(e.transaction_date)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Category
                      </dt>
                      <dd className="text-right text-xs text-foreground">
                        {cat?.name ?? "Uncategorized"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Scope
                      </dt>
                      <dd className="text-right text-xs text-foreground">
                        {vehicleLabel(e.vehicle_id) !== "—"
                          ? vehicleLabel(e.vehicle_id)
                          : "Overhead"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Receipt
                      </dt>
                      <dd>
                        <StatusPill
                          tone={
                            e.receipt_status === "missing"
                              ? "maintenance"
                              : "neutral"
                          }
                        >
                          {
                            RECEIPT_STATUS_LABELS[
                              e.receipt_status as keyof typeof RECEIPT_STATUS_LABELS
                            ]
                          }
                        </StatusPill>
                      </dd>
                    </div>
                  </dl>
                  {canReverse && !isRev && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onReverse(e.id)}
                      >
                        <RotateCcw size={13} className="mr-1" /> Reverse
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function ReimbursementsList({
  reimbursements,
  expenses,
  staff,
  canViewCosts,
  canManage,
  onApprove,
  onPay,
}: any) {
  if (reimbursements.length === 0) {
    return (
      <EmptyState
        title="No reimbursements"
        hint="When an employee or owner pays personally for a company expense, a reimbursement is recorded here."
        icon={<Wallet size={24} />}
      />
    );
  }
  return (
    <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-surface">
      {reimbursements.map((r: any) => {
        const exp = expenses.find((e: any) => e.id === r.expense_id);
        const payee = r.payee_user_id
          ? (staff.find((s: any) => s.id === r.payee_user_id)?.full_name ?? "—")
          : PAID_BY_LABELS[r.payee_type as keyof typeof PAID_BY_LABELS];
        return (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {exp?.description ?? "Expense"}
              </p>
              <p className="font-mono text-xs tabular text-muted-foreground">
                {payee} · {exp?.expense_number}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill
                tone={
                  r.status === "paid"
                    ? "available"
                    : r.status === "owed"
                      ? "maintenance"
                      : "neutral"
                }
              >
                {
                  REIMBURSEMENT_STATUS_LABELS[
                    r.status as keyof typeof REIMBURSEMENT_STATUS_LABELS
                  ]
                }
              </StatusPill>
              {canViewCosts && (
                <span className="font-mono text-sm tabular">
                  {fmtMoneyExact(r.amount)}
                </span>
              )}
              {canManage && r.status === "owed" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onApprove(r.id)}
                >
                  Approve
                </Button>
              )}
              {canManage &&
                (r.status === "owed" || r.status === "approved") && (
                  <Button size="sm" onClick={() => onPay(r.id)}>
                    Mark paid
                  </Button>
                )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PettyCashView({
  cashAccounts,
  cashEntries,
  canViewCosts,
}: any) {
  if (cashAccounts.length === 0) {
    return (
      <EmptyState
        title="No petty cash accounts"
        hint="Create a petty cash account to track cash on hand and cash expenses."
        icon={<Wallet size={24} />}
      />
    );
  }
  return (
    <div className="mt-4 space-y-4">
      {cashAccounts.map((acct: any) => {
        const balance = getCashAccountBalance(acct, cashEntries);
        const entries = cashEntries
          .filter((e: any) => e.cash_account_id === acct.id)
          .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
        return (
          <div
            key={acct.id}
            className="rounded-md border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-foreground">
                  {acct.name}
                </p>
                <p className="font-mono text-xs tabular text-muted-foreground">
                  Opening {fmtMoneyExact(acct.opening_balance)}
                </p>
              </div>
              {canViewCosts && (
                <span className="font-mono text-xl tabular text-foreground">
                  {fmtMoneyExact(balance)}
                </span>
              )}
            </div>
            <ul className="mt-3 divide-y divide-border">
              {entries.map((e: any) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p className="text-foreground">{e.description}</p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {fmtDate(e.created_at.slice(0, 10))} ·{" "}
                      {
                        CASH_ENTRY_TYPE_LABELS[
                          e.entry_type as keyof typeof CASH_ENTRY_TYPE_LABELS
                        ]
                      }
                    </p>
                  </div>
                  {canViewCosts && (
                    <span
                      className={`font-mono tabular ${e.entry_type === "cash_out" ? "text-status-out" : "text-status-available"}`}
                    >
                      {e.entry_type === "cash_out" ? "-" : "+"}
                      {fmtMoneyExact(e.amount)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function CategoriesView({ categories }: any) {
  return (
    <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-surface">
      {categories.map((c: any) => (
        <li
          key={c.id}
          className="flex items-center justify-between px-3 py-2 text-sm"
        >
          <span className="text-foreground">{c.name}</span>
          <StatusPill tone={c.active ? "available" : "neutral"}>
            {c.active ? "Active" : "Inactive"}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

export { netExpenseTotal };
