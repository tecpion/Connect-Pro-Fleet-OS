// Connect Pro Fleet — Daily Briefing page (Build #28 / Build #36 UX cleanup).
//
// The operational home screen answering "what do I need to know and act on
// today?" within ~30 seconds. DERIVED from the briefing composer (no new
// source of truth). Permission-aware: financial totals are hidden for viewers
// without financial permission.
//
// Build #36 UX cleanup — shorter, smarter, more visual, action-oriented:
//   - "Today at a Glance" KPI strip (6 polished cards)
//   - "Critical Attention" (bounded to 5, Critical only)
//   - "My Priorities" (current-user scope, bounded to 5)
//   - "Needs Assignment" (summary counters + top 6, not 18+ cards)
//   - "Today's Rentals" (Pickups / Returns / Overdue Returns tabs)
//   - "Payments & Collections" (compact positive empty state)
//   - "Fleet Attention" (Blocked / Maintenance / Compliance / Idle tabs)
//   - Compact "All Priorities" footer (no giant duplicate queue)
// Presentation dedupe: an issue shown in Critical Attention is not repeated as
// a full card elsewhere (it appears as a count/row). Underlying priority
// calculations are unchanged.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useViolations } from "@/lib/violationStoreProvider";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import { can } from "@/lib/permissions";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { AskCopilotButton } from "@/components/copilot/AskCopilotButton";
import { fmtMoney, fmtNumber, fmtDate } from "@/lib/format";
import { buildDailyBriefing, getMyPriorities } from "@/lib/briefingComposer";
import {
  getDepositsToCollect,
  getNeedsAssignmentSummary,
} from "@/lib/briefingSummary";
import {
  getBlockedVehicles,
  getMaintenanceAttention,
  getComplianceAttention,
  getDamageAttention,
  getViolationAttention,
  getIdleFleet,
} from "@/lib/briefingFleet";
import {
  getRentalsStartingToday,
  getRentalsReturningToday,
  getOverdueReturns,
} from "@/lib/briefingRentals";
import { getTodaysPaymentSummary } from "@/lib/briefingMoney";
import { DEFAULT_BRIEFING_CONFIG } from "@/lib/briefingTypes";
import type { BriefingItem } from "@/lib/briefingTypes";
import {
  GlanceKpi,
  PriorityRow,
  Segmented,
  CompactEmpty,
  PayStat,
} from "./briefing/BriefingPrimitives";
import {
  AlertTriangle,
  Wallet,
  CalendarClock,
  Car,
  ShieldAlert,
  ListTodo,
  TrendingDown,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  CalendarCheck,
  RotateCcw,
  ShieldCheck,
  CircleDot,
} from "lucide-react";

const CRITICAL_LIMIT = 5;
const MY_LIMIT = 5;
const ASSIGN_LIMIT = 6;
const ROW_LIMIT = 8;

export default function DailyBriefing() {
  const store = useStore();
  const { billingPeriods } = useBilling();
  const dc = useDamageClaims();
  const vio = useViolations();
  const comp = useCompliance();
  const staffAssignments = useStaffAssignments();

  const range = useMemo(() => resolveProfitabilityRange("this_year"), []);
  const asOf = useMemo(() => new Date(), []);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canSeeMoney = can(roleObj, overrides, "payments.view");

  const src = useMemo(
    () => ({
      store,
      billingPeriods,
      damageClaims: dc.damageClaims,
      violations: vio.violations,
      documents: comp.documents,
      requirements: comp.requirements,
      overrides: comp.overrides,
      assignments: staffAssignments.assignments,
      paymentArrangements: store.paymentArrangements,
      arrangementInstallments: store.arrangementInstallments,
      range,
    }),
    [
      store,
      billingPeriods,
      dc.damageClaims,
      vio.violations,
      comp.documents,
      comp.requirements,
      comp.overrides,
      staffAssignments.assignments,
      range,
    ],
  );

  const briefing = useMemo(
    () =>
      buildDailyBriefing(
        src,
        asOf,
        DEFAULT_BRIEFING_CONFIG,
        {
          canViewFinancials: canSeeMoney,
          canViewProfitability: can(
            roleObj,
            overrides,
            "reports.view_profitability",
          ),
          canViewSensitiveDocs: can(
            roleObj,
            overrides,
            "documents.view_sensitive",
          ),
          canViewBanking: can(roleObj, overrides, "banking.view"),
        },
        store.currentStaffId,
        store.tenant.id,
      ),
    [
      src,
      asOf,
      canSeeMoney,
      roleObj,
      overrides,
      store.currentStaffId,
      store.tenant.id,
    ],
  );

  const summary = briefing.operational_summary;

  const criticalItems = useMemo(
    () => briefing.priorities.filter((i) => i.priority === "critical"),
    [briefing.priorities],
  );
  const criticalIds = useMemo(
    () => new Set(criticalItems.map((i) => i.id)),
    [criticalItems],
  );

  const myPriorities = useMemo(
    () => getMyPriorities(src, asOf, store.currentStaffId).slice(0, MY_LIMIT),
    [src, asOf, store.currentStaffId],
  );

  const needsAssignment = useMemo(
    () => getNeedsAssignmentSummary(src, asOf),
    [src, asOf],
  );

  const pickups = useMemo(
    () => getRentalsStartingToday(src, asOf),
    [src, asOf],
  );
  const returnsToday = useMemo(
    () => getRentalsReturningToday(src, asOf),
    [src, asOf],
  );
  const overdueReturns = useMemo(
    () => getOverdueReturns(src, asOf),
    [src, asOf],
  );
  const [rentalTab, setRentalTab] = useState<"pickups" | "returns" | "overdue">(
    pickups.length ? "pickups" : "returns",
  );

  const paySummary = useMemo(
    () => getTodaysPaymentSummary(src, asOf),
    [src, asOf],
  );
  const depositsToCollect = useMemo(() => getDepositsToCollect(src), [src]);
  const moneyEmpty =
    paySummary.due_count === 0 &&
    paySummary.overdue_count === 0 &&
    paySummary.arrangement_broken_count === 0 &&
    depositsToCollect.length === 0;

  const blocked = useMemo(() => getBlockedVehicles(src, asOf), [src, asOf]);
  const maintAttn = useMemo(
    () => getMaintenanceAttention(src, asOf),
    [src, asOf],
  );
  const complianceAttn = useMemo(
    () => getComplianceAttention(src, asOf),
    [src, asOf],
  );
  const damageAttn = useMemo(() => getDamageAttention(src, asOf), [src, asOf]);
  const violationAttn = useMemo(
    () => getViolationAttention(src, asOf),
    [src, asOf],
  );
  const idle = useMemo(
    () => getIdleFleet(src, asOf, DEFAULT_BRIEFING_CONFIG),
    [src, asOf],
  );
  const maintenanceCombined = useMemo(
    () => [...maintAttn, ...damageAttn, ...violationAttn],
    [maintAttn, damageAttn, violationAttn],
  );
  const [fleetTab, setFleetTab] = useState<
    "blocked" | "maintenance" | "compliance" | "idle"
  >("blocked");

  const fleetRaw: Record<typeof fleetTab, BriefingItem[]> = {
    blocked,
    maintenance: maintenanceCombined,
    compliance: complianceAttn,
    idle,
  };
  const fleetList = fleetRaw[fleetTab].filter((i) => !criticalIds.has(i.id));

  const rentalRaw = { pickups, returns: returnsToday, overdue: overdueReturns };
  const rentalList = (rentalRaw[rentalTab] as BriefingItem[]).filter(
    (i) => !criticalIds.has(i.id),
  );

  const allPrioritiesCount = briefing.priorities.length;
  const fleetViewAllLink =
    fleetTab === "idle"
      ? "/vehicles"
      : fleetTab === "compliance"
        ? "/compliance"
        : fleetTab === "maintenance"
          ? "/maintenance"
          : "/vehicles";

  return (
    <div className="page-tint space-y-6">
      <PageHeader
        title="Daily Briefing"
        subtitle={`Today's operational attention · ${fmtDate(asOf.toISOString())}`}
        actions={<AskCopilotButton promptLabel="Ask Copilot about today" />}
      />

      {/* Suggested Copilot prompts */}
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        {[
          "What should I focus on first?",
          "Why are these vehicles blocked?",
          "Who needs collections follow-up?",
          "What changed since yesterday?",
        ].map((p) => (
          <Link
            key={p}
            to="/copilot"
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {p}
          </Link>
        ))}
      </div>

      {/* Today at a Glance */}
      <section aria-label="Today at a Glance">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Today at a Glance
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <GlanceKpi
            label="Payments Due"
            value={
              canSeeMoney
                ? `${fmtNumber(paySummary.due_count)} · ${fmtMoney(paySummary.due_amount)}`
                : `${fmtNumber(paySummary.due_count)}`
            }
            sub="Due from active renters"
            icon={<Wallet size={16} />}
            accent="green"
            to="/payments-due"
          />
          <GlanceKpi
            label="Overdue"
            value={
              canSeeMoney
                ? `${fmtNumber(paySummary.overdue_count)} · ${fmtMoney(paySummary.overdue_amount)}`
                : `${fmtNumber(paySummary.overdue_count)}`
            }
            sub="Past cutoff + grace"
            icon={<AlertTriangle size={16} />}
            accent="red"
            to="/payments-due"
          />
          <GlanceKpi
            label="Pickups Today"
            value={fmtNumber(summary.starts_today_count)}
            sub="Starting today"
            icon={<CalendarCheck size={16} />}
            accent="teal"
            to="/rental-management"
          />
          <GlanceKpi
            label="Returns Today"
            value={fmtNumber(summary.returns_today_count)}
            sub="Expected back"
            icon={<RotateCcw size={16} />}
            accent="blue"
            to="/rental-management"
          />
          <GlanceKpi
            label="Blocked Vehicles"
            value={fmtNumber(summary.blocked_vehicles_count)}
            sub="Cannot rent"
            icon={<ShieldAlert size={16} />}
            accent="orange"
            to="/vehicles"
          />
          <GlanceKpi
            label="Idle Vehicles"
            value={fmtNumber(summary.idle_vehicles_count)}
            sub="Available, not earning"
            icon={<TrendingDown size={16} />}
            accent="amber"
            to="/vehicles"
          />
        </div>
      </section>

      {/* Critical Attention */}
      {criticalItems.length > 0 && (
        <SectionCard
          title={`Critical Attention · ${criticalItems.length}`}
          icon={<AlertTriangle size={15} className="text-status-out" />}
          right={
            criticalItems.length > CRITICAL_LIMIT ? (
              <Link
                to="/tasks"
                className="text-xs font-medium text-primary hover:text-primary-press"
              >
                View all critical issues →
              </Link>
            ) : undefined
          }
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {criticalItems.slice(0, CRITICAL_LIMIT).map((item) => (
              <PriorityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* My Priorities */}
      {myPriorities.length > 0 && (
        <SectionCard
          title="My Priorities"
          icon={<ListTodo size={15} className="text-primary" />}
          right={
            <Link
              to="/tasks"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              View all my tasks →
            </Link>
          }
        >
          <div className="space-y-2">
            {myPriorities.map((item) => (
              <PriorityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                compact
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Needs Assignment */}
      {needsAssignment.total > 0 && (
        <SectionCard
          title="Needs Assignment"
          icon={<CircleDot size={15} className="text-status-maintenance" />}
          right={
            <Link
              to="/staff"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              Review all {needsAssignment.total} →
            </Link>
          }
        >
          <p className="text-sm text-foreground">
            <span className="font-semibold">{needsAssignment.total}</span> item
            {needsAssignment.total === 1 ? "" : "s"} need assignment
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {needsAssignment.categories.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground"
              >
                {c.label}
                <span className="font-mono tabular text-muted-foreground">
                  {c.count}
                </span>
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {needsAssignment.items.slice(0, ASSIGN_LIMIT).map((item) => (
              <PriorityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                compact
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Today's Rentals */}
      <SectionCard
        title="Today's Rentals"
        icon={<CalendarClock size={15} className="text-primary" />}
        right={
          <Segmented
            value={rentalTab}
            onChange={setRentalTab}
            options={[
              { key: "pickups", label: "Pickups", count: pickups.length },
              { key: "returns", label: "Returns", count: returnsToday.length },
              {
                key: "overdue",
                label: "Overdue Returns",
                count: overdueReturns.length,
              },
            ]}
          />
        }
      >
        {rentalList.length === 0 ? (
          <CompactEmpty
            title={
              rentalTab === "pickups"
                ? "No pickups today"
                : rentalTab === "returns"
                  ? "No returns today"
                  : "No overdue returns"
            }
            hint={
              rentalTab === "pickups"
                ? "No confirmed reservations start today."
                : rentalTab === "returns"
                  ? "No vehicles are scheduled to return today."
                  : "All active rentals are within their return window."
            }
          />
        ) : (
          <div className="space-y-2">
            {rentalList.slice(0, ROW_LIMIT).map((item) => (
              <PriorityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                compact
              />
            ))}
            {rentalList.length > ROW_LIMIT && (
              <Link
                to="/rental-management"
                className="block pt-1 text-center text-xs font-medium text-primary hover:text-primary-press"
              >
                View all {rentalList.length} →
              </Link>
            )}
          </div>
        )}
      </SectionCard>

      {/* Payments & Collections */}
      <SectionCard
        title="Payments & Collections"
        icon={<Wallet size={15} className="text-primary" />}
      >
        {moneyEmpty ? (
          <div className="flex items-center gap-3 py-3">
            <CheckCircle2 size={20} className="text-status-available" />
            <p className="text-sm font-medium text-foreground">
              No payment action needed today
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PayStat
              label="Due Today"
              value={fmtNumber(paySummary.due_count)}
              amount={canSeeMoney ? paySummary.due_amount : null}
              to="/payments-due"
            />
            <PayStat
              label="Overdue"
              value={fmtNumber(paySummary.overdue_count)}
              amount={canSeeMoney ? paySummary.overdue_amount : null}
              to="/payments-due"
              tone="out"
            />
            <PayStat
              label="Broken Arrangements"
              value={fmtNumber(paySummary.arrangement_broken_count)}
              to="/payment-arrangements"
              tone="out"
            />
            <PayStat
              label="Deposits to Collect"
              value={fmtNumber(depositsToCollect.length)}
              amount={
                canSeeMoney
                  ? depositsToCollect.reduce((s, d) => s + d.amount_due, 0)
                  : null
              }
              to="/deposits"
            />
          </div>
        )}
      </SectionCard>

      {/* Fleet Attention */}
      <SectionCard
        title="Fleet Attention"
        icon={<Car size={15} className="text-primary" />}
        right={
          <Segmented
            value={fleetTab}
            onChange={setFleetTab}
            options={[
              { key: "blocked", label: "Blocked", count: blocked.length },
              {
                key: "maintenance",
                label: "Maintenance",
                count: maintenanceCombined.length,
              },
              {
                key: "compliance",
                label: "Compliance",
                count: complianceAttn.length,
              },
              { key: "idle", label: "Idle", count: idle.length },
            ]}
          />
        }
      >
        {fleetList.length === 0 ? (
          <CompactEmpty
            title="Nothing blocking the fleet"
            hint={
              fleetTab === "idle"
                ? "No available vehicles are sitting idle."
                : "No vehicles need attention in this category."
            }
          />
        ) : (
          <div className="space-y-2">
            {fleetList.slice(0, ROW_LIMIT).map((item) => (
              <PriorityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                compact
              />
            ))}
            {fleetList.length > ROW_LIMIT && (
              <Link
                to={fleetViewAllLink}
                className="block pt-1 text-center text-xs font-medium text-primary hover:text-primary-press"
              >
                View all {fleetList.length} →
              </Link>
            )}
          </div>
        )}
      </SectionCard>

      {/* All Priorities — compact footer, no giant duplicate queue */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck size={15} className="text-primary" />
          <span>
            <span className="font-semibold text-foreground">
              {allPrioritiesCount}
            </span>{" "}
            open operational{" "}
            {allPrioritiesCount === 1 ? "priority" : "priorities"}
          </span>
        </div>
        <Link
          to="/executive"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          View Priority Queue
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
