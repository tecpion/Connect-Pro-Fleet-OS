// Connect Pro Fleet — Vehicle Performance page (V1).
//
// Owner-facing financial intelligence for a single vehicle. Gross Revenue hero,
// Cash Collected, Expenses, Net Contribution, Lifetime Return, performance
// label + explainable reasons, What's Helping/Hurting, Where the Money Went,
// utilization/time classification, damage/violation economics, financing,
// Vehicle vs Company economics views, comparison, and shareable Performance
// Card. All values derive from EXISTING authoritative selectors — no second
// accounting system, no invented data.
//
// Distinctions enforced: Gross Revenue ≠ Cash Collected ≠ Net Contribution.
// Deposits Held are NOT revenue. JV payout is a distribution, NOT an expense.
// Net Contribution is operational/cash-flow analytics — NOT GAAP profit.

import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "@/lib/router-compat";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Receipt,
  Percent,
  Gauge,
  Car,
  Share2,
  ChevronRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useViolations } from "@/lib/violationStoreProvider";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { can } from "@/lib/permissions";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { fmtMoney, fmtPct } from "@/lib/format";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import {
  resolvePerformanceRange,
  PERFORMANCE_RANGE_LABELS,
  type PerformanceRange,
} from "@/lib/vehiclePerformanceRanges";
import {
  DEFAULT_SHARE_CARD_OPTIONS,
  type ComparisonMetric,
  type ShareCardOptions,
} from "@/lib/vehiclePerformanceComparison";
import { DEFAULT_BRAND_COLOR } from "@/lib/vehiclePerformanceShareExport";
import { PERFORMANCE_LABELS } from "@/lib/vehiclePerformanceSettings";
import { cn } from "@/lib/utils";
import {
  MetricTile,
  HelpTip,
} from "./vehicles/performance/PerformancePrimitives";
import {
  OverviewTab,
  RevenueTab,
  CostsTab,
  UtilizationTab,
  TimelineTab,
} from "./vehicles/performance/PerformanceTabs";
import {
  ComparisonPanel,
  ShareCardPanel,
} from "./vehicles/performance/PerformancePanels";

const PERF_TONE: Record<string, "available" | "maintenance" | "out"> = {
  strong_performer: "available",
  watch: "maintenance",
  underperforming: "out",
};

const TABS = [
  "overview",
  "revenue",
  "costs",
  "utilization",
  "timeline",
] as const;
type Tab = (typeof TABS)[number];

export default function VehiclePerformancePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const store = useStore();
  const dc = useDamageClaims();
  const vio = useViolations();
  const { investorVehicles } = useInvestors();
  const { expenseRules } = usePartnerships();

  const [rangeKey, setRangeKey] = useState<PerformanceRange>("last_12_months");
  const [tab, setTab] = useState<Tab>("overview");
  const [view, setView] = useState<"vehicle" | "company">("vehicle");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [sortMetric, setSortMetric] =
    useState<ComparisonMetric>("netContribution");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState<ShareCardOptions>(
    DEFAULT_SHARE_CARD_OPTIONS,
  );

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canViewRevenue = can(roleObj, overrides, "payments.view");
  const canViewExpenses = can(roleObj, overrides, "expenses.view");
  const canViewProfit = can(
    roleObj,
    overrides,
    "reports.view_vehicle_profitability",
  );
  const canViewCompany = can(roleObj, overrides, "investors.view_financials");
  const canCompare = canViewProfit;
  const canShare = canViewProfit;

  const range = useMemo(() => resolvePerformanceRange(rangeKey), [rangeKey]);

  const inputs: VehiclePerformanceInputs = useMemo(
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
      deposits: store.rentalDeposits,
      damageClaims: dc.damageClaims,
      damageRecoveries: dc.damageRecoveries,
      violations: vio.violations,
      workOrders: store.workOrders,
    }),
    [
      store,
      investorVehicles,
      expenseRules,
      dc.damageClaims,
      dc.damageRecoveries,
      vio.violations,
    ],
  );

  const perf = useMemo(
    () => getVehiclePerformance(id, inputs, range),
    [id, inputs, range],
  );
  const vehicle = store.vehicles.find((v) => v.id === id);

  if (!vehicle) {
    return (
      <EmptyState
        title="Vehicle not found"
        hint="This vehicle may have been removed."
        action={
          <Button variant="outline" onClick={() => navigate("/vehicles")}>
            Back to Inventory
          </Button>
        }
      />
    );
  }

  const showMoney = canViewRevenue && canViewProfit;
  const showExpenses = canViewExpenses && canViewProfit;

  return (
    <div className="space-y-5">
      <Link
        to={`/vehicles/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} /> Vehicle Detail
      </Link>

      <PageHeader
        title="Vehicle Performance"
        subtitle="Revenue, profitability, utilization, costs, and lifetime return for every vehicle."
        actions={
          <div className="flex items-center gap-2">
            <select
              value={rangeKey}
              onChange={(e) => setRangeKey(e.target.value as PerformanceRange)}
              className="rounded-md border border-input bg-surface px-3 py-2 text-sm"
              aria-label="Time range"
            >
              {(
                Object.keys(PERFORMANCE_RANGE_LABELS) as PerformanceRange[]
              ).map((k) => (
                <option key={k} value={k}>
                  {PERFORMANCE_RANGE_LABELS[k]}
                </option>
              ))}
            </select>
            {canCompare && (
              <Button
                variant="outline"
                onClick={() => setCompareOpen((v) => !v)}
              >
                <Car size={15} className="mr-1.5" /> Compare
              </Button>
            )}
            {canShare && (
              <Button variant="outline" onClick={() => setShareOpen((v) => !v)}>
                <Share2 size={15} className="mr-1.5" /> Performance Card
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3">
        <Car size={18} className="text-primary" />
        <span className="font-display text-base font-semibold">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </span>
        <span className="font-mono text-sm text-muted-foreground">
          {vehicle.license_plate}
        </span>
        <StatusPill
          tone={
            vehicle.ownership_type === "company_owned" ? "neutral" : "rented"
          }
        >
          {vehicle.ownership_type === "company_owned"
            ? "Company Owned"
            : "JV / Investor"}
        </StatusPill>
        <StatusPill
          tone={
            perf.financing.financingState === "paid_off"
              ? "available"
              : "maintenance"
          }
        >
          {perf.financing.financingState === "paid_off"
            ? "Paid Off"
            : "Financed"}
        </StatusPill>
      </div>

      <SectionCard title="Gross Revenue Generated">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-xl bg-primary/5 p-5 ring-1 ring-primary/20">
            <div className="flex items-center gap-2 text-primary">
              <DollarSign size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">
                Gross Revenue Generated
              </span>
              <HelpTip text="Total rental revenue generated by this vehicle before expenses. Excludes held deposits, loans, and unrelated income." />
            </div>
            <p className="mt-2 font-mono text-4xl font-bold tabular text-primary">
              {showMoney ? fmtMoney(perf.grossRevenueGenerated) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {perf.periodStart} → {perf.periodEnd}
            </p>
          </div>
          <MetricTile
            label="Cash Collected"
            value={showMoney ? fmtMoney(perf.cashCollected) : "—"}
            sub={
              showMoney
                ? `Outstanding ${fmtMoney(perf.outstanding)}`
                : undefined
            }
            icon={<Wallet size={15} />}
          />
          <MetricTile
            label="Total Expenses"
            value={showExpenses ? fmtMoney(perf.totalExpenses) : "—"}
            icon={<Receipt size={15} />}
            tone="warning"
          />
          <MetricTile
            label="Net Contribution"
            value={showMoney ? fmtMoney(perf.netContribution) : "—"}
            sub="Not GAAP profit"
            icon={<TrendingUp size={15} />}
            tone={perf.netContribution >= 0 ? "positive" : "danger"}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Purchase Price"
            value={
              perf.financing.purchasePriceMissing
                ? "Missing"
                : fmtMoney(perf.purchasePrice)
            }
            icon={<DollarSign size={15} />}
          />
          <MetricTile
            label="Lifetime Return"
            value={
              perf.lifetimeReturn == null ? "—" : fmtPct(perf.lifetimeReturn)
            }
            sub={
              perf.acquisitionBasisFullyRecovered
                ? "Acquisition fully recovered"
                : `${perf.acquisitionBasisRecoveredPct ?? 0}% of basis recovered`
            }
            icon={<Percent size={15} />}
            tone={
              perf.lifetimeReturn != null && perf.lifetimeReturn >= 100
                ? "positive"
                : "neutral"
            }
          />
          <MetricTile
            label="Operating Contribution"
            value={showMoney ? fmtMoney(perf.operatingContribution) : "—"}
            sub="Before financing"
            icon={<Gauge size={15} />}
          />
          <MetricTile
            label="Cash-Flow Contribution"
            value={showMoney ? fmtMoney(perf.cashFlowContribution) : "—"}
            sub="After car-note payments"
            icon={<Wallet size={15} />}
          />
        </div>
      </SectionCard>

      <SectionCard title="Performance">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusPill tone={PERF_TONE[perf.performance.label]}>
              {PERFORMANCE_LABELS[perf.performance.label]}
            </StatusPill>
            <ul className="mt-3 space-y-1.5">
              {perf.performance.reasons.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <ChevronRight
                    size={14}
                    className="mt-0.5 text-muted-foreground"
                  />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <TrendingUp size={13} /> What's Helping
              </p>
              <ul className="mt-2 space-y-1">
                {perf.performance.whatsHelping.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    No strong positives
                  </li>
                ) : (
                  perf.performance.whatsHelping.map((h, i) => (
                    <li key={i} className="text-xs text-foreground">
                      {h}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                <TrendingDown size={13} /> What's Hurting
              </p>
              <ul className="mt-2 space-y-1">
                {perf.performance.whatsHurting.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    No notable drags
                  </li>
                ) : (
                  perf.performance.whatsHurting.map((h, i) => (
                    <li key={i} className="text-xs text-foreground">
                      {h}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      </SectionCard>

      {perf.hasInvestor && canViewCompany && (
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            <button
              onClick={() => setView("vehicle")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                view === "vehicle"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              Vehicle Economics
            </button>
            <button
              onClick={() => setView("company")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                view === "company"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              Company Economics
            </button>
          </div>
        </div>
      )}

      <div className="inline-flex rounded-lg border border-border bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm capitalize",
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          perf={perf}
          showMoney={showMoney}
          showExpenses={showExpenses}
          view={view}
          canViewCompany={canViewCompany}
        />
      )}
      {tab === "revenue" && <RevenueTab perf={perf} showMoney={showMoney} />}
      {tab === "costs" && <CostsTab perf={perf} showExpenses={showExpenses} />}
      {tab === "utilization" && <UtilizationTab perf={perf} />}
      {tab === "timeline" && <TimelineTab perf={perf} vehicleId={id} />}

      {compareOpen && canCompare && (
        <ComparisonPanel
          currentId={id}
          inputs={inputs}
          range={range}
          compareIds={compareIds}
          setCompareIds={setCompareIds}
          sortMetric={sortMetric}
          setSortMetric={setSortMetric}
          vehicles={store.vehicles}
        />
      )}
      {shareOpen && canShare && (
        <ShareCardPanel
          perf={perf}
          opts={shareOpts}
          setOpts={setShareOpts}
          brandColor={DEFAULT_BRAND_COLOR}
          logoUrl={store.companyInfo.logo_url}
          businessName={store.companyInfo.dba || store.companyInfo.legal_name}
        />
      )}

      <p className="pb-4 text-xs text-muted-foreground">
        Net Contribution is operational/cash-flow analytics, not formal
        tax/accounting profit. Share View never exposes private renter,
        financing, JV, or internal financial details unless explicitly selected
        and permitted.
      </p>
    </div>
  );
}
