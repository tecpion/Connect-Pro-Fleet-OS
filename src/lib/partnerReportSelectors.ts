// Connect Pro Fleet — Build #18 partner / investor-JV report selector.
//
// Investor/JV summary report. Permission-gated (investors.view_financials).
// Keeps projected vs finalized vs paid settlements separate. Custom
// compensation is never fabricated (returns null/manual).

import type { ReportContext } from "./reportContext";
import type { Investor, InvestorVehicle, Settlement } from "./investorTypes";
import type { CompensationArrangement } from "./ownershipTypes";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface InvestorReportRow {
  investor_id: string;
  investor: string;
  vehicles: number;
  compensation_types: string[];
  finalized_settlements: number;
  paid_settlements: number;
  total_investor_payout: number;
  total_company_retained: number;
}

export interface InvestorJVReport {
  rows: InvestorReportRow[];
  pairings: {
    pairing_id: string;
    investor: string;
    vehicle: string;
    compensation_type: string;
    compensation_label: string;
    finalized_payout: number;
    paid_payout: number;
  }[];
  total_finalized: number;
  total_paid: number;
}

function compensationLabel(c: CompensationArrangement | null | undefined): {
  type: string;
  label: string;
} {
  if (!c) return { type: "legacy", label: "Legacy (from split)" };
  if (c.type === "percentage") {
    const basis = c.basis === "gross" ? "Gross" : "Net";
    return {
      type: "percentage",
      label: `${c.investor_percentage}% / ${c.operator_percentage}% (${basis})`,
    };
  }
  if (c.type === "fixed") {
    return { type: "fixed", label: "Fixed payment" };
  }
  return { type: "custom", label: "Manual / settlement-based" };
}

export function getInvestorJVReport(
  ctx: ReportContext,
  investors: Investor[],
  investorVehicles: InvestorVehicle[],
  settlements: Settlement[],
): InvestorJVReport {
  const { store } = ctx;

  const rows: InvestorReportRow[] = investors.map((inv) => {
    const pairings = investorVehicles.filter(
      (iv) => iv.investor_id === inv.id && iv.active,
    );
    const invSettlements = settlements.filter((s) => s.investor_id === inv.id);
    const finalized = invSettlements.filter(
      (s) => s.payout_status !== "pending",
    );
    const paid = invSettlements.filter((s) => s.payout_status === "paid");
    const compTypes = Array.from(
      new Set(pairings.map((p) => compensationLabel(p.compensation).type)),
    );
    return {
      investor_id: inv.id,
      investor: inv.full_name,
      vehicles: pairings.length,
      compensation_types: compTypes,
      finalized_settlements: finalized.length,
      paid_settlements: paid.length,
      total_investor_payout: round2(
        finalized.reduce((s, x) => s + x.investor_payout_amount, 0),
      ),
      total_company_retained: round2(
        finalized.reduce(
          (s, x) => s + (x.gross_revenue - x.investor_payout_amount),
          0,
        ),
      ),
    };
  });

  const pairings = investorVehicles
    .filter((iv) => iv.active)
    .map((iv) => {
      const inv = investors.find((i) => i.id === iv.investor_id);
      const veh = store.vehicles.find((v) => v.id === iv.vehicle_id);
      const cl = compensationLabel(iv.compensation);
      const ivSettlements = settlements.filter(
        (s) => s.investor_id === iv.investor_id,
      );
      return {
        pairing_id: iv.id,
        investor: inv?.full_name ?? "—",
        vehicle: veh ? `${veh.make} ${veh.model}` : "—",
        compensation_type: cl.type,
        compensation_label: cl.label,
        finalized_payout: round2(
          ivSettlements
            .filter((s) => s.payout_status !== "pending")
            .reduce((s, x) => s + x.investor_payout_amount, 0),
        ),
        paid_payout: round2(
          ivSettlements
            .filter((s) => s.payout_status === "paid")
            .reduce((s, x) => s + x.investor_payout_amount, 0),
        ),
      };
    });

  return {
    rows,
    pairings,
    total_finalized: round2(
      settlements
        .filter((s) => s.payout_status !== "pending")
        .reduce((s, x) => s + x.investor_payout_amount, 0),
    ),
    total_paid: round2(
      settlements
        .filter((s) => s.payout_status === "paid")
        .reduce((s, x) => s + x.investor_payout_amount, 0),
    ),
  };
}
