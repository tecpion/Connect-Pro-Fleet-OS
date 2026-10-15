// Connect Pro Fleet — Maintenance page helper components.
//
// Extracted from Maintenance.tsx to keep the page under the line limit:
// MaintKpi (premium KPI tile), MobileCard (mobile work-order card), TabButton,
// and queueLabel. Pure presentation — no domain logic.

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { StatusPill } from "@/components/Status";
import { fmtMoneyExact, fmtDateTime } from "@/lib/format";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONE,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_PRIORITY_TONE,
  MAINTENANCE_TYPE_LABELS,
} from "@/lib/maintenanceTypes";
import {
  isWorkOrderPastExpectedReady,
  getDowntimeDuration,
  formatDowntime,
  getWorkOrderCost,
} from "@/lib/maintenanceSelectors";
import { deriveMaintenanceAttention } from "@/lib/maintenanceAttention";
import { cn } from "@/lib/utils";
import { MaintenanceAttentionBadge } from "./MaintenanceAttentionBadge";
import type { MaintenanceWorkOrder } from "@/lib/maintenanceTypes";

export type QueueTab =
  "open" | "due" | "in_progress" | "waiting" | "completed" | "all";

export function queueLabel(q: QueueTab): string {
  const labels: Record<QueueTab, string> = {
    open: "Open",
    due: "Due / Overdue",
    in_progress: "In Progress",
    waiting: "Waiting",
    completed: "Completed",
    all: "All",
  };
  return labels[q];
}

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const TILE: Record<string, string> = {
  available: "bg-status-available/10 text-status-available",
  rented: "bg-kpi-teal/10 text-kpi-teal",
  maintenance: "bg-status-maintenance/15 text-status-maintenance",
  out: "bg-status-out/10 text-status-out",
  neutral: "bg-kpi-blue/10 text-kpi-blue",
};

export function MaintKpi({
  icon,
  label,
  value,
  tone,
  mono,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "available" | "rented" | "maintenance" | "out" | "neutral";
  mono?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={`maint-kpi-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] transition-all",
        onClick &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_hsl(214_30%_15%_/_0.08)]",
        active && "ring-2 ring-primary/50",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          TILE[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-2xl font-bold tabular text-foreground",
            mono && "font-mono",
          )}
        >
          {value}
        </span>
      </span>
    </Comp>
  );
}

export function MobileCard({
  wo,
  onClick,
  canViewCost,
  attention,
  now,
}: {
  wo: MaintenanceWorkOrder;
  onClick: () => void;
  canViewCost: boolean;
  attention: ReturnType<typeof deriveMaintenanceAttention>;
  now: Date;
}) {
  const { vehicles, maintenanceVendors } = useStore();
  const v = vehicles.find((x) => x.id === wo.vehicle_id);
  const vendor = wo.vendor_id
    ? maintenanceVendors.find((x) => x.id === wo.vendor_id)
    : null;
  const cost = getWorkOrderCost(wo);
  const down = wo.downtime_started_at && !wo.downtime_ended_at;
  const pastReady = isWorkOrderPastExpectedReady(wo, now);
  const costLabel =
    cost != null
      ? fmtMoneyExact(cost)
      : wo.estimated_cost != null
        ? `${fmtMoneyExact(wo.estimated_cost)} est.`
        : "—";
  return (
    <button
      onClick={onClick}
      data-testid={`wo-card-${wo.id}`}
      className="w-full rounded-xl border border-border bg-surface p-4 text-left shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] transition-all hover:shadow-[0_8px_24px_hsl(214_30%_15%_/_0.08)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-semibold text-foreground">
          {wo.work_order_number}
        </p>
        <StatusPill tone={WORK_ORDER_STATUS_TONE[wo.status]}>
          {WORK_ORDER_STATUS_LABELS[wo.status]}
        </StatusPill>
      </div>
      <p className="mt-1 text-sm font-medium text-foreground">{wo.title}</p>
      <p className="text-xs text-muted-foreground">
        {v ? `${v.year} ${v.make} ${v.model}` : "—"} ·{" "}
        {MAINTENANCE_TYPE_LABELS[wo.maintenance_type]}
      </p>
      {vendor && (
        <p className="mt-0.5 text-xs text-muted-foreground">{vendor.name}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <StatusPill tone={WORK_ORDER_PRIORITY_TONE[wo.priority]}>
          {WORK_ORDER_PRIORITY_LABELS[wo.priority]}
        </StatusPill>
        {wo.expected_ready_at && (
          <span
            className={cn(
              "text-xs",
              pastReady
                ? "font-medium text-status-out"
                : "text-muted-foreground",
            )}
          >
            {fmtDateTime(wo.expected_ready_at)}
            {pastReady && " · Past ready"}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <MaintenanceAttentionBadge attention={attention} compact />
        <div className="flex items-center gap-2">
          {down && (
            <span className="font-mono text-xs tabular text-status-maintenance">
              {formatDowntime(getDowntimeDuration(wo, now))} down
            </span>
          )}
          {canViewCost && (
            <span className="font-mono text-xs tabular text-foreground">
              {costLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Renders the enriched desktop table body rows. Extracted to keep the page lean. */
export function WorkOrderTableBody({
  filtered,
  vehicles,
  maintenanceVendors,
  attentionByWo,
  canViewCost,
  now,
  onSelect,
}: {
  filtered: MaintenanceWorkOrder[];
  vehicles: {
    id: string;
    year: number;
    make: string;
    model: string;
    license_plate: string;
  }[];
  maintenanceVendors: { id: string; name: string }[];
  attentionByWo: Map<string, ReturnType<typeof deriveMaintenanceAttention>>;
  canViewCost: boolean;
  now: Date;
  onSelect: (id: string) => void;
}) {
  const { setDetailId } = { setDetailId: onSelect };
  return (
    <tbody className="divide-y divide-border">
      {filtered.map((w) => {
        const v = vehicles.find((x) => x.id === w.vehicle_id);
        const vendor = w.vendor_id
          ? maintenanceVendors.find((x) => x.id === w.vendor_id)
          : null;
        const cost = getWorkOrderCost(w);
        const down = w.downtime_started_at && !w.downtime_ended_at;
        const pastReady = isWorkOrderPastExpectedReady(w, now);
        const attention = attentionByWo.get(w.id) ?? {
          level: "healthy" as const,
          reasons: [],
        };
        const costLabel =
          cost != null
            ? fmtMoneyExact(cost)
            : w.estimated_cost != null
              ? `${fmtMoneyExact(w.estimated_cost)} est.`
              : "—";
        return (
          <tr
            key={w.id}
            onClick={() => setDetailId(w.id)}
            data-testid={`wo-row-${w.id}`}
            className="group cursor-pointer transition-colors hover:bg-surface-2/60"
          >
            <td className="px-4 py-3">
              <span className="font-mono font-semibold tabular text-foreground">
                {w.work_order_number}
              </span>
              <p className="text-xs text-muted-foreground">
                {MAINTENANCE_TYPE_LABELS[w.maintenance_type]}
              </p>
            </td>
            <td className="px-4 py-3">
              {v ? (
                <Link
                  to={`/vehicles/${v.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-foreground group-hover:text-primary"
                >
                  {v.year} {v.make} {v.model}
                </Link>
              ) : (
                "—"
              )}
              <p className="font-mono text-xs tabular text-muted-foreground">
                {v?.license_plate}
              </p>
            </td>
            <td className="px-4 py-3 text-foreground">{w.title}</td>
            <td className="px-4 py-3">
              <StatusPill tone={WORK_ORDER_PRIORITY_TONE[w.priority]}>
                {WORK_ORDER_PRIORITY_LABELS[w.priority]}
              </StatusPill>
            </td>
            <td className="px-4 py-3">
              <StatusPill tone={WORK_ORDER_STATUS_TONE[w.status]}>
                {WORK_ORDER_STATUS_LABELS[w.status]}
              </StatusPill>
            </td>
            <td className="px-4 py-3 text-xs text-foreground">
              {vendor?.name ?? <span className="text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-3">
              {w.expected_ready_at ? (
                <span
                  className={cn(
                    "text-xs",
                    pastReady
                      ? "font-medium text-status-out"
                      : "text-foreground",
                  )}
                >
                  {fmtDateTime(w.expected_ready_at)}
                  {pastReady && (
                    <span className="ml-1 text-status-out">· Past ready</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="px-4 py-3 font-mono text-xs tabular text-muted-foreground">
              {down ? formatDowntime(getDowntimeDuration(w, now)) : "—"}
            </td>
            {canViewCost && (
              <td className="px-4 py-3 text-right font-mono text-xs tabular text-foreground">
                {costLabel}
              </td>
            )}
            <td className="px-4 py-3">
              <MaintenanceAttentionBadge attention={attention} compact />
            </td>
            <td
              className="px-4 py-3 text-right"
              onClick={(e) => e.stopPropagation()}
            >
              <WoActionsCell wo={w} onView={onSelect} />
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

// Lazy import to avoid a circular type reference at module load.
import { WorkOrderQuickActions } from "./WorkOrderQuickActions";
function WoActionsCell({
  wo,
  onView,
}: {
  wo: MaintenanceWorkOrder;
  onView: (id: string) => void;
}) {
  return <WorkOrderQuickActions wo={wo} onView={onView} />;
}
