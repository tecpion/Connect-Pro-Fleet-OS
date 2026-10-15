// Connect Pro Fleet — Company P&L view (Build #16).

import { SectionCard, EmptyState } from "@/components/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { CompanyProfitability } from "@/lib/profitabilityTypes";
import type { TenderMixEntry } from "@/lib/collectionSelectors";
import {
  RevenueExpenseChart,
  ProfitTrendChart,
  ExpenseBreakdownChart,
  TenderMixChart,
} from "./ProfitabilityCharts";

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "out" | "available" | "neutral";
}) {
  const toneClass =
    tone === "out"
      ? "text-out"
      : tone === "available"
        ? "text-available"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-semibold tabular ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export function CompanyView({
  company,
  trend,
  tenderMix,
  expenseByCategory,
  canViewCompany,
  canViewOverhead,
  canViewInvestorFinancials,
}: {
  company: CompanyProfitability;
  trend: { date: string; revenue: number; expenses: number; profit: number }[];
  tenderMix: TenderMixEntry[];
  expenseByCategory: { category: string; amount: number }[];
  canViewCompany: boolean;
  canViewOverhead: boolean;
  canViewInvestorFinancials: boolean;
}) {
  if (!canViewCompany) {
    return (
      <EmptyState
        title="Company P&L restricted"
        hint="You don't have permission to view company-level profitability."
      />
    );
  }

  const hasData =
    company.operating_revenue > 0 || company.fleet_direct_expenses > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          label="Operating revenue"
          value={fmtMoney(company.operating_revenue)}
        />
        <Kpi label="Collections" value={fmtMoney(company.collections)} />
        <Kpi
          label="Outstanding receivables"
          value={fmtMoney(company.outstanding_receivables)}
          tone={company.outstanding_receivables > 0 ? "out" : "neutral"}
        />
        <Kpi
          label="Fleet direct expenses"
          value={fmtMoney(company.fleet_direct_expenses)}
        />
        <Kpi
          label="Gross fleet profit"
          value={fmtMoney(company.gross_fleet_profit)}
          tone={company.gross_fleet_profit < 0 ? "out" : "available"}
        />
        {canViewOverhead ? (
          <Kpi
            label="Company overhead"
            value={fmtMoney(company.company_overhead)}
          />
        ) : (
          <Kpi label="Company overhead" value="Restricted" />
        )}
        {canViewOverhead && (
          <Kpi
            label="Processor fees"
            value={fmtMoney(company.processor_fees)}
          />
        )}
        {canViewInvestorFinancials && company.partner_compensation != null && (
          <Kpi
            label="Projected partner/JV compensation"
            value={fmtMoney(company.partner_compensation)}
          />
        )}
        {canViewOverhead ? (
          <Kpi
            label="Operating profit"
            value={fmtMoney(company.operating_profit)}
            tone={company.operating_profit < 0 ? "out" : "available"}
          />
        ) : (
          <Kpi label="Operating profit" value="Restricted" />
        )}
        {canViewOverhead && (
          <Kpi
            label="Operating margin"
            value={fmtPct(company.margin_percent)}
          />
        )}
      </div>

      {/* Acquisition spend shown separately so a vehicle purchase doesn't distort operating margin */}
      <div className="rounded-md border border-border bg-surface p-3">
        <p className="text-xs text-muted-foreground">
          Vehicle acquisition spend (not in operating profit)
        </p>
        <p className="mt-1 font-mono text-lg font-semibold tabular text-foreground">
          {fmtMoney(company.acquisition_spend)}
        </p>
      </div>

      {hasData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Revenue vs expenses">
            <RevenueExpenseChart data={trend} />
          </SectionCard>
          <SectionCard title="Operating profit trend">
            <ProfitTrendChart
              data={trend.map((t) => ({ date: t.date, profit: t.profit }))}
            />
          </SectionCard>
          <SectionCard title="Expense breakdown">
            {expenseByCategory.length > 0 ? (
              <ExpenseBreakdownChart data={expenseByCategory} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No expenses in this period.
              </p>
            )}
          </SectionCard>
          <SectionCard title="Collections by tender method">
            {tenderMix.length > 0 ? (
              <TenderMixChart data={tenderMix} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No collections in this period.
              </p>
            )}
          </SectionCard>
        </div>
      ) : (
        <EmptyState
          title="No profitability data for this period"
          hint="Revenue and expenses recorded in this date range will appear here."
        />
      )}

      {/* Data-quality indicators (informational only — do NOT alter profit totals) */}
      <SectionCard title="Data quality">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Unreconciled bank transactions
            </p>
            <p className="mt-1 font-mono text-lg tabular text-maintenance">
              {company.unreconciled_transactions}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Expenses missing receipts
            </p>
            <p className="mt-1 font-mono text-lg tabular text-maintenance">
              {company.missing_receipts}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reimbursements owed</p>
            <p className="mt-1 font-mono text-lg tabular text-muted-foreground">
              {fmtMoney(company.reimbursements_outstanding)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These indicators don't affect profit totals — they flag where records
          may need attention.
        </p>
      </SectionCard>
    </div>
  );
}
