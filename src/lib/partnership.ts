// Connect Pro Fleet — partnership domain (Build #7).
//
// Pure domain helpers over the existing Build #6 architecture. No duplicate
// state — contributions and expense rules are new lightweight collections that
// compose onto the existing Investor / InvestorVehicle / Vehicle ownership /
// CompensationArrangement entities. The orchestration method
// (createInvestorPartnership) is the ONE authoritative path the wizard uses to
// persist a partnership atomically.

import type { Investor, InvestorVehicle } from "./investorTypes";
import type { Vehicle } from "./types";
import type {
  Partnership,
  PartnershipExpenseRule,
  PartnerContribution,
  PartnershipInput,
  ExpenseCategory,
  ExpenseTreatment,
} from "./partnershipTypes";
import type { CompensationArrangement } from "./ownershipTypes";
import { hasActivePairing } from "./ownership";

// ---------------------------------------------------------------------------
// Duplicate detection — never silently merge investors
// ---------------------------------------------------------------------------

export interface PossibleMatch {
  investor: Investor;
  reason: "name" | "email" | "phone";
  vehicleCount: number;
}

/** Find likely existing investors by name/email/phone before creating a new one. */
export function findPossibleMatches(
  query: { name?: string; email?: string; phone?: string },
  investors: Investor[],
  pairings: InvestorVehicle[],
): PossibleMatch[] {
  const name = query.name?.trim().toLowerCase();
  const email = query.email?.trim().toLowerCase();
  const phone = query.phone?.trim();
  const seen = new Set<string>();
  const out: PossibleMatch[] = [];
  for (const inv of investors) {
    let reason: PossibleMatch["reason"] | null = null;
    if (email && inv.email.trim().toLowerCase() === email) reason = "email";
    else if (phone && inv.phone.trim() === phone) reason = "phone";
    else if (name && inv.full_name.trim().toLowerCase() === name)
      reason = "name";
    if (reason && !seen.has(inv.id)) {
      seen.add(inv.id);
      out.push({
        investor: inv,
        reason,
        vehicleCount: pairings.filter(
          (p) => p.investor_id === inv.id && p.active,
        ).length,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ownership conflict detection
// ---------------------------------------------------------------------------

/** A vehicle already has an active outside-owner relationship (V1: one primary). */
export function hasOwnershipConflict(
  vehicleId: string,
  pairings: InvestorVehicle[],
): boolean {
  return hasActivePairing(vehicleId, pairings);
}

// ---------------------------------------------------------------------------
// Expense-rule helpers
// ---------------------------------------------------------------------------

export function makeExpenseRule(input: {
  tenant_id: string;
  pairing_id: string;
  category: ExpenseCategory;
  treatment: ExpenseTreatment;
  notes?: string | null;
}): PartnershipExpenseRule {
  return {
    id: `per_${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: input.tenant_id,
    pairing_id: input.pairing_id,
    category: input.category,
    treatment: input.treatment,
    notes: input.notes ?? null,
  };
}

/** Net agreements require at least one "deduct before split" rule. */
export function netAgreementNeedsExpenseRules(
  compensation: CompensationArrangement,
  rules: PartnershipExpenseRule[],
): boolean {
  if (compensation.type !== "percentage") return false;
  if (compensation.basis !== "net") return false;
  return !rules.some((r) => r.treatment === "deduct_before_split");
}

// ---------------------------------------------------------------------------
// Validation — review step blockers
// ---------------------------------------------------------------------------

export function validatePartnershipInput(
  input: PartnershipInput,
  ctx: { vehicles: Vehicle[]; pairings: InvestorVehicle[] },
): string[] {
  const errors: string[] = [];

  // Partner
  if (input.partner.mode === "new") {
    if (!input.partner.new?.full_name.trim())
      errors.push("Partner name is required.");
  } else if (!input.partner.existingId) {
    errors.push("An existing partner must be selected.");
  }

  // Vehicle
  if (!input.vehicle.vehicle_id) errors.push("A vehicle is required.");
  else {
    const v = ctx.vehicles.find((x) => x.id === input.vehicle.vehicle_id);
    if (!v) errors.push("Selected vehicle does not exist.");
  }
  if (!input.vehicle.ownership_type) errors.push("Ownership type is required.");

  // Ownership conflict (only blocks when NOT an explicit transfer)
  if (
    input.vehicle.vehicle_id &&
    !input.vehicle.transfer_existing &&
    hasOwnershipConflict(input.vehicle.vehicle_id, ctx.pairings)
  ) {
    errors.push(
      "This vehicle already has an active ownership relationship. Choose another vehicle or transfer ownership.",
    );
  }

  // Compensation
  if (!input.compensation) {
    errors.push("Compensation arrangement is required.");
  } else {
    if (
      input.compensation.type === "percentage" &&
      input.compensation.investor_percentage +
        input.compensation.operator_percentage !==
        100
    )
      errors.push("Investor and operator percentages must total 100.");
    if (
      input.compensation.type === "fixed" &&
      (!input.compensation.fixed_amount || input.compensation.fixed_amount <= 0)
    )
      errors.push("A fixed payout amount is required.");
    if (
      input.compensation.type === "custom" &&
      !input.compensation.description.trim()
    )
      errors.push("A custom agreement description is required.");
    if (!input.compensation.effective_date)
      errors.push("An effective date is required.");
  }

  // Net agreement expense rules
  if (
    input.compensation &&
    netAgreementNeedsExpenseRules(input.compensation, input.expense_rules)
  ) {
    errors.push(
      "After-expenses (net) agreements must define at least one expense deducted before the split.",
    );
  }

  // Contribution
  if (input.contribution) {
    if (
      (input.contribution.contribution_type === "cash" ||
        input.contribution.contribution_type === "vehicle_and_cash") &&
      (!input.contribution.cash_amount || input.contribution.cash_amount <= 0)
    )
      errors.push("A cash contribution amount is required.");
    if (
      input.contribution.contribution_type === "other" &&
      !input.contribution.description?.trim()
    )
      errors.push("An 'other' contribution needs a description.");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Plain-language summaries (review step + detail)
// ---------------------------------------------------------------------------

export function contributionSummary(c: PartnerContribution | null): string {
  if (!c) return "None";
  if (c.contribution_type === "cash")
    return `$${c.cash_amount?.toLocaleString() ?? 0} cash`;
  if (c.contribution_type === "vehicle") return "Vehicle provided by partner";
  if (c.contribution_type === "vehicle_and_cash")
    return `Vehicle + $${c.cash_amount?.toLocaleString() ?? 0} cash`;
  return c.description ?? "Other";
}

export function expenseRulesSummary(rules: PartnershipExpenseRule[]): string {
  if (rules.length === 0) return "No expense rules defined";
  const deduct = rules.filter((r) => r.treatment === "deduct_before_split");
  if (deduct.length > 0) return deduct.map((r) => r.category).join(", ");
  return rules.map((r) => `${r.category} (${r.treatment})`).join(", ");
}

export function partnershipSummary(p: Partnership): string {
  const parts: string[] = [];
  parts.push(p.ownership_type);
  if (p.compensation.type === "percentage")
    parts.push(
      `${p.compensation.investor_percentage}%/${p.compensation.operator_percentage}% (${p.compensation.basis})`,
    );
  else if (p.compensation.type === "fixed")
    parts.push(
      `$${p.compensation.fixed_amount} ${p.compensation.fixed_frequency}`,
    );
  else parts.push("Custom");
  return parts.join(" · ");
}
