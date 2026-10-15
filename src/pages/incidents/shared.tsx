import type {
  IncidentStatus,
  ViolationStatus,
  IncidentType,
  ResponsibleParty,
  IncidentPaymentStatus,
  ViolationType,
  ViolationPaymentStatus,
} from "@/lib/incidents";

// Status -> left-border accent tone (matches the app's status signaling).
export const incidentStatusTone: Record<
  IncidentStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  open: "out",
  in_review: "maintenance",
  resolved: "available",
  closed: "neutral",
};

export const violationStatusTone: Record<
  ViolationStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  pending_match: "out",
  pending_payment: "maintenance",
  billed: "maintenance",
  paid: "available",
  disputed: "out",
};

export const toneClass: Record<string, string> = {
  available: "border-l-status-available",
  maintenance: "border-l-status-maintenance",
  out: "border-l-status-out",
  neutral: "border-l-border",
};

export const INCIDENT_TYPES: IncidentType[] = [
  "accident",
  "theft",
  "damage_dispute",
  "breakdown",
  "other",
];
export const INCIDENT_STATUSES: IncidentStatus[] = [
  "open",
  "in_review",
  "resolved",
  "closed",
];
export const RESPONSIBLE_PARTIES: ResponsibleParty[] = [
  "renter",
  "staff",
  "third_party",
  "unknown",
];
export const INCIDENT_PAY_STATUSES: IncidentPaymentStatus[] = [
  "pending",
  "collected",
  "waived",
  "insurance_claim",
];

export const VIOLATION_TYPES: ViolationType[] = [
  "speeding",
  "toll",
  "parking",
  "red_light",
  "other",
];
export const VIOLATION_STATUSES: ViolationStatus[] = [
  "pending_match",
  "pending_payment",
  "billed",
  "paid",
  "disputed",
];
export const RENTER_PAY_STATUSES: ViolationPaymentStatus[] = [
  "pending",
  "billed",
  "paid",
  "waived",
];

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
