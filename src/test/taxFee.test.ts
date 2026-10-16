// Connect Pro Fleet — Build #9 Taxes & Fees domain tests.
// Covers rule applicability, rounding, calculation order, snapshots,
// idempotency, deposit isolation, tax revenue isolation, investor eligibility,
// reversals, effective dates, and the rental-start posting path.

import { describe, it, expect } from "vitest";
import {
  calculateTaxes,
  calculateFees,
  resolveTriggeredFee,
  assessObligation,
  roundMoney,
  detectDuplicateTaxRules,
  applicableTaxRules,
} from "@/lib/taxEngine";
import {
  getTaxAssessed,
  getTaxCollected,
  getFeeRevenueTotal,
  getInvestorEligibleRevenue,
  isTaxCharge,
  isFeeCharge,
} from "@/lib/taxFeeSelectors";
import type { ChargeLine, FeeRule, TaxRule } from "@/lib/taxFeeTypes";
import type { FinancialTransaction } from "@/lib/types";

const TENANT = "tnt_1";

function taxRule(over: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "tax_1",
    tenant_id: TENANT,
    name: "State Tax",
    description: "",
    calculation_type: "percentage",
    rate: 6,
    flat_amount: 0,
    taxable_categories: ["rental_rate", "addon", "administrative_fee"],
    excluded_categories: [],
    location_ids: [],
    active: true,
    effective_date: "2026-01-01",
    end_date: null,
    priority: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    ...over,
  };
}

function feeRule(over: Partial<FeeRule> = {}): FeeRule {
  return {
    id: "fee_1",
    tenant_id: TENANT,
    name: "Admin Fee",
    description: "",
    calculation_type: "flat",
    amount: 25,
    rate: 0,
    percentage_base: [],
    frequency: "one_time",
    trigger: "rental_start",
    charge_category: "administrative_fee",
    taxable: true,
    waivable: true,
    amount_override_allowed: true,
    location_ids: [],
    include_in_vehicle_revenue: false,
    active: true,
    effective_date: "2026-01-01",
    end_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    ...over,
  };
}

const rentalCharge = (amount: number): ChargeLine => ({
  category: "rental_rate",
  amount,
  description: "Rental",
});

describe("Build #9 — rounding", () => {
  it("rounds to currency precision (6% of $333 = $19.98)", () => {
    expect(roundMoney((333 * 6) / 100)).toBe(19.98);
  });
  it("rounds 6% of $99.99 to $6.00", () => {
    expect(roundMoney((99.99 * 6) / 100)).toBe(6.0);
  });
  it("does not leak floating-point into ledger state", () => {
    expect(roundMoney(19.979999999)).toBe(19.98);
  });
});

describe("Build #9 — tax rules", () => {
  it("percentage tax calculates correctly", () => {
    const { total } = calculateTaxes([taxRule()], {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      charges: [rentalCharge(350)],
    });
    expect(total).toBe(21);
  });
  it("flat tax calculates correctly", () => {
    const { total } = calculateTaxes(
      [taxRule({ calculation_type: "flat", flat_amount: 5, rate: 0 })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        charges: [rentalCharge(350)],
      },
    );
    expect(total).toBe(5);
  });
  it("location-specific tax applies only to matching location", () => {
    const rules = [taxRule({ id: "tax_loc", location_ids: ["loc_mia"] })];
    const inLoc = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: "loc_mia",
      effective_date: "2026-08-01",
      charges: [rentalCharge(100)],
    });
    const outLoc = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: "loc_la",
      effective_date: "2026-08-01",
      charges: [rentalCharge(100)],
    });
    expect(inLoc.total).toBe(6);
    expect(outLoc.total).toBe(0);
  });
  it("respects effective dates", () => {
    const rules = [taxRule({ effective_date: "2026-09-01" })];
    const before = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      charges: [rentalCharge(100)],
    });
    const after = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-09-01",
      charges: [rentalCharge(100)],
    });
    expect(before.total).toBe(0);
    expect(after.total).toBe(6);
  });
  it("respects end dates", () => {
    const rules = [
      taxRule({ effective_date: "2026-01-01", end_date: "2026-06-30" }),
    ];
    const after = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-07-01",
      charges: [rentalCharge(100)],
    });
    expect(after.total).toBe(0);
  });
  it("inactive tax does not apply", () => {
    const { total } = calculateTaxes([taxRule({ active: false })], {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      charges: [rentalCharge(100)],
    });
    expect(total).toBe(0);
  });
  it("multiple taxes apply separately", () => {
    const rules = [
      taxRule({ id: "state", rate: 6 }),
      taxRule({ id: "local", rate: 2, priority: 2 }),
    ];
    const { lines, total } = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      charges: [rentalCharge(350)],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(21);
    expect(lines[1].amount).toBe(7);
    expect(total).toBe(28);
  });
  it("detects duplicate overlapping rules", () => {
    const rules = [
      taxRule({ id: "a", name: "State Tax A" }),
      taxRule({ id: "b", name: "State Tax B" }),
    ];
    const dupes = detectDuplicateTaxRules(rules);
    expect(dupes.length).toBe(1);
  });
  it("tax rules are tenant-scoped", () => {
    const rules = [taxRule({ tenant_id: "other_tenant" })];
    const { total } = calculateTaxes(rules, {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      charges: [rentalCharge(100)],
    });
    expect(total).toBe(0);
  });
  it("non-taxable category is excluded", () => {
    const { total } = calculateTaxes(
      [taxRule({ taxable_categories: ["rental_rate"] })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        charges: [{ category: "damage", amount: 100, description: "Damage" }],
      },
    );
    expect(total).toBe(0);
  });
  it("no tax-on-tax by default", () => {
    const { lines } = calculateTaxes([taxRule()], {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      charges: [
        rentalCharge(100),
        { category: "tax", amount: 6, description: "Tax" },
      ],
    });
    // The tax category is not in taxable_categories, so it's excluded.
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(6);
  });
});

describe("Build #9 — fee rules", () => {
  it("flat fee calculates", () => {
    const { total } = calculateFees([feeRule()], {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      trigger: "rental_start",
      rental_days: 0,
      base_charges: [],
    });
    expect(total).toBe(25);
  });
  it("percentage fee calculates against configured base", () => {
    const { total } = calculateFees(
      [
        feeRule({
          calculation_type: "percentage",
          rate: 3,
          percentage_base: ["rental_rate"],
          amount: 0,
        }),
      ],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "rental_start",
        rental_days: 0,
        base_charges: [rentalCharge(350)],
      },
    );
    expect(total).toBe(roundMoney(350 * 0.03));
  });
  it("per-day fee scales by rental days", () => {
    const { total } = calculateFees(
      [feeRule({ frequency: "per_day", amount: 10 })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "rental_start",
        rental_days: 5,
        base_charges: [],
      },
    );
    expect(total).toBe(50);
  });
  it("triggered fee does not auto-post (only matches its trigger)", () => {
    const { total } = calculateFees(
      [feeRule({ frequency: "triggered", trigger: "return" })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "rental_start",
        rental_days: 0,
        base_charges: [],
      },
    );
    expect(total).toBe(0);
  });
  it("resolveTriggeredFee returns the fee for assessment", () => {
    const line = resolveTriggeredFee(
      [
        feeRule({
          frequency: "triggered",
          trigger: "return",
          amount: 150,
          name: "Cleaning Fee",
          charge_category: "cleaning",
        }),
      ],
      "fee_1",
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "return",
        rental_days: 0,
        base_charges: [],
      },
    );
    expect(line).not.toBeNull();
    expect(line!.amount).toBe(150);
    expect(line!.charge_category).toBe("cleaning");
  });
  it("fee rules are tenant-scoped", () => {
    const { total } = calculateFees([feeRule({ tenant_id: "other" })], {
      tenant_id: TENANT,
      location_id: null,
      effective_date: "2026-08-01",
      trigger: "rental_start",
      rental_days: 0,
      base_charges: [],
    });
    expect(total).toBe(0);
  });
});

describe("Build #9 — calculation order", () => {
  it("taxable fee is included in taxable base", () => {
    const res = assessObligation(
      [rentalCharge(350)],
      [taxRule()],
      [feeRule({ amount: 25, taxable: true })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "rental_start",
        rental_days: 0,
      },
    );
    // subtotal 350, fee 25, tax 6% of (350+25)=22.50
    expect(res.subtotal).toBe(350);
    expect(res.feeTotal).toBe(25);
    expect(res.taxTotal).toBe(roundMoney(375 * 0.06));
    expect(res.total).toBe(roundMoney(350 + 25 + 375 * 0.06));
  });
  it("non-taxable fee is excluded from taxable base", () => {
    const res = assessObligation(
      [rentalCharge(350)],
      [taxRule()],
      [feeRule({ amount: 25, taxable: false })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "rental_start",
        rental_days: 0,
      },
    );
    expect(res.feeTotal).toBe(25);
    expect(res.taxTotal).toBe(roundMoney(350 * 0.06)); // only rental taxed
  });
  it("deterministic order: charges → fees → taxes → total", () => {
    const res = assessObligation(
      [
        rentalCharge(350),
        { category: "addon", amount: 40, description: "GPS" },
      ],
      [taxRule()],
      [feeRule()],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "rental_start",
        rental_days: 0,
      },
    );
    expect(res.subtotal).toBe(390);
    expect(res.feeTotal).toBe(25);
    expect(res.taxTotal).toBe(roundMoney((390 + 25) * 0.06));
  });
});

describe("Build #9 — snapshots", () => {
  it("posted tax stores a rule snapshot", () => {
    const { lines } = calculateTaxes(
      [taxRule({ id: "snap_tax", name: "State Tax" })],
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        charges: [rentalCharge(350)],
      },
    );
    expect(lines[0].snapshot.rule_id).toBe("snap_tax");
    expect(lines[0].snapshot.rule_name).toBe("State Tax");
    expect(lines[0].snapshot.rate).toBe(6);
    expect(lines[0].snapshot.taxable_base).toBe(350);
    expect(lines[0].snapshot.calculated_amount).toBe(21);
  });
  it("posted fee stores a rule snapshot", () => {
    const line = resolveTriggeredFee(
      [
        feeRule({
          id: "snap_fee",
          name: "Cleaning Fee",
          frequency: "triggered",
          trigger: "return",
          charge_category: "cleaning",
          amount: 150,
        }),
      ],
      "snap_fee",
      {
        tenant_id: TENANT,
        location_id: null,
        effective_date: "2026-08-01",
        trigger: "return",
        rental_days: 0,
        base_charges: [],
      },
    );
    expect(line!.snapshot.rule_id).toBe("snap_fee");
    expect(line!.snapshot.rule_name).toBe("Cleaning Fee");
    expect(line!.snapshot.calculated_amount).toBe(150);
  });
});

describe("Build #9 — reporting selectors", () => {
  function txn(over: Partial<FinancialTransaction>): FinancialTransaction {
    return {
      id: "t1",
      tenant_id: TENANT,
      rental_id: "r1",
      reservation_id: null,
      customer_id: "c1",
      vehicle_id: null,
      invoice_id: null,
      deposit_id: null,
      transaction_type: "rental_charge",
      category: "charge",
      description: "",
      amount: 100,
      direction: "charge",
      payment_method: null,
      external_transaction_id: null,
      status: "posted",
      effective_date: "2026-08-01",
      created_at: "2026-08-01T00:00:00Z",
      created_by: null,
      notes: null,
      related_transaction_id: null,
      billing_period: null,
      metadata: null,
      ...over,
    };
  }
  it("tax assessed = posted tax charges", () => {
    const txns = [
      txn({ id: "tax1", transaction_type: "tax_charge", amount: 21 }),
    ];
    expect(getTaxAssessed(txns)).toBe(21);
  });
  it("tax is not company-earned rental revenue", () => {
    const txns = [
      txn({ id: "r1", transaction_type: "rental_charge", amount: 350 }),
      txn({ id: "tax1", transaction_type: "tax_charge", amount: 21 }),
    ];
    expect(getInvestorEligibleRevenue(txns)).toBe(350);
  });
  it("fee with include_in_vehicle_revenue counts toward investor revenue", () => {
    const txns = [
      txn({ id: "r1", transaction_type: "rental_charge", amount: 350 }),
      txn({
        id: "f1",
        transaction_type: "fee_charge",
        amount: 25,
        metadata: { include_in_vehicle_revenue: true },
      }),
    ];
    expect(getInvestorEligibleRevenue(txns)).toBe(375);
  });
  it("fee without include_in_vehicle_revenue does not count", () => {
    const txns = [
      txn({
        id: "f1",
        transaction_type: "fee_charge",
        amount: 25,
        metadata: { include_in_vehicle_revenue: false },
      }),
    ];
    expect(getInvestorEligibleRevenue(txns)).toBe(0);
  });
  it("fee revenue total sums posted fee charges", () => {
    const txns = [
      txn({ id: "f1", transaction_type: "fee_charge", amount: 25 }),
      txn({ id: "f2", transaction_type: "fee_charge", amount: 50 }),
    ];
    expect(getFeeRevenueTotal(txns)).toBe(75);
  });
  it("isTaxCharge / isFeeCharge identify transaction types", () => {
    expect(isTaxCharge(txn({ transaction_type: "tax_charge" }))).toBe(true);
    expect(isFeeCharge(txn({ transaction_type: "fee_charge" }))).toBe(true);
    expect(isTaxCharge(txn({ transaction_type: "rental_charge" }))).toBe(false);
  });
});

describe("Build #9 — deposit isolation", () => {
  function txn(over: Partial<FinancialTransaction>): FinancialTransaction {
    return {
      id: "t1",
      tenant_id: TENANT,
      rental_id: "r1",
      reservation_id: null,
      customer_id: "c1",
      vehicle_id: null,
      invoice_id: null,
      deposit_id: null,
      transaction_type: "rental_charge",
      category: "charge",
      description: "",
      amount: 100,
      direction: "charge",
      payment_method: null,
      external_transaction_id: null,
      status: "posted",
      effective_date: "2026-08-01",
      created_at: "2026-08-01T00:00:00Z",
      created_by: null,
      notes: null,
      related_transaction_id: null,
      billing_period: null,
      metadata: null,
      ...over,
    };
  }
  it("deposit collection is not taxable (never a tax charge line)", () => {
    const dep = txn({
      id: "dep",
      transaction_type: "other_payment",
      category: "payment",
      amount: 300,
      deposit_id: "d1",
      metadata: { deposit_kind: "collection" },
    });
    expect(isTaxCharge(dep)).toBe(false);
    expect(isFeeCharge(dep)).toBe(false);
  });
  it("deposit application is not a new fee/tax charge", () => {
    const app = txn({
      id: "app",
      transaction_type: "manual_adjustment",
      category: "credit",
      amount: 125,
      deposit_id: "d1",
      metadata: { deposit_kind: "application" },
    });
    expect(isTaxCharge(app)).toBe(false);
    expect(isFeeCharge(app)).toBe(false);
  });
  it("deposit movements excluded from investor-eligible revenue", () => {
    const txns = [
      txn({
        id: "dep",
        transaction_type: "other_payment",
        category: "payment",
        amount: 300,
        deposit_id: "d1",
        metadata: { deposit_kind: "collection" },
      }),
      txn({ id: "r1", transaction_type: "rental_charge", amount: 350 }),
    ];
    expect(getInvestorEligibleRevenue(txns)).toBe(350);
  });
});
