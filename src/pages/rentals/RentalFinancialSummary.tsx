// Connect Pro Fleet — Build #20 extracted rental financial summary.
//
// Split from RentalDetail.tsx to stay within the per-file line limit. Renders
// the rental's charges, outstanding balance, and held deposit as visually
// distinct blocks so staff never confuse held deposit with rental revenue or
// an arrangement's scheduled remaining with the authoritative balance.

import { SectionCard } from "@/components/ui-bits";
import { FinRow } from "@/pages/rentals/FinRow";
import { fmtMoneyExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RentalAgreement } from "@/lib/types";

export function RentalFinancialSummary({
  rental,
}: {
  rental: RentalAgreement;
}) {
  const grandTotal =
    rental.subtotal + rental.fees + rental.tax - rental.discount;

  return (
    <SectionCard title="Financial summary">
      <div className="space-y-3">
        {/* Charges */}
        <div className="space-y-2 rounded-md bg-surface-2 px-3 py-3">
          <FinRow label="Subtotal" value={fmtMoneyExact(rental.subtotal)} />
          {rental.fees > 0 && (
            <FinRow label="Fees & add-ons" value={fmtMoneyExact(rental.fees)} />
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-medium text-foreground">
              Grand total
            </span>
            <span className="font-mono text-base font-semibold tabular text-foreground">
              {fmtMoneyExact(grandTotal)}
            </span>
          </div>
          <FinRow
            label="Paid so far"
            value={fmtMoneyExact(rental.amount_paid)}
            valueClass="text-status-available"
          />
        </div>

        {/* Outstanding balance — visually distinct from deposit */}
        <div
          className={cn(
            "flex items-center justify-between rounded-md border-l-2 px-3 py-2.5",
            rental.balance_due > 0
              ? "border-status-maintenance/50 bg-status-maintenance/5"
              : "border-status-available/50 bg-status-available/5",
          )}
        >
          <span className="text-sm font-semibold text-foreground">
            Outstanding balance
          </span>
          <span
            className={cn(
              "font-mono text-lg font-semibold tabular",
              rental.balance_due > 0
                ? "text-status-maintenance"
                : "text-status-available",
            )}
          >
            {fmtMoneyExact(rental.balance_due)}
          </span>
        </div>

        {/* Deposit held — separate from rental balance */}
        <div className="flex items-center justify-between rounded-md border-l-2 border-primary/40 bg-primary/5 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">
            Security deposit held
          </span>
          <span className="font-mono text-sm font-medium tabular text-foreground">
            {fmtMoneyExact(rental.deposit_amount)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Held deposit is not rental revenue. It is refundable or applicable to
          charges at return.
        </p>
      </div>
    </SectionCard>
  );
}
