// Connect Pro Fleet — Case Center page (Build #54).
// Polished operational workspace: metrics, filters, case list, detail view.
// Permission-aware. Coordinates authoritative records — never duplicates them.
//
// Founder UX polish (Build #55): reduced list density with clear row hierarchy
// (issue title primary, customer·vehicle·rental secondary, case # tertiary),
// operational vs financial metric separation, and laptop-width responsiveness.

import { useMemo, useState } from "react";
import { useParams, Link } from "@/lib/router-compat";
import { useCaseCenterSources } from "@/lib/useCaseCenterSources";
import { deriveCaseCenterMetrics } from "@/lib/caseCenterSelectors";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CASE_CATEGORY_LABELS, type CaseCategory } from "@/lib/caseCenterTypes";
import {
  CaseStatusPill,
  CaseCategoryPill,
  CaseResponsibilityPill,
  CasePriorityPill,
} from "./caseCenter/shared";
import { CaseDetail } from "./caseCenter/CaseDetail";

const CATEGORY_FILTERS: Array<"all" | CaseCategory> = [
  "all",
  "tolls_tickets",
  "damage_claims",
  "customer_violations",
  "deposits_refunds",
  "disputes",
  "roadside_recovery",
];

const FILTER_LABELS: Record<string, string> = {
  all: "All Cases",
  ...CASE_CATEGORY_LABELS,
};

export default function CaseCenter() {
  const { id } = useParams();
  const src = useCaseCenterSources();
  const store = useStore();
  const [category, setCategory] = useState<"all" | CaseCategory>("all");
  const [search, setSearch] = useState("");

  const role = store.roles.find(
    (r) =>
      r.name === store.staff.find((s) => s.id === store.currentStaffId)?.role,
  );
  const overrides = store.staff.find((s) => s.id === store.currentStaffId)
    ?.permission_overrides as Record<string, unknown> | null;
  const canView = can(role, overrides, "case.view");

  const metrics = useMemo(() => deriveCaseCenterMetrics(src), [src]);

  const customerName = (cid: string | null) =>
    cid ? store.customerName(cid) : "—";
  const vehicleLabel = (vid: string | null) => {
    if (!vid) return "—";
    const v = store.vehicles.find((x) => x.id === vid);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown";
  };
  const rentalNumber = (rid: string | null) => {
    if (!rid) return "—";
    const r = store.rentals.find((x) => x.id === rid);
    return r?.agreement_number ?? rid;
  };
  const staffName = (sid: string | null) => {
    if (!sid) return "—";
    const s = store.staff.find((x) => x.id === sid);
    return s?.full_name ?? sid;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return src.cases
      .filter((c) => (category === "all" ? true : c.category === category))
      .filter((c) => {
        if (!q) return true;
        return (
          c.case_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          customerName(c.customer_id).toLowerCase().includes(q) ||
          vehicleLabel(c.vehicle_id).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src.cases, category, search, store.customers, store.vehicles]);

  if (!canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You don't have permission to view Case Center.
      </div>
    );
  }

  if (id) {
    return <CaseDetail caseId={id} />;
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Case Center"
        subtitle="Manage rental-related issues from review through resolution. Coordinates authoritative records — staff does the work once."
      />

      {/* Operational metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Open Cases" value={String(metrics.open_cases)} />
        <MetricCard label="Needs Review" value={String(metrics.needs_review)} />
        <MetricCard
          label="Awaiting Customer"
          value={String(metrics.awaiting_customer)}
        />
        <MetricCard label="Disputed" value={String(metrics.disputed)} />
        <MetricCard
          label="Recovery Pending"
          value={String(metrics.recovery_pending)}
        />
        <MetricCard label="Due Soon" value={String(metrics.due_soon)} />
      </div>

      {/* Financial metrics — visually separated */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard
          label="Total at Issue"
          value={fmtMoney(metrics.total_amount_at_issue)}
          tone="financial"
          hint="Derived from authoritative ledger links"
        />
        <MetricCard
          label="Unrecovered"
          value={fmtMoney(metrics.unrecovered_amount)}
          tone="financial"
          hint="Amount at issue minus linked recovery"
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setCategory(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              category === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cases, customers, vehicles..."
          className="ml-auto h-9 w-full max-w-64"
        />
      </div>

      {/* Case list — reduced density, clear hierarchy */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No cases match"
          hint="Try a different filter or search."
        />
      ) : (
        <div className="card-surface overflow-hidden">
          <ul className="divide-y divide-border/40">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/case-center/${c.id}`}
                  className="block px-4 py-3.5 transition-colors hover:bg-muted/30"
                >
                  {/* Primary: issue title + amount + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {c.title}
                      </p>
                      {/* Secondary: customer · vehicle · rental */}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {customerName(c.customer_id)} ·{" "}
                        {vehicleLabel(c.vehicle_id)} ·{" "}
                        {rentalNumber(c.rental_id)}
                      </p>
                      {/* Tertiary: case # + type + assigned + due + last activity */}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                        {c.case_number} ·{" "}
                        <CaseCategoryPill category={c.category} /> · Assigned{" "}
                        {staffName(c.assigned_staff_id)}
                        {c.due_date ? ` · Due ${fmtDate(c.due_date)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-sm font-semibold text-foreground">
                        {fmtMoney(c.amount_at_issue)}
                      </span>
                      <CaseStatusPill status={c.status} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "financial";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "card-surface px-4 py-3",
        tone === "financial" && "border-l-2 border-l-primary/60",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>
      )}
    </div>
  );
}
