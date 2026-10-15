// Connect Pro Fleet — tax & fee calculation engines (Build #9).
//
// ONE authoritative tax calculator and ONE fee resolver. Checkout, invoices,
// return, reservation pricing, and reporting all consume these so the numbers
// never disagree. The ledger remains the financial source of truth — these
// engines compute the amounts that then post as tax_charge / fee_charge ledger
// transactions carrying a rule snapshot.
//
// Calculation order (documented, deterministic):
//   1. Base rental charges
//   2. Add-ons / eligible company fees (flat + per-period)
//   3. Percentage fees (against their configured base)
//   4. Taxable base determination (sum of taxable categories)
//   5. Taxes (no tax-on-tax by default)
//   6. Total obligation
//
// Rounding: all monetary amounts resolve to currency precision (2 dp) via the
// shared roundMoney helper. No floating-point display formatting leaks into
// ledger state.

import type {
  ChargeCategory,
  ChargeLine,
  FeeLine,
  FeeRule,
  FeeTrigger,
  TaxLine,
  TaxRule,
} from "./taxFeeTypes";

/** Round to currency precision (2 dp). Centralized so no 19.97999 reaches the ledger. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function inDateRange(
  rule: { effective_date: string; end_date: string | null },
  asOf: string,
): boolean {
  if (asOf < rule.effective_date) return false;
  if (rule.end_date && asOf > rule.end_date) return false;
  return true;
}

function locationMatches(
  rule: { location_ids: string[] },
  locationId: string | null,
): boolean {
  if (!rule.location_ids || rule.location_ids.length === 0) return true;
  if (!locationId) return false;
  return rule.location_ids.includes(locationId);
}

// ---------------------------------------------------------------------------
// Tax engine
// ---------------------------------------------------------------------------

export interface TaxContext {
  tenant_id: string;
  location_id: string | null;
  effective_date: string; // ISO date — which rule version applies
  charges: ChargeLine[]; // the charge lines to assess tax against
  tax_exempt?: boolean; // rental/customer-level exemption
}

/**
 * Resolve the active tax rules applicable to a context (tenant, location,
 * effective date, active). Sorted by priority.
 */
export function applicableTaxRules(
  rules: TaxRule[],
  ctx: {
    tenant_id: string;
    location_id: string | null;
    effective_date: string;
  },
): TaxRule[] {
  return rules
    .filter(
      (r) =>
        r.tenant_id === ctx.tenant_id &&
        r.active &&
        locationMatches(r, ctx.location_id) &&
        inDateRange(r, ctx.effective_date),
    )
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Calculate all applicable tax lines for a set of charges. Each tax applies
 * only to its configured taxable_categories (minus exclusions). No tax-on-tax:
 * tax lines are never part of the taxable base.
 *
 * Returns the structured tax lines (each separately identifiable) + the total.
 */
export function calculateTaxes(
  rules: TaxRule[],
  ctx: TaxContext,
): { lines: TaxLine[]; total: number } {
  if (ctx.tax_exempt) return { lines: [], total: 0 };
  const active = applicableTaxRules(rules, ctx);
  const lines: TaxLine[] = [];
  for (const rule of active) {
    // Taxable base = sum of charge amounts in taxable_categories, minus
    // excluded_categories.
    let base = 0;
    for (const c of ctx.charges) {
      if (!rule.taxable_categories.includes(c.category)) continue;
      if (rule.excluded_categories.includes(c.category)) continue;
      base += c.amount;
    }
    base = roundMoney(base);
    if (base <= 0) continue;
    const amount =
      rule.calculation_type === "percentage"
        ? roundMoney((base * rule.rate) / 100)
        : roundMoney(rule.flat_amount);
    if (amount <= 0) continue;
    lines.push({
      rule_id: rule.id,
      rule_name: rule.name,
      amount,
      snapshot: {
        rule_id: rule.id,
        rule_name: rule.name,
        calculation_type: rule.calculation_type,
        rate: rule.rate,
        flat_amount: rule.flat_amount,
        taxable_base: base,
        calculated_amount: amount,
        location_id: ctx.location_id,
        effective_date: rule.effective_date,
        assessed_at: new Date().toISOString(),
      },
    });
  }
  const total = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, total };
}

// ---------------------------------------------------------------------------
// Fee engine
// ---------------------------------------------------------------------------

export interface FeeContext {
  tenant_id: string;
  location_id: string | null;
  effective_date: string;
  trigger: FeeTrigger;
  rental_days: number; // for per_day frequency
  base_charges: ChargeLine[]; // for percentage fees
}

/** Resolve active fee rules for a trigger (tenant, location, date, active). */
export function applicableFeeRules(
  rules: FeeRule[],
  ctx: {
    tenant_id: string;
    location_id: string | null;
    effective_date: string;
    trigger: FeeTrigger;
  },
): FeeRule[] {
  return rules.filter(
    (r) =>
      r.tenant_id === ctx.tenant_id &&
      r.active &&
      locationMatches(r, ctx.location_id) &&
      inDateRange(r, ctx.effective_date) &&
      r.trigger === ctx.trigger,
  );
}

/** Calculate a single fee rule's amount for a context. */
export function calculateFee(rule: FeeRule, ctx: FeeContext): number {
  let amount: number;
  if (rule.calculation_type === "flat") {
    amount = rule.amount;
  } else {
    // Percentage fee — against its configured base only.
    let base = 0;
    for (const c of ctx.base_charges) {
      if (rule.percentage_base.includes(c.category)) base += c.amount;
    }
    base = roundMoney(base);
    amount = roundMoney((base * rule.rate) / 100);
  }
  // Per-day frequency scales the flat amount by rental days.
  if (rule.frequency === "per_day" && ctx.rental_days > 0) {
    amount = roundMoney(amount * ctx.rental_days);
  }
  return roundMoney(Math.max(0, amount));
}

/**
 * Calculate all fee lines for a trigger. Triggered fees are NOT auto-posted —
 * they surface for staff assessment. Only non-triggered frequencies matching
 * the context trigger are returned here (triggered fees are resolved via
 * resolveTriggeredFee when staff assesses them).
 */
export function calculateFees(
  rules: FeeRule[],
  ctx: FeeContext,
): { lines: FeeLine[]; total: number } {
  const active = applicableFeeRules(rules, ctx);
  const lines: FeeLine[] = [];
  for (const rule of active) {
    const amount = calculateFee(rule, ctx);
    if (amount <= 0) continue;
    lines.push({
      rule_id: rule.id,
      rule_name: rule.name,
      amount,
      charge_category: rule.charge_category,
      taxable: rule.taxable,
      snapshot: {
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
      },
    });
  }
  const total = roundMoney(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, total };
}

/** Resolve a single triggered fee rule by id (for the Add Charge assessment flow). */
export function resolveTriggeredFee(
  rules: FeeRule[],
  ruleId: string,
  ctx: FeeContext,
): FeeLine | null {
  const rule = rules.find(
    (r) => r.id === ruleId && r.tenant_id === ctx.tenant_id && r.active,
  );
  if (!rule) return null;
  const amount = calculateFee(rule, ctx);
  if (amount <= 0) return null;
  return {
    rule_id: rule.id,
    rule_name: rule.name,
    amount,
    charge_category: rule.charge_category,
    taxable: rule.taxable,
    snapshot: {
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
    },
  };
}

// ---------------------------------------------------------------------------
// Taxable base + full assessment
// ---------------------------------------------------------------------------

/**
 * Determine the taxable base from a set of charge lines + fee lines. Taxable
 * fees are included when configured; tax lines themselves are never taxable.
 */
export function getTaxableBase(
  charges: ChargeLine[],
  feeLines: FeeLine[],
  taxableCategories: ChargeCategory[],
): number {
  let base = 0;
  for (const c of charges) {
    if (taxableCategories.includes(c.category)) base += c.amount;
  }
  for (const f of feeLines) {
    if (f.taxable && taxableCategories.includes(f.charge_category))
      base += f.amount;
  }
  return roundMoney(base);
}

export interface AssessmentResult {
  charges: ChargeLine[];
  feeLines: FeeLine[];
  taxLines: TaxLine[];
  feeTotal: number;
  taxTotal: number;
  /** Base rental + add-ons (pre-fee, pre-tax). */
  subtotal: number;
  /** Subtotal + fees + taxes — the full customer obligation. */
  total: number;
}

/**
 * Full assessment in the documented order:
 *   charges → fees (against base) → taxable base → taxes → total.
 * Tax applies to the taxable categories among charges + taxable fees.
 */
export function assessObligation(
  charges: ChargeLine[],
  taxRules: TaxRule[],
  feeRules: FeeRule[],
  ctx: {
    tenant_id: string;
    location_id: string | null;
    effective_date: string;
    trigger: FeeTrigger;
    rental_days: number;
    tax_exempt?: boolean;
  },
): AssessmentResult {
  const subtotal = roundMoney(charges.reduce((s, c) => s + c.amount, 0));
  const feeCtx: FeeContext = {
    tenant_id: ctx.tenant_id,
    location_id: ctx.location_id,
    effective_date: ctx.effective_date,
    trigger: ctx.trigger,
    rental_days: ctx.rental_days,
    base_charges: charges,
  };
  const { lines: feeLines, total: feeTotal } = calculateFees(feeRules, feeCtx);

  // Taxable charge lines = original charges + taxable fee lines (as charge lines).
  const taxableChargeLines: ChargeLine[] = [...charges];
  for (const f of feeLines) {
    if (f.taxable)
      taxableChargeLines.push({
        category: f.charge_category,
        amount: f.amount,
        description: f.rule_name,
      });
  }
  const { lines: taxLines, total: taxTotal } = calculateTaxes(taxRules, {
    tenant_id: ctx.tenant_id,
    location_id: ctx.location_id,
    effective_date: ctx.effective_date,
    charges: taxableChargeLines,
    tax_exempt: ctx.tax_exempt,
  });

  const total = roundMoney(subtotal + feeTotal + taxTotal);
  return { charges, feeLines, taxLines, feeTotal, taxTotal, subtotal, total };
}

// ---------------------------------------------------------------------------
// Duplicate-rule detection (warning helper for Settings)
// ---------------------------------------------------------------------------

export interface DuplicateRuleWarning {
  ruleIds: string[];
  reason: string;
}

/** Detect obviously duplicated tax rules (same location, rate, taxable cats, overlapping dates). */
export function detectDuplicateTaxRules(
  rules: TaxRule[],
): DuplicateRuleWarning[] {
  const warnings: DuplicateRuleWarning[] = [];
  const active = rules.filter((r) => r.active);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const sameLoc =
        a.location_ids.length === 0 && b.location_ids.length === 0
          ? true
          : a.location_ids.some((l) => b.location_ids.includes(l));
      const sameCats =
        a.taxable_categories.length === b.taxable_categories.length &&
        a.taxable_categories.every((c) => b.taxable_categories.includes(c));
      const overlap =
        a.effective_date <= (b.end_date ?? "9999") &&
        b.effective_date <= (a.end_date ?? "9999");
      const sameRate =
        a.calculation_type === b.calculation_type &&
        a.rate === b.rate &&
        a.flat_amount === b.flat_amount;
      if (sameLoc && sameCats && overlap && sameRate) {
        warnings.push({
          ruleIds: [a.id, b.id],
          reason: `Duplicate tax detected — "${a.name}" and "${b.name}" apply the same rate to the same categories.`,
        });
      }
    }
  }
  return warnings;
}
