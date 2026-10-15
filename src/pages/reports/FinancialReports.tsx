// Connect Pro Fleet — Build #18 financial report pages.
// Revenue, Collections, Outstanding Balances, Payment Arrangements, Late Fees.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useReportContext } from "./useReportContext";
import {
  getRevenueSummary,
  getCollectionsReport,
  getOutstandingBalancesReport,
  getAgingReport,
  getPaymentArrangementReport,
  getLateFeeReport,
  AGING_BUCKET_LABELS,
} from "@/lib/financialReportSelectors";
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
export function RevenueSummaryReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getRevenueSummary(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  return (
    <ReportShell
      title="Revenue Summary"
      subtitle="Recognized operating revenue by category. Taxes shown separately."
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile label="Base Rental" amount={r.base_rental_revenue} />
        <MoneyTile label="Late Fees" amount={r.late_fee_revenue} />
        <MoneyTile label="Eligible Fees" amount={r.fee_revenue} />
        <MoneyTile label="Damage Charges" amount={r.damage_charge_revenue} />
        <MoneyTile label="Forfeitures" amount={r.forfeiture_revenue} />
        <MoneyTile
          label="Total Operating Revenue"
          amount={r.total_operating_revenue}
          tone="positive"
        />
        <MoneyTile
          label="Taxes Collected"
          amount={r.tax_collected}
          sub="Pass-through, not revenue"
        />
      </div>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function CollectionsReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getCollectionsReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  const tenderCols: Column<(typeof r.by_tender)[number]>[] = [
    { key: "label", header: "Tender", render: (x) => x.label },
    {
      key: "count",
      header: "Count",
      render: (x) => String(x.count),
      mono: true,
    },
    {
      key: "total",
      header: "Total",
      render: (x) => fmtMoney(x.total),
      mono: true,
    },
  ];
  const procCols: Column<(typeof r.by_processor)[number]>[] = [
    { key: "label", header: "Processor", render: (x) => x.label },
    {
      key: "count",
      header: "Count",
      render: (x) => String(x.count),
      mono: true,
    },
    {
      key: "total",
      header: "Total",
      render: (x) => fmtMoney(x.total),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Collections"
      subtitle="Actual payments collected by tender method and processor."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              r.by_tender.map((t) => ({
                tender: t.label,
                count: t.count,
                total: t.total,
              })),
              "collections",
              ["tender", "count", "total"],
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
        <MoneyTile
          label="Total Collections"
          amount={r.total_collections}
          tone="positive"
        />
        <KpiTile label="Payments" value={String(r.payment_count)} />
        <MoneyTile label="Average Payment" amount={r.average_payment} />
        <MoneyTile label="Largest Payment" amount={r.largest_payment} />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Tender Method
        </h2>
        <ReportTable
          columns={tenderCols}
          rows={r.by_tender}
          emptyMessage="No collections in this period."
        />
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          By Processor
        </h2>
        <ReportTable
          columns={procCols}
          rows={r.by_processor}
          emptyMessage="No collections in this period."
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function OutstandingBalancesReport() {
  const ctx = useReportContext();
  const r = useMemo(
    () => getOutstandingBalancesReport(ctx, { start: "", end: "" }),
    [ctx],
  );
  const aging = useMemo(() => getAgingReport(ctx), [ctx]);
  const cols: Column<(typeof r.rows)[number]>[] = [
    { key: "customer", header: "Customer", render: (x) => x.customer },
    { key: "vehicle", header: "Vehicle", render: (x) => x.vehicle },
    {
      key: "total_outstanding",
      header: "Outstanding",
      render: (x) => fmtMoney(x.total_outstanding),
      mono: true,
    },
    {
      key: "current_due",
      header: "Current",
      render: (x) => fmtMoney(x.current_due),
      mono: true,
    },
    {
      key: "late_amount",
      header: "Late",
      render: (x) => fmtMoney(x.late_amount),
      mono: true,
    },
    {
      key: "days_late",
      header: "Days Late",
      render: (x) => String(x.days_late),
      mono: true,
    },
    {
      key: "arrangement_status",
      header: "Arrangement",
      render: (x) => x.arrangement_status ?? "—",
    },
  ];
  return (
    <ReportShell
      title="Outstanding Balances"
      subtitle="Customers and rentals with open obligations and aging."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(r.rows, "outstanding-balances", [
              "customer",
              "vehicle",
              "total_outstanding",
              "current_due",
              "late_amount",
              "days_late",
              "arrangement_status",
            ])
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MoneyTile
          label="Total Outstanding"
          amount={r.total_outstanding}
          tone="warning"
        />
        <MoneyTile label="Total Late" amount={r.total_late} tone="danger" />
        <KpiTile label="Rentals" value={String(r.rows.length)} />
      </div>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Aging
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {aging.buckets.map((b) => (
            <MoneyTile
              key={b.bucket}
              label={b.label}
              amount={b.amount}
              sub={`${b.count} rentals`}
            />
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Outstanding Rentals
        </h2>
        <ReportTable
          columns={cols}
          rows={r.rows}
          emptyMessage="No outstanding balances."
          onRowClick={(x) => (window.location.href = `/rentals/${x.rental_id}`)}
        />
      </section>
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function PaymentArrangementsReport() {
  const ctx = useReportContext();
  const r = useMemo(() => getPaymentArrangementReport(ctx), [ctx]);
  const cols: Column<(typeof r.rows)[number]>[] = [
    { key: "customer", header: "Customer", render: (x) => x.customer },
    { key: "status", header: "Status", render: (x) => x.status },
    {
      key: "arrangement_amount",
      header: "Arrangement",
      render: (x) => fmtMoney(x.arrangement_amount),
      mono: true,
    },
    {
      key: "paid",
      header: "Paid",
      render: (x) => fmtMoney(x.paid),
      mono: true,
    },
    {
      key: "collectible_remaining",
      header: "Collectible",
      render: (x) => fmtMoney(x.collectible_remaining),
      mono: true,
    },
    {
      key: "additional_balance_outside",
      header: "Outside Arr.",
      render: (x) => fmtMoney(x.additional_balance_outside),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Payment Arrangements"
      subtitle="Active, broken, and resolved arrangements. Promises are never collections."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(r.rows, "payment-arrangements", [
              "customer",
              "status",
              "arrangement_amount",
              "paid",
              "collectible_remaining",
              "additional_balance_outside",
            ])
          }
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active" value={String(r.active_count)} />
        <KpiTile
          label="Broken"
          value={String(r.broken_count)}
          tone={r.broken_count > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Resolved"
          value={String(r.resolved_count)}
          tone="positive"
        />
        <MoneyTile label="Total Collectible" amount={r.total_collectible} />
      </div>
      <ReportTable
        columns={cols}
        rows={r.rows}
        emptyMessage="No payment arrangements."
      />
    </ReportShell>
  );
}

// ---------------------------------------------------------------------------
export function LateFeesReport() {
  const ctx = useReportContext();
  const { preset, setPreset, custom, setCustom, filter } = useFilter();
  const r = useMemo(
    () => getLateFeeReport(ctx, filter),
    [ctx, filter.start, filter.end],
  );
  const cols: Column<(typeof r.by_customer)[number]>[] = [
    { key: "customer", header: "Customer", render: (x) => x.customer },
    {
      key: "assessed",
      header: "Assessed",
      render: (x) => fmtMoney(x.assessed),
      mono: true,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      render: (x) => fmtMoney(x.outstanding),
      mono: true,
    },
  ];
  return (
    <ReportShell
      title="Late Fees"
      subtitle="Late fees assessed, outstanding, and waived."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() =>
            exportRows(
              r.by_customer,
              "late-fees",
              ["customer", "assessed", "outstanding"],
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
        <MoneyTile label="Total Assessed" amount={r.total_assessed} />
        <MoneyTile
          label="Outstanding"
          amount={r.total_outstanding}
          tone="warning"
        />
        <MoneyTile label="Waived/Reversed" amount={r.total_waived} />
      </div>
      <ReportTable
        columns={cols}
        rows={r.by_customer}
        emptyMessage="No late fees in this period."
      />
    </ReportShell>
  );
}
