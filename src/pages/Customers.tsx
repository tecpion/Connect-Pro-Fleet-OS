// Connect Pro Fleet — Customers workspace (Build #38 — Customers V1).
//
// Enhanced Customers list: KPI row, lifecycle vs standing/flags, ready-to-rent
// readiness (transparent reasons), quick filters, advanced filter popover,
// customer tags, bulk selection + actions, import/export, and Add Customer
// with duplicate detection. Reuses authoritative selectors — no duplicate
// financial truth, no opaque scoring, no second compliance engine. Verification
// surfaces (KPI, filters, readiness) appear only when verification is enabled.

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { isVerificationEnabled } from "@/lib/verificationConfig";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useCustomerTags } from "@/lib/customerTagStore";
import { useCan } from "@/pages/settings/useCan";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { fmtMoney, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Users,
  Plus,
  Search,
  Upload,
  Download,
  Filter,
  Tag as TagIcon,
  ShieldX,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import {
  buildCustomerRows,
  customerKpis,
  applyQuickFilter,
  searchCustomers,
  QUICK_FILTER_LABELS,
  VERIFICATION_QUICK_FILTERS,
  LIFECYCLE_LABELS,
  STANDING_LABELS,
  type CustomerWorkspaceRow,
  type QuickFilter,
  type CustomerReadiness,
} from "@/lib/customerWorkspaceSelectors";
import { AddCustomerDialog } from "@/pages/customers/AddCustomerDialog";
import {
  SmartCaptureDialog,
  SmartCaptureButton,
  CUSTOMER_PRESET,
} from "@/components/smartcapture/SmartCapture";
import { ImportCustomersDialog } from "@/pages/customers/ImportCustomersDialog";
import { ExportCustomersDialog } from "@/pages/customers/ExportCustomersDialog";
import {
  BulkTagDialog,
  BulkStandingDialog,
  BulkTaskDialog,
} from "@/pages/customers/BulkActionDialogs";

const ALL_QUICK_FILTERS: QuickFilter[] = [
  "all",
  "active_renter",
  "previous_renter",
  "good_standing",
  "pending_verification",
  "watchlist",
  "do_not_rent",
  "vip",
  "has_balance",
  "no_balance",
  "ready",
  "needs_attention",
  "blocked",
  "rented_30d",
  "rented_90d",
  "rented_12m",
];

const READINESS_TONE: Record<
  CustomerReadiness["state"],
  { label: string; tone: "available" | "maintenance" | "out" }
> = {
  ready: { label: "Ready", tone: "available" },
  needs_attention: { label: "Needs Attention", tone: "maintenance" },
  blocked: { label: "Blocked", tone: "out" },
};

const READINESS_ICON: Record<CustomerReadiness["state"], React.ReactNode> = {
  ready: <CheckCircle2 size={12} />,
  needs_attention: <AlertTriangle size={12} />,
  blocked: <Ban size={12} />,
};

export default function Customers() {
  const { customers, rentals, vehicles } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const verificationEnabled = isVerificationEnabled(companyPolicies);
  const compliance = useCompliance();
  const tags = useCustomerTags();
  const canManage = useCan("customers.manage_status");
  const canEdit = useCan("customers.edit");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  // Build #58 — honor ?filter= so the old /drivers (Verification) redirect lands
  // on the matching Customers quick filter (e.g. pending_verification).
  const initialFilter = searchParams.get("filter") as QuickFilter | null;
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    initialFilter &&
      ALL_QUICK_FILTERS.includes(initialFilter) &&
      (verificationEnabled ||
        !VERIFICATION_QUICK_FILTERS.includes(initialFilter))
      ? initialFilter
      : "all",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<
    "all" | "view" | "selected" | null
  >(null);
  const [bulkTagMode, setBulkTagMode] = useState<"add" | "remove" | null>(null);
  const [bulkStandingOpen, setBulkStandingOpen] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);

  const allRows = useMemo(
    () =>
      buildCustomerRows({
        customers,
        rentals,
        vehicles,
        policies: companyPolicies,
        complianceFor: (id, label) =>
          compliance.entityComplianceStatus("customer", id, label),
        tagsFor: (id) => tags.tagsForCustomer(id),
        now: new Date("2026-09-02T12:00:00Z"),
      }),
    [customers, rentals, vehicles, companyPolicies, compliance, tags],
  );

  const kpis = useMemo(
    () => customerKpis(allRows, verificationEnabled),
    [allRows, verificationEnabled],
  );

  const availableFilters = useMemo(
    () =>
      verificationEnabled
        ? ALL_QUICK_FILTERS
        : ALL_QUICK_FILTERS.filter(
            (f) => !VERIFICATION_QUICK_FILTERS.includes(f),
          ),
    [verificationEnabled],
  );

  const filteredRows = useMemo(() => {
    let r = allRows;
    if (quickFilter !== "all") r = applyQuickFilter(r, quickFilter);
    if (tagFilter) r = r.filter((row) => row.tags.includes(tagFilter));
    if (query) r = searchCustomers(r, query);
    return r;
  }, [allRows, quickFilter, tagFilter, query]);

  const { visible, hasMore, remaining, loadMore } = usePagination(
    filteredRows,
    50,
    50,
  );

  const allTags = useMemo(
    () => Array.from(new Set(allRows.flatMap((r) => r.tags))).sort(),
    [allRows],
  );

  const selectedIds = useMemo(
    () =>
      Array.from(selected).filter((id) =>
        filteredRows.some((r) => r.id === id),
      ),
    [selected, filteredRows],
  );

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  const columns: ResponsiveColumn<CustomerWorkspaceRow>[] = [
    {
      key: "select",
      header: "",
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelect(r.id)}
          className="h-4 w-4 rounded border-border"
          aria-label={`Select ${r.name}`}
        />
      ),
    },
    {
      key: "customer",
      header: "Customer",
      mobilePrimary: true,
      render: (r) => (
        <div>
          <Link
            to={`/customers/${r.id}`}
            className="font-medium text-foreground hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {r.name}
          </Link>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {r.phone || "no phone"}
          </p>
          {r.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {r.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  <TagIcon size={9} /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (r) => (
        <span className="text-sm text-foreground">
          {LIFECYCLE_LABELS[r.lifecycle]}
        </span>
      ),
    },
    {
      key: "standing",
      header: "Standing",
      mobileSecondary: true,
      render: (r) => (
        <StatusPill tone={standingTone(r.standing)}>
          {STANDING_LABELS[r.standing]}
        </StatusPill>
      ),
    },
    {
      key: "vehicle",
      header: "Current Vehicle",
      mobileHidden: true,
      render: (r) =>
        r.currentVehicleId ? (
          <Link
            to={`/vehicles/${r.currentVehicleId}`}
            className="text-foreground hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {r.currentVehicle}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      mono: true,
      render: (r) =>
        r.balance > 0 ? (
          <Link
            to={`/payments-due?customer=${r.id}`}
            className="text-status-maintenance hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fmtMoney(r.balance)}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "rentals",
      header: "Rentals",
      align: "right",
      mono: true,
      mobileHidden: true,
      render: (r) => String(r.totalRentals),
    },
    {
      key: "lifetime",
      header: "Lifetime",
      align: "right",
      mono: true,
      render: (r) => fmtMoney(r.lifetimeRevenue),
    },
    {
      key: "readiness",
      header: "Readiness",
      render: (r) => <ReadinessBadge readiness={r.readiness} />,
    },
    {
      key: "last",
      header: "Last Rental",
      mono: true,
      mobileHidden: true,
      render: (r) => (r.lastRentalDate ? fmtDateShort(r.lastRentalDate) : "—"),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle="Manage customer records, rental history, balances, verification, and readiness."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload size={15} className="mr-1.5" /> Import
            </Button>
            <SmartCaptureButton
              label="Smart Capture"
              onClick={() => setCaptureOpen(true)}
            />
            <Button variant="outline" onClick={() => setExportMode("view")}>
              <Download size={15} className="mr-1.5" /> Export
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary-press"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={15} className="mr-1.5" /> Add Customer
            </Button>
          </div>
        }
      />

      <SmartCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        preset={CUSTOMER_PRESET}
        title="Smart Capture — Customer"
        onConfirm={() => {
          toast.success(
            "Captured information ready — review and finish adding the customer.",
          );
          setCaptureOpen(false);
          setAddOpen(true);
        }}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Customers" value={String(kpis.total)} />
        <KpiCard label="Active Renters" value={String(kpis.activeRenters)} />
        <KpiCard
          label="Outstanding Balance"
          value={fmtMoney(kpis.outstandingBalance)}
        />
        {verificationEnabled && (
          <KpiCard
            label="Pending Verification"
            value={String(kpis.pendingVerification)}
          />
        )}
        <KpiCard label="Do Not Rent" value={String(kpis.doNotRent)} />
        <KpiCard
          label="Previous Renters"
          value={String(kpis.previousRenters)}
        />
      </div>

      {/* Search + quick filters + advanced */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, email, license"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value as QuickFilter)}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          >
            {availableFilters.map((f) => (
              <option key={f} value={f}>
                {QUICK_FILTER_LABELS[f]}
              </option>
            ))}
          </select>
          <Popover open={showAdvanced} onOpenChange={setShowAdvanced}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter size={14} className="mr-1.5" /> Advanced
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Filters</p>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tag
                  </label>
                  <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="">All tags</option>
                    {allTags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setTagFilter("");
                    setQuickFilter("all");
                    setQuery("");
                  }}
                >
                  Clear all
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.length} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExportMode("selected")}
            >
              <Download size={14} className="mr-1.5" /> Export Selected
            </Button>
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkTagMode("add")}
                >
                  <TagIcon size={14} className="mr-1.5" /> Add Tag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkTagMode("remove")}
                >
                  Remove Tag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkTaskOpen(true)}
                >
                  Create Task
                </Button>
              </>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkStandingOpen(true)}
              >
                Change Standing
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="No customers match"
          hint="Adjust the filters, or add a new customer to start tracking their rentals and payments."
          icon={<Users size={28} />}
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setQuickFilter("all");
                setTagFilter("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            rows={visible}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/customers/${r.id}`)}
          />
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore}>
                Load more ({remaining} remaining)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportCustomersDialog open={importOpen} onOpenChange={setImportOpen} />
      {exportMode && (
        <ExportCustomersDialog
          open={!!exportMode}
          onOpenChange={(v) => !v && setExportMode(null)}
          mode={exportMode}
          rows={exportMode === "all" ? allRows : filteredRows}
          selectedIds={selectedIds}
          verificationEnabled={verificationEnabled}
        />
      )}
      {bulkTagMode && (
        <BulkTagDialog
          open={!!bulkTagMode}
          onOpenChange={(v) => !v && setBulkTagMode(null)}
          selectedIds={selectedIds}
          mode={bulkTagMode}
        />
      )}
      <BulkStandingDialog
        open={bulkStandingOpen}
        onOpenChange={setBulkStandingOpen}
        selectedIds={selectedIds}
      />
      <BulkTaskDialog
        open={bulkTaskOpen}
        onOpenChange={setBulkTaskOpen}
        selectedIds={selectedIds}
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular text-foreground">
        {value}
      </p>
    </div>
  );
}

function ReadinessBadge({ readiness }: { readiness: CustomerReadiness }) {
  const meta = READINESS_TONE[readiness.state];
  return (
    <div className="flex flex-col gap-0.5">
      <StatusPill tone={meta.tone}>
        {READINESS_ICON[readiness.state]}
        {meta.label}
      </StatusPill>
      {readiness.reasons.length > 0 && (
        <span className="text-[11px] text-muted-foreground">
          {readiness.reasons.join(" · ")}
        </span>
      )}
    </div>
  );
}

function standingTone(
  s: CustomerWorkspaceRow["standing"],
): "available" | "maintenance" | "out" {
  if (s === "do_not_rent") return "out";
  if (s === "watchlist" || s === "pending_verification") return "maintenance";
  return "available";
}
