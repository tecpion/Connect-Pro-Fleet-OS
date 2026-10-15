// Connect Pro Fleet — Portal Payments page (Build #32).
//
// Shows amount due, next payment, payment history, receipts, billing schedule,
// and charges breakdown. All amounts come from authoritative billing selectors.
// Deposits are shown separately — never as revenue.

import { usePortalView } from "@/lib/usePortalSources";
import { usePortalSession } from "@/lib/portalSessionStore";
import { fmtMoney, fmtDate, fmtTime } from "@/lib/format";
import {
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  CreditCard,
  Receipt,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function PortalPayments() {
  const { session } = usePortalSession();
  const view = usePortalView(session);

  if (!view) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const { billing, deposit } = view;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-foreground">
        Payments
      </h1>

      {/* Amount due */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard size={16} />
          <span className="text-xs font-medium uppercase tracking-wide">
            Amount Due
          </span>
        </div>
        {billing.is_paid_up ? (
          <div className="mt-2 flex items-center gap-2">
            <CheckCircle2 size={24} className="text-success" />
            <p className="font-display text-2xl font-bold text-success">
              You're all caught up
            </p>
          </div>
        ) : (
          <p className="mt-2 font-display text-3xl font-bold text-foreground">
            {fmtMoney(billing.current_balance)}
          </p>
        )}
        {billing.is_overdue && (
          <div className="mt-3 rounded-lg bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} />
              <p className="text-sm font-semibold">
                {fmtMoney(billing.overdue_amount)} Past Due
              </p>
            </div>
            {billing.overdue_original_due_date && (
              <p className="mt-1 text-xs text-muted-foreground">
                Originally due {fmtDate(billing.overdue_original_due_date)}
              </p>
            )}
            {billing.posted_late_fee > 0 && (
              <p className="text-xs text-muted-foreground">
                Late fee applied: {fmtMoney(billing.posted_late_fee)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Next payment */}
      {billing.next_payment_due_date && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">
              Next Payment Due
            </span>
          </div>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {billing.next_payment_amount != null
              ? fmtMoney(billing.next_payment_amount)
              : "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            Due {fmtDate(billing.next_payment_due_date)}
            {billing.next_payment_due_time &&
              ` at ${fmtTime(billing.next_payment_due_time)}`}
          </p>
        </div>
      )}

      {/* Pay now */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Make a Payment</p>
        {billing.payment_processing_available ? (
          <button className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Pay {fmtMoney(billing.current_balance)}
          </button>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Payment processing will be connected during production setup.
          </p>
        )}
      </div>

      {/* Billing schedule */}
      {billing.billing_schedule.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Billing Schedule
          </h2>
          <div className="space-y-2">
            {billing.billing_schedule.slice(0, 6).map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {s.period_label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Due {fmtDate(s.due_date)}
                    {s.due_time && ` at ${fmtTime(s.due_time)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {fmtMoney(s.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.status_label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charges breakdown */}
      {billing.charge_breakdown.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Charges Breakdown
          </h2>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="space-y-2">
              {billing.charge_breakdown.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {c.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.category}
                    </p>
                  </div>
                  <span className="font-medium text-foreground">
                    {fmtMoney(c.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Total Charges</span>
                <span>{fmtMoney(billing.total_charges)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total Payments</span>
                <span>-{fmtMoney(billing.total_payments)}</span>
              </div>
              {billing.total_credits > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Total Credits</span>
                  <span>-{fmtMoney(billing.total_credits)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-foreground">
                <span>Balance</span>
                <span>{fmtMoney(billing.current_balance)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payment History
        </h2>
        {billing.payment_history.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
            No payments recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {billing.payment_history.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {fmtMoney(p.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(p.date)} · {p.method_label}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      p.status === "completed"
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {p.status}
                  </span>
                  {p.receipt_available && (
                    <button className="text-xs font-medium text-primary hover:underline">
                      Receipt
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deposit (separate from revenue) */}
      {deposit.status !== "not_required" && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Security Deposit
          </h2>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield size={16} />
              <span className="text-sm font-medium text-foreground">
                {deposit.status_label}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Required</p>
                <p className="font-medium text-foreground">
                  {fmtMoney(deposit.required_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Held</p>
                <p className="font-medium text-foreground">
                  {fmtMoney(deposit.held_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Applied</p>
                <p className="font-medium text-foreground">
                  {fmtMoney(deposit.applied_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Refunded</p>
                <p className="font-medium text-foreground">
                  {fmtMoney(deposit.refunded_amount)}
                </p>
              </div>
            </div>
            {deposit.application_reason && (
              <p className="mt-2 text-xs text-muted-foreground">
                {deposit.application_reason}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
