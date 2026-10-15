// Connect Pro Fleet — vehicle ownership + compensation selectors (Build #6).
//
// Pure domain helpers over the existing store data. No duplicate state — these
// resolve ownership and compensation from the Vehicle record and the
// InvestorVehicle pairing respectively. Designed to be reusable by the vehicle
// form, vehicle detail, investor detail, and settlement engine.

import type { Vehicle } from "./types";
import type { InvestorVehicle } from "./investorTypes";
import type {
  CompensationArrangement,
  CompensationType,
  PercentageCompensation,
  FixedCompensation,
  CustomCompensation,
  VehicleOwnershipType,
  VehicleOwnershipFields,
} from "./ownershipTypes";
import { OWNERSHIP_TYPE_LABELS } from "./ownershipTypes";

// ---------------------------------------------------------------------------
// Ownership (asset fact — on the Vehicle)
// ---------------------------------------------------------------------------

/** Resolve a vehicle's ownership fields, defaulting safely to company_owned. */
export function getVehicleOwnership(
  v: Vehicle,
): Required<VehicleOwnershipFields> {
  return {
    ownership_type:
      (v.ownership_type as VehicleOwnershipType) ?? "company_owned",
    owner_entity_id: v.owner_entity_id ?? null,
    owner_display_name: v.owner_display_name ?? null,
    ownership_notes: v.ownership_notes ?? null,
    ownership_effective_date: v.ownership_effective_date ?? null,
  };
}

/** Whether a vehicle has an outside owner (external / partner / joint). */
export function hasOutsideOwner(v: Vehicle): boolean {
  const t = (v.ownership_type as VehicleOwnershipType) ?? "company_owned";
  return (
    t === "external_owner" ||
    t === "business_partner_owned" ||
    t === "jointly_owned"
  );
}

/** True when the ownership type requires/hides investor fields. */
export function showsInvestorFields(v: Vehicle): boolean {
  return hasOutsideOwner(v);
}

export function ownershipTypeLabel(v: Vehicle): string {
  const t = (v.ownership_type as VehicleOwnershipType) ?? "company_owned";
  return OWNERSHIP_TYPE_LABELS[t] ?? t;
}

// ---------------------------------------------------------------------------
// Compensation (business agreement — on the InvestorVehicle pairing)
// ---------------------------------------------------------------------------

/** Resolve the compensation arrangement for a pairing (defaults to percentage). */
export function getVehicleCompensation(
  iv: InvestorVehicle,
): CompensationArrangement {
  // Backward compatibility: existing seed pairings carry revenue_split_*_pct
  // directly. Map those into a percentage arrangement with a net basis (the
  // existing settlement engine splits net of operator costs).
  if (iv.compensation) return iv.compensation;
  return {
    type: "percentage",
    basis: "net",
    investor_percentage: iv.revenue_split_investor_pct,
    operator_percentage: iv.revenue_split_operator_pct,
    effective_date: iv.effective_date ?? "2026-01-01",
    end_date: null,
    notes: null,
  };
}

export function compensationTypeLabel(iv: InvestorVehicle): string {
  const c = getVehicleCompensation(iv);
  if (c.type === "percentage")
    return `${c.investor_percentage}% / ${c.operator_percentage}% (${c.basis})`;
  if (c.type === "fixed")
    return `$${c.fixed_amount.toFixed(2)} ${c.fixed_frequency}`;
  return "Custom";
}

/** The investor's percentage share if the arrangement is percentage-based. */
export function investorPercentage(iv: InvestorVehicle): number | null {
  const c = getVehicleCompensation(iv);
  return c.type === "percentage" ? c.investor_percentage : null;
}

/** Build a percentage compensation from split fields (used by the pairing UI). */
export function makePercentageCompensation(
  investorPct: number,
  opts?: { basis?: "gross" | "net"; effectiveDate?: string; notes?: string },
): PercentageCompensation {
  return {
    type: "percentage",
    basis: opts?.basis ?? "net",
    investor_percentage: investorPct,
    operator_percentage: 100 - investorPct,
    effective_date:
      opts?.effectiveDate ?? new Date().toISOString().slice(0, 10),
    end_date: null,
    notes: opts?.notes ?? null,
  };
}

export function makeFixedCompensation(
  amount: number,
  frequency: FixedCompensation["fixed_frequency"],
  opts?: {
    effectiveDate?: string;
    guaranteedWhenNotRented?: boolean;
    guaranteedDuringDowntime?: boolean;
    notes?: string;
  },
): FixedCompensation {
  return {
    type: "fixed",
    fixed_amount: amount,
    fixed_frequency: frequency,
    guaranteed_when_not_rented: opts?.guaranteedWhenNotRented ?? false,
    guaranteed_during_downtime: opts?.guaranteedDuringDowntime ?? false,
    effective_date:
      opts?.effectiveDate ?? new Date().toISOString().slice(0, 10),
    end_date: null,
    notes: opts?.notes ?? null,
  };
}

export function makeCustomCompensation(
  description: string,
  opts?: { effectiveDate?: string; notes?: string },
): CustomCompensation {
  return {
    type: "custom",
    description,
    effective_date:
      opts?.effectiveDate ?? new Date().toISOString().slice(0, 10),
    end_date: null,
    notes: opts?.notes ?? null,
  };
}

/** Validate a compensation arrangement (percentages sum to 100, amounts >= 0). */
export function validateCompensation(
  c: CompensationArrangement,
): string | null {
  if (c.type === "percentage") {
    if (c.investor_percentage < 0 || c.investor_percentage > 100)
      return "Investor percentage must be between 0 and 100.";
    if (c.investor_percentage + c.operator_percentage !== 100)
      return "Investor and operator percentages must sum to 100.";
  }
  if (c.type === "fixed" && c.fixed_amount < 0)
    return "Fixed amount cannot be negative.";
  if (c.type === "custom" && !c.description.trim())
    return "Custom compensation requires a description.";
  return null;
}

// ---------------------------------------------------------------------------
// Vehicle ↔ Investor linking
// ---------------------------------------------------------------------------

/** Find the active primary investor pairing for a vehicle (V1: one primary). */
export function getVehicleInvestorRelationship(
  vehicleId: string,
  pairings: InvestorVehicle[],
): InvestorVehicle | null {
  return (
    pairings.find((iv) => iv.vehicle_id === vehicleId && iv.active) ?? null
  );
}

/** Enforce the V1 one-primary-owner rule: only one active pairing per vehicle. */
export function hasActivePairing(
  vehicleId: string,
  pairings: InvestorVehicle[],
): boolean {
  return pairings.some((iv) => iv.vehicle_id === vehicleId && iv.active);
}

/** All pairings (active + historical) for a vehicle, most recent first. */
export function vehiclePairingHistory(
  vehicleId: string,
  pairings: InvestorVehicle[],
): InvestorVehicle[] {
  return pairings
    .filter((iv) => iv.vehicle_id === vehicleId)
    .sort((a, b) =>
      (a.effective_date ?? "") < (b.effective_date ?? "") ? 1 : -1,
    );
}

// ---------------------------------------------------------------------------
// Vehicle economics (always visible — payout structure must not hide a loss)
// ---------------------------------------------------------------------------

export interface VehicleEconomics {
  gross_revenue: number;
  additional_revenue: number;
  vehicle_expenses: number;
  maintenance_repair_cost: number;
  net_performance: number;
  investor_payout: number;
  operator_retained: number;
}

/**
 * Compute a vehicle's actual economics from financial truth. Revenue comes from
 * the ledger; expenses from tracked operating/repair costs. The payout
 * structure is applied AFTER net performance is known so a guaranteed payout
 * can produce a negative operator result — never redefined to look profitable.
 */
export function getVehicleEconomics(input: {
  vehicleId: string;
  grossRevenue: number;
  additionalRevenue?: number;
  operatingCosts: number;
  repairCosts: number;
  pairing: InvestorVehicle | null;
}): VehicleEconomics {
  const gross = input.grossRevenue;
  const additional = input.additionalRevenue ?? 0;
  const expenses = input.operatingCosts + input.repairCosts;
  const net = gross + additional - expenses;

  let investorPayout = 0;
  const pairing = input.pairing;
  if (pairing) {
    const c = getVehicleCompensation(pairing);
    if (c.type === "percentage") {
      const base = c.basis === "gross" ? gross : net;
      investorPayout = base * (c.investor_percentage / 100);
    } else if (c.type === "fixed") {
      // Fixed payouts are configured; automated scheduling comes in the next
      // investor build. For economics display we use the configured amount so
      // the operator-retained figure reflects the agreement.
      investorPayout = c.fixed_amount;
    } else {
      // Custom — not auto-calculated. Payout shown as 0 until finalized.
      investorPayout = 0;
    }
  }

  return {
    gross_revenue: gross,
    additional_revenue: additional,
    vehicle_expenses: expenses,
    maintenance_repair_cost: input.repairCosts,
    net_performance: net,
    investor_payout: investorPayout,
    operator_retained: net - investorPayout,
  };
}

export type { CompensationType };
