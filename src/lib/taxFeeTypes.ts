// Connect Pro Fleet — Taxes & Fees domain types (Build #9).
//
// Taxes and fees are financial obligations. When assessed they become
// legitimate ledger charges (transaction_type tax_charge / fee_charge) carrying
// a rule snapshot in metadata so historical postings never change when Settings
// are edited later.
//
// TAX ≠ FEE: a tax is government-imposed; a fee is company-imposed. They are
// modelled separately so reporting can distinguish company-earned revenue (fees)
// from tax liability (taxes collected on behalf of a jurisdiction).

// A first-class charge category. Taxable base determination and reporting both
// key off this rather than parsing line-item text. Deposit movements carry
// their own deposit_kind and are never taxable charge lines.
export type ChargeCategory =
  | "rental_rate"
  | "addon"
  | "administrative_fee"
  | "delivery"
  | "fuel"
  | "mileage"
  | "cleaning"
  | "damage"
  | "late_fee"
  | "deposit_forfeiture"
  | "tax"
  | "other";

export const CHARGE_CATEGORY_LABELS: Record<ChargeCategory, string> = {
  rental_rate: "Rental Rate",
  addon: "Add-On",
  administrative_fee: "Administrative Fee",
  delivery: "Delivery",
  fuel: "Fuel",
  mileage: "Mileage",
  cleaning: "Cleaning",
  damage: "Damage",
  late_fee: "Late Fee",
  deposit_forfeiture: "Deposit Forfeiture",
  tax: "Tax",
  other: "Other",
};

// Categories that are NEVER taxable by default — deposit movements are held
// money, not rental revenue, so no tax attaches to collection/application/
// refund. The legitimate underlying charge may itself be taxable.
export const NON_TAXABLE_CATEGORIES: ChargeCategory[] = ["tax"];

export type TaxCalculationType = "percentage" | "flat";

export interface TaxRule {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  calculation_type: TaxCalculationType;
  rate: number; // percentage when calculation_type === "percentage" (e.g. 6 = 6%)
  flat_amount: number; // when calculation_type === "flat"
  taxable_categories: ChargeCategory[]; // which charge categories this tax applies to
  excluded_categories: ChargeCategory[]; // explicit exclusions (evaluated after inclusions)
  location_ids: string[]; // empty = all locations
  active: boolean;
  effective_date: string;
  end_date: string | null;
  priority: number; // lower = applied first (display order)
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type FeeCalculationType = "flat" | "percentage";
export type FeeFrequency =
  | "one_time"
  | "per_day"
  | "per_rental_period"
  | "per_billing_period"
  | "triggered";
export type FeeTrigger =
  | "reservation"
  | "checkout"
  | "rental_start"
  | "billing_period"
  | "extension"
  | "return"
  | "manual";

export const FEE_FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  one_time: "One Time",
  per_day: "Per Day",
  per_rental_period: "Per Rental Period",
  per_billing_period: "Per Billing Period",
  triggered: "Triggered",
};

export const FEE_TRIGGER_LABELS: Record<FeeTrigger, string> = {
  reservation: "Reservation",
  checkout: "Checkout",
  rental_start: "Rental Start",
  billing_period: "Billing Period",
  extension: "Extension",
  return: "Return",
  manual: "Manual / Event-Based",
};

export interface FeeRule {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  calculation_type: FeeCalculationType;
  amount: number; // flat amount when calculation_type === "flat"
  rate: number; // percentage when calculation_type === "percentage"
  percentage_base: ChargeCategory[]; // what a percentage fee is calculated from
  frequency: FeeFrequency;
  trigger: FeeTrigger;
  charge_category: ChargeCategory; // categorizes the resulting charge
  taxable: boolean; // whether tax applies to this fee
  waivable: boolean;
  amount_override_allowed: boolean;
  location_ids: string[]; // empty = all locations
  include_in_vehicle_revenue: boolean; // investor eligibility
  active: boolean;
  effective_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Immutable snapshot stored on each posted tax/fee transaction so historical
// postings can be explained without depending on the current mutable rule.
export interface TaxRuleSnapshot {
  rule_id: string;
  rule_name: string;
  calculation_type: TaxCalculationType;
  rate: number;
  flat_amount: number;
  taxable_base: number;
  calculated_amount: number;
  location_id: string | null;
  effective_date: string;
  assessed_at: string;
}

export interface FeeRuleSnapshot {
  rule_id: string;
  rule_name: string;
  calculation_type: FeeCalculationType;
  amount: number;
  rate: number;
  frequency: FeeFrequency;
  trigger: FeeTrigger;
  charge_category: ChargeCategory;
  taxable: boolean;
  calculated_amount: number;
  effective_date: string;
  assessed_at: string;
}

// A single calculated tax line.
export interface TaxLine {
  rule_id: string;
  rule_name: string;
  amount: number;
  snapshot: TaxRuleSnapshot;
}

// A single calculated fee line.
export interface FeeLine {
  rule_id: string;
  rule_name: string;
  amount: number;
  charge_category: ChargeCategory;
  taxable: boolean;
  snapshot: FeeRuleSnapshot;
}

// A charge line fed into the tax engine.
export interface ChargeLine {
  category: ChargeCategory;
  amount: number;
  description: string;
}
