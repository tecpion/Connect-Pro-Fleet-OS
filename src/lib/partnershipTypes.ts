// Connect Pro Fleet — partnership domain types (Build #7).
//
// A partnership is the guided Investor/JV setup result. It composes the existing
// Build #6 entities (Investor, InvestorVehicle pairing, Vehicle ownership,
// CompensationArrangement) plus two new lightweight concepts:
//
//   PartnerContribution  — what the partner brought into THIS deal (vehicle,
//                          cash, both, other). Agreement metadata only — never
//                          rental revenue, customer payment, or acquisition cost.
//
//   PartnershipExpenseRule — which expense categories affect the payout and
//                          how (deduct before split / investor pays / operator
//                          pays / shared-custom). Preserved as structured
//                          agreement metadata; the settlement engine consumes
//                          what it can safely represent and flags the rest.
//
// Ownership (asset fact) and compensation (business agreement) remain separate,
// exactly as in Build #6. A contribution never determines ownership, and
// ownership never determines compensation.

import type { CompensationArrangement } from "./ownershipTypes";
import type { VehicleOwnershipType } from "./ownershipTypes";

// ---------------------------------------------------------------------------
// Contribution
// ---------------------------------------------------------------------------

export type ContributionType =
  "vehicle" | "cash" | "vehicle_and_cash" | "other";

export const CONTRIBUTION_TYPE_LABELS: Record<ContributionType, string> = {
  vehicle: "Vehicle",
  cash: "Cash",
  vehicle_and_cash: "Vehicle + Cash",
  other: "Other",
};

export interface PartnerContribution {
  id: string;
  tenant_id: string;
  investor_id: string;
  vehicle_id: string | null; // null until the vehicle step links it
  contribution_type: ContributionType;
  cash_amount: number | null; // present when cash is involved
  vehicle_contribution: boolean; // true when a vehicle is contributed
  description: string | null; // free-text for "other" / context
  contribution_date: string; // ISO date
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

// ---------------------------------------------------------------------------
// Expense rules (agreement metadata)
// ---------------------------------------------------------------------------

export type ExpenseCategory =
  | "maintenance"
  | "repairs"
  | "parts"
  | "labor"
  | "tires"
  | "brakes"
  | "oil_service"
  | "towing"
  | "registration"
  | "insurance"
  | "gps"
  | "detailing"
  | "recovery"
  | "taxes_fees"
  | "other";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  maintenance: "Maintenance",
  repairs: "Repairs",
  parts: "Parts",
  labor: "Labor",
  tires: "Tires",
  brakes: "Brakes",
  oil_service: "Oil / Routine Service",
  towing: "Towing",
  registration: "Registration",
  insurance: "Insurance",
  gps: "GPS",
  detailing: "Detailing",
  recovery: "Recovery",
  taxes_fees: "Taxes / Government Fees",
  other: "Other",
};

// How a category is treated in the payout calculation.
export type ExpenseTreatment =
  | "deduct_before_split" // operator cost removed before the split (net basis)
  | "operator_pays" // rental company bears it (no investor impact)
  | "investor_pays" // investor bears it (reduces investor payout)
  | "shared_custom"; // custom split — preserved as metadata, not auto-calculated yet

export const EXPENSE_TREATMENT_LABELS: Record<ExpenseTreatment, string> = {
  deduct_before_split: "Deduct before split",
  operator_pays: "Rental company pays",
  investor_pays: "Investor pays",
  shared_custom: "Shared / Custom",
};

export interface PartnershipExpenseRule {
  id: string;
  tenant_id: string;
  pairing_id: string; // -> InvestorVehicle.id
  category: ExpenseCategory;
  treatment: ExpenseTreatment;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Partnership — the composed result of the wizard
// ---------------------------------------------------------------------------

// A partnership record links the pieces created by the wizard so they can be
// queried together and so legacy vs structured agreements are distinguishable.
export interface Partnership {
  id: string;
  tenant_id: string;
  investor_id: string;
  vehicle_id: string;
  pairing_id: string; // -> InvestorVehicle.id
  contribution_id: string | null; // -> PartnerContribution.id
  ownership_type: VehicleOwnershipType;
  compensation: CompensationArrangement;
  expense_rules: PartnershipExpenseRule[];
  structured: boolean; // true when created via the wizard (vs legacy seed)
  created_at: string;
  created_by: string | null;
}

// The full input to the atomic createPartnership orchestration. The wizard
// collects this shape across its steps and submits it as one operation so a
// partial state (investor created but pairing failed) can never persist.
export interface PartnershipInput {
  // Step 1 — partner
  partner: {
    mode: "new" | "existing";
    existingId?: string;
    new?: {
      full_name: string;
      email: string;
      phone: string;
      relationship: "family" | "external";
      joined_at: string;
    };
  };
  // Step 2 — contribution
  contribution: {
    contribution_type: ContributionType;
    cash_amount: number | null;
    vehicle_contribution: boolean;
    description: string | null;
    contribution_date: string;
    notes: string | null;
  } | null;
  // Step 3 — vehicle + ownership
  vehicle: {
    vehicle_id: string;
    ownership_type: VehicleOwnershipType;
    ownership_notes: string | null;
    transfer_existing: boolean; // true if replacing an existing active pairing
  };
  // Step 4 — compensation
  compensation: CompensationArrangement;
  // Step 5 — expense rules
  expense_rules: PartnershipExpenseRule[];
}
