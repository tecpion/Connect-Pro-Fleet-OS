// Connect Pro Fleet — Build #4 billing test fixtures.
// Shared factory helpers for the billing engine tests.

import type { BillingPeriod, RentalBillingConfig } from "@/lib/billingTypes";
import type { FinancialTransaction, RentalAgreement } from "@/lib/types";
import { periodDedupeKey } from "@/lib/billing";

export const TENANT = "tnt_test";

export function makeRental(
  over: Partial<RentalAgreement> = {},
): RentalAgreement {
  return {
    id: "rnt_1",
    tenant_id: TENANT,
    reservation_id: "res_1",
    customer_id: "cus_1",
    vehicle_id: "veh_1",
    agreement_number: "AGR-2026-000125",
    status: "active",
    checkout_date: "2026-08-24",
    checkout_time: "09:15",
    scheduled_return_date: "2026-09-07",
    scheduled_return_time: "17:00",
    actual_return_date: null,
    actual_return_time: null,
    rate_type: "weekly",
    rate_amount: 400,
    subtotal: 400,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 300,
    amount_paid: 0,
    balance_due: 400,
    mileage_out: 10000,
    mileage_in: null,
    fuel_out: 100,
    fuel_in: null,
    weekly_payment_day: "Monday",
    next_payment_due: "2026-08-31",
    payment_cutoff_time: "17:00",
    grace_period: 12,
    late_fee: 50,
    late_fee_applied: false,
    weeks_rented: 1,
    created_by: "stf_1",
    created_at: "2026-08-24T09:15:00Z",
    updated_at: "2026-08-24T09:15:00Z",
    ...over,
  };
}

export function charge(
  id: string,
  rentalId: string,
  amount: number,
  periodStart: string,
  txnType: FinancialTransaction["transaction_type"] = "weekly_rental_charge",
): FinancialTransaction {
  return {
    id,
    tenant_id: TENANT,
    rental_id: rentalId,
    reservation_id: "res_1",
    customer_id: "cus_1",
    vehicle_id: "veh_1",
    invoice_id: null,
    deposit_id: null,
    transaction_type: txnType,
    category: "charge",
    description: "Weekly rental",
    amount,
    direction: "charge",
    payment_method: null,
    external_transaction_id: null,
    status: "posted",
    effective_date: periodStart,
    created_at: "2026-08-24T09:15:00Z",
    created_by: "stf_1",
    notes: null,
    related_transaction_id: null,
    billing_period: periodStart,
    metadata: null,
  };
}

export function payment(
  id: string,
  rentalId: string,
  amount: number,
  date: string,
): FinancialTransaction {
  return {
    id,
    tenant_id: TENANT,
    rental_id: rentalId,
    reservation_id: "res_1",
    customer_id: "cus_1",
    vehicle_id: "veh_1",
    invoice_id: null,
    deposit_id: null,
    transaction_type: "card_payment",
    category: "payment",
    description: "Card payment",
    amount,
    direction: "payment",
    payment_method: "card",
    external_transaction_id: null,
    status: "posted",
    effective_date: date,
    created_at: "2026-08-24T09:20:00Z",
    created_by: "stf_1",
    notes: null,
    related_transaction_id: null,
    billing_period: null,
    metadata: null,
  };
}

export function credit(
  id: string,
  rentalId: string,
  amount: number,
  date: string,
): FinancialTransaction {
  return {
    id,
    tenant_id: TENANT,
    rental_id: rentalId,
    reservation_id: "res_1",
    customer_id: "cus_1",
    vehicle_id: "veh_1",
    invoice_id: null,
    deposit_id: null,
    transaction_type: "fee_waiver",
    category: "credit",
    description: "Waiver",
    amount,
    direction: "credit",
    payment_method: null,
    external_transaction_id: null,
    status: "posted",
    effective_date: date,
    created_at: "2026-08-24T09:20:00Z",
    created_by: "stf_1",
    notes: null,
    related_transaction_id: null,
    billing_period: null,
    metadata: null,
  };
}

export function makePeriod(over: Partial<BillingPeriod> = {}): BillingPeriod {
  return {
    id: "bp_1",
    tenant_id: TENANT,
    rental_id: "rnt_1",
    invoice_id: null,
    sequence_number: 1,
    period_start: "2026-08-24",
    period_end: "2026-08-30",
    due_at: "2026-08-24",
    billing_frequency: "weekly",
    rate_type: "weekly",
    base_amount: 400,
    additional_amount: 0,
    tax_amount: 0,
    fee_amount: 0,
    total_amount: 400,
    status: "upcoming",
    generated_at: "2026-08-24T09:00:00Z",
    paid_at: null,
    dedupe_key: periodDedupeKey("rnt_1", "2026-08-24", "2026-08-30"),
    source: "engine",
    transaction_id: "txn_1",
    fee_transaction_ids: [],
    tax_transaction_ids: [],
    late_fee_applied: false,
    created_at: "2026-08-24T09:00:00Z",
    updated_at: "2026-08-24T09:00:00Z",
    ...over,
  };
}

export function billingConfig(
  over: Partial<RentalBillingConfig> = {},
): RentalBillingConfig {
  return {
    billing_frequency: "weekly",
    billing_anchor_date: "2026-08-24",
    recurring_amount: 400,
    auto_generate_periods: true,
    custom_schedule: null,
    ...over,
  };
}
