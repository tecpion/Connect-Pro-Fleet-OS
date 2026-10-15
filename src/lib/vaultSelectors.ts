// Connect Pro Fleet — Vehicle Vault selectors (Build #45).
//
// Pure selectors over vault documents. No mutation, no duplicate financial
// truth. Conflict detection surfaces purchase-price / expense-amount mismatches
// WITHOUT overwriting either side (spec §66, §67).

import type { VaultDocument, VaultDocGroup } from "./vaultTypes";
import type { Vehicle } from "./types";
import type { ExpenseTransaction } from "./expenseTypes";

/** All vault documents for a vehicle (non-archived first, newest first). */
export function vehicleVaultDocs(
  docs: VaultDocument[],
  vehicleId: string,
): VaultDocument[] {
  return docs
    .filter((d) => d.vehicle_id === vehicleId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Documents for a vehicle within a specific group. */
export function vehicleVaultDocsByGroup(
  docs: VaultDocument[],
  vehicleId: string,
  group: VaultDocGroup,
): VaultDocument[] {
  return vehicleVaultDocs(docs, vehicleId).filter((d) => d.group === group);
}

/** The purchase package: all purchase/ownership documents that exist for a
 *  vehicle (spec §28). Only records that exist are shown. */
export function vehiclePurchasePackage(
  docs: VaultDocument[],
  vehicleId: string,
): VaultDocument[] {
  return vehicleVaultDocsByGroup(docs, vehicleId, "purchase_ownership").filter(
    (d) => d.status !== "voided",
  );
}

/** Compact vault summary for the Vehicle Digital Twin (spec §60). */
export interface VaultSummary {
  total: number;
  purchaseDocs: number;
  expenseSupport: number;
  complianceDocs: number;
  needsAttention: number;
}

export function vehicleVaultSummary(
  docs: VaultDocument[],
  vehicleId: string,
): VaultSummary {
  const v = vehicleVaultDocs(docs, vehicleId).filter(
    (d) => d.status !== "voided" && d.status !== "archived",
  );
  return {
    total: v.length,
    purchaseDocs: v.filter((d) => d.group === "purchase_ownership").length,
    expenseSupport: v.filter((d) => d.group === "expense_documentation").length,
    complianceDocs: v.filter((d) => d.group === "compliance").length,
    needsAttention: v.filter(
      (d) => d.status === "awaiting_signature" || d.status === "needs_review",
    ).length,
  };
}

/** Attention items for the vault (spec §45). */
export interface VaultAttentionItem {
  document_id: string;
  vehicle_id: string;
  document_number: string;
  category: string;
  reason: string;
  severity: "critical" | "high" | "medium";
}

export function vaultAttentionItems(
  docs: VaultDocument[],
): VaultAttentionItem[] {
  const out: VaultAttentionItem[] = [];
  for (const d of docs) {
    if (d.status === "voided" || d.status === "archived") continue;
    if (d.status === "awaiting_signature") {
      out.push({
        document_id: d.id,
        vehicle_id: d.vehicle_id,
        document_number: d.document_number,
        category: d.category,
        reason: "Signature required",
        severity: "high",
      });
    }
    if (d.status === "needs_review") {
      out.push({
        document_id: d.id,
        vehicle_id: d.vehicle_id,
        document_number: d.document_number,
        category: d.category,
        reason: "Document needs review",
        severity: "medium",
      });
    }
    // Purchase documentation missing: a vehicle with no purchase/ownership docs.
    // (Surfaced at the vehicle level by callers using hasPurchaseDocumentation.)
  }
  return out;
}

/** Whether a vehicle has ANY purchase/ownership documentation (spec §45). */
export function hasPurchaseDocumentation(
  docs: VaultDocument[],
  vehicleId: string,
): boolean {
  return vehiclePurchasePackage(docs, vehicleId).length > 0;
}

/** Purchase amount conflict: generated record price vs authoritative vehicle
 *  purchase_price (spec §66). Returns null when no conflict. */
export function purchaseAmountConflict(
  doc: VaultDocument,
  authoritativePrice: number,
): { generated: number; authoritative: number } | null {
  if (doc.purchase_price == null) return null;
  if (authoritativePrice <= 0) return null; // no authoritative value to conflict
  if (doc.purchase_price === authoritativePrice) return null;
  return { generated: doc.purchase_price, authoritative: authoritativePrice };
}

/** Expense amount conflict: cash-expense record amount vs linked ledger amount
 *  (spec §67). Returns null when no conflict. */
export function expenseAmountConflict(
  doc: VaultDocument,
  expense: Partial<ExpenseTransaction>,
): { generated: number; ledger: number } | null {
  if (doc.amount == null) return null;
  const ledgerAmount = expense.amount;
  if (ledgerAmount == null) return null;
  if (doc.amount === ledgerAmount) return null;
  return { generated: doc.amount, ledger: ledgerAmount };
}

/** Duplicate-document warning: same file_name + same vehicle (spec §54). Does
 *  NOT reject — only flags. */
export function findDuplicateUpload(
  docs: VaultDocument[],
  vehicleId: string,
  fileName: string,
): VaultDocument | null {
  return (
    docs.find(
      (d) =>
        d.vehicle_id === vehicleId &&
        d.file_name === fileName &&
        d.status !== "voided",
    ) ?? null
  );
}

/** Tenant-scoping guard: ensure a document belongs to the given tenant. */
export function docBelongsToTenant(
  doc: VaultDocument,
  tenantId: string,
): boolean {
  return doc.tenant_id === tenantId;
}

/** Vehicle mismatch validation: a document's vehicle_id must match the vehicle
 *  being linked (spec §68). */
export function validateVehicleLink(
  doc: VaultDocument,
  vehicleId: string,
): boolean {
  return doc.vehicle_id === vehicleId;
}

/** Mask a VIN to last 4 + last 4 for non-sensitive viewers (spec §52). */
export function maskVin(vin: string, showFull: boolean): string {
  if (showFull || vin.length <= 8) return vin;
  return `${vin.slice(0, 4)}••••${vin.slice(-4)}`;
}

/** Resolve the vehicle label for a document. */
export function vehicleLabelFor(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model}`;
}
