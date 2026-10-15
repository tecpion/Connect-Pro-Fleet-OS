// Connect Pro Fleet — Customer arrangements tab (Build #10 / cleanup).
// Extracted to keep CustomerProfile under the line limit. Shows a customer's
// arrangement history (active, broken, completed) without mixing promise
// amounts into lifetime revenue. Build #10 cleanup: shows collectible remaining
// alongside scheduled remaining so a credit-resolved arrangement is clear.

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { fmtMoneyExact, fmtDateShort, statusToneClasses } from "@/lib/format";
import {
  ARRANGEMENT_STATUS_LABELS,
  ARRANGEMENT_STATUS_TONE,
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONE,
} from "@/lib/paymentArrangementTypes";
import {
  installmentPaidAmount,
  installmentStatus,
  reconcileArrangement,
  getNextInstallment,
} from "@/lib/paymentArrangements";
import { cn } from "@/lib/utils";
import { Handshake } from "lucide-react";

export function CustomerArrangementsTab({
  customerId,
}: {
  customerId: string;
}) {
  const {
    arrangementsForCustomer,
    installmentsForArrangement,
    transactions,
    rentals,
    rentalFinancials,
  } = useStore();

  const arrangements = arrangementsForCustomer(customerId).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );

  if (arrangements.length === 0) {
    return (
      <SectionCard title="Payment arrangements">
        <EmptyState
          title="No payment arrangements"
          hint="When this customer agrees to pay an outstanding balance over time, it will appear here."
          icon={<Handshake size={28} />}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Payment arrangements">
      <div className="space-y-3 p-4">
        {arrangements.map((a) => {
          const rental = rentals.find((r) => r.id === a.rental_id);
          const installments = installmentsForArrangement(a.id);
          const next = getNextInstallment(installments, transactions);
          const tone = ARRANGEMENT_STATUS_TONE[a.status];
          const rentalOutstanding = rental
            ? rentalFinancials(a.rental_id!).balance
            : 0;
          const rec = reconcileArrangement(
            a,
            installments,
            transactions,
            rentalOutstanding,
          );
          return (
            <div
              key={a.id}
              className={cn(
                "status-border border-l-2 rounded-r-md border border-border bg-surface-2 px-3 py-3",
                statusToneClasses[tone].border,
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {a.terms_summary}
                  </p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {a.arrangement_number}
                    {rental ? ` · ${rental.agreement_number}` : ""}
                  </p>
                </div>
                <StatusPill tone={tone}>
                  {ARRANGEMENT_STATUS_LABELS[a.status]}
                </StatusPill>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Promised</p>
                  <p className="font-mono tabular text-foreground">
                    {fmtMoneyExact(a.arrangement_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Paid toward</p>
                  <p className="font-mono tabular text-status-available">
                    {fmtMoneyExact(rec.paidAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Scheduled remaining</p>
                  <p className="font-mono tabular text-status-maintenance">
                    {fmtMoneyExact(rec.scheduledRemaining)}
                  </p>
                </div>
              </div>
              {rec.needsReconciliation && (
                <p className="mt-2 font-mono text-xs tabular text-status-maintenance">
                  Collectible remaining:{" "}
                  {fmtMoneyExact(rec.collectibleRemaining)}
                  {rec.resolvedByCredits > 0 &&
                    ` · ${fmtMoneyExact(rec.resolvedByCredits)} resolved by credits`}
                </p>
              )}
              {next && a.status === "active" && (
                <p className="mt-2 font-mono text-xs tabular text-muted-foreground">
                  Next promise: {fmtMoneyExact(next.amount_due)} ·{" "}
                  {fmtDateShort(next.due_date)}
                </p>
              )}
              {rental && (
                <Link
                  to={`/rentals/${rental.id}`}
                  className="mt-2 inline-block text-xs font-medium text-primary hover:text-primary-press"
                >
                  View rental →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
