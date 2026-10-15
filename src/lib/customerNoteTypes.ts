// Connect Pro Fleet — structured Customer Notes (Build #27).
//
// Structured internal operational notes attached to a customer. These are
// operational context (e.g. "Prefers pickup after 4 PM") — NOT protected or
// sensitive discriminatory profiling. Pinned notes stay visible at the top of
// the customer profile. Notes are append-style with basic edit tracking
// (updated_at / updated_by) — no full version engine required.
//
// Customer notes are a standalone tenant-scoped store slice (like compliance
// events) because the main fleet store module is at its size ceiling. They are
// NOT financial records, tasks, or notifications.

export type CustomerNoteType =
  "general" | "rental" | "payment" | "operational" | "document" | "follow_up";

export const CUSTOMER_NOTE_TYPE_LABELS: Record<CustomerNoteType, string> = {
  general: "General",
  rental: "Rental",
  payment: "Payment",
  operational: "Behavior / Operational",
  document: "Document",
  follow_up: "Follow-Up",
};

export interface CustomerNote {
  id: string;
  tenant_id: string;
  customer_id: string;
  text: string;
  type: CustomerNoteType;
  pinned: boolean;
  created_by: string | null; // staff id
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}
