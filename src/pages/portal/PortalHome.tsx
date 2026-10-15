// Connect Pro Fleet — Portal Home page (Build #32).
//
// Answers the customer's immediate questions: What am I renting? What do I owe?
// When is my next payment? Is anything overdue? What do I need to do?

import { Link } from "@/lib/router-compat";
import { usePortalView } from "@/lib/usePortalSources";
import { usePortalSession } from "@/lib/portalSessionStore";
import { fmtMoney, fmtDate, fmtTime } from "@/lib/format";
import {
  Car,
  CreditCard,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
  FileText,
  LifeBuoy,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalNotice } from "@/lib/portalTypes";

export function PortalHome() {
  const { session } = usePortalSession();
  const view = usePortalView(session);

  if (!view) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading your portal…</p>
      </div>
    );
  }

  const { billing, selected_rental, deposit, notices, customer } = view;
  const company = view.company_contact;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Welcome back, {customer.first_name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here's your rental overview.
        </p>
      </div>

      {/* Action-needed notices */}
      {notices.filter((n) => n.priority !== "update").length > 0 && (
        <div className="space-y-2">
          {notices
            .filter((n) => n.priority !== "update")
            .slice(0, 3)
            .map((n) => (
              <NoticeBanner key={n.id} notice={n} />
            ))}
        </div>
      )}

      {/* No active rental */}
      {view.has_no_active_rental ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            You don't currently have an active rental.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Contact {company.name} if you believe this is an error.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {view.past_rentals.length > 0 && (
              <Link
                to="/portal/rental"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                View Past Rentals
              </Link>
            )}
            <Link
              to="/portal/help"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              Get Help
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Active rental card */}
          {selected_rental && (
            <Link
              to="/portal/rental"
              className="block rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Active Rental
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-foreground">
                    {selected_rental.agreement_number}
                  </p>
                  {selected_rental.vehicle && (
                    <p className="text-sm text-foreground">
                      {selected_rental.vehicle.year}{" "}
                      {selected_rental.vehicle.make}{" "}
                      {selected_rental.vehicle.model}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    selected_rental.status === "active"
                      ? "bg-success/15 text-success"
                      : "bg-warning/15 text-warning",
                  )}
                >
                  {selected_rental.status_label}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                {selected_rental.checkout_date && (
                  <span>Started {fmtDate(selected_rental.checkout_date)}</span>
                )}
                {!selected_rental.is_open_ended &&
                  selected_rental.scheduled_return_date && (
                    <span>
                      Ends {fmtDate(selected_rental.scheduled_return_date)}
                    </span>
                  )}
                {selected_rental.is_open_ended && <span>Open-ended</span>}
              </div>
            </Link>
          )}

          {/* Balance + Next payment */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CreditCard size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  Current Balance
                </span>
              </div>
              {billing.is_paid_up ? (
                <div className="mt-2 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-success" />
                  <p className="font-display text-xl font-bold text-success">
                    Paid up
                  </p>
                </div>
              ) : (
                <p className="mt-2 font-display text-2xl font-bold text-foreground">
                  {fmtMoney(billing.current_balance)}
                </p>
              )}
              {billing.is_overdue && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle size={14} />
                  <span>{fmtMoney(billing.overdue_amount)} past due</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  Next Payment
                </span>
              </div>
              {billing.next_payment_due_date ? (
                <>
                  <p className="mt-2 font-display text-xl font-bold text-foreground">
                    {billing.next_payment_amount != null
                      ? fmtMoney(billing.next_payment_amount)
                      : "—"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Due {fmtDate(billing.next_payment_due_date)}
                    {billing.next_payment_due_time &&
                      ` at ${fmtTime(billing.next_payment_due_time)}`}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No payment currently scheduled.
                </p>
              )}
            </div>
          </div>

          {/* Arrangement banner */}
          {billing.arrangement && billing.arrangement.status && (
            <div className="rounded-xl border border-border bg-accent/30 p-4">
              <p className="text-sm font-medium text-foreground">
                Payment Arrangement:{" "}
                <span className="text-muted-foreground">
                  {billing.arrangement.status_label}
                </span>
              </p>
              {billing.arrangement.next_payment_due && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Next arrangement payment:{" "}
                  {fmtDate(billing.arrangement.next_payment_due)}
                  {billing.arrangement.next_payment_amount != null &&
                    ` — ${fmtMoney(billing.arrangement.next_payment_amount)}`}
                </p>
              )}
            </div>
          )}

          {/* Deposit summary */}
          {deposit.status !== "not_required" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Security Deposit
                </span>
                <span className="text-sm text-muted-foreground">
                  {deposit.status_label}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Held: {fmtMoney(deposit.held_amount)} · Applied:{" "}
                {fmtMoney(deposit.applied_amount)}
              </p>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <QuickAction
                to="/portal/rental"
                icon={FileText}
                label="View Rental"
              />
              <QuickAction
                to="/portal/payments"
                icon={CreditCard}
                label="View Payments"
              />
              <QuickAction
                to="/portal/requests"
                icon={ArrowRight}
                label="Request Extension"
              />
              <QuickAction
                to="/portal/requests"
                icon={ArrowRight}
                label="Request Return"
              />
              <QuickAction to="/portal/help" icon={LifeBuoy} label="Get Help" />
            </div>
          </div>

          {/* Vehicle card */}
          {selected_rental?.vehicle && (
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Car size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  Your Vehicle
                </span>
              </div>
              <p className="mt-2 font-display text-lg font-bold text-foreground">
                {selected_rental.vehicle.year} {selected_rental.vehicle.make}{" "}
                {selected_rental.vehicle.model}
              </p>
              {selected_rental.vehicle.license_plate_masked && (
                <p className="text-sm text-muted-foreground">
                  Plate: {selected_rental.vehicle.license_plate_masked}
                </p>
              )}
              {selected_rental.vehicle.location_name && (
                <p className="text-sm text-muted-foreground">
                  Location: {selected_rental.vehicle.location_name}
                </p>
              )}
            </div>
          )}

          {/* Recent activity */}
          {view.timeline.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent Activity
              </h2>
              <div className="space-y-2">
                {view.timeline.slice(0, 4).map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {evt.title}
                      </p>
                      {evt.description && (
                        <p className="text-xs text-muted-foreground">
                          {evt.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(evt.occurred_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon size={16} className="text-muted-foreground" />
      {label}
    </Link>
  );
}

function NoticeBanner({ notice }: { notice: PortalNotice }) {
  const isAction = notice.priority === "action_needed";
  return (
    <Link
      to={notice.deep_link ?? "#"}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-sm",
        isAction
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-warning/30 bg-warning/5 text-warning",
      )}
    >
      <AlertTriangle size={16} className="shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{notice.title}</p>
        {notice.detail && <p className="text-xs opacity-80">{notice.detail}</p>}
      </div>
    </Link>
  );
}
