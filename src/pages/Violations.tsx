// Connect Pro Fleet — Tolls & Violations Center (Build #25).
// List + tabs + filters + search + KPIs + detail dialog + create dialog.
// Permission-aware. Mobile-first cards; desktop table.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useViolations } from "@/lib/violationStoreProvider";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtDate } from "@/lib/format";
import { PageHeader, EmptyState, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/Status";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus, Upload } from "lucide-react";
import {
  VIOLATION_STATUS_LABELS,
  VIOLATION_STATUS_TONE,
  VIOLATION_TYPE_LABELS,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_TONE,
} from "@/lib/violationTypes";
import {
  getOpenViolations,
  getOverdueViolations,
  getViolationsDueSoon,
  getNeedsReview,
  statusForTab,
} from "@/lib/violationSelectors";
import {
  TABS,
  TAB_LABELS,
  type ViolationTab,
  toneClass,
  statusLabel,
  typeLabel,
  responsibilityLabel,
} from "./violations/shared";
import { CreateViolationDialog } from "./violations/CreateViolationDialog";
import { ViolationDetail } from "./violations/ViolationDetail";
import { ImportViolationsDialog } from "./violations/ImportViolationsDialog";

export default function Violations() {
  const store = useStore();
  const vio = useViolations();
  const [tab, setTab] = useState<ViolationTab>("open");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [respFilter, setRespFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const role = store.roles.find(
    (r) =>
      r.name === store.staff.find((s) => s.id === store.currentStaffId)?.role,
  );
  const overrides = store.staff.find((s) => s.id === store.currentStaffId)
    ?.permission_overrides as Record<string, unknown> | null;
  const canView = can(role, overrides, "violations.view");
  const canCreate = can(role, overrides, "violations.create");
  const canImport = can(role, overrides, "violations.import");
  const canViewFinancials = can(role, overrides, "violations.view_financials");

  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "—";
  };
  const staffName = (id: string | null) =>
    id ? (store.staff.find((s) => s.id === id)?.full_name ?? "—") : "—";

  const now = new Date("2026-09-02T12:00:00Z");
  const open = getOpenViolations(vio.violations);
  const overdue = getOverdueViolations(vio.violations, now);
  const dueSoon = getViolationsDueSoon(vio.violations, now);
  const needsReview = getNeedsReview(vio.violations, {}, now, false);

  const filtered = useMemo(() => {
    const statuses = statusForTab(tab);
    const q = search.trim().toLowerCase();
    return vio.violations.filter((v) => {
      if (statuses && !statuses.includes(v.status)) return false;
      if (typeFilter && v.violation_type !== typeFilter) return false;
      if (respFilter && v.responsibility !== respFilter) return false;
      if (staffFilter && v.assigned_staff_id !== staffFilter) return false;
      if (q) {
        const hay = [
          v.violation_number,
          v.citation_number,
          v.plate_number_snapshot,
          vehicleLabel(v.vehicle_id),
          v.customer_id ? store.customerName(v.customer_id) : "",
          v.issuing_authority,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [vio.violations, tab, typeFilter, respFilter, staffFilter, search]);

  if (!canView) {
    return (
      <div className="py-10 text-sm text-muted-foreground">
        You don't have permission to view violations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tolls & Violations"
        subtitle="Track tolls, tickets, citations, and customer responsibility."
        actions={
          <div className="flex items-center gap-2">
            {canImport && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload size={16} /> Import CSV
              </Button>
            )}
            {canCreate && (
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={16} /> Add violation
              </Button>
            )}
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Open" value={String(open.length)} tone="maintenance" />
        <KpiCard
          label="Needs review"
          value={String(needsReview.length)}
          tone="out"
        />
        <KpiCard
          label="Due soon"
          value={String(dueSoon.length)}
          tone="maintenance"
        />
        <KpiCard label="Overdue" value={String(overdue.length)} tone="out" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search citation, plate, vehicle, customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {Object.entries(VIOLATION_TYPE_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>
              {lbl}
            </option>
          ))}
        </select>
        <select
          value={respFilter}
          onChange={(e) => setRespFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm"
        >
          <option value="">All responsibility</option>
          {Object.entries(RESPONSIBILITY_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>
              {lbl}
            </option>
          ))}
        </select>
        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm"
        >
          <option value="">All staff</option>
          {store.staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="No violations yet"
          hint="Track tolls, tickets, citations, and customer responsibility here."
          action={
            canCreate && (
              <Button
                className="bg-primary text-primary-foreground"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={16} /> Add violation
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => setDetail(v.id)}
                className={cn(
                  "w-full rounded-md border border-border bg-surface p-3 text-left",
                  toneClass[VIOLATION_STATUS_TONE[v.status]],
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {v.violation_number}
                  </span>
                  <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
                    {statusLabel(v.status)}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-foreground">
                  {typeLabel(v.violation_type)}
                  {v.citation_number ? ` · ${v.citation_number}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {vehicleLabel(v.vehicle_id)} · {fmtDate(v.occurred_at)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
                    {responsibilityLabel(v.responsibility)}
                  </StatusPill>
                  <span className="font-mono text-sm">
                    {canViewFinancials ? fmtMoney(v.total_amount) : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Violation</th>
                  <th className="py-2 pr-3">Vehicle</th>
                  <th className="py-2 pr-3">Customer / Rental</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Occurred</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Responsibility</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Assigned</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setDetail(v.id)}
                    className="cursor-pointer border-b border-border hover:bg-surface-2"
                  >
                    <td className="py-2 pr-3 font-mono">
                      {v.violation_number}
                    </td>
                    <td className="py-2 pr-3">{vehicleLabel(v.vehicle_id)}</td>
                    <td className="py-2 pr-3">
                      {v.customer_id ? store.customerName(v.customer_id) : "—"}
                    </td>
                    <td className="py-2 pr-3">{typeLabel(v.violation_type)}</td>
                    <td className="py-2 pr-3">{fmtDate(v.occurred_at)}</td>
                    <td className="py-2 pr-3">
                      {v.due_at ? fmtDate(v.due_at) : "—"}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {canViewFinancials ? fmtMoney(v.total_amount) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
                        {responsibilityLabel(v.responsibility)}
                      </StatusPill>
                    </td>
                    <td className="py-2 pr-3">
                      <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
                        {statusLabel(v.status)}
                      </StatusPill>
                    </td>
                    <td className="py-2 pr-3">
                      {staffName(v.assigned_staff_id)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {createOpen && (
        <CreateViolationDialog
          vehicles={store.vehicles}
          staff={store.staff}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setDetail(id);
          }}
        />
      )}
      {detail && (
        <ViolationDetail violationId={detail} onClose={() => setDetail(null)} />
      )}
      {importOpen && (
        <ImportViolationsDialog
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "available" | "maintenance" | "out";
}) {
  return (
    <SectionCard>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-foreground">
        {value}
      </p>
    </SectionCard>
  );
}
