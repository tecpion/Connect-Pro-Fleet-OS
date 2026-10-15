// Connect Pro Fleet — operational security deposit types (Build #8).
//
// A security deposit is NOT rental revenue when collected. It is held money
// until it is refunded, applied to a legitimate charge, partially applied,
// or forfeited. The ledger remains the financial source of truth; a
// RentalDeposit is the operational lifecycle record that tracks what happened
// to every dollar of a deposit across a reservation/rental.
//
// Policy (Settings > Security Deposits) is the template. RentalDeposit is the
// snapshot of the actual obligation for one reservation/rental — frozen at
// booking/checkout so later policy changes never alter historical deposits.

import type { PaymentMethod } from "./chargeTypes";

// ---------------------------------------------------------------------------
// Deposit statuses (operational lifecycle)
// ---------------------------------------------------------------------------

export type DepositStatus =
  | "required"
  | "pending"
  | "collected"
  | "held"
  | "partially_applied"
  | "fully_applied"
  | "refund_pending"
  | "partially_refunded"
  | "refunded"
  | "forfeited"
  | "cancelled";

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  required: "Required",
  pending: "Pending",
  collected: "Collected",
  held: "Held",
  partially_applied: "Partially Applied",
  fully_applied: "Fully Applied",
  refund_pending: "Refund Pending",
  partially_refunded: "Partially Refunded",
  refunded: "Refunded",
  forfeited: "Forfeited",
  cancelled: "Cancelled",
};

// Tone for left-border / pill treatments (maps to existing status semantics).
export const DEPOSIT_STATUS_TONE: Record<
  DepositStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  required: "maintenance",
  pending: "maintenance",
  collected: "available",
  held: "available",
  partially_applied: "maintenance",
  fully_applied: "maintenance",
  refund_pending: "maintenance",
  partially_refunded: "maintenance",
  refunded: "neutral",
  forfeited: "out",
  cancelled: "neutral",
};

// ---------------------------------------------------------------------------
// Deposit history event types (immutable audit trail)
// ---------------------------------------------------------------------------

export type DepositEventType =
  | "required"
  | "collected"
  | "held"
  | "applied"
  | "refund_pending"
  | "refunded"
  | "forfeited"
  | "overridden"
  | "cancelled"
  | "reversed";

export const DEPOSIT_EVENT_LABELS: Record<DepositEventType, string> = {
  required: "Deposit required",
  collected: "Deposit collected",
  held: "Deposit held",
  applied: "Deposit applied to charges",
  refund_pending: "Refund pending",
  refunded: "Deposit refunded",
  forfeited: "Deposit forfeited",
  overridden: "Deposit requirement overridden",
  cancelled: "Deposit cancelled",
  reversed: "Deposit action reversed",
};

export interface DepositHistoryEvent {
  id: string;
  tenant_id: string;
  deposit_id: string;
  event_type: DepositEventType;
  amount: number; // amount involved in this event (0 for status-only)
  payment_method?: PaymentMethod | null;
  transaction_id?: string | null; // linked ledger transaction
  reason?: string | null;
  staff_id?: string | null;
  at: string;
  request_key?: string | null; // idempotency key for money-moving events
}

// ---------------------------------------------------------------------------
// RentalDeposit — the operational lifecycle record
// ---------------------------------------------------------------------------

export interface RentalDeposit {
  id: string;
  tenant_id: string;
  reservation_id: string | null;
  rental_id: string | null; // null until converted
  customer_id: string;
  vehicle_id: string | null;
  policy_id: string | null; // -> DepositPolicy.id (snapshot source)
  required_amount: number; // snapshotted at creation
  collected_amount: number; // sum of collection transactions
  applied_amount: number; // sum applied to charges
  refunded_amount: number; // sum refunded
  forfeited_amount: number; // sum forfeited
  status: DepositStatus;
  currency: string;
  source_snapshot: {
    source: "vehicle_override" | "class" | "company_default" | "manual";
    policy_name?: string | null;
    class_name?: string | null;
  };
  collected_at: string | null;
  refund_due_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ---------------------------------------------------------------------------
// Forfeiture reasons
// ---------------------------------------------------------------------------

export type ForfeitureReason =
  | "damage"
  | "cleaning"
  | "fuel"
  | "late_return"
  | "contract_violation"
  | "abandonment"
  | "other";

export const FORFEITURE_REASON_LABELS: Record<ForfeitureReason, string> = {
  damage: "Damage",
  cleaning: "Cleaning",
  fuel: "Fuel",
  late_return: "Late return",
  contract_violation: "Contract violation",
  abandonment: "Abandonment",
  other: "Other",
};
