// Connect Pro Fleet — Global Documents workspace (Build #45).
//
// A cross-vehicle search/browse experience for vault documents. Reuses the
// VaultStore (no duplicate file storage). Search by document #, vehicle, VIN,
// vendor, seller, type, date, amount, linked expense, signature status. Filters
// by vehicle, document type, generated/uploaded, signed/awaiting, date range,
// expense-linked, purchase-related, missing attention. Permission-gated.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useVault } from "@/lib/vaultStoreProvider";
import { can } from "@/lib/permissions";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VaultDocRow } from "@/pages/vehicles/VaultPrimitives";
import {
  VAULT_DOC_CATEGORY_LABELS,
  VAULT_DOC_STATUS_LABELS,
  type VaultDocCategory,
  type VaultDocStatus,
  type VaultDocument,
} from "@/lib/vaultTypes";
import { vaultAttentionItems } from "@/lib/vaultSelectors";
import { fmtMoneyExact } from "@/lib/format";
import { Search, FileText } from "lucide-react";

export function GlobalDocumentsView() {
  const store = useStore();
  const vault = useVault();
  const [query, setQuery] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState("all");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canView = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.view",
  );
  const canExport = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.export",
  );

  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : id;
  };

  const attention = useMemo(
    () => vaultAttentionItems(vault.vaultDocs),
    [vault.vaultDocs],
  );

  const filtered = useMemo(() => {
    let list = vault.vaultDocs.filter((d) => d.status !== "archived");
    if (vehicleFilter !== "all")
      list = list.filter((d) => d.vehicle_id === vehicleFilter);
    if (typeFilter !== "all")
      list = list.filter((d) => d.category === typeFilter);
    if (statusFilter !== "all")
      list = list.filter((d) => d.status === statusFilter);
    if (sourceFilter !== "all")
      list = list.filter((d) =>
        sourceFilter === "generated"
          ? d.source === "generated"
          : d.source !== "generated",
      );
    if (linkedFilter === "expense")
      list = list.filter((d) => !!d.links.expense_id);
    else if (linkedFilter === "purchase")
      list = list.filter((d) => !!d.links.acquisition_vehicle_id);
    else if (linkedFilter === "attention")
      list = list.filter((d) => attention.some((a) => a.document_id === d.id));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (d) =>
          d.document_number.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          (d.vendor_name ?? "").toLowerCase().includes(q) ||
          (d.seller_name ?? "").toLowerCase().includes(q) ||
          vehicleLabel(d.vehicle_id).toLowerCase().includes(q) ||
          (store.vehicles.find((v) => v.id === d.vehicle_id)?.vin ?? "")
            .toLowerCase()
            .includes(q),
      );
    }
    return list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vault.vaultDocs,
    vehicleFilter,
    typeFilter,
    statusFilter,
    sourceFilter,
    linkedFilter,
    query,
    attention,
  ]);

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <EmptyState
          title="Documents restricted"
          hint="You don't have permission to view vehicle documents."
        />
      </div>
    );
  }

  function exportCsv() {
    const rows = [
      [
        "Document #",
        "Type",
        "Vehicle",
        "Vendor/Seller",
        "Amount",
        "Date",
        "Status",
        "Linked Expense",
      ],
      ...filtered.map((d) => [
        d.document_number,
        VAULT_DOC_CATEGORY_LABELS[d.category],
        vehicleLabel(d.vehicle_id),
        d.vendor_name ?? d.seller_name ?? "",
        d.amount != null ? String(d.amount) : "",
        d.expense_date ?? d.purchase_date ?? "",
        VAULT_DOC_STATUS_LABELS[d.status],
        d.links.expense_id ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vehicle-documents.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const categories = Object.keys(
    VAULT_DOC_CATEGORY_LABELS,
  ) as VaultDocCategory[];
  const statuses = Object.keys(VAULT_DOC_STATUS_LABELS) as VaultDocStatus[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        subtitle="Search and browse all vehicle documents, receipts, cash expense records, and purchase records."
        actions={
          canExport && (
            <Button variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          )
        }
      />

      {/* Attention strip */}
      {attention.length > 0 && (
        <div className="rounded-md border border-status-maintenance/30 bg-status-maintenance/5 p-3">
          <p className="text-sm font-medium text-status-maintenance">
            {attention.length} document{attention.length > 1 ? "s" : ""} need
            attention
          </p>
          <p className="text-xs text-muted-foreground">
            Awaiting signature or review. Filter by "Missing Attention" below.
          </p>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by #, vehicle, VIN, vendor, seller…"
            className="pl-8"
          />
        </div>
        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Vehicle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vehicles</SelectItem>
            {store.vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.year} {v.make} {v.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {VAULT_DOC_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {VAULT_DOC_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="generated">Generated</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={linkedFilter} onValueChange={setLinkedFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Linked" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="expense">Expense Linked</SelectItem>
            <SelectItem value="purchase">Purchase Related</SelectItem>
            <SelectItem value="attention">Missing Attention</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SectionCard
        title={`${filtered.length} document${filtered.length !== 1 ? "s" : ""}`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No documents found"
            hint="Adjust filters or add documents from a vehicle's document vault."
            icon={<FileText size={24} />}
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((doc) => (
              <li key={doc.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to={`/vehicles/${doc.vehicle_id}`}
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    {vehicleLabel(doc.vehicle_id)}
                  </Link>
                  {doc.amount != null && (
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {fmtMoneyExact(doc.amount)}
                    </span>
                  )}
                </div>
                <VaultDocRow doc={doc} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
