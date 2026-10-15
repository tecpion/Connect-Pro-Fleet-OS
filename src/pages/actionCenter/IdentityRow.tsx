// Connect Pro Fleet — enriched briefing row with record identity (spec §9–13,
// §16, §19, §21–23). Wraps the existing PriorityRow display but prepends a
// contextual identity line (customer + vehicle) and a due-state chip, derived
// ONLY from data already on the BriefingItem + the authoritative store. No new
// source of truth is introduced.

import { Link } from "@/lib/router-compat";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BriefingItem } from "@/lib/briefingTypes";
import {
  PRIORITY_TONE,
  PRIORITY_DOT,
} from "@/pages/briefing/BriefingPrimitives";
import { ArrowRight } from "lucide-react";

export interface IdentityResolvers {
  customerName: (id: string) => string;
  vehicleLabel: (id: string) => string;
}

const DAY = 86_400_000;

/** Resolve a compact due-state label from the item's due_at / age_days. */
function dueStateLabel(item: BriefingItem): string | null {
  if (item.age_days != null && item.age_days > 0) {
    return `Overdue by ${item.age_days} ${item.age_days === 1 ? "day" : "days"}`;
  }
  if (item.due_at) {
    const dueTs = new Date(item.due_at + "T00:00:00").getTime();
    if (isNaN(dueTs)) return null;
    const todayTs = new Date(
      new Date().toISOString().slice(0, 10) + "T00:00:00",
    ).getTime();
    const diff = Math.round((dueTs - todayTs) / DAY);
    if (diff === 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    if (diff < 0)
      return `Overdue by ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "day" : "days"}`;
  }
  return null;
}

/** Build the identity subtitle: customer · vehicle (whichever exists). */
function identityLine(
  item: BriefingItem,
  res: IdentityResolvers,
): string | null {
  const parts: string[] = [];
  if (item.customer_id) {
    const n = res.customerName(item.customer_id);
    if (n && n !== "—") parts.push(n);
  }
  if (item.vehicle_id) {
    const v = res.vehicleLabel(item.vehicle_id);
    if (v && v !== "—") parts.push(v);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Enriched row: shows the briefing title, a contextual identity line (customer +
 * vehicle), the factual reason, an optional due-state chip, the permission-gated
 * amount, and the primary action. Compact mode hides the reason to keep My Work
 * rows tight. Falls back gracefully when no identity is available.
 */
export function IdentityRow({
  item,
  canSeeMoney,
  resolvers,
  compact,
}: {
  item: BriefingItem;
  canSeeMoney: boolean;
  resolvers: IdentityResolvers;
  compact?: boolean;
}) {
  const amount =
    item.amount != null && canSeeMoney ? fmtMoney(item.amount) : null;
  const identity = identityLine(item, resolvers);
  const dueState = dueStateLabel(item);
  return (
    <Link
      to={item.deep_link ?? "#"}
      className={cn(
        "block rounded-md border border-border border-l-4 p-3 transition-colors hover:bg-surface-2",
        PRIORITY_TONE[item.priority],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                PRIORITY_DOT[item.priority],
              )}
            />
            <p className="truncate text-sm font-medium text-foreground">
              {item.title}
            </p>
          </div>
          {identity && (
            <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">
              {identity}
            </p>
          )}
          {/* The factual reason is ALWAYS shown (even in compact mode) so
              repeated rows like "Vehicle blocked" are disambiguated by their
              real blocker (e.g. "Registration expired Sep 10"). When no reason
              exists on the authoritative item, a neutral fallback is shown
              rather than inventing one. Compact mode keeps the line tight. */}
          <p
            className={cn(
              "mt-0.5 text-xs text-muted-foreground",
              compact ? "line-clamp-1" : "line-clamp-2",
              !item.reason && "italic",
            )}
          >
            {item.reason || "Blocker details unavailable"}
          </p>
          {dueState && (
            <p
              className={cn(
                "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                dueState.startsWith("Overdue")
                  ? "bg-status-out/10 text-status-out"
                  : "bg-status-maintenance/10 text-status-maintenance",
              )}
            >
              {dueState}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {amount && (
            <span className="font-mono text-sm font-semibold tabular text-foreground">
              {amount}
            </span>
          )}
          {item.action_label && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-primary">
              {item.action_label}
              <ArrowRight size={12} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Resolve a human-readable vehicle label from the store. */
export function makeVehicleLabel(
  vehicles: {
    id: string;
    year?: number | string;
    make?: string;
    model?: string;
    license_plate?: string;
  }[],
): (id: string) => string {
  return (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    if (!v) return "—";
    const yr = v.year ? `${v.year} ` : "";
    return (
      `${yr}${v.make ?? ""} ${v.model ?? ""}`.trim() || v.license_plate || "—"
    );
  };
}
