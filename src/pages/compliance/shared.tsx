// Connect Pro Fleet — Compliance Center shared UI helpers (Build #26).
// Tab definitions, tone/label maps, and small presentational helpers shared by
// the Compliance page and entity-detail sections. Tone maps reuse the Status
// component's Tone union so compliance states render with consistent colors.

import type {
  ComplianceStatus,
  DocumentStatus,
  VerificationStatus,
  ComplianceSeverity,
  DocumentEntityType,
  ComplianceIssue,
} from "@/lib/complianceTypes";
import {
  COMPLIANCE_STATUS_LABELS,
  COMPLIANCE_STATUS_TONE,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONE,
  VERIFICATION_LABELS,
  SEVERITY_LABELS,
  documentTypeLabel,
} from "@/lib/complianceTypes";
import type { Tone } from "@/components/Status";

export type ComplianceTab =
  | "needs_attention"
  | "vehicles"
  | "customers"
  | "rentals"
  | "expiring"
  | "missing"
  | "all";

export const TAB_LABELS: Record<ComplianceTab, string> = {
  needs_attention: "Needs Attention",
  vehicles: "Vehicles",
  customers: "Customers",
  rentals: "Rentals",
  expiring: "Expiring Soon",
  missing: "Missing",
  all: "All Documents",
};

export const TABS: ComplianceTab[] = [
  "needs_attention",
  "vehicles",
  "customers",
  "rentals",
  "expiring",
  "missing",
  "all",
];

export function complianceStatusTone(s: ComplianceStatus): Tone {
  return COMPLIANCE_STATUS_TONE[s];
}

export function complianceStatusLabel(s: ComplianceStatus): string {
  return COMPLIANCE_STATUS_LABELS[s];
}

export function documentStatusTone(s: DocumentStatus): Tone {
  return DOCUMENT_STATUS_TONE[s];
}

export function documentStatusLabel(s: DocumentStatus): string {
  return DOCUMENT_STATUS_LABELS[s];
}

export function verificationLabel(v: VerificationStatus): string {
  return VERIFICATION_LABELS[v];
}

export function severityTone(s: ComplianceSeverity): Tone {
  switch (s) {
    case "critical":
      return "out";
    case "high":
      return "maintenance";
    case "medium":
      return "maintenance";
    case "normal":
      return "neutral";
  }
}

export function severityLabel(s: ComplianceSeverity): string {
  return SEVERITY_LABELS[s];
}

export function entityTypeLabel(t: DocumentEntityType): string {
  switch (t) {
    case "vehicle":
      return "Vehicle";
    case "customer":
      return "Customer";
    case "rental":
      return "Rental";
    case "company":
      return "Company";
  }
}

export function docType(t: string): string {
  return documentTypeLabel(t as never);
}

/** Sort issues by severity (critical first), then by expiration urgency. */
const SEVERITY_RANK: Record<ComplianceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  normal: 3,
};

export function sortIssuesByUrgency(
  issues: ComplianceIssue[],
): ComplianceIssue[] {
  return [...issues].sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (r !== 0) return r;
    // Earliest expiration first (nulls last).
    if (!a.expiration_date && !b.expiration_date) return 0;
    if (!a.expiration_date) return 1;
    if (!b.expiration_date) return -1;
    return a.expiration_date < b.expiration_date ? -1 : 1;
  });
}
