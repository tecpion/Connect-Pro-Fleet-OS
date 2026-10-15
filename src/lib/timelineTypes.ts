// Connect Pro Fleet — unified timeline types (Build #27).
//
// Customer 360 and the Fleet Digital Twin are AGGREGATION + INTELLIGENCE layers,
// NOT new source-of-truth stores. The unified timeline is DERIVED from existing
// module events via normalizers — we never copy every event into a second
// permanent timeline store. Future backend may materialize this for performance;
// for now it is derived on demand.
//
// Financial privacy: timeline events carry financial_amount/direction ONLY for
// permission-gated rendering. A viewer without financial permission sees
// "Payment recorded" but the amount is stripped by the permission filter before
// rendering. Sensitive document numbers are masked (Build #26 rules) and never
// placed raw in metadata.

export type TimelineCategory =
  | "rental"
  | "reservation"
  | "payment"
  | "billing"
  | "deposit"
  | "damage"
  | "maintenance"
  | "violation"
  | "compliance"
  | "document"
  | "task"
  | "assignment"
  | "expense"
  | "note"
  | "system";

export const TIMELINE_CATEGORY_LABELS: Record<TimelineCategory, string> = {
  rental: "Rentals",
  reservation: "Reservations",
  payment: "Payments",
  billing: "Billing",
  deposit: "Deposits",
  damage: "Damage",
  maintenance: "Maintenance",
  violation: "Violations",
  compliance: "Compliance",
  document: "Documents",
  task: "Tasks",
  assignment: "Assignments",
  expense: "Expenses",
  note: "Notes",
  system: "System",
};

export type TimelineSeverity = "info" | "success" | "warning" | "critical";

/** A single normalized event in the unified timeline. */
export interface UnifiedTimelineEvent {
  /** Stable id (source_module + ":" + source id + ":" + event type). */
  id: string;
  occurred_at: string;
  event_type: string;
  category: TimelineCategory;
  title: string;
  description: string | null;
  entity_type: string;
  entity_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  source_module: string;
  actor_id: string | null;
  actor_name: string | null;
  financial_amount: number | null;
  financial_direction: "in" | "out" | null;
  severity: TimelineSeverity;
  status: string | null;
  deep_link: string | null;
  metadata: Record<string, unknown> | null;
  /** True when the event references sensitive data (DL, policy #). The raw
   *  sensitive value is masked in metadata; this flag lets the UI gate file
   *  access behind documents.view_sensitive. */
  sensitive: boolean;
  customer_id: string | null;
  vehicle_id: string | null;
  rental_id: string | null;
}

export type TimelineSortOrder = "newest" | "oldest";

/** Category filter chips for the Customer 360 timeline (spec §7). */
export const CUSTOMER_TIMELINE_CATEGORIES: TimelineCategory[] = [
  "rental",
  "reservation",
  "payment",
  "billing",
  "deposit",
  "damage",
  "violation",
  "compliance",
  "document",
  "task",
  "assignment",
  "note",
];

/** Category filter chips for the Vehicle Digital Twin timeline (spec §7). */
export const VEHICLE_TIMELINE_CATEGORIES: TimelineCategory[] = [
  "rental",
  "payment",
  "billing",
  "damage",
  "maintenance",
  "violation",
  "compliance",
  "document",
  "expense",
  "task",
];
