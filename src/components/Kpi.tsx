import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { statusToneClasses } from "@/lib/format";

type Tone = "available" | "maintenance" | "out" | "rented" | "neutral";

export function Kpi({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const t = tone ? statusToneClasses[tone] : null;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tabular text-foreground",
        )}
      >
        {value}
        {t && (
          <span
            className={cn(
              "ml-2 inline-block h-2 w-2 rounded-full align-middle",
              t.dot,
            )}
          />
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
