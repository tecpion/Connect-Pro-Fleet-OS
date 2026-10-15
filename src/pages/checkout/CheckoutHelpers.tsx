// Connect Pro Fleet — checkout shared helpers (Build #5).
// Extracted from CheckoutWorkflow.tsx to keep it under the file size limit.

import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

export function VerifyCard({
  ok,
  icon: Icon,
  title,
  lines,
}: {
  ok: boolean;
  icon: typeof ShieldCheck;
  title: string;
  lines: string[];
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        ok
          ? "border-status-available/40 bg-status-available/5"
          : "border-status-maintenance/40 bg-status-maintenance/5",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          size={18}
          className={ok ? "text-status-available" : "text-status-maintenance"}
        />
        <p className="font-display text-sm font-semibold text-foreground">
          {title}
        </p>
      </div>
      <div className="mt-2 space-y-0.5">
        {lines.map((l, i) => (
          <p
            key={i}
            className="font-mono text-xs tabular text-muted-foreground"
          >
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Row({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm text-foreground",
          mono && "font-mono tabular",
          valueClass,
        )}
      >
        {value}
      </span>
    </div>
  );
}
