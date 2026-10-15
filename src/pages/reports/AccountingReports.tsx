// Connect Pro Fleet — Build #18 accounting report pages.
// Expenses, Missing Receipts, Reimbursements, Banking/Reconciliation, Deposits.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { useReportContext } from "./useReportContext";
import {
  getExpensesReport,
  getMissingReceiptsReport,
  getReimbursementsReport,
  getBankingReconciliationReport,
  getDepositsReport,
} from "@/lib/accountingReportSelectors";
import {
  ReportShell,
  ReportFilterBar,
  KpiTile,
  MoneyTile,
  ReportTable,
  ExportButton,
  type DatePreset,
  presetRange,
  type Column,
} from "./ReportShared";
import { exportRows } from "@/lib/reportCsv";
import { fmtMoney } from "@/lib/format";

function useFilter() {
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const range = preset === "custom" ? custom : presetRange(preset);
  return {
    preset,
    setPreset,
    custom,
    setCustom,
    filter: { start: range.start, end: range.end },
  };
}

// ---------------------------------------------------------------------------
export function ExpensesReport() {
  const ctx = useReportContext();
  const store = useStore();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const canViewOverhead = can(
    store.roles.find((r) => r.id === currentStaff?.role_id),
    currentStaff?.permission_overrides ?? null,
    "expenses.view_company_overhead",
  );
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getExpensesReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  const catCols: Column<(typeof r.by_category)[number]>[] = [
    { key: "category", header: "Category", render: (x) => x.category },
    {
      key: "amount",
      header: "Amount",
      render: (x) => fmtMoney(x.amount),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Expenses"
      subtitle="Total spend by category, vendor, and payment method."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              r.by_category,
              "expenses-by-category",
              ["category", "amount"],
              filter,
            )
          }
        />
      }
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        custom={custom}
        onCustomChange={setCustom}
        locations={store.locations}
        vehicleClasses={store.vehicleClasses}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile label="Total Expenses" amount={r.total} />
        <MoneyTile label="Vehicle Direct" amount={r.vehicle_direct} />
        {canViewOverhead && (
          <MoneyTile label="Company Overhead" amount={r.company_overhead} />
        )}
        <MoneyTile label="Cash Expenses" amount={r.cash_expenses} />
        <MoneyTile
          label="Acquisition Spend"
          amount={r.acquisition_spend}
          sub="Separate from operating profit"
        />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Category
        </h2>
        <ReportTable
          columns={catCols}
          rows={r.by_category}
          emptyMessage="No expenses in this period."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function MissingReceiptsReport() {
  const ctx = useReportContext();
  const r = useMemo(() => getMissingReceiptsReport(ctx), [ctx]);
  const cols: Column<(typeof r.rows)[number]>[] = [
    {
      key: "expense_number",
      header: "Expense",
      render: (x) => x.expense_number,
      mono: true,
    },
    { key: "date", header: "Date", render: (x) => x.date, mono: true },
    { key: "vendor", header: "Vendor", render: (x) => x.vendor },
    {
      key: "amount",
      header: "Amount",
      render: (x) => fmtMoney(x.amount),
      mono: true,
    },
    { key: "category", header: "Category", render: (x) => x.category },
    {
      key: "age_days",
      header: "Age",
      render: (x) => `${x.age_days}d`,
      mono: true,
    },
    {
      key: "reimbursement_status",
      header: "Reimbursement",
      render: (x) => x.reimbursement_status,
    },
  ];
  return (
    <ReportShell
      title="Missing Receipts"
      subtitle="Expenses requiring a receipt that do not have one."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(r.rows, "missing-receipts", [
              "expense_number",
              "date",
              "vendor",
              "amount",
              "category",
              "age_days",
              "reimbursement_status",
            ])
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          label="Count"
          value={String(r.count)}
          tone={r.count > 0 ? "warning" : "default"}
        />
        <MoneyTile label="Total Amount" amount={r.total_amount} />
      </div>
      <ReportTable
        columns={cols}
        rows={r.rows}
        emptyMessage="No missing receipts."
        onRowClick={(x) => (window.location.href = `/finance?tab=expenses`)}
      />
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function ReimbursementsReport() {
  const ctx = useReportContext();
  const r = useMemo(() => getReimbursementsReport(ctx), [ctx]);
  const cols: Column<{ payee: string; amount: number }>[] = [
    { key: "payee", header: "Payee", render: (x) => x.payee },
    {
      key: "amount",
      header: "Owed",
      render: (x) => fmtMoney(x.amount),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Reimbursements"
      subtitle="Owed, approved, and paid reimbursements — never double-counted as expense."
      generatedAt={new Date()}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Owed" value={String(r.owed.length)} />
        <KpiTile label="Approved" value={String(r.approved.length)} />
        <KpiTile label="Paid" value={String(r.paid.length)} />
        <MoneyTile
          label="Outstanding"
          amount={r.total_outstanding}
          tone="warning"
        />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Outstanding by Payee
        </h2>
        <ReportTable
          columns={cols}
          rows={r.by_payee}
          emptyMessage="No outstanding reimbursements."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function BankingReconciliationReport() {
  const ctx = useReportContext();
  const r = useMemo(() => getBankingReconciliationReport(ctx), [ctx]);
  const cols: Column<(typeof r.accounts)[number]>[] = [
    {
      key: "name",
      header: "Account",
      render: (x) => x.name + (x.last_four ? ` ••••${x.last_four}` : ""),
    },
    {
      key: "unreviewed",
      header: "Unreviewed",
      render: (x) => String(x.unreviewed),
      mono: true,
    },
    {
      key: "suggested_matches",
      header: "Suggested",
      render: (x) => String(x.suggested_matches),
      mono: true,
    },
    {
      key: "unmatched_in",
      header: "Unmatched In",
      render: (x) => String(x.unmatched_in),
      mono: true,
    },
    {
      key: "unmatched_out",
      header: "Unmatched Out",
      render: (x) => String(x.unmatched_out),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Banking & Reconciliation"
      subtitle="Account status and reconciliation health. No live balances."
      generatedAt={new Date()}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          label="Unreviewed"
          value={String(r.total_unreviewed)}
          tone={r.total_unreviewed > 0 ? "warning" : "default"}
        />
        <KpiTile label="Suggested Matches" value={String(r.total_suggested)} />
        <KpiTile
          label="Statements Needing Attention"
          value={String(r.statements_needing_attention)}
          tone={r.statements_needing_attention > 0 ? "warning" : "default"}
        />
      </div>
      <ReportTable
        columns={cols}
        rows={r.accounts}
        emptyMessage="No financial accounts."
        onRowClick={() => (window.location.href = "/finance?tab=banking")}
      />
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function DepositsReport() {
  const ctx = useReportContext();
  const r = useMemo(() => getDepositsReport(ctx), [ctx]);
  const cols: Column<(typeof r.rows)[number]>[] = [
    { key: "customer", header: "Customer", render: (x) => x.customer },
    { key: "rental", header: "Rental", render: (x) => x.rental, mono: true },
    {
      key: "required",
      header: "Required",
      render: (x) => fmtMoney(x.required),
      mono: true,
    },
    {
      key: "held",
      header: "Held",
      render: (x) => fmtMoney(x.held),
      mono: true,
    },
    {
      key: "applied",
      header: "Applied",
      render: (x) => fmtMoney(x.applied),
      mono: true,
    },
    {
      key: "refund_due",
      header: "Refund Due",
      render: (x) => fmtMoney(x.refund_due),
      mono: true,
    },
    { key: "status", header: "Status", render: (x) => x.status },
  ];
  return (
    <ReportShell
      title="Security Deposits"
      subtitle="Held liability and deposit lifecycle. Held deposits are never revenue."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(r.rows, "deposits", [
              "customer",
              "rental",
              "required",
              "held",
              "applied",
              "refund_due",
              "status",
            ])
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile
          label="Held Liability"
          amount={r.held_liability}
          sub="Money owed to customers"
          tone="warning"
        />
        <MoneyTile label="Collected" amount={r.collected} />
        <MoneyTile label="Applied" amount={r.applied} />
        <MoneyTile
          label="Refund Pending"
          amount={r.refund_pending}
          tone="warning"
        />
        <MoneyTile label="Refunded" amount={r.refunded} />
        <MoneyTile label="Forfeited" amount={r.forfeited} />
        <MoneyTile label="Uncollected" amount={r.uncollected} />
      </div>
      <ReportTable
        columns={cols}
        rows={r.rows}
        emptyMessage="No deposits."
        onRowClick={() => (window.location.href = "/deposits")}
      />
    </ReportShell>
  );
}
