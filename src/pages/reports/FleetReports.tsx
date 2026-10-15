// Connect Pro Fleet — Build #18 fleet report pages.
// Vehicle Performance (premium workspace), Maintenance, Damage Claims.

import { useMemo, useState } from "react";
import { useReportContext } from "./useReportContext";
import {
  getMaintenanceReport,
  getDamageClaimsReport,
} from "@/lib/fleetReportSelectors";
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

// Vehicle Performance now lives in its own focused module (premium fleet
// workspace). Re-exported here so existing route wiring stays unchanged.
export { VehiclePerformanceReport } from "./VehiclePerformanceReport";

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
export function MaintenanceReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getMaintenanceReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  const vehCols: Column<(typeof r.by_vehicle)[number]>[] = [
    { key: "vehicle", header: "Vehicle", render: (x) => x.vehicle },
    {
      key: "work_orders",
      header: "Work Orders",
      render: (x) => String(x.work_orders),
      mono: true,
    },
    {
      key: "spend",
      header: "Spend",
      render: (x) => fmtMoney(x.spend),
      mono: true,
    },
  ];
  const vendorCols: Column<(typeof r.by_vendor)[number]>[] = [
    { key: "vendor", header: "Vendor", render: (x) => x.vendor },
    {
      key: "work_orders",
      header: "Work Orders",
      render: (x) => String(x.work_orders),
      mono: true,
    },
    {
      key: "spend",
      header: "Spend",
      render: (x) => fmtMoney(x.spend),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Maintenance"
      subtitle="Work orders, downtime, and spend by vehicle and vendor."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              r.by_vehicle,
              "maintenance-by-vehicle",
              ["vehicle", "work_orders", "spend"],
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile label="Total Spend" amount={r.total_spend} />
        <KpiTile label="Open Work Orders" value={String(r.open_work_orders)} />
        <KpiTile
          label="Overdue"
          value={String(r.overdue_work_orders)}
          tone={r.overdue_work_orders > 0 ? "warning" : "default"}
        />
        <KpiTile label="Completed" value={String(r.completed_work_orders)} />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Spend by Vehicle
        </h2>
        <ReportTable
          columns={vehCols}
          rows={r.by_vehicle}
          emptyMessage="No maintenance spend."
        />
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Spend by Vendor
        </h2>
        <ReportTable
          columns={vendorCols}
          rows={r.by_vendor}
          emptyMessage="No vendor spend."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function DamageClaimsReport() {
  const ctx = useReportContext();
  const r = useMemo(() => getDamageClaimsReport(ctx), [ctx]);
  const cols: Column<(typeof r.rows)[number]>[] = [
    {
      key: "claim_number",
      header: "Claim",
      render: (x) => x.claim_number,
      mono: true,
    },
    { key: "vehicle", header: "Vehicle", render: (x) => x.vehicle },
    { key: "customer", header: "Customer", render: (x) => x.customer },
    { key: "status", header: "Status", render: (x) => x.status },
    {
      key: "responsibility",
      header: "Responsibility",
      render: (x) => x.responsibility,
    },
    {
      key: "age_days",
      header: "Age",
      render: (x) => `${x.age_days}d`,
      mono: true,
    },
    {
      key: "actual_cost",
      header: "Actual Cost",
      render: (x) => (x.actual_cost != null ? fmtMoney(x.actual_cost) : "—"),
      mono: true,
    },
    {
      key: "total_recovery",
      header: "Recovery",
      render: (x) => fmtMoney(x.total_recovery),
      mono: true,
    },
    {
      key: "net_loss",
      header: "Net Loss",
      render: (x) => (x.net_loss != null ? fmtMoney(x.net_loss) : "—"),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Damage Claims"
      subtitle="Open claims, recovery, and net damage loss."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(r.rows, "damage-claims", [
              "claim_number",
              "vehicle",
              "customer",
              "status",
              "responsibility",
              "age_days",
              "actual_cost",
              "total_recovery",
              "net_loss",
            ])
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Open Claims" value={String(r.open_count)} />
        <KpiTile
          label="Recovery Pending"
          value={String(r.recovery_pending_count)}
          tone="warning"
        />
        <MoneyTile label="Actual Cost" amount={r.total_actual_cost} />
        <MoneyTile
          label="Net Damage Loss"
          amount={r.total_net_loss}
          tone={r.total_net_loss > 0 ? "danger" : "positive"}
        />
      </div>
      <ReportTable
        columns={cols}
        rows={r.rows}
        emptyMessage="No damage claims."
        onRowClick={(x) =>
          (window.location.href = `/damage-claims?claim=${x.claim_id}`)
        }
      />
    </ReportShell>
  );
}
