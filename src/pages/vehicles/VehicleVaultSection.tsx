// Connect Pro Fleet — Vehicle Vault section (Build #45).
// The permanent document vault on VehicleDetail: summary strip, grouped
// document table, purchase package, and the Add Document menu trigger. Dialogs
// are owned by the parent (VehicleDetail) so this stays a presentational leaf.

import { useMemo, useState } from "react";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useVault } from "@/lib/vaultStoreProvider";
import {
  vehicleVaultDocs,
  vehicleVaultSummary,
  vehiclePurchasePackage,
  hasPurchaseDocumentation,
} from "@/lib/vaultSelectors";
import {
  VAULT_DOC_GROUP_LABELS,
  type VaultDocGroup,
  type VaultDocument,
} from "@/lib/vaultTypes";
import { VaultDocRow, VaultSummaryStrip } from "./VaultPrimitives";
import { AddDocumentMenu, type MenuAction } from "./VaultAddMenu";
import { FileText, Search, FolderArchive } from "lucide-react";
import { can } from "@/lib/permissions";
import { useStore } from "@/lib/store";

export function VehicleVaultSection({
  vehicleId,
  onMenuAction,
  onSelectDoc,
}: {
  vehicleId: string;
  onMenuAction: (a: MenuAction) => void;
  onSelectDoc: (doc: VaultDocument) => void;
}) {
  const vault = useVault();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<VaultDocGroup | "all">("all");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canUpload = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.upload",
  );
  const canView = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.view",
  );

  const allDocs = vault.vehicleDocs(vehicleId);
  const summary = useMemo(
    () => vehicleVaultSummary(vault.vaultDocs, vehicleId),
    [vault.vaultDocs, vehicleId],
  );
  const purchasePackage = useMemo(
    () => vehiclePurchasePackage(vault.vaultDocs, vehicleId),
    [vault.vaultDocs, vehicleId],
  );
  const hasPurchaseDocs = hasPurchaseDocumentation(vault.vaultDocs, vehicleId);

  const filtered = useMemo(() => {
    let list = allDocs;
    if (activeGroup !== "all")
      list = list.filter((d) => d.group === activeGroup);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (d) =>
          d.document_number.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          (d.vendor_name ?? "").toLowerCase().includes(q) ||
          (d.seller_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [allDocs, activeGroup, query]);

  const groups: (VaultDocGroup | "all")[] = [
    "all",
    "purchase_ownership",
    "expense_documentation",
    "maintenance",
    "compliance",
    "damage_incident",
    "violations",
    "other",
  ];

  if (!canView) return null;

  return (
    <SectionCard
      title="Documents"
      right={<AddDocumentMenu onAction={onMenuAction} disabled={!canUpload} />}
    >
      <div className="space-y-4">
        <VaultSummaryStrip {...summary} />

        {/* Purchase documentation attention (spec §45) */}
        {!hasPurchaseDocs && (
          <div className="rounded-md border border-status-maintenance/30 bg-status-maintenance/5 p-3">
            <p className="text-sm font-medium text-status-maintenance">
              Purchase documentation missing
            </p>
            <p className="text-xs text-muted-foreground">
              No Bill of Sale or Purchase Record on file. Create one to document
              this vehicle's acquisition.
            </p>
          </div>
        )}

        {/* Search + group filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, title, vendor…"
              className="pl-8"
            />
          </div>
          <select
            value={activeGroup}
            onChange={(e) =>
              setActiveGroup(e.target.value as VaultDocGroup | "all")
            }
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            {groups.map((g) => (
              <option key={g} value={g}>
                {g === "all" ? "All groups" : VAULT_DOC_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </div>

        {/* Document table */}
        {filtered.length === 0 ? (
          <EmptyState
            title="No documents in this group yet"
            hint="Upload receipts, create cash expense records, or generate a bill of sale to build this vehicle's permanent document trail."
            icon={<FileText size={24} />}
          />
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((doc) => (
              <VaultDocRow
                key={doc.id}
                doc={doc}
                onClick={() => onSelectDoc(doc)}
              />
            ))}
          </ul>
        )}

        {/* Purchase Package (spec §28) */}
        {purchasePackage.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2">
              <FolderArchive size={15} className="text-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                Purchase Package
              </h4>
            </div>
            <ul className="divide-y divide-border">
              {purchasePackage.map((doc) => (
                <VaultDocRow
                  key={doc.id}
                  doc={doc}
                  onClick={() => onSelectDoc(doc)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/** Re-export for convenience. */
export { Button };
