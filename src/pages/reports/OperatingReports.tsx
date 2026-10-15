// Connect Pro Fleet — Build #18 Daily & Weekly Operating report pages.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useReportContext } from "./useReportContext";
import {
  getDailyOperatingReport,
  getWeeklyOperatingReport,
} from "@/lib/operatingReportSelectors";
import { ReportShell, KpiTile, ReportTable, type Column } from "./ReportShared";
import { fmtMoney } from "@/lib/format";

export function DailyOperatingReport() {
  const ctx = useReportContext();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const report = useMemo(
    () => getDailyOperatingReport(ctx, new Date(date + "T00:00:00")),
    [ctx, date],
  );

  const pickupCols: Column<(typeof report.pickups_today)[number]>[] = [
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "vehicle", header: "Vehicle", render: (r) => r.vehicle },
    {
      key: "rental_id",
      header: "Rental",
      render: (r) => r.rental_id,
      mono: true,
    },
  ];
  const returnCols: Column<(typeof report.returns_today)[number]>[] = [
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "vehicle", header: "Vehicle", render: (r) => r.vehicle },
    {
      key: "rental_id",
      header: "Rental",
      render: (r) => r.rental_id,
      mono: true,
    },
  ];
  const overdueCols: Column<(typeof report.overdue_rentals)[number]>[] = [
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "vehicle", header: "Vehicle", render: (r) => r.vehicle },
    {
      key: "rental_id",
      header: "Rental",
      render: (r) => r.rental_id,
      mono: true,
    },
  ];
  const payCols: Column<(typeof report.payments_due_today)[number]>[] = [
    { key: "customer", header: "Customer", render: (r) => r.customer },
    {
      key: "amount",
      header: "Amount",
      render: (r) => fmtMoney(r.amount),
      mono: true,
    },
    {
      key: "rental_id",
      header: "Rental",
      render: (r) => r.rental_id,
      mono: true,
    },
  ];
  const brokenCols: Column<(typeof report.broken_arrangements)[number]>[] = [
    { key: "customer", header: "Customer", render: (r) => r.customer },
    {
      key: "amount",
      header: "Amount",
      render: (r) => fmtMoney(r.amount),
      mono: true,
    },
    {
      key: "arrangement_id",
      header: "Arrangement",
      render: (r) => r.arrangement_id,
      mono: true,
    },
  ];

  return (
    <ReportShell
      title="Daily Operating Report"
      subtitle="Today's operational activity and items needing action."
      generatedAt={new Date()}
      actions={
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm print:hidden"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Pickups" value={String(report.pickups_today.length)} />
        <KpiTile label="Returns" value={String(report.returns_today.length)} />
        <KpiTile
          label="Overdue"
          value={String(report.overdue_rentals.length)}
          tone={report.overdue_rentals.length > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Payments Due"
          value={String(report.payments_due_today.length)}
        />
        <KpiTile
          label="Late Payments"
          value={String(report.late_payments.length)}
          tone="warning"
        />
        <KpiTile
          label="Broken Arrangements"
          value={String(report.broken_arrangements.length)}
          tone="danger"
        />
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Pickups Today
        </h2>
        <ReportTable
          columns={pickupCols}
          rows={report.pickups_today}
          emptyMessage="No pickups scheduled today."
          onRowClick={(r) => (window.location.href = `/rentals/${r.rental_id}`)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Returns Today
        </h2>
        <ReportTable
          columns={returnCols}
          rows={report.returns_today}
          emptyMessage="No returns scheduled today."
          onRowClick={(r) => (window.location.href = `/rentals/${r.rental_id}`)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Overdue Rentals
        </h2>
        <ReportTable
          columns={overdueCols}
          rows={report.overdue_rentals}
          emptyMessage="No overdue rentals."
          onRowClick={(r) => (window.location.href = `/rentals/${r.rental_id}`)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Payments Due Today
        </h2>
        <ReportTable
          columns={payCols}
          rows={report.payments_due_today}
          emptyMessage="No payments due today."
          onRowClick={(r) => (window.location.href = `/rentals/${r.rental_id}`)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Broken Payment Arrangements
        </h2>
        <ReportTable
          columns={brokenCols}
          rows={report.broken_arrangements}
          emptyMessage="No broken arrangements."
          onRowClick={(r) => (window.location.href = `/payment-arrangements`)}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/payments-due"
          className="text-sm text-primary hover:underline"
        >
          Open Payments Due →
        </Link>
        <Link
          to="/maintenance"
          className="text-sm text-primary hover:underline"
        >
          Open Maintenance →
        </Link>
        <Link
          to="/damage-claims"
          className="text-sm text-primary hover:underline"
        >
          Open Damage Claims →
        </Link>
      </div>
    </ReportShell>
  );
}

export function WeeklyOperatingReport() {
  const ctx = useReportContext();
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    return new Date(now.getTime() - day * 86_400_000)
      .toISOString()
      .slice(0, 10);
  });
  const report = useMemo(
    () => getWeeklyOperatingReport(ctx, new Date(weekStart + "T00:00:00")),
    [ctx, weekStart],
  );

  return (
    <ReportShell
      title="Weekly Operating Report"
      subtitle={`Week of ${report.week_start} to ${report.week_end}`}
      generatedAt={new Date()}
      actions={
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm print:hidden"
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile
          label="Rentals Started"
          value={String(report.rentals_started)}
        />
        <KpiTile
          label="Rentals Completed"
          value={String(report.rentals_completed)}
        />
        <KpiTile label="Extensions" value={String(report.extensions)} />
        <KpiTile label="Exchanges" value={String(report.exchanges)} />
        <KpiTile
          label="Utilization"
          value={`${Math.round(report.utilization)}%`}
        />
        <KpiTile
          label="Tasks Completed"
          value={String(report.tasks_completed)}
        />
        <KpiTile
          label="Tasks Overdue"
          value={String(report.tasks_overdue)}
          tone={report.tasks_overdue > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Downtime Active"
          value={String(report.maintenance_downtime_active)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Collections" value={fmtMoney(report.collections)} />
        <KpiTile
          label="Billed Revenue"
          value={fmtMoney(report.billed_revenue)}
        />
        <KpiTile label="Late Balances" value={fmtMoney(report.late_balances)} />
        <KpiTile
          label="Late Fees Assessed"
          value={fmtMoney(report.late_fees_assessed)}
        />
        <KpiTile
          label="Maintenance Spend"
          value={fmtMoney(report.maintenance_spend)}
        />
        <KpiTile
          label="Expenses Recorded"
          value={fmtMoney(report.expenses_recorded)}
        />
        <KpiTile
          label="Damage Created"
          value={String(report.damage_claims_created)}
        />
        <KpiTile
          label="Damage Resolved"
          value={String(report.damage_claims_resolved)}
        />
      </div>
    </ReportShell>
  );
}
