// Connect Pro Fleet — Action Center page (Build #37).
//
// The unified operational workspace: "What needs attention and what should I do
// next?" Combines prioritized operational work + the Fleet Copilot
// conversational workspace. DERIVED from the briefing composer (no new source
// of truth). Permission-aware.
//
// This consolidates the old standalone Daily Briefing + standalone Copilot
// dashboard into ONE workspace. The Daily Briefing sections (Critical Attention,
// My Work, Needs Assignment, Today's Rentals, Payments & Collections, Fleet
// Attention, All Priorities) are reused verbatim — only the page chrome changes
// (a prominent Copilot composer at the top, no "Today at a Glance" KPI strip,
// which belongs on the Dashboard).
//
// No business logic is changed. The Copilot engine is unchanged.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useBookingRequestsOptional } from "@/lib/store/bookingRequestStore";
import { useViolations } from "@/lib/violationStoreProvider";
import { selectBookingAttentionItems } from "@/lib/bookingRequestSelectors";
import { useTelematicsAttention } from "./actionCenter/useTelematicsAttention";
import { VerificationAttentionSection } from "./actionCenter/VerificationAttentionSection";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PageHeader, SectionCard } from "@/components/ui-bits";
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
  Segmented,
  CompactEmpty,
  PayStat,
} from "./briefing/BriefingPrimitives";
import { IdentityRow, makeVehicleLabel } from "./actionCenter/IdentityRow";
import { ActionCenterCopilot } from "./actionCenter/ActionCenterCopilot";
import {
  AlertTriangle,
  Wallet,
  CalendarClock,
  Car,
  ShieldAlert,
  ListTodo,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  CircleDot,
  Inbox,
  Satellite,
} from "lucide-react";

const CRITICAL_LIMIT = 5;
const MY_LIMIT = 5;
const ASSIGN_LIMIT = 6;
const ROW_LIMIT = 8;

/** Starter prompts shown in the Action Center composer area. These map to real
 *  deterministic Copilot intents only. */
const ACTION_CENTER_PROMPTS = [
  "What should I focus on first?",
  "Who owes money today?",
  "What's blocking the fleet?",
  "Which vehicles have been idle the longest?",
  "What changed since yesterday?",
  "Give me my morning briefing.",
  "Draft reminders for overdue customers.",
];

export default function ActionCenter() {
  const store = useStore();
  const { billingPeriods } = useBilling();
  const dc = useDamageClaims();
  const vio = useViolations();
  const bookingsOpt = useBookingRequestsOptional();
  const comp = useCompliance();
  const staffAssignments = useStaffAssignments();

  const range = useMemo(() => resolveProfitabilityRange("this_year"), []);
  const asOf = useMemo(() => new Date(), []);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canSeeMoney = can(roleObj, overrides, "payments.view");
  // Identity resolvers — derive compact customer + vehicle labels from the
  // authoritative store so each row shows the real record behind it (spec §9–13,
  // §16, §19, §21–23). No new source of truth; pure derivation.
  const resolvers = {
    customerName: (id: string) => store.customerName(id),
    vehicleLabel: makeVehicleLabel(store.vehicles),
  };

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
  const bookingAttention = useMemo(
    () =>
      bookingsOpt
        ? selectBookingAttentionItems({
            requests: bookingsOpt.bookingRequests,
            customers: store.customers,
          })
        : [],
    [bookingsOpt, store.customers],
  );
  const telematicsAttention = useTelematicsAttention();
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
        title="Action Center"
        subtitle="Prioritized work and operational intelligence, powered by Fleet Copilot."
      />

      {/* Prominent Copilot composer */}
      <ActionCenterCopilot prompts={ACTION_CENTER_PROMPTS} />

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
              <IdentityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                resolvers={resolvers}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* My Work */}
      {myPriorities.length > 0 && (
        <SectionCard
          title="My Work"
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
              <IdentityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                resolvers={resolvers}
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
              <IdentityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                resolvers={resolvers}
                compact
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Build #62 — Booking Requests (CRM handoff intake). New + missing
          license + needs follow-up + waitlisted surface here and deep-link into
          Rental Management → Booking Requests. Not a second task queue. */}
      {bookingAttention.length > 0 && (
        <SectionCard
          title={`Booking Requests · ${bookingAttention.length}`}
          icon={<Inbox size={15} className="text-primary" />}
          right={
            <Link
              to="/rental-management?tab=booking"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              Open all booking requests →
            </Link>
          }
        >
          <div className="space-y-2">
            {bookingAttention.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                to={item.deep_link}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40 hover:bg-surface-2"
              >
                <span className="text-foreground">{item.reason}</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    item.priority === "high"
                      ? "text-status-out"
                      : "text-status-maintenance",
                  )}
                >
                  {item.priority === "high" ? "High" : "Medium"}
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      {/* V1 Telematics Hub - GPS/telematics alerts needing attention. High +
          medium severity, new/acknowledged. Deep-links into Telematics Alerts
          (or the Vehicle/Rental Detail). Not a second task queue. */}
      {telematicsAttention.length > 0 && (
        <SectionCard
          title={`Telematics Alerts · ${telematicsAttention.length}`}
          icon={<Satellite size={15} className="text-primary" />}
          right={
            <Link
              to="/telematics?tab=alerts"
              className="text-xs font-medium text-primary hover:text-primary-press"
            >
              Open all telematics alerts →
            </Link>
          }
        >
          <div className="space-y-2">
            {telematicsAttention.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                to={
                  item.rental_id
                    ? `/rentals/${item.rental_id}`
                    : `/vehicles/${item.vehicle_id}`
                }
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40 hover:bg-surface-2"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <AlertTriangle
                    size={13}
                    className={
                      item.severity === "high"
                        ? "text-status-out"
                        : "text-status-maintenance"
                    }
                  />
                  <span>
                    {item.vehicle_label}{" "}
                    <span className="text-muted-foreground">
                      · {item.plate}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    · {item.type.replace(/_/g, " ")}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    item.severity === "high"
                      ? "text-status-out"
                      : "text-status-maintenance",
                  )}
                >
                  {item.severity === "high" ? "High" : "Medium"}
                </span>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <VerificationAttentionSection />

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
              <IdentityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                resolvers={resolvers}
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
              to="/rental-management?tab=active&filter=payment_due"
            />
            <PayStat
              label="Overdue"
              value={fmtNumber(paySummary.overdue_count)}
              amount={canSeeMoney ? paySummary.overdue_amount : null}
              to="/rental-management?tab=active&filter=late"
              tone="out"
            />
            <PayStat
              label="Broken Arrangements"
              value={fmtNumber(paySummary.arrangement_broken_count)}
              to="/rental-management?tab=active&filter=arrangement"
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
              to="/rental-management?tab=active&filter=deposit"
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
              <IdentityRow
                key={item.id}
                item={item}
                canSeeMoney={canSeeMoney}
                resolvers={resolvers}
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

      {/* All Priorities — compact footer. Action Center IS the priority queue:
          the sections above already show every open operational priority in
          priority order, so there is no separate "queue" to link to. The
          count gives the operator a sense of total open work at a glance. */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
        <ShieldCheck size={15} className="text-primary" />
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {allPrioritiesCount}
          </span>{" "}
          open operational{" "}
          {allPrioritiesCount === 1 ? "priority" : "priorities"} · everything
          above is the live queue.
        </span>
      </div>
    </div>
  );
}
