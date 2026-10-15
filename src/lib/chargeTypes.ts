// Connect Pro Fleet — financial transaction charge types.
// Extracted from types.ts to keep each module focused. Adds incident_charge
// and violation_charge so incidents/violations bill through the shared ledger
// rather than a separate system. types.ts re-exports these for compatibility.

export type TransactionDirection = "charge" | "payment" | "credit" | "refund";

// CHARGES
export type ChargeType =
  | "rental_charge"
  | "weekly_rental_charge"
  | "late_fee"
  | "damage_charge"
  | "cleaning_fee"
  | "fuel_charge"
  | "mileage_charge"
  | "ticket_charge"
  | "toll_charge"
  | "exchange_fee"
  | "maintenance_customer_charge"
  | "miscellaneous_charge"
  | "incident_charge"
  | "violation_charge"
  | "tax_charge"
  | "fee_charge"
  | "migration_opening_balance";

// PAYMENTS
export type PaymentType =
  | "card_payment"
  | "cash_payment"
  | "ach_payment"
  | "zelle_payment"
  | "cashapp_payment"
  | "external_payment"
  | "other_payment";

// ADJUSTMENTS
export type AdjustmentType =
  "credit" | "discount" | "fee_waiver" | "write_off" | "manual_adjustment";

// REFUNDS
export type RefundType = "refund";

export type TransactionType =
  ChargeType | PaymentType | AdjustmentType | RefundType;

export type PaymentMethod =
  "card" | "cash" | "ach" | "zelle" | "cashapp" | "external" | "other";

export type TransactionStatus = "posted" | "voided";

export interface FinancialTransaction {
  id: string;
  tenant_id: string;
  rental_id: string;
  reservation_id?: string | null;
  customer_id: string;
  vehicle_id?: string | null;
  invoice_id?: string | null;
  deposit_id?: string | null;
  transaction_type: TransactionType;
  category: "charge" | "payment" | "credit" | "refund";
  description: string;
  amount: number;
  direction: TransactionDirection;
  payment_method?: PaymentMethod | null;
  external_transaction_id?: string | null;
  status: TransactionStatus;
  effective_date: string;
  created_at: string;
  created_by: string | null;
  notes?: string | null;
  related_transaction_id?: string | null;
  billing_period?: string | null;
  metadata?: Record<string, unknown> | null;
}
