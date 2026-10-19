// Connect Pro Fleet — Phase 5 investor / JV mappers.
// Row ↔ domain for investors, vehicle pairings, and settlements. Payouts
// remain distributions (not operating expenses). Historical effective terms
// are preserved via effective_date / end_date. tenant_id ↔ organization_id.

import type {
  InvestorRow,
  InvestorVehicleRow,
  InvestorSettlementRow,
} from "./dbTypesIntegrations";
import type { Investor, InvestorVehicle, Settlement } from "../investorTypes";

// ── investors ───────────────────────────────────────────────────────────────

export function rowToInvestor(r: InvestorRow): Investor {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    full_name: r.name,
    email: r.email,
    phone: r.phone ?? "",
    relationship: r.partner_type === "family" ? "family" : "external",
    status: r.status === "exited" ? "exited" : "active",
    joined_at: r.created_at,
    exited_at: null,
    exit_reason: null,
  };
}

export function investorToRow(
  i: Investor,
): Omit<InvestorRow, "created_at" | "updated_at" | "external_id"> {
  return {
    id: i.id,
    organization_id: i.tenant_id,
    name: i.full_name,
    partner_type: i.relationship,
    contact_name: null,
    email: i.email,
    phone: i.phone || null,
    address: null,
    status: i.status,
    notes: i.exit_reason,
  };
}

// ── investor-vehicle pairings ──────────────────────────────────────────────

export function rowToInvestorVehicle(r: InvestorVehicleRow): InvestorVehicle {
  const pct = r.percentage ?? 0;
  return {
    id: r.id,
    tenant_id: r.organization_id,
    investor_id: r.investor_id,
    vehicle_id: r.vehicle_id,
    ownership_type: r.status === "contributed" ? "contributed" : "owned",
    revenue_split_investor_pct: pct,
    revenue_split_operator_pct: Math.max(0, 100 - pct),
    agreement_id: null,
    active: r.status === "active",
    compensation:
      r.compensation_type === "fixed"
        ? {
            type: "fixed",
            fixed_amount: r.fixed_amount ?? 0,
            fixed_frequency: (r.fixed_frequency ?? "monthly") as
              "weekly" | "biweekly" | "monthly" | "custom",
            guaranteed_when_not_rented: r.guaranteed_when_not_rented ?? false,
            guaranteed_during_downtime: r.guaranteed_during_downtime ?? false,
            effective_date: r.effective_date.slice(0, 10),
            end_date: r.end_date?.slice(0, 10) ?? null,
            notes: r.notes,
          }
        : r.compensation_type === "custom"
          ? {
              type: "custom",
              description: r.custom_terms ?? "",
              effective_date: r.effective_date.slice(0, 10),
              end_date: r.end_date?.slice(0, 10) ?? null,
              notes: r.notes,
            }
          : {
              type: "percentage",
              basis:
                r.basis === "net" || r.basis === "net_revenue"
                  ? "net"
                  : "gross",
              investor_percentage: pct,
              operator_percentage: Math.max(0, 100 - pct),
              effective_date: r.effective_date.slice(0, 10),
              end_date: r.end_date?.slice(0, 10) ?? null,
              notes: r.notes,
            },
    effective_date: r.effective_date ?? null,
  };
}

export function investorVehicleToRow(
  iv: InvestorVehicle,
): Omit<InvestorVehicleRow, "created_at" | "updated_at"> {
  return {
    id: iv.id,
    organization_id: iv.tenant_id,
    investor_id: iv.investor_id,
    vehicle_id: iv.vehicle_id,
    status: iv.active ? "active" : "inactive",
    effective_date:
      iv.compensation?.effective_date ??
      iv.effective_date ??
      new Date().toISOString(),
    end_date: iv.compensation?.end_date ?? null,
    compensation_type: iv.compensation?.type ?? "percentage",
    percentage:
      iv.compensation?.type === "percentage"
        ? iv.compensation.investor_percentage
        : iv.revenue_split_investor_pct,
    basis:
      iv.compensation?.type === "percentage" ? iv.compensation.basis : "net",
    fixed_amount:
      iv.compensation?.type === "fixed" ? iv.compensation.fixed_amount : null,
    fixed_frequency:
      iv.compensation?.type === "fixed"
        ? iv.compensation.fixed_frequency
        : null,
    guaranteed_when_not_rented:
      iv.compensation?.type === "fixed"
        ? iv.compensation.guaranteed_when_not_rented
        : null,
    guaranteed_during_downtime:
      iv.compensation?.type === "fixed"
        ? iv.compensation.guaranteed_during_downtime
        : null,
    custom_terms:
      iv.compensation?.type === "custom" ? iv.compensation.description : null,
    notes: iv.compensation?.notes ?? null,
  };
}

// ── settlements (payouts remain distributions) ──────────────────────────────

export function rowToInvestorSettlement(r: InvestorSettlementRow): Settlement {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    investor_id: r.investor_id,
    vehicle_id: r.vehicle_id ?? "",
    period_start: r.period_start,
    period_end: r.period_end,
    gross_revenue: r.gross_revenue,
    operating_costs: r.expenses,
    repair_costs: 0,
    operator_fee_amount: r.operator_amount,
    investor_payout_amount: r.investor_amount,
    payout_status: (r.status === "paid"
      ? "paid"
      : "pending") as Settlement["payout_status"],
    payout_date: r.paid_at,
    statement_pdf_url: null,
    created_at: r.created_at,
  };
}

export function investorSettlementToRow(
  s: Settlement,
): Omit<InvestorSettlementRow, "created_at"> {
  return {
    id: s.id,
    organization_id: s.tenant_id,
    investor_id: s.investor_id,
    pairing_id: null,
    vehicle_id: s.vehicle_id || null,
    period_start: s.period_start,
    period_end: s.period_end,
    status: s.payout_status,
    gross_revenue: s.gross_revenue,
    expenses: s.operating_costs + s.repair_costs,
    investor_amount: s.investor_payout_amount,
    operator_amount: s.operator_fee_amount,
    finalized_at: null,
    finalized_by: null,
    paid_at: s.payout_date,
    notes: null,
  };
}
