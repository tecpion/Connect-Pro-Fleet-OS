// Connect Pro Fleet — Vehicle Digital Twin Overview + Timeline (Build #27).
//
// Composes the vehicleTwinSelectors into a compact overview: operational
// snapshot, blocking badges, profitability (permission-gated), needs
// attention, and the unified timeline. Profitability reuses the existing
// selector — no new formula (spec §34). Multiple blockers coexist (spec §32).

import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { AskCopilotButton } from "@/components/copilot/AskCopilotButton";
import {
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { UnifiedTimeline } from "@/components/UnifiedTimeline";
import { VehicleBadge } from "@/components/EntityBadges";
import { useEntitySources } from "@/lib/useEntitySources";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import {
  getVehicleDigitalTwinSummary,
  getVehicleAttentionItems,
} from "@/lib/vehicleTwinSelectors";
import { getVehicleProfitability } from "@/lib/profitabilitySelectors";
import { getVehicleTimeline } from "@/lib/timelineComposer";
import { VEHICLE_TIMELINE_CATEGORIES } from "@/lib/timelineTypes";
import {
  COMPLIANCE_STATUS_LABELS,
  COMPLIANCE_STATUS_TONE,
} from "@/lib/complianceTypes";
import { fmtMoney, fmtNumber, fmtDateShort } from "@/lib/format";
import { vehicleStatusMeta } from "@/lib/format";
import { isWorkOrderActive } from "@/lib/maintenanceSelectors";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function VehicleTwinOverview({ vehicleId }: { vehicleId: string }) {
  const { vehicleTwinSources, timelineSources, canSeeProfit } =
    useEntitySources();
  const range =
    vehicleTwinSources.range ?? resolveProfitabilityRange("this_year");
  const summary = useMemo(
    () => getVehicleDigitalTwinSummary(vehicleId, vehicleTwinSources, range),
    [vehicleId, vehicleTwinSources, range],
  );
  const attention = useMemo(
    () => getVehicleAttentionItems(vehicleId, vehicleTwinSources, range),
    [vehicleId, vehicleTwinSources, range],
  );
  const timeline = useMemo(
    () => getVehicleTimeline(vehicleId, timelineSources),
    [vehicleId, timelineSources],
  );

  // Profitability is computed separately via the existing selector (spec §34:
  // do not duplicate Build #16 calculations). Permission-gated by the caller.
  const profitability = useMemo(
    () =>
      canSeeProfit && vehicleTwinSources.inputs
        ? getVehicleProfitability(vehicleId, vehicleTwinSources.inputs, range)
        : null,
    [canSeeProfit, vehicleId, vehicleTwinSources.inputs, range],
  );

  const store = vehicleTwinSources.store;
  const vehicle = store.vehicles.find((v) => v.id === vehicleId);
  const currentRental = summary.currentRentalId
    ? store.rentals.find((r) => r.id === summary.currentRentalId)
    : null;
  const currentCustomer = summary.currentCustomerId
    ? store.customers.find((c) => c.id === summary.currentCustomerId)
    : null;
  const activeWOs = store.workOrders.filter(
    (w) =>
      w.vehicle_id === vehicleId &&
      isWorkOrderActive(w) &&
      w.blocks_vehicle_use,
  );
  const openDamage =
    vehicleTwinSources.damageClaims?.filter(
      (d) =>
        d.vehicle_id === vehicleId &&
        d.blocks_vehicle_use &&
        !["resolved", "closed", "cancelled"].includes(d.claim_status),
    ) ?? [];

  const util = summary.utilization;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AskCopilotButton
          vehicleId={vehicleId}
          label={
            vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : vehicleId
          }
        />
      </div>
      {/* Blocking badges (spec §32) */}
      <div className="flex flex-wrap gap-2">
        <VehicleBadge
          kind={
            vehicle?.status === "rented"
              ? "rented"
              : vehicle?.status === "available"
                ? "available"
                : vehicle?.status === "maintenance"
                  ? "maintenance"
                  : "available"
          }
        />
        {activeWOs.length > 0 && <VehicleBadge kind="maintenance" />}
        {openDamage.length > 0 && <VehicleBadge kind="damage_block" />}
        {summary.complianceStatus === "blocked" && (
          <VehicleBadge kind="compliance_block" />
        )}
      </div>

      {/* Operational snapshot (spec §33) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          label="Status"
          value={vehicleStatusMeta[vehicle?.status ?? "available"].label}
        />
        <SummaryCard
          label="Current Renter"
          value={
            currentCustomer
              ? `${currentCustomer.first_name} ${currentCustomer.last_name}`
              : "—"
          }
        />
        <SummaryCard
          label="Utilization"
          value={`${util.utilizationPct}%`}
          mono
        />
        <SummaryCard label="Rented Days" value={String(util.rentedDays)} mono />
        <SummaryCard
          label="Idle Days"
          value={String(util.idleDays)}
          mono
          tone={util.idleDays >= 14 ? "maintenance" : "neutral"}
        />
        <SummaryCard
          label="Blocked Days"
          value={String(util.blockedDays)}
          mono
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Current rental */}
          <SectionCard title="Current Rental">
            {currentRental ? (
              <div className="space-y-2">
                <Link
                  to={`/rentals/${currentRental.id}`}
                  className="font-mono text-sm font-medium text-primary hover:underline"
                >
                  {currentRental.agreement_number}
                </Link>
                {currentCustomer && (
                  <p className="text-sm text-muted-foreground">
                    Renter: {currentCustomer.first_name}{" "}
                    {currentCustomer.last_name}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not currently rented.
              </p>
            )}
          </SectionCard>

          {/* Needs attention (spec §69) */}
          <SectionCard title="Needs Attention">
            {attention.length === 0 ? (
              <EmptyState
                title="Nothing needs attention"
                hint="No blocking maintenance, damage, compliance, or idle issues."
                icon={<CheckCircle2 size={22} />}
              />
            ) : (
              <ul className="space-y-2">
                {attention.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <AlertTriangle
                      size={14}
                      className={
                        a.severity === "critical"
                          ? "text-status-out"
                          : "text-status-maintenance"
                      }
                    />
                    <span className="text-foreground">{a.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          {/* Profitability (spec §34) */}
          {canSeeProfit && profitability && (
            <SectionCard title="Profitability (YTD)">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="font-mono tabular">
                    {fmtMoney(profitability.revenue.total_revenue)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Operating cost</dt>
                  <dd className="font-mono tabular">
                    {fmtMoney(profitability.expenses.total_direct_expenses)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="font-medium text-foreground">
                    Operating profit
                  </dt>
                  <dd
                    className={cn(
                      "font-mono tabular font-semibold",
                      profitability.gross_profit >= 0
                        ? "text-status-available"
                        : "text-status-out",
                    )}
                  >
                    {fmtMoney(profitability.gross_profit)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Maintenance</dt>
                  <dd className="font-mono tabular">
                    {fmtMoney(profitability.expenses.maintenance_expenses)}
                  </dd>
                </div>
              </dl>
            </SectionCard>
          )}

          {/* Compliance + ownership (spec §46, §49) */}
          <SectionCard title="Compliance & Ownership">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <DataLabel>Compliance</DataLabel>
                <StatusPill
                  tone={
                    COMPLIANCE_STATUS_TONE[summary.complianceStatus] ??
                    "neutral"
                  }
                >
                  {COMPLIANCE_STATUS_LABELS[summary.complianceStatus]}
                </StatusPill>
              </div>
              <div className="flex justify-between">
                <DataLabel>Ownership</DataLabel>
                <DataValue className="capitalize">
                  {summary.ownershipType
                    ? summary.ownershipType.replace("_", " ")
                    : "—"}
                </DataValue>
              </div>
              <div className="flex justify-between">
                <DataLabel>Mileage</DataLabel>
                <DataValue mono>
                  {vehicle ? `${fmtNumber(vehicle.current_mileage)} mi` : "—"}
                </DataValue>
              </div>
              <div className="flex justify-between">
                <DataLabel>Last Activity</DataLabel>
                <DataValue mono>
                  {summary.lastActivityAt
                    ? fmtDateShort(summary.lastActivityAt)
                    : "—"}
                </DataValue>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>

      {/* Timeline (spec §51) */}
      <SectionCard title="Timeline">
        <UnifiedTimeline
          events={timeline}
          categories={VEHICLE_TIMELINE_CATEGORIES}
          canSeeMoney={canSeeProfit}
        />
      </SectionCard>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "maintenance";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          mono && "font-mono tabular",
          tone === "maintenance"
            ? "text-status-maintenance"
            : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
