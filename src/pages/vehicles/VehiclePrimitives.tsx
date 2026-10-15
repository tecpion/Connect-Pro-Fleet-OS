// Connect Pro Fleet — Vehicle Inventory small UI primitives.
//
// KpiTile: summary KPI card with colored icon tile, large count, label.
// FilterChip: removable active-filter pill. Both use semantic design tokens.

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type KpiTone =
  "available" | "rented" | "maintenance" | "out" | "neutral";

const TILE_TONE: Record<KpiTone, string> = {
  available: "bg-status-available/10 text-status-available",
  rented: "bg-kpi-teal/10 text-kpi-teal",
  maintenance: "bg-status-maintenance/15 text-status-maintenance",
  out: "bg-status-out/10 text-status-out",
  neutral: "bg-kpi-blue/10 text-kpi-blue",
};

export function KpiTile({
  label,
  value,
  tone,
  icon,
  onClick,
  active,
}: {
  label: string;
  value: string | number;
  tone: KpiTone;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={`kpi-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
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
          TILE_TONE[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block font-mono text-2xl font-bold tabular text-foreground">
          {value}
        </span>
      </span>
    </Comp>
  );
}

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span
      data-testid="active-filter-chip"
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="rounded-full hover:bg-primary/20"
      >
        <X size={12} />
      </button>
    </span>
  );
}
