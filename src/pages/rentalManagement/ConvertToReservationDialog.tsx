// Connect Pro Fleet — Convert a Booking Request to a Reservation.
//
// Builds ONE authoritative Reservation via the existing Fleet store's
// addReservation + reservation snapshot path (no second reservation engine).
// Prefills customer, dates, class/vehicle, and source references from the
// booking request; staff confirm the actual vehicle, rate, and deposit. On
// success the BookingRequest is linked (converted_to_reservation) and an
// outbound mock "booking_request.converted" CRM event is recorded.
//
// A Reservation is created ONLY here on explicit staff confirmation — never
// automatically from an inbound CRM lead.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useBookingRequests } from "@/lib/store/bookingRequestStore";
import type { BookingRequest } from "@/lib/bookingRequestTypes";
import type { Reservation as ReservationType } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { uid } from "@/lib/store/ids";
import {
  getEligibleVehicles,
  getRentalDuration,
  getRateRecommendation,
  type EligibleVehicle,
} from "@/lib/reservationPricing";
import {
  resolveDeposit,
  buildReservationSnapshot,
} from "@/lib/reservationSnapshot";
import { AlertTriangle } from "lucide-react";

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ConvertToReservationDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: BookingRequest;
}) {
  const store = useStore();
  const bookings = useBookingRequests();

  const matchedCustomerId =
    request.customer_match.kind === "matched"
      ? request.customer_match.customer_id
      : null;
  const matchedCustomer = matchedCustomerId
    ? (store.customers.find((c) => c.id === matchedCustomerId) ?? null)
    : null;

  const [vehicleId, setVehicleId] = useState(
    request.requested_vehicle_id ?? "",
  );
  const [classId, setClassId] = useState(
    request.requested_vehicle_class_id ?? "",
  );
  const [startDate, setStartDate] = useState(
    request.requested_start_date ?? new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(
    request.requested_end_date ??
      new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  );
  const [customPrice, setCustomPrice] = useState<number | "">("");

  const eligible = useMemo<EligibleVehicle[]>(() => {
    if (!classId) return [];
    return getEligibleVehicles(store.vehicles, store.vehicleClasses, {
      classId,
      start: startDate,
      end: endDate,
      reservations: store.reservations,
      rentals: store.rentals,
      maintenance: store.maintenance,
    });
  }, [store, classId, startDate, endDate]);

  const selectedVehicle = eligible.find((v) => v.id === vehicleId) ?? null;

  const durationDays = useMemo(
    () =>
      startDate && endDate && startDate < endDate
        ? getRentalDuration(startDate, endDate)
        : 0,
    [startDate, endDate],
  );

  const recommendation = useMemo(
    () =>
      selectedVehicle
        ? getRateRecommendation(selectedVehicle.pricing, durationDays)
        : null,
    [selectedVehicle, durationDays],
  );

  const deposit = useMemo(
    () =>
      selectedVehicle
        ? resolveDeposit(
            selectedVehicle,
            store.vehicleClasses,
            store.depositPolicies,
          )
        : null,
    [selectedVehicle, store.vehicleClasses, store.depositPolicies],
  );

  const recommendedTotal = recommendation?.recommended_total ?? 0;
  const finalPrice =
    customPrice === "" ? recommendedTotal : Number(customPrice);

  const valid =
    !!selectedVehicle?.available &&
    startDate < endDate &&
    durationDays > 0 &&
    (customPrice === "" ||
      (Number(customPrice) >= 0 && !isNaN(Number(customPrice))));

  const renterName = matchedCustomer
    ? `${matchedCustomer.first_name} ${matchedCustomer.last_name}`
    : `${request.first_name} ${request.last_name}`;
  const renterEmail = matchedCustomer ? matchedCustomer.email : request.email;
  const renterPhone = matchedCustomer ? matchedCustomer.phone : request.phone;

  const submit = () => {
    if (!valid || !selectedVehicle || !recommendation) return;
    const snapshot = buildReservationSnapshot({
      selectedVehicle,
      recommendation,
      vehicleClasses: store.vehicleClasses,
      classId,
      durationDays,
      customPrice: customPrice === "" ? null : Number(customPrice),
      recommendedTotal,
      finalPrice,
      overrideReason: "",
      currentStaffId: store.currentStaffId,
    });
    const reservationId = uid("res");
    const reservation: ReservationType = {
      id: reservationId,
      vehicle_id: selectedVehicle.id,
      customer_id: matchedCustomer?.id ?? null,
      renter_name: renterName,
      renter_email: renterEmail,
      renter_phone: renterPhone,
      start_date: startDate,
      end_date: endDate,
      status: "pending_verification",
      source: "manual",
      ghl_opportunity_id: request.crm_opportunity_id,
      total_price: finalPrice,
      deposit_amount: deposit?.amount ?? 0,
      deposit_status: "held",
      amount_paid: 0,
      pricing_snapshot: snapshot,
      created_at: new Date().toISOString(),
      created_by: store.currentStaffId,
      created_by_name: store.creatorLabel(store.currentStaffId, "manual"),
      tenant_id: store.tenant.id,
    };
    store.addReservation(reservation);
    const result = bookings.convertToReservation({
      booking_request_id: request.id,
      reservation_id: reservationId,
      actor_id: store.currentStaffId,
    });
    if (!result) {
      toast.error("This request is not in an eligible status to convert.");
      return;
    }
    store.logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label: `Booking request converted to reservation — ${renterName}`,
      tone: "available",
    });
    onOpenChange(false);
    toast.success("Reservation created from booking request.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert to Reservation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Confirm the vehicle, dates, and rate. A real reservation is created
            and the booking request is linked to it.{" "}
            {matchedCustomer
              ? "Existing customer linked — no duplicate created."
              : "A new customer record will be created at checkout verification."}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Customer</Label>
              <p className="mt-1 text-sm font-medium text-foreground">
                {renterName}
                {matchedCustomer && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (existing)
                  </span>
                )}
              </p>
            </div>
            <div>
              <Label>Phone / Email</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {renterPhone} · {renterEmail}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Vehicle class</Label>
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setVehicleId("");
                }}
                className={selectCls}
              >
                <option value="">— Select a class —</option>
                {store.vehicleClasses
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label>Vehicle</Label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={selectCls}
                disabled={!classId}
              >
                <option value="">— Select a vehicle —</option>
                {eligible
                  .filter((v) => v.available)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model} · {v.license_plate}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Pickup date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Return date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Duration</Label>
              <p className="mt-1 font-mono text-sm tabular text-muted-foreground">
                {durationDays} day{durationDays === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {selectedVehicle && recommendation && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Recommended total</Label>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {fmtMoney(recommendedTotal)}
                </p>
              </div>
              <div>
                <Label>Final price</Label>
                <Input
                  type="number"
                  value={customPrice}
                  onChange={(e) =>
                    setCustomPrice(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder={String(recommendedTotal)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Security deposit</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {deposit ? fmtMoney(deposit.amount) : "—"}
                </p>
              </div>
            </div>
          )}

          {classId && selectedVehicle && !selectedVehicle.available && (
            <p className="flex items-center gap-1.5 text-xs text-status-out">
              <AlertTriangle size={13} /> That vehicle is not available for the
              selected dates.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Create reservation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
