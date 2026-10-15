// Connect Pro Fleet — Expenses workspace (Build #14 + Expenses V1).
//
// Operational finance workspace: KPIs, Expenses, Reimbursements, Receipts,
// Recurring, Categories, Rules, Month-End, Vendors, Spend Analytics. Composes
// the existing authoritative expense ledger — no duplicate financial records.
// Cost data is permission-gated (expenses.view_costs); company overhead is
// gated by expenses.view_company_overhead. Mobile uses stacked cards.

import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Kpi } from "@/components/Kpi";
import { fmtMoney, fmtMoneyExact } from "@/lib/format";
import { RecordExpenseDialog } from "./expenses/RecordExpenseDialog";
import {
  ExpensesList,
  ReimbursementsList,
  PettyCashView,
} from "./expenses/ExpensesTabs";
import {
  CategoriesView,
  MonthEndView,
  VendorsView,
  SpendAnalyticsView,
} from "./expenses/CategoriesViews";
import { ReceiptsView } from "./expenses/ReceiptsView";
import { RecurringView } from "./expenses/RecurringView";
import { RulesView } from "./expenses/RulesView";
import {
  netExpenseTotal,
  getExpensesMissingReceipts,
  getOutstandingReimbursementTotal,
  getCompanyOverheadExpenses,
} from "@/lib/expenseSelectors";
import { getUnallocatedExpenses } from "@/lib/expenseRuleSelectors";
import { Plus } from "lucide-react";

export interface ExpensesProps {
  /** Controlled sub-tab value. When provided, the workspace is "embedded"
   *  inside the Finance workspace: its own page header is hidden and the
   *  active sub-tab is driven by the parent (URL-addressable). */
  subtab?: string;
  onSubtabChange?: (subtab: string) => void;
  /** Hide the page header + outer max-width wrapper when embedded. */
  embedded?: boolean;
}

export default function Expenses({
  subtab,
  onSubtabChange,
  embedded = false,
}: ExpensesProps = {}) {
  const store = useStore();
  const [params] = useSearchParams();
  const [internalTab, setInternalTab] = useState("expenses");
  // Controlled (embedded) vs internal (standalone) sub-tab state.
  const tab = subtab ?? internalTab;
  const setTab = (next: string) => {
    if (onSubtabChange) onSubtabChange(next);
    else setInternalTab(next);
  };
  const [query, setQuery] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [scopeFilter, setScopeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [receiptFilter, setReceiptFilter] = useState("all");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewCosts = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.view_costs",
  );
  const canViewOverhead = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.view_company_overhead",
  );
  const canCreate = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.create",
  );
  const canReverse = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.reverse",
  );
  const canManageReimbursements = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.manage_reimbursements",
  );

  const vendorName = (id: string | null) =>
    id ? (store.maintenanceVendors.find((v) => v.id === id)?.name ?? "—") : "—";
  const vehicleLabel = (id: string | null) => {
    if (!id) return "—";
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.make} ${v.model}` : "vehicle";
  };

  // ---- KPIs (month + fleet-wide) -------------------------------------------
  const monthKey = new Date().toISOString().slice(0, 7);
  const kpis = useMemo(() => {
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
  }, [store, monthKey, canViewOverhead]);

  const selectedExpenseId = params.get("expense");
  const selectedExpense = selectedExpenseId
    ? store.expenses.find((e) => e.id === selectedExpenseId)
    : null;

  return (
    <div
      className={
        embedded ? "space-y-5" : "mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8"
      }
    >
      {!embedded && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">
              Expenses
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Categorize spending, assign to vehicles, track overhead, capture
              receipts, manage reimbursements, and keep the month clean.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setRecordOpen(true)}>
              <Plus size={16} className="mr-1" /> Record expense
            </Button>
          )}
        </header>
      )}
      {embedded && canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setRecordOpen(true)}>
            <Plus size={16} className="mr-1" /> Record expense
          </Button>
        </div>
      )}

      {/* KPI row — Gross revenue-style hero is intentionally absent here; this
          is the expense ledger. Expenses This Month is the dominant KPI. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Expenses This Month"
          value={canViewCosts ? fmtMoney(kpis.thisMonth) : "—"}
          tone="maintenance"
        />
        <Kpi
          label="Unallocated"
          value={String(kpis.unallocated)}
          tone={kpis.unallocated > 0 ? "maintenance" : "neutral"}
        />
        <Kpi
          label="Missing Receipts"
          value={String(kpis.missingReceipts)}
          tone={kpis.missingReceipts > 0 ? "maintenance" : "neutral"}
        />
        <Kpi
          label="Reimbursements Owed"
          value={canViewCosts ? fmtMoney(kpis.reimbursementsOwed) : "—"}
          tone={kpis.reimbursementsOwed > 0 ? "maintenance" : "neutral"}
        />
        <Kpi
          label="Vehicle Expenses"
          value={canViewCosts ? fmtMoney(kpis.vehicle) : "—"}
        />
        <Kpi
          label="Overhead Expenses"
          value={canViewOverhead ? fmtMoney(kpis.overhead) : "—"}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="reimbursements">Reimbursements</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          {canViewOverhead && (
            <TabsTrigger value="categories">Categories</TabsTrigger>
          )}
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="monthend">Month-End</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="cash">Petty Cash</TabsTrigger>
        </TabsList>

        {tab === "expenses" && (
          <ExpensesList
            expenses={store.expenses}
            canViewCosts={canViewCosts}
            canViewOverhead={canViewOverhead}
            canReverse={canReverse}
            query={query}
            scopeFilter={scopeFilter}
            methodFilter={methodFilter}
            receiptFilter={receiptFilter}
            setQuery={setQuery}
            setScopeFilter={setScopeFilter}
            setMethodFilter={setMethodFilter}
            setReceiptFilter={setReceiptFilter}
            onReverse={(id: string) => {
              const reason = window.prompt("Reason for reversal?");
              if (reason) {
                store.reverseExpense(id, reason);
              }
            }}
            vendorName={vendorName}
            vehicleLabel={vehicleLabel}
            categories={store.expenseCategories}
          />
        )}

        {tab === "reimbursements" && (
          <ReimbursementsList
            reimbursements={store.expenseReimbursements}
            expenses={store.expenses}
            staff={store.staff}
            canViewCosts={canViewCosts}
            canManage={canManageReimbursements}
            onApprove={(id: string) => store.approveReimbursement(id)}
            onPay={(id: string) => store.markReimbursementPaid(id, "ach")}
          />
        )}

        {tab === "receipts" && <ReceiptsView />}
        {tab === "recurring" && <RecurringView />}
        {tab === "categories" && canViewOverhead && <CategoriesView />}
        {tab === "rules" && <RulesView />}
        {tab === "monthend" && <MonthEndView />}
        {tab === "vendors" && <VendorsView />}
        {tab === "analytics" && <SpendAnalyticsView />}
        {tab === "cash" && (
          <PettyCashView
            cashAccounts={store.cashAccounts}
            cashEntries={store.cashEntries}
            canViewCosts={canViewCosts}
          />
        )}
      </Tabs>

      {selectedExpense && (
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="font-mono text-xs tabular text-muted-foreground">
            {selectedExpense.expense_number}
          </p>
          <p className="text-sm font-medium text-foreground">
            {selectedExpense.description}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtMoneyExact(selectedExpense.amount)} ·{" "}
            {selectedExpense.payment_method}
          </p>
        </div>
      )}

      <RecordExpenseDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  );
}
