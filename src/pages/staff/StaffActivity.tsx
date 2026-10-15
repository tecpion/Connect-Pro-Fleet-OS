// Connect Pro Fleet — Staff Activity feed (Build #24 enhancement).
//
// Team Activity (not full system audit). Each row shows:
//   Actor · Action · Related Record · When · Source · Category
// Derived from the existing store activity log via activityMeta — no second
// audit engine. Unrelated records are NOT mislabeled "maintenance": category
// is derived from the label's actual domain. Banking/financial detail lines
// are hidden from viewers without the relevant permission.
//
// Rows deep-link to the authoritative related record where one can be derived.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useCan } from "@/pages/settings/useCan";
import { Badge } from "@/components/ui/badge";
import { activityMetaFromLabel, type ActivityMeta } from "./activityMeta";
import type { ActivityCategory } from "@/lib/staffActivityMeta";

const CATEGORY_OPTIONS: (ActivityCategory | "All")[] = [
  "All",
  "Customer Service",
  "Collections",
  "Reservations",
  "Maintenance",
  "Damage",
  "Violation",
  "Document",
  "Administrative",
  "Other",
];

const SOURCE_OPTIONS = ["All", "Manual", "System", "Automation"] as const;

const RELATED_HREF: Record<string, string> = {
  rental: "/rentals",
  reservation: "/reservations",
  maintenance: "/maintenance",
  work_order: "/maintenance",
  damage: "/damage-claims",
  claim: "/damage-claims",
  incident: "/incidents",
  violation: "/violations",
  vehicle: "/vehicles",
  task: "/tasks",
  staff: "/staff",
  document: "/finance?tab=expenses&subtab=receipts",
};

function hrefForRelated(
  related: string | null,
  category: ActivityCategory,
): string {
  if (!related) {
    // Fall back to a category-appropriate destination.
    const cat = category.toLowerCase();
    for (const key of Object.keys(RELATED_HREF)) {
      if (cat.includes(key)) return RELATED_HREF[key];
    }
    return "/action-center";
  }
  const lower = related.toLowerCase();
  for (const key of Object.keys(RELATED_HREF)) {
    if (lower.includes(key)) return RELATED_HREF[key];
  }
  return "/action-center";
}

interface EnrichedRow {
  id: string;
  at: string;
  label: string;
  meta: ActivityMeta;
}

export function StaffActivity() {
  const store = useStore();
  const canViewActivity = useCan("staff.view_activity");
  const canSeeBanking = useCan("banking.view");
  const canSeeFinancials = useCan("dashboard.view_financials");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("All");
  const [srcFilter, setSrcFilter] = useState<string>("All");
  const [q, setQ] = useState("");

  const staffNames = useMemo(
    () => store.staff.map((s) => s.full_name),
    [store.staff],
  );

  const rows = useMemo<EnrichedRow[]>(() => {
    return store.activityLog.map((e) => ({
      id: e.id,
      at: e.at,
      label: e.label,
      meta: activityMetaFromLabel(e.label, staffNames),
    }));
  }, [store.activityLog, staffNames]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      const label = r.label.toLowerCase();
      // Permission privacy: hide banking/financial detail from unauthorized viewers.
      const isBanking =
        label.includes("bank") ||
        label.includes("reconcil") ||
        label.includes("transaction");
      const isFinancial =
        label.includes("$") ||
        label.includes("revenue") ||
        label.includes("expense");
      if (isBanking && !canSeeBanking) return false;
      if (isFinancial && !canSeeFinancials) return false;
      if (staffFilter !== "all" && !label.includes(staffFilter.toLowerCase()))
        return false;
      if (catFilter !== "All" && r.meta.category !== catFilter) return false;
      if (srcFilter !== "All" && r.meta.source !== srcFilter) return false;
      if (query && !label.includes(query)) return false;
      return true;
    });
  }, [
    rows,
    staffFilter,
    catFilter,
    srcFilter,
    q,
    canSeeBanking,
    canSeeFinancials,
  ]);

  if (!canViewActivity) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        You don't have permission to view staff activity.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search activity…"
          className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring lg:max-w-xs"
        />
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All staff</option>
          {store.staff.map((s) => (
            <option key={s.id} value={s.full_name}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={srcFilter}
          onChange={(e) => setSrcFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No activity to show.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const href = hrefForRelated(r.meta.related, r.meta.category);
            return (
              <li key={r.id}>
                <Link
                  to={href}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
                >
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{r.meta.action}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.meta.actor}
                      {r.meta.related ? ` · ${r.meta.related}` : ""}
                      {" · "}
                      {new Date(r.at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.meta.category !== "Other" && (
                      <Badge variant="outline" className="text-[10px]">
                        {r.meta.category}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {r.meta.source}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
