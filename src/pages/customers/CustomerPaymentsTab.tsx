// Connect Pro Fleet — Customer payments tab (Build #10).
// Extracted from CustomerProfile to keep it under the line limit.

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { fmtMoneyExact, fmtDateTime } from "@/lib/format";
import { DEPOSIT_STATUS_LABELS } from "@/lib/depositTypes";
import type { RentalAgreement, RentalEvent } from "@/lib/types";

export function CustomerPaymentsTab({
  customerId,
  custRentals,
  rentalEvents,
}: {
  customerId: string;
  custRentals: RentalAgreement[];
  rentalEvents: RentalEvent[];
}) {
  const { depositForCustomer } = useStore();
  return (
    <SectionCard title="Payment history">
      <p className="text-sm text-muted-foreground">
        Payments are tracked against each rental agreement. Security deposit
        activity is shown separately — held deposits are not rental revenue.
      </p>
      <div className="mt-3 space-y-2">
        {custRentals
          .filter((r) => r.amount_paid > 0)
          .flatMap((r) =>
            rentalEvents
              .filter((e) => e.rental_id === r.id && e.type === "payment")
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-foreground">{e.label}</p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {fmtDateTime(e.at)}
                    </p>
                  </div>
                  <Link
                    to={`/rentals/${r.id}`}
                    className="font-mono text-xs text-primary hover:text-primary-press"
                  >
                    {r.agreement_number}
                  </Link>
                </div>
              )),
          )}
      </div>
      {depositForCustomer(customerId).length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Security deposits
          </p>
          <div className="space-y-2">
            {depositForCustomer(customerId).map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm text-foreground">
                    Deposit — {DEPOSIT_STATUS_LABELS[d.status]}
                  </p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    Held{" "}
                    {fmtMoneyExact(
                      d.collected_amount -
                        d.applied_amount -
                        d.refunded_amount -
                        d.forfeited_amount,
                    )}
                    {d.refunded_amount > 0 &&
                      ` · Refunded ${fmtMoneyExact(d.refunded_amount)}`}
                  </p>
                </div>
                <span className="font-mono text-xs tabular text-foreground">
                  {fmtMoneyExact(d.required_amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
