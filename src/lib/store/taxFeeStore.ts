// Connect Pro Fleet — tax & fee store methods (Build #9).
// CRUD for rules + authoritative assessment/posting. Taxes/fees post as
// ledger charges (tax_charge/fee_charge) with a rule snapshot so historical
// postings never change when Settings are edited. Idempotency via stable
// source keys. Deposit movements carry deposit_kind and are never tax/fees.

import { fmtMoney } from "../format";
import {
  calculateFees,
  calculateTaxes,
  resolveTriggeredFee,
  roundMoney,
  type FeeContext,
} from "../taxEngine";
import type {
  ChargeCategory,
  ChargeLine,
  FeeRule,
  FeeRuleSnapshot,
  FeeTrigger,
  TaxRule,
  TaxRuleSnapshot,
} from "../taxFeeTypes";
import type { FinancialTransaction } from "../types";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export function buildTaxFeeMethods(s: StoreState) {
  function logSettings(
    action: string,
    detail?: string,
    old_value?: string | null,
    new_value?: string | null,
  ) {
    const now = new Date().toISOString();
    s.setSettingsAudit((a) => [
      {
        id: uid("aud"),
        tenant_id: TENANT_ID,
        at: now,
        actor_id: s.currentStaffId,
        action,
        detail: detail ?? null,
        old_value: old_value ?? null,
        new_value: new_value ?? null,
      },
      ...a,
    ]);
    s.setActivity((act) =>
      [
        { id: uid("act"), at: now, label: action, tone: "neutral" as const },
        ...act,
      ].slice(0, 30),
    );
  }

  // --- Tax rule CRUD ---
  function addTaxRule(r: TaxRule) {
    s.setTaxRules((rs) => [...rs, r]);
    logSettings("Tax rule created", r.name);
  }
  function updateTaxRule(id: string, patch: Partial<TaxRule>) {
    const prev = s.taxRules.find((r) => r.id === id);
    const now = new Date().toISOString();
    s.setTaxRules((rs) =>
      rs.map((r) => (r.id === id ? { ...r, ...patch, updated_at: now } : r)),
    );
    if (prev) {
      const changed: string[] = [];
      if (patch.rate != null && patch.rate !== prev.rate)
        changed.push(`rate ${prev.rate}% → ${patch.rate}%`);
      if (patch.flat_amount != null && patch.flat_amount !== prev.flat_amount)
        changed.push(
          `amount ${fmtMoney(prev.flat_amount)} → ${fmtMoney(patch.flat_amount)}`,
        );
      if (patch.active != null && patch.active !== prev.active)
        changed.push(prev.active ? "deactivated" : "activated");
      logSettings(
        `Tax rule updated — ${prev.name}`,
        changed.join(", ") || undefined,
      );
    }
  }
  function deactivateTaxRule(id: string) {
    updateTaxRule(id, { active: false });
  }

  // --- Fee rule CRUD ---
  function addFeeRule(r: FeeRule) {
    s.setFeeRules((rs) => [...rs, r]);
    logSettings("Fee rule created", r.name);
  }
  function updateFeeRule(id: string, patch: Partial<FeeRule>) {
    const prev = s.feeRules.find((r) => r.id === id);
    const now = new Date().toISOString();
    s.setFeeRules((rs) =>
      rs.map((r) => (r.id === id ? { ...r, ...patch, updated_at: now } : r)),
    );
    if (prev) {
      const changed: string[] = [];
      if (patch.amount != null && patch.amount !== prev.amount)
        changed.push(
          `amount ${fmtMoney(prev.amount)} → ${fmtMoney(patch.amount)}`,
        );
      if (patch.active != null && patch.active !== prev.active)
        changed.push(prev.active ? "deactivated" : "activated");
      logSettings(
        `Fee rule updated — ${prev.name}`,
        changed.join(", ") || undefined,
      );
    }
  }
  function deactivateFeeRule(id: string) {
    updateFeeRule(id, { active: false });
  }

  // --- Assessment + posting (authoritative path) ---
  function postFeeCharge(input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    ruleId: string;
    amount: number;
    chargeCategory: ChargeCategory;
    snapshot: FeeRuleSnapshot;
    description?: string;
    effectiveDate?: string;
    billingPeriod?: string | null;
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
    snapshot: TaxRuleSnapshot;
    description?: string;
    effectiveDate?: string;
    billingPeriod?: string | null;
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
      },
    };
    s.setTransactions((ts) => [...ts, txn]);
    return txn.id;
  }

  /** Assess + post all start-time fees + taxes for a rental (rental_start trigger).
   *  Idempotent via a stable per-rental source key so a checkout retry never double-posts. */
  function postStartCharges(input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    locationId?: string | null;
    effectiveDate: string;
    baseCharges: ChargeLine[];
    taxExempt?: boolean;
  }): { feeTxnIds: string[]; taxTxnIds: string[] } {
    const feeCtx: FeeContext = {
      tenant_id: TENANT_ID,
      location_id: input.locationId ?? null,
      effective_date: input.effectiveDate,
      trigger: "rental_start",
      rental_days: 0,
      base_charges: input.baseCharges,
    };
    const { lines: feeLines } = calculateFees(s.feeRules, feeCtx);
    const chargeGroupId = uid("grp");
    const feeTxnIds: string[] = [];
    for (const f of feeLines) {
      const id = postFeeCharge({
        rentalId: input.rentalId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        reservationId: input.reservationId,
        ruleId: f.rule_id,
        amount: f.amount,
        chargeCategory: f.charge_category,
        snapshot: f.snapshot,
        chargeGroupId,
        idempotencyKey: `start|${input.rentalId}|${f.rule_id}`,
        includeInVehicleRevenue: false,
      });
      feeTxnIds.push(id);
    }
    const taxableLines: ChargeLine[] = [...input.baseCharges];
    for (const f of feeLines)
      if (f.taxable)
        taxableLines.push({
          category: f.charge_category,
          amount: f.amount,
          description: f.rule_name,
        });
    const { lines: taxLines } = calculateTaxes(s.taxRules, {
      tenant_id: TENANT_ID,
      location_id: input.locationId ?? null,
      effective_date: input.effectiveDate,
      charges: taxableLines,
      tax_exempt: input.taxExempt,
    });
    const taxTxnIds: string[] = [];
    for (const t of taxLines) {
      const id = postTaxCharge({
        rentalId: input.rentalId,
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        reservationId: input.reservationId,
        ruleId: t.rule_id,
        amount: t.amount,
        snapshot: t.snapshot,
        chargeGroupId,
        idempotencyKey: `start|${input.rentalId}|tax|${t.rule_id}`,
      });
      taxTxnIds.push(id);
    }
    return { feeTxnIds, taxTxnIds };
  }

  /** Assess + post a single triggered fee (e.g. cleaning at return) + its tax if taxable.
   *  Supports an authorized amount override. */
  function assessTriggeredFee(input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    locationId?: string | null;
    ruleId: string;
    trigger: FeeTrigger;
    effectiveDate: string;
    rentalDays?: number;
    baseCharges?: ChargeLine[];
    overrideAmount?: number;
    overrideReason?: string;
    taxExempt?: boolean;
  }): { feeTxnId: string | null; taxTxnIds: string[]; amount: number } {
    const ctx: FeeContext = {
      tenant_id: TENANT_ID,
      location_id: input.locationId ?? null,
      effective_date: input.effectiveDate,
      trigger: input.trigger,
      rental_days: input.rentalDays ?? 0,
      base_charges: input.baseCharges ?? [],
    };
    const line = resolveTriggeredFee(s.feeRules, input.ruleId, ctx);
    if (!line) return { feeTxnId: null, taxTxnIds: [], amount: 0 };
    const rule = s.feeRules.find((r) => r.id === input.ruleId);
    if (!rule) return { feeTxnId: null, taxTxnIds: [], amount: 0 };
    let amount = line.amount;
    if (input.overrideAmount != null) {
      if (!rule.amount_override_allowed)
        return { feeTxnId: null, taxTxnIds: [], amount: 0 };
      amount = roundMoney(input.overrideAmount);
    }
    const chargeGroupId = uid("grp");
    const snapshot: FeeRuleSnapshot = {
      ...line.snapshot,
      calculated_amount: amount,
    };
    const feeTxnId = postFeeCharge({
      rentalId: input.rentalId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      reservationId: input.reservationId,
      ruleId: rule.id,
      amount,
      chargeCategory: rule.charge_category,
      snapshot,
      description:
        rule.name + (input.overrideReason ? ` — ${input.overrideReason}` : ""),
      chargeGroupId,
      includeInVehicleRevenue: rule.include_in_vehicle_revenue,
    });
    const taxTxnIds: string[] = [];
    if (rule.taxable && !input.taxExempt) {
      const { lines: taxLines } = calculateTaxes(s.taxRules, {
        tenant_id: TENANT_ID,
        location_id: input.locationId ?? null,
        effective_date: input.effectiveDate,
        charges: [
          { category: rule.charge_category, amount, description: rule.name },
        ],
        tax_exempt: input.taxExempt,
      });
      for (const t of taxLines) {
        const id = postTaxCharge({
          rentalId: input.rentalId,
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          reservationId: input.reservationId,
          ruleId: t.rule_id,
          amount: t.amount,
          snapshot: t.snapshot,
          chargeGroupId,
        });
        taxTxnIds.push(id);
      }
    }
    s.setActivity((a) =>
      [
        {
          id: uid("act"),
          at: new Date().toISOString(),
          label: `Fee assessed — ${rule.name} · ${fmtMoney(amount)}`,
          tone: "maintenance" as const,
        },
        ...a,
      ].slice(0, 30),
    );
    return { feeTxnId, taxTxnIds, amount };
  }

  /** Reverse a charge bundle (a fee + its associated tax) coherently. Posts
   *  opposite-signed reversals linked via charge_group_id; history preserved. */
  function reverseChargeBundle(input: {
    rentalId: string;
    customerId: string;
    chargeGroupId: string;
    reason: string;
  }): string[] {
    const bundle = s.transactions.filter(
      (t) =>
        t.metadata?.charge_group_id === input.chargeGroupId &&
        t.status === "posted",
    );
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const orig of bundle) {
      const reversal: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: input.rentalId,
        reservation_id: orig.reservation_id,
        customer_id: input.customerId,
        vehicle_id: orig.vehicle_id,
        invoice_id: null,
        deposit_id: null,
        transaction_type: orig.transaction_type,
        category: orig.category === "charge" ? "credit" : orig.category,
        description: `Reversal — ${orig.description}`,
        amount: orig.amount,
        direction: "credit",
        payment_method: null,
        external_transaction_id: null,
        status: "posted",
        effective_date: now.slice(0, 10),
        created_at: now,
        created_by: s.currentStaffId,
        notes: input.reason,
        related_transaction_id: orig.id,
        billing_period: orig.billing_period,
        metadata: {
          ...orig.metadata,
          reversal: true,
          reversal_of: orig.id,
          charge_group_id: input.chargeGroupId,
        },
      };
      s.setTransactions((ts) => [...ts, reversal]);
      ids.push(reversal.id);
    }
    s.setActivity((a) =>
      [
        {
          id: uid("act"),
          at: now,
          label: `Charge reversed — ${fmtMoney(bundle.reduce((s2, t) => s2 + t.amount, 0))} · ${input.reason}`,
          tone: "neutral" as const,
        },
        ...a,
      ].slice(0, 30),
    );
    return ids;
  }

  return {
    addTaxRule,
    updateTaxRule,
    deactivateTaxRule,
    addFeeRule,
    updateFeeRule,
    deactivateFeeRule,
    postFeeCharge,
    postTaxCharge,
    postStartCharges,
    assessTriggeredFee,
    reverseChargeBundle,
  };
}
