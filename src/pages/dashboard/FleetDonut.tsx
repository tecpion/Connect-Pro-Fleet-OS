// Connect Pro Fleet — premium radial donut for the Fleet Snapshot module.
// Visual only: derives slices from the same FleetStatusCounts used elsewhere.

import { cn } from "@/lib/utils";
import type { FleetStatusCounts } from "@/lib/dashboard";

type Slice = {
  key: string;
  value: number;
  color: string; // hsl var
  label: string;
};

export function FleetDonut({ fleet }: { fleet: FleetStatusCounts }) {
  const slices: Slice[] = [
    {
      key: "rented",
      value: fleet.rented,
      color: "var(--status-rented)",
      label: "On rent",
    },
    {
      key: "available",
      value: fleet.available,
      color: "var(--status-available)",
      label: "Available",
    },
    {
      key: "reserved",
      value: fleet.reserved,
      color: "var(--status-maintenance)",
      label: "Reserved",
    },
    {
      key: "maintenance",
      value: fleet.maintenance,
      color: "var(--status-maintenance)",
      label: "Maintenance",
    },
    {
      key: "out",
      value: fleet.out_of_service,
      color: "var(--status-out)",
      label: "Out of service",
    },
  ];
  const total = fleet.total || 1;
  const size = 140;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--surface-2))"
          strokeWidth={stroke}
        />
        {slices.map((s) => {
          if (s.value <= 0) return null;
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc * c}
              strokeLinecap="butt"
              style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
            />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-[28px] font-bold tabular text-foreground">
          {fleet.utilization}%
        </span>
        <span className="text-[12px] font-medium text-muted-foreground">
          utilization
        </span>
      </div>
    </div>
  );
}

export function LegendDot({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2/60">
      <span className="flex items-center gap-2 text-foreground">
        <span
          className={cn("inline-block h-2.5 w-2.5 rounded-full")}
          style={{ background: color }}
        />
        {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular text-foreground">
        {value}
      </span>
    </li>
  );
}
