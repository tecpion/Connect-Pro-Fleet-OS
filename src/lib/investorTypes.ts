// Connect Pro Fleet — Investor / JV module (V1 scope).
//
// Staff-only: investors are managed inside the existing staff app. There is
// NO investor login, authentication, or self-service portal in V1. Staff add
// investors, assign vehicles with a per-pairing revenue split, log operating
// and repair costs per vehicle, and generate downloadable settlement PDFs.
//
// All records are tenant-scoped, mirroring the Supabase schema so the mock
// store can be swapped for a real supabase-js client later.

import type { FinancialTransaction } from "./chargeTypes";
import type { CompensationArrangement } from "./ownershipTypes";
import type { OwnershipChangeRecord } from "./ownershipTypes";

export type InvestorRelationship = "family" | "external";
export type InvestorStatus = "active" | "exited";
export type InvestorOwnershipType = "owned" | "contributed";

export type VehicleOperatingCostType =
  "insurance" | "gps_tracker" | "maintenance" | "other";

export type OperatingCostResponsibility = "investor_pays" | "operator_pays";

export type SettlementPayoutStatus = "pending" | "paid";

export interface Investor {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  phone: string;
  relationship: InvestorRelationship;
  status: InvestorStatus;
  joined_at: string; // ISO date
  exited_at: string | null;
  exit_reason: string | null;
}

/**
 * Per investor-vehicle pairing. The revenue split is set HERE, not tenant-wide
 * — different investors can have different splits on the same platform. Build #6
 * separates ownership (asset fact on the Vehicle) from compensation (business
 * agreement on the pairing). `compensation` is the typed arrangement; the
 * legacy revenue_split_*_pct fields remain for backward compatibility and are
 * migrated into a percentage compensation when `compensation` is absent.
 */
export interface InvestorVehicle {
  id: string;
  tenant_id: string;
  investor_id: string;
  vehicle_id: string;
  // Legacy ownership classification on the pairing (owned/contributed). The
  // authoritative ownership type now lives on the Vehicle record; this remains
  // for display compatibility.
  ownership_type: InvestorOwnershipType;
  revenue_split_investor_pct: number; // 0..100
  revenue_split_operator_pct: number; // 0..100
  agreement_id: string | null;
  active: boolean;
  // Build #6 — typed compensation arrangement (percentage/fixed/custom).
  compensation?: import("./ownershipTypes").CompensationArrangement | null;
  // Effective date of the current arrangement (for audit/versioning).
  effective_date?: string | null;
}

/** Recurring monthly operating cost assigned to a vehicle. */
export interface VehicleOperatingCost {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  cost_type: VehicleOperatingCostType;
  monthly_amount: number;
  responsibility: OperatingCostResponsibility;
}

/** A one-off repair cost logged against a vehicle for a settlement period. */
export interface VehicleRepairCost {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  description: string;
  amount: number;
  incurred_date: string; // ISO date
  responsibility: OperatingCostResponsibility;
}

export interface Settlement {
  id: string;
  tenant_id: string;
  investor_id: string;
  vehicle_id: string;
  period_start: string; // ISO date
  period_end: string; // ISO date
  gross_revenue: number;
  operating_costs: number;
  repair_costs: number;
  operator_fee_amount: number;
  investor_payout_amount: number;
  payout_status: SettlementPayoutStatus;
  payout_date: string | null;
  statement_pdf_url: string | null;
  created_at: string;
}

export interface InvestorStore {
  investors: Investor[];
  investorVehicles: InvestorVehicle[];
  vehicleOperatingCosts: VehicleOperatingCost[];
  vehicleRepairCosts: VehicleRepairCost[];
  settlements: Settlement[];

  // Investors
  addInvestor: (i: Investor) => void;
  updateInvestor: (id: string, patch: Partial<Investor>) => void;

  // Investor-vehicle pairings
  addInvestorVehicle: (iv: InvestorVehicle) => void;
  updateInvestorVehicle: (id: string, patch: Partial<InvestorVehicle>) => void;
  removeInvestorVehicle: (id: string) => void;
  // Build #6 — update the compensation arrangement on a pairing (percentage/
  // fixed/custom). Records an audit entry; historical settlements remain
  // unchanged — future periods use the new arrangement from its effective date.
  updatePairingCompensation: (
    pairingId: string,
    compensation: CompensationArrangement,
  ) => void;
  // Build #6 — ownership change history (audited; preserved for a vehicle).
  ownershipChanges: OwnershipChangeRecord[];
  logOwnershipChange: (record: OwnershipChangeRecord) => void;

  // Operating costs
  addVehicleOperatingCost: (c: VehicleOperatingCost) => void;
  updateVehicleOperatingCost: (
    id: string,
    patch: Partial<VehicleOperatingCost>,
  ) => void;
  removeVehicleOperatingCost: (id: string) => void;

  // Repair costs
  addVehicleRepairCost: (c: VehicleRepairCost) => void;
  removeVehicleRepairCost: (id: string) => void;

  // Settlements
  generateSettlement: (input: {
    investorId: string;
    vehicleId: string;
    periodStart: string;
    periodEnd: string;
    operatorFeePct: number;
    transactions: FinancialTransaction[];
  }) => Settlement | null;
  markSettlementPaid: (id: string, payoutDate: string) => void;
}
