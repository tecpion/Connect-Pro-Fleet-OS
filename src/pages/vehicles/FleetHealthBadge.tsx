// Connect Pro Fleet — Fleet Health badge (explainable presentation layer).
//
// Renders the derived Fleet Health level as a colored pill. On hover/focus a
// Popover reveals the human-readable reasons behind the level — no opaque
// score. `compact` renders a smaller pill for dense table rows.

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  FLEET_HEALTH_LABELS,
  type FleetHealth,
  type FleetHealthLevel,
} from "@/lib/fleetHealth";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

const LEVEL_STYLES: Record<
  FleetHealthLevel,
  { pill: string; icon: React.ReactNode }
> = {
  healthy: {
    pill: "bg-status-available/10 text-status-available",
    icon: <CheckCircle2 size={compactIconSize()} />,
  },
  attention: {
    pill: "bg-status-maintenance/15 text-status-maintenance",
    icon: <AlertTriangle size={compactIconSize()} />,
  },
  critical: {
    pill: "bg-status-out/10 text-status-out",
    icon: <ShieldAlert size={compactIconSize()} />,
  },
};

function compactIconSize() {
  return 13;
}

export function FleetHealthBadge({
  health,
  compact = false,
}: {
  health: FleetHealth;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = LEVEL_STYLES[health.level];
  const reasonCount = health.reasons.length;

  const pill = (
    <span
      data-testid={`fleet-health-${health.level}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        compact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        style.pill,
      )}
    >
      {style.icon}
      {FLEET_HEALTH_LABELS[health.level]}
      {reasonCount > 0 && <span className="opacity-70">· {reasonCount}</span>}
    </span>
  );

  if (health.level === "healthy" || reasonCount === 0) {
    return pill;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="fleet-health-trigger"
        >
          {pill}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        align="start"
        data-testid="fleet-health-explanation"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {FLEET_HEALTH_LABELS[health.level]} — {reasonCount}{" "}
          {reasonCount === 1 ? "item" : "items"}
        </p>
        <ul className="space-y-1.5">
          {health.reasons.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  r.blocking ? "bg-status-out" : "bg-status-maintenance",
                )}
              />
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
