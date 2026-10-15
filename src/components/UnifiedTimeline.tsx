// Connect Pro Fleet — unified timeline UI (Build #27, spec §28, §51, §72).
//
// Renders UnifiedTimelineEvent[] as a scannable chronological list with
// category icons, date, title, short context, and deep links. Financial
// amounts are rendered only when `canSeeMoney` is true (spec §8). Sensitive
// document numbers are never shown — only masked values from the normalizer.
// Supports category filter chips + pagination for long history (spec §74).

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  type UnifiedTimelineEvent,
  type TimelineCategory,
  TIMELINE_CATEGORY_LABELS,
} from "@/lib/timelineTypes";
import { filterTimeline, paginateTimeline } from "@/lib/timelineComposer";
import { safeDateShort, safeDateTime } from "@/lib/dateSafety";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Car,
  CreditCard,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Wrench,
  StickyNote,
  ListTodo,
  UserCheck,
  Receipt,
  CalendarCheck,
  CircleDot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const CATEGORY_ICON: Record<TimelineCategory, LucideIcon> = {
  rental: Car,
  reservation: CalendarCheck,
  payment: CreditCard,
  billing: Receipt,
  deposit: CreditCard,
  damage: AlertTriangle,
  maintenance: Wrench,
  violation: AlertTriangle,
  compliance: ShieldCheck,
  document: FileText,
  task: ListTodo,
  assignment: UserCheck,
  expense: Receipt,
  note: StickyNote,
  system: CircleDot,
};

const PAGE_SIZE = 25;

export function UnifiedTimeline({
  events,
  categories,
  canSeeMoney = false,
}: {
  events: UnifiedTimelineEvent[];
  categories: TimelineCategory[];
  canSeeMoney?: boolean;
}) {
  const [active, setActive] = useState<TimelineCategory | "all">("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => filterTimeline(events, active === "all" ? undefined : [active]),
    [events, active],
  );
  const { items, hasMore } = paginateTimeline(filtered, page, PAGE_SIZE);

  const chips: Array<TimelineCategory | "all"> = ["all", ...categories];

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-2 p-8 text-center text-sm text-muted-foreground">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => {
              setActive(c);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "all" ? "All" : TIMELINE_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <ol className="relative space-y-3 border-l border-border pl-4">
        {items.map((ev) => {
          const Icon = CATEGORY_ICON[ev.category] ?? CircleDot;
          const date = safeDateShort(ev.occurred_at);
          const time = safeDateTime(ev.occurred_at);
          const showMoney =
            canSeeMoney &&
            ev.financial_amount != null &&
            ev.financial_amount !== 0;
          return (
            <li key={ev.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[1.4rem] flex h-6 w-6 items-center justify-center rounded-full",
                  ev.severity === "critical"
                    ? "bg-destructive text-destructive-foreground"
                    : ev.severity === "warning"
                      ? "bg-status-maintenance text-white"
                      : "bg-surface-2 text-muted-foreground border border-border",
                )}
              >
                <Icon size={12} />
              </span>
              <div className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {ev.title}
                    </p>
                    {ev.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {ev.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[11px] tabular text-muted-foreground">
                      {date ?? "—"}
                    </p>
                    {time && (
                      <p className="font-mono text-[10px] tabular text-muted-foreground">
                        {time.split(",")[1]?.trim()}
                      </p>
                    )}
                  </div>
                </div>
                {showMoney && (
                  <p
                    className={cn(
                      "mt-1 font-mono text-xs tabular",
                      ev.financial_direction === "in"
                        ? "text-status-available"
                        : ev.financial_direction === "out"
                          ? "text-status-out"
                          : "text-muted-foreground",
                    )}
                  >
                    {ev.financial_direction === "in"
                      ? "+"
                      : ev.financial_direction === "out"
                        ? "−"
                        : ""}
                    {fmtMoney(ev.financial_amount!)}
                  </p>
                )}
                {ev.deep_link && (
                  <Link
                    to={ev.deep_link}
                    className="mt-1 inline-block text-[11px] text-primary hover:underline"
                  >
                    View →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
