// Connect Pro Fleet — Booking Request detail drawer + staff actions.
//
// Shows the full request: customer, request, documents, CRM source, and
// staff actions (Contact, Assign, Waitlist, Decline, Convert to Reservation).
// Convert builds ONE authoritative Reservation via the existing Fleet store's
// addReservation path (no second reservation engine) and links the request.
// A request is intake only — conversion never auto-creates a RentalAgreement.

import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useBookingRequests } from "@/lib/store/bookingRequestStore";
import {
  BOOKING_REQUEST_STATUS_LABELS,
  BOOKING_REQUEST_SOURCE_LABELS,
  type BookingRequest,
} from "@/lib/bookingRequestTypes";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { uid } from "@/lib/store/ids";
import {
  Phone,
  Mail,
  UserCheck,
  Clock,
  XCircle,
  CheckCircle2,
  ArrowRightLeft,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { ConvertToReservationDialog } from "./ConvertToReservationDialog";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function StaffPicker({
  staffId,
  staff,
  onChange,
}: {
  staffId: string | null;
  staff: { id: string; full_name: string }[];
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={staffId ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Unassigned</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.full_name}
        </option>
      ))}
    </select>
  );
}

export function BookingRequestDetail({
  bookingId,
  onOpenChange,
}: {
  bookingId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const store = useStore();
  const bookings = useBookingRequests();
  const navigate = useNavigate();

  const [convertOpen, setConvertOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [waitlistReason, setWaitlistReason] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const request = useMemo<BookingRequest | null>(
    () => (bookingId ? bookings.bookingById(bookingId) : null),
    [bookings, bookingId],
  );

  const matchedCustomerId =
    request && request.customer_match.kind === "matched"
      ? request.customer_match.customer_id
      : null;
  const customerMatch = matchedCustomerId
    ? (store.customers.find((c) => c.id === matchedCustomerId) ?? null)
    : null;

  const vehicle = request
    ? store.vehicles.find((v) => v.id === request.requested_vehicle_id)
    : null;
  const cls = request
    ? store.vehicleClasses.find(
        (c) => c.id === request.requested_vehicle_class_id,
      )
    : null;

  const canConvert =
    request && ["new", "reviewing", "needs_follow_up"].includes(request.status);

  return (
    <Sheet open={!!bookingId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {request ? `${request.first_name} ${request.last_name}` : ""}
          </SheetTitle>
          <SheetDescription>
            {request
              ? `Booking request · ${request.id.replace("brq_", "BRQ-").toUpperCase()}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {request && (
          <div className="space-y-6">
            {/* Status banner */}
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium",
                request.status === "declined" || request.status === "cancelled"
                  ? "border-status-out/30 bg-status-out/5 text-status-out"
                  : request.status === "converted_to_reservation"
                    ? "border-status-available/30 bg-status-available/5 text-status-available"
                    : "border-border bg-surface text-foreground",
              )}
            >
              {BOOKING_REQUEST_STATUS_LABELS[request.status]}
              {request.converted_reservation_id && (
                <button
                  onClick={() =>
                    navigate(
                      `/reservations/${request.converted_reservation_id}`,
                    )
                  }
                  className="ml-2 text-xs font-semibold text-primary hover:underline"
                >
                  View reservation →
                </button>
              )}
            </div>

            {/* Customer */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Customer
              </h4>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  {request.first_name} {request.last_name}
                </Field>
                <Field label="Phone">
                  <a
                    href={`tel:${request.phone}`}
                    className="text-primary hover:underline"
                  >
                    {request.phone}
                  </a>
                </Field>
                <Field label="Email">
                  <a
                    href={`mailto:${request.email}`}
                    className="text-primary hover:underline"
                  >
                    {request.email}
                  </a>
                </Field>
                <Field label="Existing customer">
                  {request.customer_match.kind === "matched" ? (
                    customerMatch ? (
                      <button
                        onClick={() =>
                          navigate(`/customers/${customerMatch.id}`)
                        }
                        className="text-primary hover:underline"
                      >
                        {customerMatch.first_name} {customerMatch.last_name} →
                      </button>
                    ) : (
                      "Linked"
                    )
                  ) : request.customer_match.kind === "ambiguous" ? (
                    <span className="flex items-center gap-1 text-status-out">
                      <AlertTriangle size={13} /> Ambiguous — review needed
                    </span>
                  ) : (
                    "No match — new customer on convert"
                  )}
                </Field>
              </dl>
            </section>

            {/* Request */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Request
              </h4>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Vehicle">
                  {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
                </Field>
                <Field label="Class">{cls?.name ?? "—"}</Field>
                <Field label="Pickup">
                  {request.requested_start_date
                    ? fmtDate(request.requested_start_date)
                    : "TBD"}
                </Field>
                <Field label="Return">
                  {request.requested_end_date
                    ? fmtDate(request.requested_end_date)
                    : "TBD"}
                </Field>
                <Field label="Duration">
                  {request.rental_duration_type ?? "Unknown"}
                </Field>
                <Field label="Notes">{request.notes ?? "—"}</Field>
              </dl>
            </section>

            {/* Documents */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Documents
              </h4>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Driver's license">
                  {request.driver_license_status === "not_provided" ? (
                    <span className="text-status-out">Not provided</span>
                  ) : request.driver_license_status === "expired" ? (
                    <span className="text-status-out">Expired</span>
                  ) : (
                    <span className="text-foreground">
                      {request.driver_license_document_reference ?? "Provided"}
                    </span>
                  )}
                </Field>
                <Field label="Verification">
                  {request.verification_status}
                </Field>
              </dl>
            </section>

            {/* CRM source */}
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                CRM Source
              </h4>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Source">
                  {BOOKING_REQUEST_SOURCE_LABELS[request.source]}
                </Field>
                <Field label="Lead source">{request.lead_source ?? "—"}</Field>
                <Field label="Contact ref">
                  {request.crm_contact_id ?? "—"}
                </Field>
                <Field label="Opportunity ref">
                  {request.crm_opportunity_id ?? "—"}
                </Field>
                <Field label="Pipeline stage">
                  {request.crm_pipeline_stage ?? "—"}
                </Field>
                <Field label="Submitted">
                  {fmtDateTime(request.submitted_at)}
                </Field>
              </dl>
            </section>

            {/* Waitlist / decline audit */}
            {request.waitlist && (
              <section className="rounded-md border border-border bg-surface-2 p-3 text-sm">
                <p className="font-medium">Waitlisted</p>
                <p className="mt-1 text-muted-foreground">
                  {request.waitlist.reason ?? "No reason given"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Waitlisted {fmtDateTime(request.waitlist.waitlisted_at)} ·
                  Preferred dates: {request.waitlist.requested_dates ?? "TBD"}
                </p>
              </section>
            )}
            {request.declined && (
              <section className="rounded-md border border-status-out/30 bg-status-out/5 p-3 text-sm">
                <p className="font-medium text-status-out">
                  {request.status === "cancelled" ? "Cancelled" : "Declined"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {request.declined.reason}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtDateTime(request.declined.declined_at)}
                </p>
              </section>
            )}

            {/* Assigned staff */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assigned staff
              </h4>
              <StaffPicker
                staffId={request.assigned_to}
                staff={store.staff}
                onChange={(id) =>
                  bookings.assignStaff(request.id, id, store.currentStaffId)
                }
              />
            </section>

            {/* Staff actions */}
            <section className="space-y-2 border-t border-border pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Staff actions
              </h4>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    (window.location.href = `tel:${request.phone}`)
                  }
                >
                  <Phone size={14} className="mr-1.5" /> Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    (window.location.href = `mailto:${request.email}`)
                  }
                >
                  <Mail size={14} className="mr-1.5" /> Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    bookings.setStatus(
                      request.id,
                      "reviewing",
                      store.currentStaffId,
                    );
                    toast.success("Marked as reviewing.");
                  }}
                  disabled={request.status !== "new"}
                >
                  <UserCheck size={14} className="mr-1.5" /> Start review
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWaitlistOpen(true)}
                  disabled={
                    request.status === "converted_to_reservation" ||
                    request.status === "declined" ||
                    request.status === "cancelled"
                  }
                >
                  <Clock size={14} className="mr-1.5" /> Waitlist
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeclineOpen(true)}
                  disabled={
                    request.status === "converted_to_reservation" ||
                    request.status === "declined" ||
                    request.status === "cancelled"
                  }
                >
                  <XCircle size={14} className="mr-1.5" /> Decline
                </Button>
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary-press"
                  onClick={() => setConvertOpen(true)}
                  disabled={!canConvert}
                >
                  <ArrowRightLeft size={14} className="mr-1.5" /> Convert to
                  Reservation
                </Button>
              </div>
            </section>
          </div>
        )}
      </SheetContent>

      {/* Waitlist dialog */}
      <Dialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Put on waitlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Input
                value={waitlistReason}
                onChange={(e) => setWaitlistReason(e.target.value)}
                placeholder="e.g. No SUV available for the requested week"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaitlistOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary-press"
              onClick={() => {
                if (!request) return;
                bookings.putOnWaitlist(
                  request.id,
                  {
                    reason: waitlistReason || null,
                    preferred_class_id: request.requested_vehicle_class_id,
                    preferred_vehicle_id: request.requested_vehicle_id,
                    requested_dates:
                      request.requested_start_date && request.requested_end_date
                        ? `${request.requested_start_date} to ${request.requested_end_date}`
                        : null,
                    staff_notes: null,
                  },
                  store.currentStaffId,
                );
                setWaitlistOpen(false);
                setWaitlistReason("");
                toast.success("Request waitlisted. No reservation created.");
              }}
            >
              Waitlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline dialog */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Input
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Expired driver's license"
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The original request is preserved for audit history.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!request) return;
                bookings.decline(
                  request.id,
                  declineReason || "Declined by staff",
                  store.currentStaffId,
                );
                setDeclineOpen(false);
                setDeclineReason("");
                toast.success("Request declined and preserved for audit.");
              }}
            >
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {request && (
        <ConvertToReservationDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          request={request}
        />
      )}
    </Sheet>
  );
}

export { uid, CheckCircle2, FileText };
