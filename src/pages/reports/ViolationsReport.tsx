// Connect Pro Fleet — Tolls & Violations report (Build #25).
// Derived operational/accounting summary: total assessed, company paid,
// customer charged, recovered, unrecovered exposure, open/disputed counts.
// No report-specific financial truth — all values come from the violation
// store + linked ledger/expense records via the violation selectors.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useViolations } from "@/lib/violationStoreProvider";
import { can } from "@/lib/permissions";
import {
  getViolationFinancialSummary,
  getViolationResponsibilitySummary,
  getOpenViolations,
  getDisputedViolations,
} from "@/lib/violationSelectors";
import {
  ReportShell,
  KpiTile,
  MoneyTile,
  ReportTable,
  ExportButton,
  type Column,
} from "./ReportShared";
import { exportRows } from "@/lib/reportCsv";
import { fmtMoney } from "@/lib/format";
import {
  VIOLATION_TYPE_LABELS,
  RESPONSIBILITY_LABELS,
  VIOLATION_STATUS_LABELS,
} from "@/lib/violationTypes";
import { deriveViolationReportMetrics } from "@/lib/violationReportSelectors";

export function ViolationsReport() {
  const store = useStore();
  const vio = useViolations();

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "violations.view_financials",
  );

  // Linked payments: customer ledger transactions tagged with a violation_id.
  const linkedPayments = useMemo(
    () =>
      store.transactions.filter(
        (t) => t.category === "payment" && t.metadata?.violation_id != null,
      ),
    [store.transactions],
  );
  // Linked expenses: expense transactions tagged with a violation_id.
  const linkedExpenses = useMemo(
    () => store.expenses.filter((e) => e.metadata?.violation_id != null),
    [store.expenses],
  );

  const summary = useMemo(
    () =>
      getViolationFinancialSummary(
        vio.violations,
        linkedPayments,
        linkedExpenses,
      ),
    [vio.violations, linkedPayments, linkedExpenses],
  );
  const respSummary = useMemo(
    () => getViolationResponsibilitySummary(vio.violations),
    [vio.violations],
  );
  const reportMetrics = useMemo(
    () =>
      deriveViolationReportMetrics(
        vio.violations,
        linkedPayments,
        linkedExpenses,
      ),
    [vio.violations, linkedPayments, linkedExpenses],
  );
  // Recovery rate = fraction of company-paid cost offset by actual cash
  // recovery. Derived from the authoritative financial summary — not seeded.
  const recoveryRate =
    summary.companyPaid > 0
      ? Math.min(1, summary.recovered / summary.companyPaid)
      : null;

  const masked = canViewFinancials
    ? summary
    : {
        ...summary,
        totalAssessed: 0,
        companyPaid: 0,
        customerCharged: 0,
        recovered: 0,
        unrecoveredExposure: 0,
      };

  const rows = useMemo(() => {
    const byType: Record<
      string,
      { type: string; count: number; assessed: number; open: number }
    > = {};
    for (const v of vio.violations) {
      const key = v.violation_type;
      if (!byType[key])
        byType[key] = { type: key, count: 0, assessed: 0, open: 0 };
      byType[key].count++;
      byType[key].assessed += v.total_amount;
      if (v.status !== "resolved" && v.status !== "cancelled")
        byType[key].open++;
    }
    return Object.values(byType).sort((a, b) => b.count - a.count);
  }, [vio.violations]);

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "type",
      header: "Type",
      render: (x) =>
        VIOLATION_TYPE_LABELS[x.type as keyof typeof VIOLATION_TYPE_LABELS] ??
        x.type,
    },
    {
      key: "count",
      header: "Total",
      render: (x) => String(x.count),
      mono: true,
    },
    {
      key: "open",
      header: "Open",
      render: (x) => String(x.open),
      mono: true,
    },
    {
      key: "assessed",
      header: "Assessed",
      render: (x) => (canViewFinancials ? fmtMoney(x.assessed) : "—"),
      mono: true,
    },
  ];

  const respRows = Object.entries(respSummary).map(([k, v]) => ({
    responsibility: k,
    count: v,
  }));
  const respCols: Column<(typeof respRows)[number]>[] = [
    {
      key: "responsibility",
      header: "Responsibility",
      render: (x) =>
        RESPONSIBILITY_LABELS[
          x.responsibility as keyof typeof RESPONSIBILITY_LABELS
        ] ?? x.responsibility,
    },
    {
      key: "count",
      header: "Count",
      render: (x) => String(x.count),
      mono: true,
    },
  ];

  const exportCols = canViewFinancials
    ? cols
    : cols.filter((c) => c.key !== "assessed");

  return (
    <ReportShell
      title="Tolls & Violations Report"
      subtitle="Assessed amounts, company-paid costs, customer charges, recovery, and unrecovered exposure."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              rows,
              "tolls-violations-report",
              exportCols.map((c) => c.header),
            )
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile label="Open" value={String(masked.openCount)} />
        <KpiTile
          label="Disputed"
          value={String(masked.disputedCount)}
          tone={masked.disputedCount > 0 ? "warning" : "default"}
        />
        {canViewFinancials ? (
          <MoneyTile label="Total Assessed" amount={masked.totalAssessed} />
        ) : (
          <KpiTile label="Total Assessed" value="—" />
        )}
        {canViewFinancials ? (
          <MoneyTile label="Company Paid" amount={masked.companyPaid} />
        ) : (
          <KpiTile label="Company Paid" value="—" />
        )}
        {canViewFinancials ? (
          <MoneyTile label="Customer Charged" amount={masked.customerCharged} />
        ) : (
          <KpiTile label="Customer Charged" value="—" />
        )}
        {canViewFinancials ? (
          <MoneyTile label="Recovered" amount={masked.recovered} />
        ) : (
          <KpiTile label="Recovered" value="—" />
        )}
        {canViewFinancials ? (
          <MoneyTile
            label="Unrecovered Exposure"
            amount={masked.unrecoveredExposure}
            tone={masked.unrecoveredExposure > 0 ? "danger" : "default"}
          />
        ) : (
          <KpiTile label="Unrecovered Exposure" value="—" />
        )}
        <KpiTile
          label="Match Rate"
          value={`${Math.round(reportMetrics.match_rate * 100)}%`}
        />
        <KpiTile
          label="Recovery Rate"
          value={
            recoveryRate == null ? "—" : `${Math.round(recoveryRate * 100)}%`
          }
          tone={
            recoveryRate != null && recoveryRate < 0.5 && recoveryRate >= 0
              ? "warning"
              : "default"
          }
        />
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Type
        </h2>
        <ReportTable
          columns={cols}
          rows={rows}
          emptyMessage="No violations recorded."
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Responsibility
        </h2>
        <ReportTable
          columns={respCols}
          rows={respRows}
          emptyMessage="No violations recorded."
        />
      </section>

      <p className="text-xs text-muted-foreground">
        All amounts are derived from the Rental Ledger (customer charges) and
        Expense Ledger (company payments). A violation customer charge is not
        base rental revenue. Customer payments are counted once via FIFO ledger
        allocation.
      </p>
    </ReportShell>
  );
}
