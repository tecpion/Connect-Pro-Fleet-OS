// Connect Pro Fleet — violations UI shared helpers (Build #25).

import type {
  ViolationStatus,
  ViolationType,
  ViolationResponsibility,
  DisputeStatus,
  ViolationSource,
  ViolationEvidenceType,
} from "@/lib/violationTypes";
import {
  VIOLATION_STATUS_LABELS,
  VIOLATION_STATUS_TONE,
  VIOLATION_TYPE_LABELS,
  ALL_VIOLATION_TYPES,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_TONE,
  DISPUTE_STATUS_LABELS,
  VIOLATION_SOURCE_LABELS,
  EVIDENCE_TYPE_LABELS,
} from "@/lib/violationTypes";

export const toneClass: Record<string, string> = {
  available: "border-l-status-available",
  maintenance: "border-l-status-maintenance",
  out: "border-l-status-out",
  neutral: "border-l-border",
  rented: "border-l-status-rented",
};

export const statusLabel = (s: ViolationStatus) => VIOLATION_STATUS_LABELS[s];
export const typeLabel = (t: ViolationType) => VIOLATION_TYPE_LABELS[t];
export const responsibilityLabel = (r: ViolationResponsibility) =>
  RESPONSIBILITY_LABELS[r];
export const disputeLabel = (d: DisputeStatus) => DISPUTE_STATUS_LABELS[d];
export const sourceLabel = (s: ViolationSource) => VIOLATION_SOURCE_LABELS[s];
export const evidenceLabel = (e: ViolationEvidenceType) =>
  EVIDENCE_TYPE_LABELS[e];

export const ALL_TYPES = ALL_VIOLATION_TYPES;

export const TABS = [
  "open",
  "needs_review",
  "customer",
  "company",
  "disputed",
  "resolved",
  "all",
] as const;
export type ViolationTab = (typeof TABS)[number];

export const TAB_LABELS: Record<ViolationTab, string> = {
  open: "Open",
  needs_review: "Needs Review",
  customer: "Customer Responsibility",
  company: "Company Responsibility",
  disputed: "Disputed",
  resolved: "Paid / Resolved",
  all: "All",
};

export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono tabular" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
