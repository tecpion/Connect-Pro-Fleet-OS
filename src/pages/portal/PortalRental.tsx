// Connect Pro Fleet — Portal Rental page (Build #32).
//
// Shows rental details, terms, agreements, policies, and active requests.
// Uses the frozen rental policy snapshot — company policy changes do NOT
// rewrite existing rental terms.

import { Link } from "@/lib/router-compat";
import { usePortalView } from "@/lib/usePortalSources";
import { usePortalSession } from "@/lib/portalSessionStore";
import { fmtMoney, fmtDate } from "@/lib/format";
import {
  PORTAL_REQUEST_STATUS_LABELS,
  PORTAL_REQUEST_TYPE_LABELS,
} from "@/lib/portalTypes";
import { FileText, Calendar, Car, ArrowRight } from "lucide-react";

export function PortalRental() {
  const { session } = usePortalSession();
  const view = usePortalView(session);

  if (!view) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (view.has_no_active_rental) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Rentals
        </h1>
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            You don't currently have an active rental.
          </p>
          {view.past_rentals.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No rental history to show.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              See your past rentals below.
            </p>
          )}
        </div>
        {view.past_rentals.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Past Rentals
            </h2>
            {view.past_rentals.map((r) => (
              <PastRentalCard key={r.id} rental={r} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const rental = view.selected_rental!;
  const { billing, deposit, agreements, policies, requests } = view;
  const activeRequests = requests.filter(
    (r) => r.status !== "completed" && r.status !== "cancelled",
  );

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-foreground">
        Rental Details
      </h1>

      {/* Rental summary */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rental Agreement
            </p>
            <p className="mt-1 font-display text-xl font-bold text-foreground">
              {rental.agreement_number}
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {rental.status_label}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Start Date</p>
            <p className="font-medium text-foreground">
              {rental.checkout_date ? fmtDate(rental.checkout_date) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scheduled End</p>
            <p className="font-medium text-foreground">
              {rental.is_open_ended
                ? "Open-ended"
                : rental.scheduled_return_date
                  ? fmtDate(rental.scheduled_return_date)
                  : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="font-medium text-foreground">
              {fmtMoney(rental.rate_amount)} / {rental.rate_type}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Billing</p>
            <p className="font-medium text-foreground">
              {rental.billing_cadence ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Vehicle */}
      {rental.vehicle && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Car size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">
              Vehicle
            </span>
          </div>
          <p className="mt-2 font-display text-lg font-bold text-foreground">
            {rental.vehicle.year} {rental.vehicle.make} {rental.vehicle.model}
          </p>
          {rental.vehicle.license_plate_masked && (
            <p className="text-sm text-muted-foreground">
              Plate: {rental.vehicle.license_plate_masked}
            </p>
          )}
        </div>
      )}

      {/* Balance + deposit */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current Balance
          </p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {fmtMoney(billing.current_balance)}
          </p>
        </div>
        {deposit.status !== "not_required" && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Security Deposit
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {deposit.status_label}
            </p>
            <p className="text-xs text-muted-foreground">
              Held: {fmtMoney(deposit.held_amount)}
            </p>
          </div>
        )}
      </div>

      {/* Agreements */}
      {agreements.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Agreements
          </h2>
          <div className="space-y-2">
            {agreements.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {a.agreement_type_label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.status_label}
                      {a.signed_date && ` · Signed ${fmtDate(a.signed_date)}`}
                    </p>
                  </div>
                </div>
                {a.requires_signature && (
                  <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
                    Signature pending
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rental terms / policies */}
      <div>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rental Terms
        </h2>
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="mb-2 text-xs italic text-muted-foreground">
            {policies.source === "rental_snapshot"
              ? "Based on the terms agreed for this rental."
              : policies.source === "company_current"
                ? "Based on current company policy."
                : "No policy snapshot available."}
          </p>
          <dl className="space-y-2">
            <TermRow label="Billing" value={policies.billing_cadence} />
            <TermRow label="Late Fees" value={policies.late_fee_summary} />
            <TermRow label="Deposit" value={policies.deposit_summary} />
            <TermRow label="Mileage" value={policies.mileage_summary} />
            <TermRow label="Fuel" value={policies.fuel_summary} />
            <TermRow label="Returns" value={policies.return_summary} />
            <TermRow label="Extensions" value={policies.extension_summary} />
          </dl>
        </div>
      </div>

      {/* Active requests */}
      {activeRequests.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active Requests
          </h2>
          <div className="space-y-2">
            {activeRequests.map((r) => (
              <Link
                key={r.id}
                to="/portal/requests"
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {PORTAL_REQUEST_TYPE_LABELS[r.request_type]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.request_number}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {PORTAL_REQUEST_STATUS_LABELS[r.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Past rentals */}
      {view.past_rentals.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Past Rentals
          </h2>
          <div className="space-y-2">
            {view.past_rentals.map((r) => (
              <PastRentalCard key={r.id} rental={r} />
            ))}
          </div>
        </div>
      )}

      {/* Request actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/portal/requests"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowRight size={16} />
          Submit a Request
        </Link>
      </div>
    </div>
  );
}

function TermRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function PastRentalCard({
  rental,
}: {
  rental: import("@/lib/portalTypes").PortalRentalView;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {rental.agreement_number}
          </p>
          {rental.vehicle && (
            <p className="text-xs text-muted-foreground">
              {rental.vehicle.year} {rental.vehicle.make} {rental.vehicle.model}
            </p>
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {rental.status_label}
      </span>
    </div>
  );
}
