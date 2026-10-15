// Connect Pro Fleet — seed: expense categories (Build #14 / Expenses V1).
// Split from seedExpenses to stay under the line limit.
//
// Expenses V1 expands this into a robust starter library organized under
// Vehicle / Fleet Expenses and Business / Overhead Expenses with parent-child
// hierarchy. Legacy category IDs (ec_maint, ec_parts, ec_tires, ec_fuel, etc.)
// are PRESERVED so seeded expenses and existing selectors keep resolving.
// New categories carry group + default settings metadata.

import type { ExpenseCategory } from "../expenseTypes";
import { TENANT_ID } from "./ids";

const T = "2026-01-01T00:00:00Z";

function cat(
  id: string,
  name: string,
  type: ExpenseCategory["type"],
  group: ExpenseCategory["group"],
  parent: string | null,
  opts: Partial<ExpenseCategory> = {},
): ExpenseCategory {
  return {
    id,
    tenant_id: TENANT_ID,
    name,
    type,
    group,
    parent_category_id: parent,
    active: true,
    created_at: T,
    default_scope:
      opts.default_scope ??
      (group === "vehicle" ? "vehicle" : "company_overhead"),
    receipt_required_default: opts.receipt_required_default ?? "optional",
    recurring_allowed: opts.recurring_allowed ?? true,
    multi_vehicle_allowed: opts.multi_vehicle_allowed ?? false,
  };
}

export const expenseCategories: ExpenseCategory[] = [
  // ===== Vehicle / Fleet Expenses =====
  // -- Maintenance & Repairs (parent: ec_maint) --
  cat("ec_maint", "Maintenance & Repairs", "maintenance", "vehicle", null, {
    multi_vehicle_allowed: false,
  }),
  cat(
    "ec_oil",
    "Oil / Routine Service",
    "vehicle_direct",
    "vehicle",
    "ec_maint",
  ),
  cat("ec_parts", "Parts", "vehicle_direct", "vehicle", "ec_maint", {
    multi_vehicle_allowed: true,
  }),
  cat("ec_tires", "Tires", "vehicle_direct", "vehicle", "ec_maint"),
  cat("ec_brakes", "Brakes", "vehicle_direct", "vehicle", "ec_maint"),
  cat("ec_battery", "Battery", "vehicle_direct", "vehicle", "ec_maint"),
  cat(
    "ec_engine",
    "Engine / Transmission",
    "vehicle_direct",
    "vehicle",
    "ec_maint",
  ),
  cat(
    "ec_suspension",
    "Suspension / Steering",
    "vehicle_direct",
    "vehicle",
    "ec_maint",
  ),
  cat("ec_electrical", "Electrical", "vehicle_direct", "vehicle", "ec_maint"),
  cat(
    "ec_body",
    "Body / Collision Repair",
    "vehicle_direct",
    "vehicle",
    "ec_maint",
  ),
  cat(
    "ec_glass",
    "Glass / Windshield",
    "vehicle_direct",
    "vehicle",
    "ec_maint",
  ),
  // -- Operating Costs --
  cat("ec_fuel", "Fuel", "vehicle_direct", "vehicle", null, {
    receipt_required_default: "optional",
  }),
  cat("ec_wash", "Car Wash", "vehicle_direct", "vehicle", null, {
    receipt_required_default: "not_required",
  }),
  cat(
    "ec_detailing",
    "Detailing / Cleaning",
    "vehicle_direct",
    "vehicle",
    null,
  ),
  cat("ec_towing", "Towing", "vehicle_direct", "vehicle", null),
  cat("ec_roadside", "Roadside Assistance", "vehicle_direct", "vehicle", null),
  cat("ec_parking", "Parking / Storage", "vehicle_direct", "vehicle", null),
  cat(
    "ec_transport",
    "Vehicle Transport / Delivery",
    "vehicle_direct",
    "vehicle",
    null,
  ),
  cat("ec_repo", "Repossession / Recovery", "vehicle_direct", "vehicle", null),
  cat("ec_keys", "Keys / Key Replacement", "vehicle_direct", "vehicle", null),
  cat(
    "ec_accessories",
    "Accessories / Equipment",
    "vehicle_direct",
    "vehicle",
    null,
    { multi_vehicle_allowed: true },
  ),
  // -- Ownership Costs --
  cat("ec_insurance", "Vehicle Insurance", "vehicle_direct", "vehicle", null, {
    recurring_allowed: true,
    multi_vehicle_allowed: true,
  }),
  cat("ec_registration", "Registration", "vehicle_direct", "vehicle", null, {
    recurring_allowed: true,
  }),
  cat("ec_title", "Title / Plates", "vehicle_direct", "vehicle", null),
  cat(
    "ec_vehicle_inspection",
    "Vehicle Inspection",
    "vehicle_direct",
    "vehicle",
    null,
  ),
  cat(
    "ec_car_note",
    "Vehicle Payment / Car Note",
    "vehicle_direct",
    "vehicle",
    null,
    { recurring_allowed: true },
  ),
  cat("ec_gps", "GPS / Telematics", "vehicle_direct", "vehicle", null, {
    recurring_allowed: true,
    multi_vehicle_allowed: true,
  }),
  // -- Loss / Incident Costs --
  cat("ec_damage", "Damage Cost", "vehicle_direct", "vehicle", null),
  cat(
    "ec_company_tolls",
    "Company-Paid Tolls / Violations",
    "vehicle_direct",
    "vehicle",
    null,
  ),
  // -- Other Vehicle --
  cat(
    "ec_other_vehicle",
    "Other Vehicle Expense",
    "vehicle_direct",
    "vehicle",
    null,
  ),

  // ===== Business / Overhead Expenses =====
  // -- People --
  cat("ec_payroll", "Payroll", "company_overhead", "overhead", null, {
    recurring_allowed: true,
    receipt_required_default: "not_required",
  }),
  cat(
    "ec_contractor",
    "Contractor / VA Labor",
    "company_overhead",
    "overhead",
    null,
  ),
  cat(
    "ec_benefits",
    "Employee Benefits",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat(
    "ec_commissions",
    "Sales / Commissions",
    "company_overhead",
    "overhead",
    null,
  ),
  // -- Office & Operations --
  cat("ec_rent", "Office Rent", "company_overhead", "overhead", null, {
    recurring_allowed: true,
    receipt_required_default: "optional",
  }),
  cat(
    "ec_storage_rent",
    "Storage / Yard Rent",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat("ec_utilities", "Utilities", "company_overhead", "overhead", null, {
    recurring_allowed: true,
  }),
  cat("ec_phone", "Phone / Internet", "company_overhead", "overhead", null, {
    recurring_allowed: true,
  }),
  cat(
    "ec_office_supplies",
    "Office Supplies",
    "company_overhead",
    "overhead",
    null,
  ),
  cat("ec_equipment", "Equipment", "company_overhead", "overhead", null),
  cat("ec_security", "Security", "company_overhead", "overhead", null, {
    recurring_allowed: true,
  }),
  cat(
    "ec_janitorial",
    "Cleaning / Janitorial",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat(
    "ec_shipping",
    "Shipping / Postage",
    "company_overhead",
    "overhead",
    null,
  ),
  // -- Technology --
  cat(
    "ec_software",
    "Software / Subscriptions",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  // -- Marketing --
  cat(
    "ec_marketing",
    "Advertising / Marketing",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat("ec_content", "Content / Creative", "company_overhead", "overhead", null),
  // -- Professional --
  cat(
    "ec_accounting",
    "Accounting / Bookkeeping",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat("ec_legal", "Legal", "company_overhead", "overhead", null),
  cat(
    "ec_professional",
    "Professional Fees",
    "company_overhead",
    "overhead",
    null,
  ),
  cat(
    "ec_licenses",
    "Licenses / Permits",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat(
    "ec_memberships",
    "Memberships / Dues",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat(
    "ec_training",
    "Training / Education",
    "company_overhead",
    "overhead",
    null,
  ),
  // -- Financial --
  cat(
    "ec_merchant_fees",
    "Merchant Processing Fees",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat("ec_bank_fees", "Bank Fees", "company_overhead", "overhead", null),
  cat(
    "ec_interest",
    "Interest / Financing Fees",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  // -- Business Operations --
  cat(
    "ec_business_insurance",
    "Business Insurance",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  cat("ec_travel", "Travel", "company_overhead", "overhead", null),
  cat("ec_meals", "Meals", "company_overhead", "overhead", null),
  cat(
    "ec_taxes",
    "Taxes / Government Fees",
    "company_overhead",
    "overhead",
    null,
    { recurring_allowed: true },
  ),
  // -- Adjustments --
  cat("ec_refund", "Refund / Adjustment", "company_overhead", "overhead", null),
  cat(
    "ec_other_overhead",
    "Other Overhead",
    "company_overhead",
    "overhead",
    null,
  ),
];
