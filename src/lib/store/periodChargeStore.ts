// Connect Pro Fleet — billing-period charge posting (Build #9 cleanup).
//
// Posts a BillingPeriod's full obligation: base rental charge + per-billing-
// period fees + applicable taxes. Each component posts as its own ledger
// charge linked to the period via metadata.billing_period_id, so the period's
// total obligation = sum of its linked charges (authoritative). Idempotent:
// re-running for the same period never duplicates any component.
//
// Only fees whose frequency applies to a billing period (per_billing_period or
// per_day scaled by period days) are included — one-time/start fees are NOT
// reposted here. Triggered fees are never auto-posted.

import {
  calculateFee,
  calculateTaxes,
  roundMoney,
  type FeeContext,
} from "../taxEngine";
import type { ChargeLine, FeeRuleSnapshot } from "../taxFeeTypes";
import type { FinancialTransaction } from "../types";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export function buildPeriodChargeMethods(s: StoreState) {
  function postFeeCharge(input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    ruleId: string;
    amount: number;
    chargeCategory: ChargeLine["category"];
    snapshot: FeeRuleSnapshot;
    description?: string;
    effectiveDate?: string;
    billingPeriod?: string | null;
    billingPeriodId?: string | null;
    includeInVehicleRevenue: boolean;
    chargeGroupId?: string;
    idempotencyKey?: string;
  }): string {
    if (input.idempotencyKey) {
      const existing = s.transactions.find(
        (t) =>
          t.metadata?.fee_idempotency_key === input.idempotencyKey &&
          t.status === "posted",
      );
      if (existing) return existing.id;
    }
    const now = new Date().toISOString();
    const txn: FinancialTransaction = {
      id: uid("txn"),
      tenant_id: TENANT_ID,
      rental_id: input.rentalId,
      reservation_id: input.reservationId ?? null,
      customer_id: input.customerId,
      vehicle_id: input.vehicleId ?? null,
      invoice_id: null,
      deposit_id: null,
      transaction_type: "fee_charge",
      category: "charge",
      description: input.description ?? input.snapshot.rule_name,
      amount: roundMoney(input.amount),
      direction: "charge",
      payment_method: null,
      external_transaction_id: null,
      status: "posted",
      effective_date: input.effectiveDate ?? now.slice(0, 10),
      created_at: now,
      created_by: s.currentStaffId,
      notes: null,
      related_transaction_id: null,
      billing_period: input.billingPeriod ?? null,
      metadata: {
        fee_rule_snapshot: input.snapshot,
        charge_category: input.chargeCategory,
        charge_group_id: input.chargeGroupId ?? null,
        include_in_vehicle_revenue: input.includeInVehicleRevenue,
        fee_idempotency_key: input.idempotencyKey ?? null,
        billing_period_id: input.billingPeriodId ?? input.billingPeriod ?? null,
      },
    };
    s.setTransactions((ts) => [...ts, txn]);
    return txn.id;
  }

  function postTaxCharge(input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    ruleId: string;
    amount: number;
    snapshot: import("../taxFeeTypes").TaxRuleSnapshot;
    description?: string;
    effectiveDate?: string;
    billingPeriod?: string | null;
    billingPeriodId?: string | null;
    chargeGroupId?: string;
    idempotencyKey?: string;
  }): string {
    if (input.idempotencyKey) {
      const existing = s.transactions.find(
        (t) =>
          t.metadata?.tax_idempotency_key === input.idempotencyKey &&
          t.status === "posted",
      );
      if (existing) return existing.id;
    }
    const now = new Date().toISOString();
    const txn: FinancialTransaction = {
      id: uid("txn"),
      tenant_id: TENANT_ID,
      rental_id: input.rentalId,
      reservation_id: input.reservationId ?? null,
      customer_id: input.customerId,
      vehicle_id: input.vehicleId ?? null,
      invoice_id: null,
      deposit_id: null,
      transaction_type: "tax_charge",
      category: "charge",
      description: input.description ?? `Tax — ${input.snapshot.rule_name}`,
      amount: roundMoney(input.amount),
      direction: "charge",
      payment_method: null,
      external_transaction_id: null,
      status: "posted",
      effective_date: input.effectiveDate ?? now.slice(0, 10),
      created_at: now,
      created_by: s.currentStaffId,
      notes: null,
      related_transaction_id: null,
      billing_period: input.billingPeriod ?? null,
      metadata: {
        tax_rule_snapshot: input.snapshot,
        charge_category: "tax",
        charge_group_id: input.chargeGroupId ?? null,
        tax_idempotency_key: input.idempotencyKey ?? null,
        billing_period_id: input.billingPeriodId ?? input.billingPeriod ?? null,
      },
    };
    s.setTransactions((ts) => [...ts, txn]);
    return txn.id;
  }

  function postPeriodCharges(input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    locationId?: string | null;
    effectiveDate: string;
    billingPeriodId: string;
    periodStart: string;
    periodEnd: string;
    baseAmount: number;
    periodDays: number;
    taxExempt?: boolean;
  }): {
    baseTxnId: string | null;
    feeTxnIds: string[];
    taxTxnIds: string[];
    feeTotal: number;
    taxTotal: number;
  } {
    const chargeGroupId = uid("grp");
    const feeTxnIds: string[] = [];
    const taxTxnIds: string[] = [];
    let feeTotal = 0;
    let taxTotal = 0;

    // 1. Base rental charge (idempotent per period).
    const baseKey = `period|${input.billingPeriodId}|base`;
    const baseExisting = s.transactions.find(
      (t) => t.metadata?.period_base_key === baseKey && t.status === "posted",
    );
    let baseTxnId: string | null = null;
    if (baseExisting) {
      baseTxnId = baseExisting.id;
    } else if (input.baseAmount > 0) {
      const now = new Date().toISOString();
      const txn: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: input.rentalId,
        reservation_id: input.reservationId ?? null,
        customer_id: input.customerId,
        vehicle_id: input.vehicleId ?? null,
        invoice_id: null,
        deposit_id: null,
        transaction_type: "rental_charge",
        category: "charge",
        description: `Rental — ${input.periodStart} → ${input.periodEnd}`,
        amount: roundMoney(input.baseAmount),
        direction: "charge",
        payment_method: null,
        external_transaction_id: null,
        status: "posted",
        effective_date: input.effectiveDate,
        created_at: now,
        created_by: s.currentStaffId,
        notes: null,
        related_transaction_id: null,
        billing_period: input.periodStart,
        metadata: {
          billing_period_id: input.billingPeriodId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          charge_group_id: chargeGroupId,
          period_base_key: baseKey,
        },
      };
      s.setTransactions((ts) => [...ts, txn]);
      baseTxnId = txn.id;
    }

    // 2. Per-billing-period + per-day fees (NOT one-time, NOT triggered).
    const baseCharges: ChargeLine[] = [
      {
        category: "rental_rate",
        amount: roundMoney(input.baseAmount),
        description: "Rental",
      },
    ];
    const feeCtx: FeeContext = {
      tenant_id: TENANT_ID,
      location_id: input.locationId ?? null,
      effective_date: input.effectiveDate,
      trigger: "billing_period",
      rental_days: input.periodDays,
      base_charges: baseCharges,
    };
    const applicableFees = s.feeRules.filter(
      (r) =>
        r.tenant_id === TENANT_ID &&
        r.active &&
        r.trigger === "billing_period" &&
        (r.frequency === "per_billing_period" || r.frequency === "per_day"),
    );
    for (const rule of applicableFees) {
      const amount = calculateFee(rule, feeCtx);
      if (amount <= 0) continue;
      const feeKey = `period|${input.billingPeriodId}|fee|${rule.id}`;
      const snapshot: FeeRuleSnapshot = {
        rule_id: rule.id,
        rule_name: rule.name,
        calculation_type: rule.calculation_type,
        amount: rule.amount,
        rate: rule.rate,
        frequency: rule.frequency,
        trigger: rule.trigger,
        charge_category: rule.charge_category,
        taxable: rule.taxable,
        calculated_amount: amount,
        effective_date: rule.effective_date,
        assessed_at: new Date().toISOString(),
      };
      const id = postFeeCharge({
        rentalId: input.rentalId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        reservationId: input.reservationId,
        ruleId: rule.id,
        amount,
        chargeCategory: rule.charge_category,
        snapshot,
        chargeGroupId,
        billingPeriod: input.periodStart,
        billingPeriodId: input.billingPeriodId,
        includeInVehicleRevenue: rule.include_in_vehicle_revenue,
        idempotencyKey: feeKey,
      });
      feeTxnIds.push(id);
      feeTotal = roundMoney(feeTotal + amount);
      if (rule.taxable) {
        baseCharges.push({
          category: rule.charge_category,
          amount,
          description: rule.name,
        });
      }
    }

    // 3. Taxes on (base + taxable per-period fees).
    if (!input.taxExempt) {
      const { lines: taxLines } = calculateTaxes(s.taxRules, {
        tenant_id: TENANT_ID,
        location_id: input.locationId ?? null,
        effective_date: input.effectiveDate,
        charges: baseCharges,
      });
      for (const t of taxLines) {
        const taxKey = `period|${input.billingPeriodId}|tax|${t.rule_id}`;
        const id = postTaxCharge({
          rentalId: input.rentalId,
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          reservationId: input.reservationId,
          ruleId: t.rule_id,
          amount: t.amount,
          snapshot: t.snapshot,
          chargeGroupId,
          billingPeriod: input.periodStart,
          billingPeriodId: input.billingPeriodId,
          idempotencyKey: taxKey,
        });
        taxTxnIds.push(id);
        taxTotal = roundMoney(taxTotal + t.amount);
      }
    }

    return { baseTxnId, feeTxnIds, taxTxnIds, feeTotal, taxTotal };
  }

  return { postPeriodCharges };
}
