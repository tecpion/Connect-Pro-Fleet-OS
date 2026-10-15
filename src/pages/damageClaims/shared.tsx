// Connect Pro Fleet — damage claims UI shared helpers (Build #17).

import type {
  DamageClaimStatus,
  DamageSeverity,
  DamageSource,
  ResponsibilityStatus,
} from "@/lib/damageClaimTypes";
import {
  DAMAGE_CLAIM_STATUS_LABELS,
  DAMAGE_CLAIM_STATUS_TONE,
  DAMAGE_SEVERITY_LABELS,
  DAMAGE_SEVERITY_TONE,
  DAMAGE_SOURCE_LABELS,
  RESPONSIBILITY_LABELS,
} from "@/lib/damageClaimTypes";

export const toneClass: Record<string, string> = {
  available: "border-l-status-available",
  maintenance: "border-l-status-maintenance",
  out: "border-l-status-out",
  neutral: "border-l-border",
  rented: "border-l-status-rented",
};

export const claimStatusTone = DAMAGE_CLAIM_STATUS_TONE;
export const severityTone = DAMAGE_SEVERITY_TONE;

export const CLAIM_STATUSES: DamageClaimStatus[] = [
  "open",
  "under_review",
  "customer_responsible",
  "insurance_pending",
  "repair_in_progress",
  "recovery_pending",
  "resolved",
  "closed",
  "cancelled",
];

export const DAMAGE_SOURCES: DamageSource[] = [
  "checkout_inspection",
  "checkin_inspection",
  "mid_rental_report",
  "accident",
  "incident",
  "staff_discovery",
  "customer_reported",
  "third_party",
  "other",
];

export const SEVERITIES: DamageSeverity[] = [
  "minor",
  "moderate",
  "major",
  "critical",
];

export const RESPONSIBILITY_STATUSES: ResponsibilityStatus[] = [
  "undetermined",
  "customer",
  "company",
  "third_party",
  "insurance",
  "shared",
  "not_chargeable",
];

export const statusLabel = (s: DamageClaimStatus) =>
  DAMAGE_CLAIM_STATUS_LABELS[s];
export const severityLabel = (s: DamageSeverity) => DAMAGE_SEVERITY_LABELS[s];
export const sourceLabel = (s: DamageSource) => DAMAGE_SOURCE_LABELS[s];
export const responsibilityLabel = (s: ResponsibilityStatus) =>
  RESPONSIBILITY_LABELS[s];

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
