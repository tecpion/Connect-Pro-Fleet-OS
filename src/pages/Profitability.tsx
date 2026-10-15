// Connect Pro Fleet — Profitability & P&L page (Build #16).
//
// Three derived views (Vehicle / Fleet / Company P&L) over the authoritative
// rental + expense ledgers. Profitability is NEVER stored — every figure is
// derived from the selectors. Sensitive data (company overhead, investor
// economics) is permission-gated so it isn't leaked to unauthorized staff.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, SectionCard } from "@/components/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/format";
import {
  resolveProfitabilityRange,
  getCompanyProfitability,
  getFleetProfitability,
  getVehiclePerformanceRows,
  getClassProfitability,
  getLocationProfitability,
  type ProfitabilityInputs,
} from "@/lib/profitabilitySelectors";
import {
  PROFITABILITY_RANGE_LABELS,
  type ProfitabilityRange,
} from "@/lib/profitabilityTypes";
import { buildProfitTrend } from "@/lib/profitabilityTrend";
import {
  getCollectionsByTenderMethod,
  getTenderMethodMix,
} from "@/lib/collectionSelectors";
import { getExpensesByCategory } from "@/lib/expenseSelectors";
import {
  RevenueExpenseChart,
  ProfitTrendChart,
  ExpenseBreakdownChart,
  TenderMixChart,
} from "./profitability/ProfitabilityCharts";
import { Download, TrendingUp, BarChart3, Car, MapPin } from "lucide-react";
import { CompanyView } from "./profitability/CompanyView";
import { FleetView } from "./profitability/FleetView";
import { VehiclesView } from "./profitability/VehiclesView";

export default function Profitability() {
  const store = useStore();
  const { investorVehicles } = useInvestors();
  const { expenseRules } = usePartnerships();
  const [tab, setTab] = useState("company");
  const [rangeKey, setRangeKey] = useState<ProfitabilityRange>("this_month");
  const [custom, setCustom] = useState({ start: "", end: "" });

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewProfitability = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reports.view_profitability",
  );
  const canViewCompany = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reports.view_company_profitability",
  );
  const canViewVehicle = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reports.view_vehicle_profitability",
  );
  const canViewInvestorFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.view_financials",
  );
  const canViewOverhead = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.view_company_overhead",
  );
  const canExport = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reports.export",
  );

  const range = useMemo(
    () =>
      resolveProfitabilityRange(
        rangeKey,
        rangeKey === "custom" ? custom : undefined,
      ),
    [rangeKey, custom],
  );

  const inputs: ProfitabilityInputs = useMemo(
    () => ({
      transactions: store.transactions,
      expenses: store.expenses,
      expenseLineItems: store.expenseLineItems,
      expenseCategories: store.expenseCategories,
      feeRules: store.feeRules,
      vehicles: store.vehicles,
      vehicleClasses: store.vehicleClasses,
      locations: store.locations,
      rentals: store.rentals,
      exchanges: store.rentals.flatMap((r) => store.vehicleExchanges(r.id)),
      investorVehicles,
      expenseRules,
      importedTransactions: store.importedTransactions,
      expenseReceipts: store.expenseReceipts,
      expenseReimbursements: store.expenseReimbursements,
    }),
    [store, investorVehicles, expenseRules],
  );

  const company = useMemo(
    () => getCompanyProfitability(inputs, range),
    [inputs, range],
  );
  const fleet = useMemo(
    () => getFleetProfitability(inputs, range),
    [inputs, range],
  );
  const vehicleRows = useMemo(
    () => getVehiclePerformanceRows(inputs, range),
    [inputs, range],
  );
  const classRows = useMemo(
    () => getClassProfitability(inputs, range),
    [inputs, range],
  );
  const locationRows = useMemo(
    () => getLocationProfitability(inputs, range),
    [inputs, range],
  );
  const trend = useMemo(
    () =>
      buildProfitTrend(
        store.transactions,
        store.expenses,
        store.expenseCategories,
        range,
      ),
    [store, range],
  );
  const tenderMix = useMemo(
    () => getTenderMethodMix(store.transactions),
    [store.transactions],
  );
  const expenseByCategory = useMemo(
    () =>
      getExpensesByCategory(store.expenses, store.expenseCategories)
        .filter((c) => c.total > 0)
        .map((c) => ({
          category: c.category?.name ?? "Uncategorized",
          amount: c.total,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8),
    [store],
  );

  if (!canViewProfitability) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <EmptyState
          title="Profitability restricted"
          hint="You don't have permission to view profitability reports."
        />
      </div>
    );
  }

  function exportCsv() {
    const header = [
      "Vehicle",
      "Class",
      "Ownership",
      "Revenue",
      "Collections",
      "Expenses",
      "Gross Profit",
      "Utilization",
      "Margin",
      "Rented Days",
    ];
    const rows = vehicleRows.map((r) => [
      r.label,
      r.class_name ?? "",
      r.ownership_type,
      r.revenue,
      r.collections,
      r.expenses,
      r.gross_profit,
      `${r.utilization}%`,
      `${r.margin}%`,
      r.rented_days,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `profitability-${range.start.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Profitability
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational P&L derived from your rental and expense ledgers — not a
            substitute for formal accounting statements.
          </p>
        </div>
        {canExport && (
          <Button variant="outline" onClick={exportCsv}>
            <Download size={16} className="mr-1" /> Export CSV
          </Button>
        )}
      </header>

      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PROFITABILITY_RANGE_LABELS) as ProfitabilityRange[]).map(
          (k) => (
            <button
              key={k}
              onClick={() => setRangeKey(k)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                rangeKey === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {PROFITABILITY_RANGE_LABELS[k]}
            </button>
          ),
        )}
        {rangeKey === "custom" && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={custom.start}
              onChange={(e) =>
                setCustom((c) => ({ ...c, start: e.target.value }))
              }
              className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="date"
              value={custom.end}
              onChange={(e) =>
                setCustom((c) => ({ ...c, end: e.target.value }))
              }
              className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
            />
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
        </TabsList>

        {tab === "company" && (
          <CompanyView
            company={company}
            trend={trend}
            tenderMix={tenderMix}
            expenseByCategory={expenseByCategory}
            canViewCompany={canViewCompany}
            canViewOverhead={canViewOverhead}
            canViewInvestorFinancials={canViewInvestorFinancials}
          />
        )}
        {tab === "fleet" && (
          <FleetView
            fleet={fleet}
            trend={trend}
            canViewInvestorFinancials={canViewInvestorFinancials}
          />
        )}
        {tab === "vehicles" && canViewVehicle && (
          <VehiclesView
            rows={vehicleRows}
            canViewInvestorFinancials={canViewInvestorFinancials}
          />
        )}
        {tab === "vehicles" && !canViewVehicle && (
          <EmptyState
            title="Vehicle profitability restricted"
            hint="You don't have permission to view vehicle-level profitability."
          />
        )}
        {tab === "classes" && (
          <ClassLocationTable
            rows={classRows.map((c) => ({
              id: c.class_id ?? c.class_name,
              name: c.class_name,
              count: c.vehicle_count,
              revenue: c.revenue,
              expenses: c.expenses,
              profit: c.gross_profit,
              utilization: c.utilization,
              extra: fmtMoney(c.revenue_per_vehicle),
              extraLabel: "Rev / vehicle",
            }))}
            icon={<Car size={16} />}
            nameLabel="Class"
          />
        )}
        {tab === "locations" && (
          <ClassLocationTable
            rows={locationRows.map((c) => ({
              id: c.location_id ?? c.location_name,
              name: c.location_name,
              count: c.vehicle_count,
              revenue: c.revenue,
              expenses: c.expenses,
              profit: c.gross_profit,
              utilization: c.utilization,
            }))}
            icon={<MapPin size={16} />}
            nameLabel="Location"
          />
        )}
      </Tabs>
    </div>
  );
}

function ClassLocationTable({
  rows,
  icon,
  nameLabel,
  extraLabel,
}: {
  rows: {
    id: string;
    name: string;
    count: number;
    revenue: number;
    expenses: number;
    profit: number;
    utilization: number;
    extra?: string;
  }[];
  icon: React.ReactNode;
  nameLabel: string;
  extraLabel?: string;
}) {
  if (rows.length === 0)
    return <EmptyState title="No data" hint="No vehicles in this period." />;
  return (
    <SectionCard title={`${nameLabel} profitability`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">{nameLabel}</th>
              <th className="py-2 pr-4 text-right font-medium">Vehicles</th>
              <th className="py-2 pr-4 text-right font-medium">Revenue</th>
              <th className="py-2 pr-4 text-right font-medium">Expenses</th>
              <th className="py-2 pr-4 text-right font-medium">Gross profit</th>
              <th className="py-2 pr-4 text-right font-medium">Utilization</th>
              {extraLabel && (
                <th className="py-2 text-right font-medium">{extraLabel}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="py-2.5 pr-4">
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    {icon}
                    {r.name}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {r.count}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-foreground">
                  {fmtMoney(r.revenue)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {fmtMoney(r.expenses)}
                </td>
                <td
                  className={`py-2.5 pr-4 text-right font-mono tabular font-semibold ${
                    r.profit < 0 ? "text-out" : "text-foreground"
                  }`}
                >
                  {fmtMoney(r.profit)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {fmtPct(r.utilization)}
                </td>
                {extraLabel && (
                  <td className="py-2.5 text-right font-mono tabular text-muted-foreground">
                    {r.extra ?? "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
