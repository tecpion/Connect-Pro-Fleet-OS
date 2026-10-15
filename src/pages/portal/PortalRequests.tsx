// Connect Pro Fleet — Portal Requests page (Build #32).
//
// Customer can submit extension / exchange / return / generic requests and
// view their request history with timeline. Submitting a request NEVER mutates
// the rental lifecycle — staff review is required.

import { useState } from "react";
import { usePortalView } from "@/lib/usePortalSources";
import { usePortalSession } from "@/lib/portalSessionStore";
import { usePortalRequests } from "@/lib/portalRequestStore";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  PORTAL_REQUEST_STATUS_LABELS,
  PORTAL_REQUEST_TYPE_LABELS,
  PORTAL_EXCHANGE_REASON_LABELS,
  type PortalRequestType,
  type ExchangeReason,
} from "@/lib/portalTypes";
import { Plus, X, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PortalRequests() {
  const { session } = usePortalSession();
  const view = usePortalView(session);
  const {
    createExtensionRequest,
    createExchangeRequest,
    createReturnRequest,
    cancelRequest,
  } = usePortalRequests();
  const [showForm, setShowForm] = useState<PortalRequestType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!view) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const { requests, selected_rental, customer } = view;
  const selectedRequest = selectedId
    ? requests.find((r) => r.id === selectedId)
    : null;

  const handleCancel = (reqId: string) => {
    if (!session) return;
    cancelRequest(
      session.tenant_id,
      reqId,
      `${customer.first_name} ${customer.last_name}`,
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Requests
        </h1>
        {selected_rental && (
          <button
            onClick={() => setShowForm("extension")}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={16} />
            New Request
          </button>
        )}
      </div>

      {/* New request form */}
      {showForm && session && selected_rental && (
        <NewRequestForm
          type={showForm}
          rental={selected_rental}
          customerId={session.customer_id}
          tenantId={session.tenant_id}
          onClose={() => setShowForm(null)}
          onSubmit={(payload) => {
            if (showForm === "extension" && payload.extension) {
              createExtensionRequest({
                tenant_id: session.tenant_id,
                customer_id: session.customer_id,
                rental_id: selected_rental.id,
                ...payload.extension,
              });
            } else if (showForm === "exchange" && payload.exchange) {
              createExchangeRequest({
                tenant_id: session.tenant_id,
                customer_id: session.customer_id,
                rental_id: selected_rental.id,
                ...payload.exchange,
              });
            } else if (showForm === "return" && payload.return) {
              createReturnRequest({
                tenant_id: session.tenant_id,
                customer_id: session.customer_id,
                rental_id: selected_rental.id,
                ...payload.return,
              });
            }
            setShowForm(null);
          }}
        />
      )}

      {/* Request detail */}
      {selectedRequest ? (
        <RequestDetail
          request={selectedRequest}
          onBack={() => setSelectedId(null)}
          onCancel={() => handleCancel(selectedRequest.id)}
        />
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="font-medium text-foreground">
            You haven't submitted any requests.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Need to extend your rental or request a return? Start here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-surface p-3 text-left hover:bg-accent"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {PORTAL_REQUEST_TYPE_LABELS[r.request_type]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.request_number} · {fmtDate(r.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={r.status} />
                <ArrowRight size={16} className="text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone =
    {
      submitted: "bg-muted text-muted-foreground",
      under_review: "bg-warning/15 text-warning",
      approved: "bg-success/15 text-success",
      declined: "bg-destructive/15 text-destructive",
      completed: "bg-success/15 text-success",
      cancelled: "bg-muted text-muted-foreground",
    }[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}
    >
      {PORTAL_REQUEST_STATUS_LABELS[
        status as keyof typeof PORTAL_REQUEST_STATUS_LABELS
      ] ?? status}
    </span>
  );
}

function RequestDetail({
  request,
  onBack,
  onCancel,
}: {
  request: import("@/lib/portalTypes").CustomerPortalRequest;
  onBack: () => void;
  onCancel: () => void;
}) {
  const canCancel = ["submitted", "under_review"].includes(request.status);
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to requests
      </button>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {request.request_number}
            </p>
            <h2 className="font-display text-lg font-bold text-foreground">
              {PORTAL_REQUEST_TYPE_LABELS[request.request_type]}
            </h2>
          </div>
          <StatusChip status={request.status} />
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <p className="text-foreground">{request.subject}</p>
          {request.customer_note && (
            <p className="text-muted-foreground">"{request.customer_note}"</p>
          )}
        </div>

        {/* Extension details */}
        {request.request_type === "extension" && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Current end</p>
              <p className="font-medium text-foreground">
                {request.current_scheduled_end
                  ? fmtDate(request.current_scheduled_end)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Requested end</p>
              <p className="font-medium text-foreground">
                {request.requested_new_end
                  ? fmtDate(request.requested_new_end)
                  : "—"}
              </p>
            </div>
            {request.estimated_extension_charge != null && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">
                  Estimated charge
                </p>
                <p className="font-medium text-foreground">
                  {fmtMoney(request.estimated_extension_charge)}{" "}
                  <span className="text-xs text-muted-foreground">
                    (estimate — not yet posted)
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Exchange details */}
        {request.request_type === "exchange" && request.exchange_reason && (
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-muted-foreground">
              Reason: {PORTAL_EXCHANGE_REASON_LABELS[request.exchange_reason]}
            </p>
            {request.exchange_issue_description && (
              <p className="text-muted-foreground">
                Issue: {request.exchange_issue_description}
              </p>
            )}
            {request.exchange_reason === "accident_damage" && (
              <p className="rounded-lg bg-destructive/5 p-2 text-xs text-destructive">
                Contact the rental company immediately if the vehicle is unsafe
                to drive.
              </p>
            )}
          </div>
        )}

        {/* Return details */}
        {request.request_type === "return" && request.requested_return_date && (
          <div className="mt-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Requested return date
            </p>
            <p className="font-medium text-foreground">
              {fmtDate(request.requested_return_date)}
              {request.requested_return_location &&
                ` · ${request.requested_return_location}`}
            </p>
          </div>
        )}

        {/* Staff response */}
        {request.staff_response && (
          <div className="mt-3 rounded-lg bg-accent/30 p-3">
            <p className="text-xs font-medium text-foreground">
              Response from rental company:
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {request.staff_response}
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Timeline
          </p>
          <div className="space-y-2">
            {request.timeline.map((t) => (
              <div key={t.id} className="flex items-start gap-2 text-xs">
                <Clock size={12} className="mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-foreground">{t.label}</p>
                  <p className="text-muted-foreground">{fmtDate(t.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {canCancel && (
          <button
            onClick={onCancel}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            Cancel Request
          </button>
        )}
      </div>
    </div>
  );
}

interface NewRequestPayload {
  extension?: {
    current_scheduled_end: string;
    requested_new_end: string;
    customer_note: string | null;
    estimated_extension_charge: number | null;
  };
  exchange?: {
    exchange_reason: ExchangeReason;
    issue_description: string | null;
    preferred_timing: string | null;
    customer_note: string | null;
  };
  return?: {
    requested_return_date: string;
    requested_return_location: string | null;
    customer_note: string | null;
  };
}

function NewRequestForm({
  type,
  rental,
  customerId: _customerId,
  tenantId: _tenantId,
  onClose,
  onSubmit,
}: {
  type: PortalRequestType;
  rental: import("@/lib/portalTypes").PortalRentalView;
  customerId: string;
  tenantId: string;
  onClose: () => void;
  onSubmit: (payload: NewRequestPayload) => void;
}) {
  const [note, setNote] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [reason, setReason] = useState<ExchangeReason>("vehicle_issue");
  const [issueDesc, setIssueDesc] = useState("");
  const [timing, setTiming] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnLoc, setReturnLoc] = useState(rental.return_location_name ?? "");

  const handleSubmit = () => {
    if (type === "extension") {
      onSubmit({
        extension: {
          current_scheduled_end: rental.scheduled_return_date ?? "",
          requested_new_end: newEnd,
          customer_note: note || null,
          estimated_extension_charge: null,
        },
      });
    } else if (type === "exchange") {
      onSubmit({
        exchange: {
          exchange_reason: reason,
          issue_description: issueDesc || null,
          preferred_timing: timing || null,
          customer_note: note || null,
        },
      });
    } else if (type === "return") {
      onSubmit({
        return: {
          requested_return_date: returnDate,
          requested_return_location: returnLoc || null,
          customer_note: note || null,
        },
      });
    }
  };

  const canSubmit =
    type === "extension" ? !!newEnd : type === "return" ? !!returnDate : true;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-foreground">
            {PORTAL_REQUEST_TYPE_LABELS[type]}
          </h2>
          <button onClick={onClose} aria-label="Close">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {type === "extension" && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Current scheduled end
                </label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rental.scheduled_return_date
                    ? fmtDate(rental.scheduled_return_date)
                    : "Open-ended"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Requested new end date
                </label>
                <input
                  type="date"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </>
          )}

          {type === "exchange" && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ExchangeReason)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {Object.entries(PORTAL_EXCHANGE_REASON_LABELS).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Describe the issue (optional)
                </label>
                <textarea
                  value={issueDesc}
                  onChange={(e) => setIssueDesc(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Preferred timing (optional)
                </label>
                <input
                  type="text"
                  value={timing}
                  onChange={(e) => setTiming(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </>
          )}

          {type === "return" && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Intended return date
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Return location
                </label>
                <input
                  type="text"
                  value={returnLoc}
                  onChange={(e) => setReturnLoc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-medium text-foreground">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Submitting this request does not change your rental. Our team will
          review and respond.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}
