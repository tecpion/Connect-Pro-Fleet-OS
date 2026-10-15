// Connect Pro Fleet — compliance permission hooks (Build #26).
// Resolves the current staff's effective permissions for gating compliance UI
// and sensitive document numbers. Mirrors the settings useCan pattern.

import { useStore } from "./store";
import { can } from "./permissions";
import type { DocumentRecord } from "./complianceTypes";
import { isSensitiveDoc, maskNumber } from "./complianceMutationHelpers";

export function useComplianceCan() {
  const store = useStore();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const role = currentStaff
    ? (store.roles.find((r) => r.id === currentStaff.role_id) ??
      store.roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const overrides = currentStaff?.permission_overrides ?? null;
  const check = (key: string) => (role ? can(role, overrides, key) : true);
  return {
    canView: check("compliance.view"),
    canManage: check("compliance.manage"),
    canOverride: check("compliance.override"),
    canUpload: check("documents.upload"),
    canReview: check("documents.review"),
    canArchive: check("documents.archive"),
    canViewSensitive: check("documents.view_sensitive"),
  };
}

/** Resolve a document number, masking sensitive docs unless permitted. */
export function useDocumentNumber(
  doc: Pick<DocumentRecord, "document_type" | "document_number">,
): string | null {
  const { canViewSensitive } = useComplianceCan();
  if (!doc.document_number) return null;
  if (!isSensitiveDoc(doc) || canViewSensitive) return doc.document_number;
  return maskNumber(doc.document_number);
}
