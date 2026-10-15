import type {
  Investor,
  InvestorVehicle,
  Settlement,
  VehicleOperatingCost,
  VehicleRepairCost,
} from "./investorTypes";
import type { Vehicle } from "./types";
import type { CompanyInfo } from "./settingsTypes";
import { fmtMoney, fmtMoneyExact, fmtDate } from "./format";
import { getVehicleCompensation } from "./ownership";

// Generates a printable settlement statement and opens it in a new window for
// the staff member to download / print / save as PDF. No external PDF library
// dependency — uses the browser's native print-to-PDF. Branded with the
// route-line flourish header per the investor statement design language.

function costTypeLabel(t: string): string {
  const map: Record<string, string> = {
    insurance: "Insurance",
    gps_tracker: "GPS Tracker",
    maintenance: "Maintenance",
    other: "Other",
  };
  return map[t] ?? t;
}

function responsibilityLabel(r: string): string {
  return r === "operator_pays" ? "Operator pays" : "Investor pays";
}

// Build a human-readable compensation summary for the statement header.
function compensationSummary(pairing: InvestorVehicle): string {
  const c = getVehicleCompensation(pairing);
  if (c.type === "percentage")
    return `${c.investor_percentage}% investor / ${c.operator_percentage}% operator (${c.basis})`;
  if (c.type === "fixed")
    return `${fmtMoneyExact(c.fixed_amount)} ${c.fixed_frequency}`;
  return "Custom arrangement";
}

// Render the investor share row based on the compensation type. Percentage
// arrangements show the split math; fixed/custom show the configured payout.
function investorShareRow(
  pairing: InvestorVehicle,
  settlement: Settlement,
  operatorCosts: number,
): string {
  const c = getVehicleCompensation(pairing);
  if (c.type === "percentage") {
    const base =
      c.basis === "gross"
        ? settlement.gross_revenue
        : settlement.gross_revenue -
          operatorCosts -
          settlement.operator_fee_amount;
    const share = base * (c.investor_percentage / 100);
    return `<div class="row"><span>Investor share (${c.investor_percentage}% ${c.basis})</span><span class="v">${fmtMoneyExact(share)}</span></div>`;
  }
  if (c.type === "fixed") {
    return `<div class="row"><span>Fixed payout (${c.fixed_frequency})</span><span class="v">${fmtMoneyExact(c.fixed_amount)}</span></div>`;
  }
  return `<div class="row"><span>Custom arrangement</span><span class="v">see agreement</span></div>`;
}

export function openSettlementStatement(opts: {
  investor: Investor;
  vehicle: Vehicle;
  pairing: InvestorVehicle;
  settlement: Settlement;
  operatingCosts: VehicleOperatingCost[];
  repairCosts: VehicleRepairCost[];
  company: CompanyInfo;
}): void {
  const {
    investor,
    vehicle,
    pairing,
    settlement,
    operatingCosts,
    repairCosts,
    company,
  } = opts;

  const months = Math.max(
    1,
    (new Date(settlement.period_end).getFullYear() -
      new Date(settlement.period_start).getFullYear()) *
      12 +
      (new Date(settlement.period_end).getMonth() -
        new Date(settlement.period_start).getMonth()) +
      1,
  );

  const vocRows = operatingCosts
    .map(
      (c) => `
      <tr>
        <td>${costTypeLabel(c.cost_type)}</td>
        <td>${responsibilityLabel(c.responsibility)}</td>
        <td class="num">${fmtMoneyExact(c.monthly_amount)}</td>
        <td class="num">${months}</td>
        <td class="num">${fmtMoneyExact(c.monthly_amount * months)}</td>
      </tr>`,
    )
    .join("");

  const repairRows = repairCosts.length
    ? repairCosts
        .map(
          (c) => `
        <tr>
          <td>${c.description}</td>
          <td>${fmtDate(c.incurred_date)}</td>
          <td>${responsibilityLabel(c.responsibility)}</td>
          <td class="num">${fmtMoneyExact(c.amount)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No repair costs in this period.</td></tr>`;

  const operatorCosts =
    settlement.operating_costs +
    settlement.repair_costs -
    (operatingCosts
      .filter((c) => c.responsibility === "investor_pays")
      .reduce((s, c) => s + c.monthly_amount * months, 0) +
      repairCosts
        .filter((c) => c.responsibility === "investor_pays")
        .reduce((s, c) => s + c.amount, 0));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Settlement Statement · ${investor.full_name} · ${vehicle.make} ${vehicle.model}</title>
<style>
  @page { margin: 1.5cm 2cm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1B2430; margin: 0; padding: 32px; background: #F2F4F3; }
  .display { font-family: 'Space Grotesk', 'Inter', sans-serif; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; text-align: right; }
  .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 40px 44px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark { width: 30px; height: 30px; border-radius: 7px; background: #2251EA; display: flex; align-items: center; justify-content: center; }
  .brand-mark svg { width: 18px; height: 18px; }
  .brand-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; }
  .brand-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6b7280; }
  h1 { font-family: 'Space Grotesk', sans-serif; font-size: 22px; margin: 24px 0 4px; }
  .muted { color: #6b7280; }
  .route { margin: 18px 0 22px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 13px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 9px 10px; border-bottom: 1px solid #f1f3f2; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 32px; margin: 14px 0; }
  .grid dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  .grid dd { margin: 2px 0 0; font-size: 14px; }
  .totals { margin-top: 18px; border-top: 2px solid #1B2430; padding-top: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .totals .row.payout { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 600; border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 12px; color: #2251EA; }
  .totals .row .v { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 28px; font-size: 11px; color: #9ca3af; border-top: 1px solid #f1f3f2; padding-top: 12px; }
  .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
  .badge.pending { background: #FEF3C7; color: #92400E; }
  .badge.paid { background: #DCFCE7; color: #166534; }
  @media print { body { padding: 0; background: #fff; } .sheet { border: none; max-width: none; padding: 0; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="brand">
    <div class="brand-mark">
      <svg viewBox="0 0 120 12" preserveAspectRatio="none"><path d="M2 6 C 20 6, 20 2, 40 2 S 60 10, 80 6 S 100 2, 118 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>
    </div>
    <div>
      <div class="brand-name">${company.dba || company.legal_name}</div>
      <div class="brand-sub">settlement statement</div>
    </div>
  </div>

  <h1 class="display">Settlement Statement</h1>
  <p class="muted" style="margin:0;">${fmtDate(settlement.period_start)} → ${fmtDate(settlement.period_end)}</p>

  <div class="route">
    <svg viewBox="0 0 600 24" preserveAspectRatio="none" style="width:100%;height:14px;">
      <path d="M4 12 C 80 12, 80 4, 160 4 S 240 20, 320 12 S 400 4, 480 12 S 560 20, 596 12" fill="none" stroke="#2251EA" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  </div>

  <dl class="grid">
    <div><dt>Investor</dt><dd>${investor.full_name}</dd></div>
    <div><dt>Relationship</dt><dd style="text-transform:capitalize;">${investor.relationship}</dd></div>
    <div><dt>Vehicle</dt><dd>${vehicle.year} ${vehicle.make} ${vehicle.model}</dd></div>
    <div><dt>Plate</dt><dd class="mono">${vehicle.license_plate}</dd></div>
    <div><dt>Ownership</dt><dd style="text-transform:capitalize;">${pairing.ownership_type}</dd></div>
    <div><dt>Compensation</dt><dd>${compensationSummary(pairing)}</dd></div>
    <div><dt>Payout status</dt><dd><span class="badge ${settlement.payout_status}">${settlement.payout_status === "paid" ? "Paid" : "Pending"}${settlement.payout_date ? ` · ${fmtDate(settlement.payout_date)}` : ""}</span></dd></div>
    <div><dt>Statement ID</dt><dd class="mono">${settlement.id}</dd></div>
  </dl>

  <h3 class="display" style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:22px 0 4px;">Operating Costs</h3>
  <table>
    <thead><tr><th>Cost type</th><th>Responsibility</th><th class="num">Monthly</th><th class="num">Months</th><th class="num">Total</th></tr></thead>
    <tbody>${vocRows || '<tr><td colspan="5" class="muted">No operating costs on file.</td></tr>'}</tbody>
  </table>

  <h3 class="display" style="font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:18px 0 4px;">Repair Costs</h3>
  <table>
    <thead><tr><th>Description</th><th>Date</th><th>Responsibility</th><th class="num">Amount</th></tr></thead>
    <tbody>${repairRows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Gross revenue</span><span class="v">${fmtMoneyExact(settlement.gross_revenue)}</span></div>
    <div class="row"><span>Operating + repair costs (operator)</span><span class="v">-${fmtMoneyExact(operatorCosts)}</span></div>
    <div class="row"><span>Operator fee</span><span class="v">-${fmtMoneyExact(settlement.operator_fee_amount)}</span></div>
    ${investorShareRow(pairing, settlement, operatorCosts)}
    <div class="row payout"><span>Investor payout</span><span class="v">${fmtMoneyExact(settlement.investor_payout_amount)}</span></div>
  </div>

  <div class="footer">
    ${company.legal_name} · ${company.street}, ${company.city}, ${company.state} ${company.zip}<br/>
    ${company.business_phone} · ${company.business_email}<br/>
    Generated ${fmtDate(new Date().toISOString())}. This statement summarizes revenue and costs for the period shown.
  </div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
