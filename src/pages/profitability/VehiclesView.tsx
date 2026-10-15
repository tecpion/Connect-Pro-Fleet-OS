// Connect Pro Fleet — Vehicle performance table view (Build #16).

import { Link } from "@/lib/router-compat";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/format";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import type { VehiclePerformanceRow } from "@/lib/profitabilityTypes";

export function VehiclesView({
  rows,
  canViewInvestorFinancials,
}: {
  rows: VehiclePerformanceRow[];
  canViewInvestorFinancials: boolean;
}) {
  if (rows.length === 0)
    return (
      <EmptyState title="No vehicles" hint="No vehicles in this period." />
    );

  const sorted = [...rows].sort((a, b) => b.gross_profit - a.gross_profit);

  return (
    <SectionCard title="Vehicle performance">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Vehicle</th>
              <th className="py-2 pr-4 font-medium">Class</th>
              <th className="py-2 pr-4 font-medium">Ownership</th>
              <th className="py-2 pr-4 text-right font-medium">Revenue</th>
              <th className="py-2 pr-4 text-right font-medium">Collections</th>
              <th className="py-2 pr-4 text-right font-medium">Expenses</th>
              <th className="py-2 pr-4 text-right font-medium">Gross profit</th>
              {canViewInvestorFinancials && (
                <th className="py-2 pr-4 text-right font-medium">
                  Company share
                </th>
              )}
              <th className="py-2 pr-4 text-right font-medium">Utilization</th>
              <th className="py-2 pr-4 text-right font-medium">Margin</th>
              <th className="py-2 text-right font-medium">Rented days</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.vehicle_id}
                className="border-b border-border/50 hover:bg-surface-2"
              >
                <td className="py-2.5 pr-4">
                  <Link
                    to={`/vehicles/${r.vehicle_id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {r.label}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 text-muted-foreground">
                  {r.class_name ?? "—"}
                </td>
                <td className="py-2.5 pr-4 text-muted-foreground">
                  {OWNERSHIP_TYPE_LABELS[r.ownership_type]}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-foreground">
                  {fmtMoney(r.revenue)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {fmtMoney(r.collections)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {fmtMoney(r.expenses)}
                </td>
                <td
                  className={`py-2.5 pr-4 text-right font-mono tabular font-semibold ${
                    r.gross_profit < 0 ? "text-out" : "text-foreground"
                  }`}
                >
                  {fmtMoney(r.gross_profit)}
                </td>
                {canViewInvestorFinancials && (
                  <td
                    className={`py-2.5 pr-4 text-right font-mono tabular ${
                      r.company_share != null && r.company_share < 0
                        ? "text-out"
                        : "text-muted-foreground"
                    }`}
                  >
                    {r.company_share != null
                      ? fmtMoney(r.company_share)
                      : "Manual"}
                  </td>
                )}
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {fmtPct(r.utilization)}
                </td>
                <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
                  {fmtPct(r.margin)}
                </td>
                <td className="py-2.5 text-right font-mono tabular text-muted-foreground">
                  {r.rented_days}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Sorted by gross profit (highest first). Negative profit vehicles are
        shown in red — they're losing money this period.
      </p>
    </SectionCard>
  );
}
