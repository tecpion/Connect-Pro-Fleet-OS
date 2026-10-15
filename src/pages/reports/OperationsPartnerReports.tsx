// Connect Pro Fleet — Build #18 operations & partner report pages.
// Rental Activity, Tasks, Staff Activity, Investor/JV Summary.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { useReportContext, useInvestors } from "./useReportContext";
import {
  getRentalActivityReport,
  getTasksReport,
  getStaffActivityReport,
} from "@/lib/operationsReportSelectors";
import { getInvestorJVReport } from "@/lib/partnerReportSelectors";
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
export function RentalActivityReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getRentalActivityReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  return (
    <ReportShell
      title="Rental Activity"
      subtitle="Rentals started, active, completed, extended, and exchanged."
      generatedAt={new Date()}
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        custom={custom}
        onCustomChange={setCustom}
        locations={ctx.store.locations}
        vehicleClasses={ctx.store.vehicleClasses}
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Started" value={String(r.started)} />
        <KpiTile label="Active" value={String(r.active)} />
        <KpiTile label="Completed" value={String(r.completed)} />
        <KpiTile label="Extended" value={String(r.extended)} />
        <KpiTile label="Exchanged" value={String(r.exchanged)} />
        <KpiTile
          label="Overdue"
          value={String(r.overdue)}
          tone={r.overdue > 0 ? "danger" : "default"}
        />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Rental Model
        </h2>
        <ReportTable
          columns={[
            { key: "model", header: "Model", render: (x) => x.model },
            {
              key: "count",
              header: "Count",
              render: (x) => String(x.count),
              mono: true,
            },
          ]}
          rows={r.by_model}
          emptyMessage="No rentals."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function TasksReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getTasksReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  const assigneeCols: Column<(typeof r.by_assignee)[number]>[] = [
    { key: "assignee", header: "Assignee", render: (x) => x.assignee },
    { key: "open", header: "Open", render: (x) => String(x.open), mono: true },
    {
      key: "overdue",
      header: "Overdue",
      render: (x) => String(x.overdue),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Tasks"
      subtitle="Open, overdue, urgent, and completed tasks by assignee and category."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              r.by_assignee,
              "tasks-by-assignee",
              ["assignee", "open", "overdue"],
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
        locations={ctx.store.locations}
        vehicleClasses={ctx.store.vehicleClasses}
      />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Open" value={String(r.open)} />
        <KpiTile label="In Progress" value={String(r.in_progress)} />
        <KpiTile label="Completed" value={String(r.completed_in_period)} />
        <KpiTile
          label="Overdue"
          value={String(r.overdue)}
          tone={r.overdue > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Urgent"
          value={String(r.urgent)}
          tone={r.urgent > 0 ? "warning" : "default"}
        />
        <KpiTile
          label="Unassigned"
          value={String(r.unassigned)}
          tone={r.unassigned > 0 ? "warning" : "default"}
        />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Workload by Assignee
        </h2>
        <ReportTable
          columns={assigneeCols}
          rows={r.by_assignee}
          emptyMessage="No tasks."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function StaffActivityReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getStaffActivityReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  const wlCols: Column<(typeof r.workload)[number]>[] = [
    { key: "name", header: "Staff", render: (x) => x.name },
    {
      key: "open_tasks",
      header: "Open Tasks",
      render: (x) => String(x.open_tasks),
      mono: true,
    },
    {
      key: "overdue_tasks",
      header: "Overdue",
      render: (x) => String(x.overdue_tasks),
      mono: true,
    },
    {
      key: "open_claims",
      header: "Open Claims",
      render: (x) => String(x.open_claims),
      mono: true,
    },
    {
      key: "open_work_orders",
      header: "Open WOs",
      render: (x) => String(x.open_work_orders),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Staff Activity & Workload"
      subtitle="Current workload and activity by staff member. No productivity scoring."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              r.workload,
              "staff-workload",
              [
                "name",
                "open_tasks",
                "overdue_tasks",
                "open_claims",
                "open_work_orders",
              ],
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
        locations={ctx.store.locations}
        vehicleClasses={ctx.store.vehicleClasses}
      />
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Current Workload
        </h2>
        <ReportTable
          columns={wlCols}
          rows={r.workload}
          emptyMessage="No staff."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function InvestorJVReport() {
  const ctx = useReportContext();
  const store = useStore();
  const inv = useInvestors();
  const r = useMemo(
    () =>
      getInvestorJVReport(
        ctx,
        inv.investors,
        inv.investorVehicles,
        inv.settlements,
      ),
    [ctx, inv.investors, inv.investorVehicles, inv.settlements],
  );
  const rowCols: Column<(typeof r.rows)[number]>[] = [
    { key: "investor", header: "Investor", render: (x) => x.investor },
    {
      key: "vehicles",
      header: "Vehicles",
      render: (x) => String(x.vehicles),
      mono: true,
    },
    {
      key: "compensation_types",
      header: "Compensation",
      render: (x) => x.compensation_types.join(", "),
    },
    {
      key: "finalized_settlements",
      header: "Finalized",
      render: (x) => String(x.finalized_settlements),
      mono: true,
    },
    {
      key: "paid_settlements",
      header: "Paid",
      render: (x) => String(x.paid_settlements),
      mono: true,
    },
    {
      key: "total_investor_payout",
      header: "Payout",
      render: (x) => fmtMoney(x.total_investor_payout),
      mono: true,
    },
  ];
  const pairingCols: Column<(typeof r.pairings)[number]>[] = [
    { key: "investor", header: "Investor", render: (x) => x.investor },
    { key: "vehicle", header: "Vehicle", render: (x) => x.vehicle },
    {
      key: "compensation_label",
      header: "Compensation",
      render: (x) => x.compensation_label,
    },
    {
      key: "finalized_payout",
      header: "Finalized",
      render: (x) => fmtMoney(x.finalized_payout),
      mono: true,
    },
    {
      key: "paid_payout",
      header: "Paid",
      render: (x) => fmtMoney(x.paid_payout),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Investor / JV Summary"
      subtitle="Partner vehicles, compensation, and settlements. Projected vs finalized vs paid kept separate."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(r.pairings, "investor-jv", [
              "investor",
              "vehicle",
              "compensation_label",
              "finalized_payout",
              "paid_payout",
            ])
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MoneyTile label="Total Finalized" amount={r.total_finalized} />
        <MoneyTile label="Total Paid" amount={r.total_paid} tone="positive" />
        <KpiTile label="Investors" value={String(r.rows.length)} />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Investor
        </h2>
        <ReportTable
          columns={rowCols}
          rows={r.rows}
          emptyMessage="No investors."
          onRowClick={(x) =>
            (window.location.href = `/investors/${x.investor_id}`)
          }
        />
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Vehicle Pairing
        </h2>
        <ReportTable
          columns={pairingCols}
          rows={r.pairings}
          emptyMessage="No pairings."
        />
      </section>
    </ReportShell>
  );
}
