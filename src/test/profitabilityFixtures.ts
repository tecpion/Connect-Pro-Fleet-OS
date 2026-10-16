// Connect Pro Fleet — profitability domain test fixtures (Build #16).

import type { FinancialTransaction } from "@/lib/chargeTypes";
import type {
  ExpenseTransaction,
  ExpenseLineItem,
  ExpenseCategory,
} from "@/lib/expenseTypes";
import type {
  RentalAgreement,
  Vehicle,
  VehicleClass,
  Location,
} from "@/lib/types";
import type { RentalVehicleExchange } from "@/lib/store/storeContext";
import type { InvestorVehicle } from "@/lib/investorTypes";
import type { ProfitabilityInputs } from "@/lib/profitabilitySelectors";

export const TENANT = "tnt_test";

export function txn(over: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: "tx_" + Math.random().toString(36).slice(2, 8),
    tenant_id: TENANT,
    rental_id: "rnt_1",
    customer_id: "cus_1",
    transaction_type: "rental_charge",
    category: "charge",
    description: "test",
    amount: 100,
    direction: "charge",
    status: "posted",
    effective_date: "2026-08-15",
    created_at: "2026-08-15T00:00:00Z",
    created_by: null,
    ...over,
  };
}

export function expense(over: Partial<ExpenseTransaction>): ExpenseTransaction {
  return {
    id: "exp_" + Math.random().toString(36).slice(2, 8),
    tenant_id: TENANT,
    expense_number: "EXP-2026-000001",
    transaction_date: "2026-08-15",
    entered_at: "2026-08-15T00:00:00Z",
    entered_by_user_id: null,
    description: "test",
    memo: null,
    amount: 100,
    currency: "USD",
    expense_category_id: "cat_maint",
    vendor_id: null,
    payment_method: "cash",
    payment_source: null,
    processor: null,
    paid_by_type: "company",
    paid_by_user_id: null,
    reimbursement_status: "not_required",
    location_id: null,
    vehicle_id: "veh_1",
    rental_id: null,
    maintenance_work_order_id: null,
    receipt_status: "not_required",
    receipt_required: false,
    no_receipt_reason: null,
    status: "posted",
    reversal_of: null,
    source: "manual",
    dedupe_key: null,
    reconciled_imported_id: null,
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
    ...over,
  };
}

export function vehicle(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "veh_1",
    vin: "TESTVIN",
    make: "Toyota",
    model: "Camry",
    year: 2020,
    license_plate: "FL-TEST",
    status: "available",
    location: "Main Lot",
    vehicle_type: "car",
    vehicle_class_id: "cls_1",
    daily_rate: 50,
    weekly_rate: 350,
    deposit_amount: 300,
    images: [],
    documents: [],
    purchase_date: "2020-01-01",
    purchase_price: 20000,
    current_mileage: 50000,
    insurance_policy_number: "POL",
    insurance_expiry: "2027-01-01",
    registration_expiry: "2027-01-01",
    tenant_id: TENANT,
    created_at: "2020-01-01T00:00:00Z",
    updated_at: "2020-01-01T00:00:00Z",
    ownership_type: "company_owned",
    ...over,
  };
}

export function rental(over: Partial<RentalAgreement> = {}): RentalAgreement {
  return {
    id: "rnt_1",
    tenant_id: TENANT,
    reservation_id: null,
    customer_id: "cus_1",
    vehicle_id: "veh_1",
    agreement_number: "AGR-2026-0001",
    status: "active",
    checkout_date: "2026-08-10",
    checkout_time: "09:00",
    scheduled_return_date: "2026-08-20",
    scheduled_return_time: "17:00",
    actual_return_date: null,
    actual_return_time: null,
    rate_type: "weekly",
    rate_amount: 350,
    subtotal: 350,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 300,
    amount_paid: 0,
    balance_due: 350,
    mileage_out: 50000,
    mileage_in: null,
    fuel_out: 100,
    fuel_in: null,
    weekly_payment_day: "Monday",
    next_payment_due: null,
    payment_cutoff_time: "17:00",
    grace_period: 12,
    late_fee: 50,
    late_fee_applied: false,
    weeks_rented: 1,
    created_by: null,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...over,
  };
}

export function inputs(
  over: Partial<ProfitabilityInputs> = {},
): ProfitabilityInputs {
  return {
    transactions: [],
    expenses: [],
    expenseLineItems: [],
    expenseCategories: [],
    feeRules: [],
    vehicles: [vehicle()],
    vehicleClasses: [
      {
        id: "cls_1",
        name: "Midsize",
        tenant_id: TENANT,
        description: "",
        daily_rate: 50,
        weekly_rate: 350,
        minimum_rental_duration: 1,
        minimum_rental_unit: "day",
        default_deposit_policy_id: null,
        active: true,
        display_order: 1,
        created_at: "",
        updated_at: "",
        created_by: null,
      },
    ],
    locations: [
      {
        id: "loc_1",
        name: "Main Lot",
        tenant_id: TENANT,
        address: "",
        phone: "",
        timezone: "America/New_York",
      } as Location,
    ],
    rentals: [rental()],
    exchanges: [],
    investorVehicles: [],
    importedTransactions: [],
    expenseReceipts: [],
    expenseReimbursements: [],
    ...over,
  };
}

export function makeExchange(
  over: Partial<RentalVehicleExchange> = {},
): RentalVehicleExchange {
  return {
    id: "ex_1",
    tenant_id: TENANT,
    rental_id: "rnt_ex",
    customer_id: "cus_1",
    old_vehicle_id: "veh_1",
    new_vehicle_id: "veh_2",
    exchange_at: "2026-08-15T00:00:00Z",
    reason: "mechanical",
    old_mileage_in: 0,
    old_fuel_in: 0,
    new_mileage_out: 0,
    new_fuel_out: 0,
    old_vehicle_disposition: "maintenance",
    rate_changed: false,
    old_rate: 0,
    new_rate: null,
    created_by: null,
    created_at: "",
    ...over,
  };
}

export function makePairing(
  over: Partial<InvestorVehicle> = {},
): InvestorVehicle {
  return {
    id: "iv_1",
    tenant_id: TENANT,
    investor_id: "inv_1",
    vehicle_id: "veh_1",
    ownership_type: "owned",
    revenue_split_investor_pct: 60,
    revenue_split_operator_pct: 40,
    agreement_id: null,
    active: true,
    effective_date: "2026-01-01",
    ...over,
  };
}

export function makeCategory(
  id: string,
  name: string,
  type: string,
): ExpenseCategory {
  return {
    id,
    name,
    tenant_id: TENANT,
    type: type as ExpenseCategory["type"],
    parent_category_id: null,
    active: true,
    created_at: "",
  } as ExpenseCategory;
}
