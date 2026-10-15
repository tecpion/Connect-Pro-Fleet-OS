// Connect Pro Fleet — Compliance Center (workspace).
//
// Operational documents & compliance hub. Tabs: Needs Attention, Vehicles,
// Customers, Rentals, Expiring Soon, Missing, All Documents. Dashboard summary
// cards (Blocked Vehicles, Expired, Expiring Soon, Missing Required, Pending
// Review) are DERIVED from selectors — never stored as booleans. Needs Attention
// uses the operational workspace component (entity, requirement, status,
// impact, timing, owner, next action). Permission-aware. Sensitive document
// numbers masked. All KPIs come from authoritative selectors.
//
// NOTE: this page is rendered by complianceIntegration.test.tsx WITHOUT a
// Router, so it must not render top-level <Link> at the page level. The
// NeedsAttentionWorkspace guards its own links (SafeLink).

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useComplianceCan } from "@/lib/compliancePermissionHooks";
import { PageHeader, EmptyState, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/Status";
import { ShieldCheck, FilePlus, Search } from "lucide-react";
import {
  getExpiredDocuments,
  getDocumentsExpiringWithin,
} from "@/lib/complianceSelectors";
import { getEntityComplianceStatus } from "@/lib/complianceStatus";
import type { DocumentRecord } from "@/lib/complianceTypes";
import { documentTypeLabel } from "@/lib/complianceTypes";
import { TABS, TAB_LABELS, sortIssuesByUrgency } from "./compliance/shared";
import type { ComplianceTab } from "./compliance/shared";
import type { UploadContext } from "./compliance/DocumentUploadDialog";
import { DocumentUploadDialog } from "./compliance/DocumentUploadDialog";
import { DocumentReviewDialog } from "./compliance/DocumentReviewDialog";
import { DocCard, DocRow } from "./compliance/ComplianceDocItems";
import {
  OverrideDialog,
  type OverrideContext,
} from "./compliance/OverrideDialog";
import { NeedsAttentionWorkspace } from "./compliance/NeedsAttentionWorkspace";
import {
  toComplianceItem,
  applyComplianceFilters,
  sortComplianceItems,
  DEFAULT_FILTERS,
  NEXT_ACTION_LABELS,
  type ComplianceFilters,
  type ComplianceItem,
} from "@/lib/complianceWorkspace";

const NOW = new Date("2026-09-02T12:00:00Z");

export default function Compliance() {
  const store = useStore();
  const comp = useCompliance();
  const { canView, canUpload, canOverride } = useComplianceCan();
  const [tab, setTab] = useState<ComplianceTab>("needs_attention");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ComplianceFilters>(DEFAULT_FILTERS);
  const [uploadCtx, setUploadCtx] = useState<UploadContext | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewDoc, setReviewDoc] = useState<DocumentRecord | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [overrideCtx, setOverrideCtx] = useState<OverrideContext | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model} (${v.license_plate})` : id;
  };
  const customerLabel = (id: string) => {
    const c = store.customers.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : id;
  };
  const rentalLabel = (id: string) => {
    const r = store.rentals.find((x) => x.id === id);
    return r ? r.agreement_number : id;
  };
  const staffName = (id: string | null) =>
    id
      ? (store.staff.find((s) => s.id === id)?.full_name ?? "Unassigned")
      : "Unassigned";

  // Build the Needs Attention queue across all entities (DERIVED).
  const allIssues = useMemo(() => {
    const issues = [];
    for (const v of store.vehicles) {
      issues.push(
        ...getEntityComplianceStatus(
          "vehicle",
          v.id,
          vehicleLabel(v.id),
          comp.requirements,
          comp.documents,
          comp.overrides,
          NOW,
        ).issues,
      );
    }
    for (const c of store.customers) {
      issues.push(
        ...getEntityComplianceStatus(
          "customer",
          c.id,
          customerLabel(c.id),
          comp.requirements,
          comp.documents,
          comp.overrides,
          NOW,
        ).issues,
      );
    }
    for (const rnt of store.rentals) {
      issues.push(
        ...getEntityComplianceStatus(
          "rental",
          rnt.id,
          rentalLabel(rnt.id),
          comp.requirements,
          comp.documents,
          comp.overrides,
          NOW,
        ).issues,
      );
    }
    return sortIssuesByUrgency(issues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.vehicles, store.customers, store.rentals, comp]);

  const allItems: ComplianceItem[] = useMemo(
    () =>
      allIssues.map((i) =>
        toComplianceItem(
          i,
          comp.requirements,
          comp.documents,
          comp.overrides,
          NOW,
        ),
      ),
    [allIssues, comp.requirements, comp.documents, comp.overrides],
  );

  const expired = getExpiredDocuments(comp.documents, NOW);
  const expiring = getDocumentsExpiringWithin(comp.documents, NOW, 30);
  const missing = allIssues.filter((i) => i.reason === "missing_required");
  const pendingReview = comp.documents.filter(
    (d) =>
      d.verification_status === "pending" ||
      d.verification_status === "not_reviewed",
  );
  const blockedVehicles = store.vehicles.filter(
    (v) => comp.complianceBlocksForVehicle(v.id).blocked,
  );

  const openUpload = (ctx: UploadContext) => {
    setUploadCtx(ctx);
    setUploadOpen(true);
  };

  const filteredDocs = useMemo(() => {
    let docs = comp.documents.filter((d) => d.archived_at == null);
    if (tab === "vehicles")
      docs = docs.filter((d) => d.entity_type === "vehicle");
    else if (tab === "customers")
      docs = docs.filter((d) => d.entity_type === "customer");
    else if (tab === "rentals")
      docs = docs.filter((d) => d.entity_type === "rental");
    else if (tab === "expiring") docs = expiring;
    else if (tab === "missing")
      docs = docs.filter((d) => !d.file_reference || d.status === "missing");
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      docs = docs.filter(
        (d) =>
          d.entity_label?.toLowerCase().includes(q) ||
          d.issuer?.toLowerCase().includes(q) ||
          d.document_number?.toLowerCase().includes(q) ||
          documentTypeLabel(d.document_type).toLowerCase().includes(q),
      );
    }
    return docs.sort((a, b) =>
      (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""),
    );
  }, [comp.documents, tab, expiring, search]);

  const filteredItems = useMemo(
    () => sortComplianceItems(applyComplianceFilters(allItems, filters)),
    [allItems, filters],
  );

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkAssign = (staffId: string) => {
    for (const it of filteredItems) {
      const k = `${it.entity_type}-${it.entity_id}-${it.document_type}`;
      if (!selected.has(k)) continue;
      if (it.document_id) comp.assignStaff(it.document_id, staffId || null);
    }
    setSelected(new Set());
  };

  const createTaskFor = (it: ComplianceItem) =>
    store.createTask({
      title: `${NEXT_ACTION_LABELS[it.next_action]} — ${documentTypeLabel(it.document_type)} — ${it.entity_label}`,
      description: `${documentTypeLabel(it.document_type)} — ${it.reason.replace(/_/g, " ")}. ${it.block_label}.`,
      category: "document",
      priority: it.blocking ? "urgent" : "normal",
      // DocumentEntityType is broader than TaskEntityType (it also includes
      // "company"); null out unsupported entity types so the task is created
      // without an entity link rather than failing the type check.
      entityType:
        it.entity_type === "vehicle" ||
        it.entity_type === "customer" ||
        it.entity_type === "rental"
          ? (it.entity_type as "vehicle" | "customer" | "rental")
          : null,
      entityId: it.entity_id,
      entityLabel: it.entity_label,
    });

  const bulkTask = () => {
    for (const it of filteredItems) {
      const k = `${it.entity_type}-${it.entity_id}-${it.document_type}`;
      if (selected.has(k)) createTaskFor(it);
    }
    setSelected(new Set());
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance" />
        <EmptyState
          title="No access"
          hint="You do not have permission to view compliance."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        subtitle="Track vehicle documents, customer credentials, rental agreements, and compliance status."
        actions={
          canUpload && (
            <Button
              onClick={() =>
                openUpload({
                  entity_type: "company",
                  entity_id: store.tenant.id,
                  entity_label: store.tenant.business_name,
                })
              }
            >
              <FilePlus size={16} className="mr-1.5" /> Upload document
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Blocked vehicles"
          value={blockedVehicles.length}
          tone="out"
        />
        <SummaryCard label="Expired" value={expired.length} tone="out" />
        <SummaryCard
          label="Expiring soon"
          value={expiring.length}
          tone="maintenance"
        />
        <SummaryCard
          label="Missing required"
          value={missing.length}
          tone="out"
        />
        <SummaryCard
          label="Pending review"
          value={pendingReview.length}
          tone="maintenance"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
              (tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70")
            }
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by entity, issuer, document #, type…"
          className="pl-9"
        />
      </div>

      {tab === "needs_attention" ? (
        <NeedsAttentionWorkspace
          items={filteredItems}
          allItemsCount={allItems.length}
          filters={filters}
          setFilters={setFilters}
          staff={store.staff}
          onUpload={openUpload}
          onOverride={(ctx) => {
            setOverrideCtx(ctx);
            setOverrideOpen(true);
          }}
          onCreateTask={createTaskFor}
          canOverride={canOverride}
          staffName={staffName}
          entityLink={(type, id) =>
            type === "vehicle"
              ? `/vehicles/${id}`
              : type === "customer"
                ? `/customers/${id}`
                : type === "rental"
                  ? `/rentals/${id}`
                  : "/compliance"
          }
          selected={selected}
          toggleSelect={toggleSelect}
          selectAll={() =>
            setSelected(
              new Set(
                filteredItems.map(
                  (i) => `${i.entity_type}-${i.entity_id}-${i.document_type}`,
                ),
              ),
            )
          }
          clearAll={() => setSelected(new Set())}
          bulkAssign={bulkAssign}
          bulkTask={bulkTask}
        />
      ) : (
        <EntityDocTab
          filteredDocs={filteredDocs}
          canUpload={canUpload}
          onUpload={openUpload}
          onReview={(d) => {
            setReviewDoc(d);
            setReviewOpen(true);
          }}
          tenantLabel={store.tenant.business_name}
          tenantId={store.tenant.id}
        />
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        context={uploadCtx}
      />
      <DocumentReviewDialog
        doc={reviewDoc}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
      />
      <OverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        context={overrideCtx}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "out" | "maintenance" | "available";
}) {
  return (
    <SectionCard>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums">
          {value}
        </span>
        <StatusPill tone={tone}>{value === 0 ? "OK" : "Action"}</StatusPill>
      </div>
    </SectionCard>
  );
}

function EntityDocTab({
  filteredDocs,
  canUpload,
  onUpload,
  onReview,
  tenantLabel,
  tenantId,
}: {
  filteredDocs: DocumentRecord[];
  canUpload: boolean;
  onUpload: (ctx: UploadContext) => void;
  onReview: (d: DocumentRecord) => void;
  tenantLabel: string;
  tenantId: string;
}) {
  if (filteredDocs.length === 0) {
    return (
      <EmptyState
        title="No documents"
        hint="Upload vehicle registrations, customer licenses, and rental agreements here."
        icon={<ShieldCheck size={28} />}
        action={
          canUpload ? (
            <Button
              onClick={() =>
                onUpload({
                  entity_type: "company",
                  entity_id: tenantId,
                  entity_label: tenantLabel,
                })
              }
            >
              <FilePlus size={16} className="mr-1.5" /> Upload document
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <>
      <div className="space-y-3 lg:hidden">
        {filteredDocs.map((d) => (
          <DocCard key={d.id} doc={d} onReview={() => onReview(d)} />
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Document</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Verification</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.map((d) => (
              <DocRow key={d.id} doc={d} onReview={() => onReview(d)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
