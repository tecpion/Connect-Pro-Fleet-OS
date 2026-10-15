// Connect Pro Fleet — linkable financial metric tile for the Dashboard
// Collections & Financial Snapshot section (spec §6). Each metric deep-links to
// its authoritative destination. Uses semantic design tokens only.

import { Link } from "@/lib/router-compat";
import { fmtMoney, statusToneClasses } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "available" | "maintenance" | "out" | "rented" | "neutral";

export function FinancialMetric({
  label,
  amount,
  tone,
  to,
}: {
  label: string;
  amount: number;
  tone: Tone;
  to?: string;
}) {
  const t = statusToneClasses[tone];
  const value = fmtMoney(amount);
  const inner = (
    <>
      <span className={cn("absolute inset-x-0 top-0 h-1", t.dot)} aria-hidden />
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("h-2 w-2 rounded-full", t.dot)} />
      </div>
      <p className="mt-2.5 font-mono text-[26px] font-bold tracking-tight tabular text-foreground">
        {value}
      </p>
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="group relative block overflow-hidden rounded-2xl border border-border/80 bg-surface p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-surface p-4 shadow-xs transition-all hover:border-border hover:shadow-sm">
      {inner}
    </div>
  );
}
