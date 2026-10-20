import { useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { useStore } from "@/lib/store";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { StatusDot } from "@/components/Status";
import {
  fmtMoney,
  fmtDateTime,
  fmtNumber,
  statusToneClasses,
} from "@/lib/format";
import {
  fleetStatusCounts,
  activeRentalCount,
  returnsToday,
  overdueRentals,
  pickupsToday,
  maintenanceAttention,
} from "@/lib/dashboard";
import { useDashboardFinancials } from "@/pages/dashboard/useDashboardFinancials";
import { useDashboardAttention } from "@/pages/dashboard/useDashboardAttention";
import { getPaymentObligations } from "@/lib/billingSelectors";
import { useBilling } from "@/lib/billingStore";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { isVerificationEnabled } from "@/lib/verificationConfig";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ContextualHelp } from "@/components/support/ContextualHelp";
import { QuickAddMenu } from "@/components/QuickAddMenu";
import { AskCopilotButton } from "@/components/copilot/AskCopilotButton";
import {
  Car,
  CalendarCheck,
  Wallet,
  AlertTriangle,
  CalendarClock,
  Wrench,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import {
  KpiCard,
  PickupsTab,
  ReturnsTab,
  PaymentsTab,
  OverdueTab,
  NeedsAttention,
} from "./dashboard/DashboardParts";
import { FinancialMetric } from "./dashboard/DashboardMetrics";
import { CollectionsChart } from "./dashboard/CollectionsChart";
import { FleetDonut, LegendDot } from "./dashboard/FleetDonut";
import { myDashboardTasks } from "./dashboard/dashboardTasks";

type Tone = "available" | "maintenance" | "out" | "rented" | "neutral";

export default function Dashboard() {
  const {
    vehicles,
    reservations,
    rentals,
    maintenance,
    drivers,
    inspections,
    transactions,
    activityLog,
    recordRentalPayment,
    currentStaffId,
    rentalDeposits,
    paymentArrangements,
    arrangementInstallments,
    tasks,
    rentalFinancials,
    companyInfo,
  } = useStore();
  const navigate = useNavigate();
  const { billingPeriods } = useBilling();
  const { companyPolicies } = useCompanyPolicies();
  const verificationEnabled = isVerificationEnabled(companyPolicies);
  const tz = companyInfo.timezone;

  const fleet = useMemo(
    () => fleetStatusCounts(vehicles, reservations, tz),
    [vehicles, reservations, tz],
  );
  const activeCount = useMemo(() => activeRentalCount(rentals), [rentals]);
  const obligations = useMemo(
    () =>
      getPaymentObligations(
        rentals,
        billingPeriods,
        transactions,
        new Date(),
        tz,
      ),
    [rentals, billingPeriods, transactions, tz],
  );
  const dueToday = obligations.filter((p) => p.bucket === "due_today");
  const late = obligations.filter((p) => p.bucket === "late");
  const returns = useMemo(() => returnsToday(rentals, tz), [rentals, tz]);
  const overdue = useMemo(() => overdueRentals(rentals, tz), [rentals, tz]);
  const pickups = useMemo(
    () => pickupsToday(reservations, rentals, tz),
    [reservations, rentals, tz],
  );
  const maintAttention = useMemo(
    () => maintenanceAttention(maintenance, vehicles),
    [maintenance, vehicles],
  );

  const dueTodayTotal = dueToday.reduce((s, p) => s + p.amountDue, 0);
  const lateTotal = late.reduce((s, p) => s + p.amountDue, 0);

  const attentionItems = useDashboardAttention({
    rentals,
    reservations,
    vehicles,
    maintenance,
    drivers,
    inspections,
    rentalDeposits,
    paymentArrangements,
    arrangementInstallments,
    transactions,
    lateObligations: late,
    lateTotal,
    rentalFinancials,
    verificationEnabled,
  });

  const myTaskItems = useMemo(
    () => myDashboardTasks(tasks, currentStaffId),
    [tasks, currentStaffId],
  );

  const [tab, setTab] = useState<
    "pickups" | "returns" | "payments" | "overdue"
  >("pickups");
  const tabCounts = {
    pickups: pickups.length,
    returns: returns.length,
    payments: dueToday.length,
    overdue: overdue.length,
  };

  // Build #37 — Dashboard KPI "Explain this" opens the Copilot drawer with a
  // contextual explanation query. Reuses the existing engine; no new logic.
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState<string | null>(null);
  const askCopilot = (q: string) => {
    setCopilotQuery(q);
    setCopilotOpen(true);
  };

  // Financial metrics use the shared period-aware selectors (Build #5) so the
  // dashboard never computes financial truth independently.
  const {
    collectedWeek,
    outstanding,
    revenueMonth,
    net,
    chart7d,
    chartInterval,
    setChartInterval,
    chartData,
  } = useDashboardFinancials(transactions, maintenance);

  return (
    <div className="page-tint space-y-8">
      <PageHeader
        title="Operations Overview"
        subtitle="Here's what needs your attention across your fleet today."
        actions={
          <div className="flex items-center gap-2.5">
            <AskCopilotButton
              promptLabel="✨ Ask Copilot"
              initialQuery="What do I need to know today?"
            />
            <QuickAddMenu />
            <ContextualHelp
              route="/"
              productArea="dashboard"
              articleSlugs={["kb_getting_started", "kb_daily_briefing"]}
            />
          </div>
        }
      />

      {/* Core KPI strip — 6 high-contrast metric tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Fleet utilization"
          value={`${fleet.utilization}%`}
          hint={`${fleet.rented} of ${fleet.rentable} rentable on rent`}
          icon={<Car size={19} />}
          tone={fleet.utilization >= 60 ? "available" : "maintenance"}
          accent="teal"
          to="/vehicles"
          askCopilotQuery="Why is fleet utilization what it is?"
          onAskCopilot={askCopilot}
        />
        <KpiCard
          label="Active rentals"
          value={fmtNumber(activeCount)}
          hint="Currently checked out"
          icon={<CalendarCheck size={19} />}
          tone="rented"
          accent="indigo"
          to="/rentals?filter=active"
        />
        <KpiCard
          label="Payments due today"
          value={fmtNumber(dueToday.length)}
          secondary={fmtMoney(dueTodayTotal)}
          hint="Due from active renters"
          icon={<Wallet size={19} />}
          tone={dueToday.length ? "maintenance" : "neutral"}
          accent="green"
          to="/rental-management?tab=active&filter=payment_due"
          askCopilotQuery="Who owes me money today?"
          onAskCopilot={askCopilot}
          spark={chart7d}
        />
        <KpiCard
          label="Late payments"
          value={fmtNumber(late.length)}
          secondary={fmtMoney(lateTotal)}
          hint="Requires follow-up"
          icon={<AlertTriangle size={19} />}
          tone={late.length ? "out" : "neutral"}
          accent="red"
          to="/rental-management?tab=active&filter=late"
          askCopilotQuery="Who is overdue right now?"
          onAskCopilot={askCopilot}
        />
        <KpiCard
          label="Returns today"
          value={fmtNumber(returns.length)}
          hint="Vehicles expected back"
          icon={<CalendarClock size={19} />}
          tone={returns.length ? "maintenance" : "neutral"}
          accent="blue"
          to="/rentals?filter=returns_today"
          askCopilotQuery="What returns are due today?"
          onAskCopilot={askCopilot}
        />
        <KpiCard
          label="Maintenance due"
          value={fmtNumber(maintAttention.length)}
          hint="Due or overdue"
          icon={<Wrench size={19} />}
          tone={maintAttention.length ? "maintenance" : "neutral"}
          accent="orange"
          to="/maintenance"
          askCopilotQuery="What maintenance needs attention?"
          onAskCopilot={askCopilot}
        />
      </div>

      {/* Operational control */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title="Needs attention"
          count={attentionItems.length}
          countTone={attentionItems.length ? "maintenance" : "neutral"}
        >
          <NeedsAttention items={attentionItems} />
        </SectionCard>

        <SectionCard
          title="Today's operations"
          className="lg:col-span-2"
          right={
            <div className="seg-control">
              {(
                [
                  ["pickups", "Pickups"],
                  ["returns", "Returns"],
                  ["payments", "Payments Due"],
                  ["overdue", "Overdue"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  data-active={tab === key}
                  className="seg-control-item"
                >
                  {label}
                  <span className="ml-1.5 tabular">{tabCounts[key]}</span>
                </button>
              ))}
            </div>
          }
        >
          {tab === "pickups" && <PickupsTab pickups={pickups} />}
          {tab === "returns" && <ReturnsTab returns={returns} />}
          {tab === "payments" && (
            <PaymentsTab
              dueToday={dueToday}
              onRecord={(rentalId, amount) => {
                recordRentalPayment(rentalId, amount, "Card");
                toast.success(`Recorded ${fmtMoney(amount)}.`);
              }}
            />
          )}
          {tab === "overdue" && <OverdueTab overdue={overdue} />}
        </SectionCard>
      </div>

      {/* My tasks — compact attention list for the signed-in user */}
      {myTaskItems.length > 0 && (
        <SectionCard
          title="My tasks"
          count={myTaskItems.length}
          right={
            <Link
              to="/tasks"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              View my tasks →
            </Link>
          }
        >
          <ul className="space-y-1">
            {myTaskItems.map((item) => (
              <li key={item.id}>
                <Link
                  to="/tasks"
                  className={`status-border ${item.overdue ? statusToneClasses["out"].border : statusToneClasses["maintenance"].border} flex items-center justify-between rounded-lg py-2.5 pl-3 pr-2 transition-colors hover:bg-surface-2`}
                >
                  <span className="text-sm text-foreground">{item.title}</span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular",
                      item.overdue
                        ? "text-status-out"
                        : "text-status-maintenance",
                    )}
                  >
                    {item.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Collections & Financial Snapshot — linkable metrics (spec §5–6) */}
      <SectionCard title="Collections & Financial Snapshot">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            <FinancialMetric
              label="Collected this week"
              amount={collectedWeek}
              tone="available"
              to="/rental-management?tab=active&filter=payment_due&bucket=paid_week"
            />
            <FinancialMetric
              label="Outstanding"
              amount={outstanding}
              tone={outstanding > 0 ? "maintenance" : "neutral"}
              to="/rental-management?tab=active&filter=payment_due"
            />
            <FinancialMetric
              label="Billed revenue this month"
              amount={revenueMonth}
              tone="rented"
              to="/profitability"
            />
            <FinancialMetric
              label="Net contribution"
              amount={net}
              tone={net >= 0 ? "available" : "out"}
              to="/profitability"
            />
          </div>
          <CollectionsChart
            data={chartData}
            interval={chartInterval}
            onInterval={setChartInterval}
          />
        </div>
      </SectionCard>

      {/* Fleet snapshot + recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Fleet snapshot">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <FleetDonut fleet={fleet} />
            <div className="w-full flex-1">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[28px] font-semibold leading-none tabular text-foreground">
                  {fmtNumber(fleet.total)}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  Total vehicles
                </p>
              </div>
              <ul className="mt-3 space-y-0.5">
                <LegendDot
                  color="var(--status-available)"
                  label="Available"
                  value={fleet.available}
                />
                <LegendDot
                  color="var(--status-rented)"
                  label="On rent"
                  value={fleet.rented}
                />
                <LegendDot
                  color="var(--status-maintenance)"
                  label="Reserved"
                  value={fleet.reserved}
                />
                <LegendDot
                  color="var(--status-maintenance)"
                  label="Maintenance"
                  value={fleet.maintenance}
                />
                <LegendDot
                  color="var(--status-out)"
                  label="Out of service"
                  value={fleet.out_of_service}
                />
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Recent activity"
          className="lg:col-span-2"
          right={
            <span className="text-xs font-medium text-muted-foreground">
              Latest {Math.min(6, activityLog.length)}
            </span>
          }
        >
          <ul className="space-y-1">
            {activityLog.slice(0, 6).map((a, idx, arr) => (
              <li
                key={a.id}
                className="flex gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-surface-2/50"
              >
                <div className="relative flex flex-col items-center">
                  <span className="mt-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 ring-1 ring-border/60">
                    <StatusDot tone={a.tone} />
                  </span>
                  {idx < arr.length - 1 && (
                    <span className="mt-0.5 w-px flex-1 bg-border/60" />
                  )}
                </div>
                <div className="min-w-0 pb-3">
                  <p className="text-[14px] font-medium text-foreground">
                    {a.label}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] tabular text-muted-foreground/80">
                    {fmtDateTime(a.at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Build #37 — Dashboard Copilot drawer (KPI "Explain this" + page action) */}
      <Sheet
        open={copilotOpen}
        onOpenChange={(v) => {
          setCopilotOpen(v);
          if (!v) setCopilotQuery(null);
        }}
      >
        <SheetContent className="w-full p-0 sm:max-w-[440px]" side="right">
          <CopilotPanel
            onClose={() => {
              setCopilotOpen(false);
              setCopilotQuery(null);
            }}
            initialQuery={copilotQuery}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
