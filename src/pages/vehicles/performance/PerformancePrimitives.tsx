// Connect Pro Fleet — Vehicle Performance shared UI primitives.

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricTile({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: "neutral" | "primary" | "positive" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-4",
        tone === "primary" && "ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tabular",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "primary" && "text-primary",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <Info size={13} className="text-muted-foreground/70" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 w-52 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-xs text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function MoneyRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular">
        {amount === 0
          ? "—"
          : `-${amount < 0 ? "+" : ""}${label.includes("Recovery") || label.includes("Recovered") ? "" : ""}${fmtAbs(amount)}`}
      </span>
    </div>
  );
}

function fmtAbs(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
}

export function Row({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-1 text-xs text-muted-foreground/70">
            ({hint})
          </span>
        )}
      </span>
      <span
        className={cn(
          "font-mono tabular",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function TimelineItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            highlight ? "bg-primary" : "bg-muted-foreground/40",
          )}
        />
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular",
          highlight && "font-bold text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}
