// Connect Pro Fleet — Billing schedule preview (Build #4).
// Human-readable preview of the payment obligations a billing config will
// produce, shown at checkout so the financial commitment is obvious before the
// rental starts. Reads the rental's effective billing config (live as staff
// edits it via the picker) and projects the first few periods.

import {
  resolveBillingConfig,
  generatePeriodSpecs,
  rentalTermDays,
} from "@/lib/billing";
import { BILLING_FREQUENCY_LABELS } from "@/lib/billingTypes";
import type { RentalAgreement } from "@/lib/types";
import { fmtMoney, fmtMoneyExact, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

function addDays(iso: string, n: number): string {
  return new Date(new Date(iso + "T00:00:00").getTime() + n * DAY)
    .toISOString()
    .slice(0, 10);
}

export function BillingSchedulePreview({
  rental,
}: {
  rental: RentalAgreement;
}) {
  const config = resolveBillingConfig(rental);
  const specs = generatePeriodSpecs(rental, config, { horizonDays: 30 });
  const termDays = rentalTermDays(rental);
  const isOpenEnded = !rental.scheduled_return_date;

  const intervalLabel =
    config.billing_frequency === "daily"
      ? "Every day"
      : config.billing_frequency === "weekly"
        ? "Every 7 days"
        : config.billing_frequency === "biweekly"
          ? "Every 14 days"
          : config.billing_frequency === "upfront"
            ? "One payment"
            : "Custom installments";

  const totalScheduled = specs.reduce((s, p) => s + p.base_amount, 0);

  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payment schedule preview
        </p>
        <span className="text-xs font-medium text-primary">
          {BILLING_FREQUENCY_LABELS[config.billing_frequency]}
        </span>
      </div>

      {specs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Set a billing anchor date to preview the payment schedule.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {specs.slice(0, 4).map((s, i) => (
            <li
              key={`${s.period_start}-${i}`}
              className="flex items-center justify-between"
            >
              <span className="font-mono text-xs tabular text-muted-foreground">
                {fmtDateShort(s.due_at)}
                {i === 0 ? " · First payment" : ""}
              </span>
              <span className="font-mono text-sm tabular text-foreground">
                {fmtMoneyExact(s.base_amount)}
              </span>
            </li>
          ))}
          {specs.length > 4 && (
            <li className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">
                +{specs.length - 4} more within 30 days
              </span>
              <span className="font-mono text-xs tabular text-muted-foreground">
                {fmtMoneyExact(
                  specs.slice(4).reduce((s, p) => s + p.base_amount, 0),
                )}
              </span>
            </li>
          )}
        </ol>
      )}

      <div className="mt-3 space-y-1 border-t border-border pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Cadence</span>
          <span className="text-xs text-foreground">{intervalLabel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Rental term</span>
          <span className="font-mono text-xs tabular text-foreground">
            {isOpenEnded
              ? "Open-ended"
              : `${termDays} day${termDays === 1 ? "" : "s"}`}
          </span>
        </div>
        {config.billing_frequency !== "upfront" && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {isOpenEnded ? "Bills until" : "Bills through"} return
            </span>
            <span className="text-xs text-foreground">
              {rental.scheduled_return_date
                ? fmtDateShort(rental.scheduled_return_date)
                : "Open-ended"}
            </span>
          </div>
        )}
        {rental.late_fee > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Late fee</span>
            <span className="font-mono text-xs tabular text-status-maintenance">
              {fmtMoney(rental.late_fee)} after{" "}
              {rental.payment_cutoff_time ?? "—"} ({rental.grace_period}h grace)
            </span>
          </div>
        )}
        <div
          className={cn(
            "flex items-center justify-between border-t border-border pt-2",
          )}
        >
          <span className="text-xs font-medium text-foreground">
            Total scheduled (30d)
          </span>
          <span className="font-mono text-sm font-semibold tabular text-foreground">
            {fmtMoneyExact(totalScheduled)}
          </span>
        </div>
      </div>
    </div>
  );
}
