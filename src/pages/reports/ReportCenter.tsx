// Connect Pro Fleet — Build #18 Report Center.
//
// Landing page for the management reporting suite. Renders report cards from
// the centralized REPORT_CATALOG, grouped by category, hiding any report the
// current user cannot access. Links to dedicated report pages (or the existing
// Profitability module where reused).

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import {
  REPORT_CATALOG,
  REPORT_CATEGORY_LABELS,
  REPORT_CATEGORY_ORDER,
  visibleReports,
  type ReportCategory,
} from "@/lib/reportCatalog";
import { PageHeader } from "@/components/ui-bits";
import { TrendingUp } from "lucide-react";

export default function ReportCenter() {
  const store = useStore();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canAccess = (perm: string) => can(roleObj, overrides, perm);
  const reports = visibleReports(canAccess);

  const grouped = REPORT_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: reports.filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Management reporting across revenue, fleet, accounting, and operations."
      />

      {grouped.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          You don't have access to any reports.
        </div>
      )}

      {grouped.map((g) => (
        <section key={g.category}>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {REPORT_CATEGORY_LABELS[g.category as ReportCategory]}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((r) => (
              <Link
                key={r.id}
                to={r.route}
                className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    {r.title}
                  </h3>
                  <TrendingUp
                    size={16}
                    className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {r.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
