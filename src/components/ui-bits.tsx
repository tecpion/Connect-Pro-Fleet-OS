import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Loading state — consistent skeleton/spinner for short operations.
// ---------------------------------------------------------------------------

export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-10 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <svg
        className="h-4 w-4 animate-spin text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.25"
        />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
  tone,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
  tone?: "teal" | "blue" | "neutral";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/40 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="empty-disc mb-3" data-tone={tone ?? "neutral"}>
          {icon}
        </div>
      )}
      <p className="font-display text-base font-semibold text-foreground">
        {title}
      </p>
      {hint && (
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{hint}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight text-foreground sm:text-[32px]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[15px] font-normal text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </div>
  );
}

export function SectionCard({
  title,
  children,
  className,
  right,
  icon,
  count,
  countTone,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
  icon?: ReactNode;
  /** Optional count badge shown beside the title. */
  count?: number;
  /** Tone for the count pill (defaults to neutral). */
  countTone?: "neutral" | "out" | "maintenance" | "available";
}) {
  return (
    <section className={cn("card-surface card-surface-hover", className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-border/80 px-6 py-4">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="font-display text-[17px] font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {count !== undefined && (
              <span className="count-pill" data-tone={countTone ?? "neutral"}>
                {count}
              </span>
            )}
          </div>
          {right}
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

export function DataLabel({ children }: { children: ReactNode }) {
  return (
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </dt>
  );
}

export function DataValue({
  children,
  mono,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <dd
      className={cn(
        "mt-0.5 text-sm text-foreground",
        mono && "font-mono tabular",
        className,
      )}
    >
      {children}
    </dd>
  );
}
