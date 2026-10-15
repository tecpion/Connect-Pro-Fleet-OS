import { useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router-compat";
import { useStore, uid } from "@/lib/store";
import { useResourceCenter } from "@/lib/resourceCenterStore";
import type { AssignmentType, ReservationStatus } from "@/lib/types";
import {
  PageHeader,
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { StatusPill, reservationTone } from "@/components/Status";
import { RouteProgress } from "@/components/RouteLine";
import {
  fmtMoneyExact,
  fmtDate,
  fmtDateShort,
  fmtDateTime,
  reservationStatusMeta,
  sourceMeta,
  depositStatusMeta,
  daysBetween,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  UserPlus,
  ClipboardCheck,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  ReservationAddons,
  ReservationPaymentDialog,
} from "@/components/ReservationSections";
import { PricingSummaryCard } from "@/pages/reservations/PricingSummaryCard";
import {
  VerificationResourcesPanel,
  canConfirmReservation,
} from "@/components/VerificationResourcesPanel";
import { DepositPanel } from "@/components/DepositPanel";
import { depositBlocksCheckout } from "@/lib/deposit";
import { resolveVehicleDeposit } from "@/lib/vehicleClass";

export default function ReservationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    reservations,
    rentals,
    vehicles,
    staff,
    assignments,
    drivers,
    updateReservation,
    convertReservationToRental,
    addAssignment,
    logActivity,
    depositForReservation,
    ensureDepositForReservation,
    depositPolicies,
    vehicleClasses,
  } = useStore();
  const { resourceCategories, reservationVerificationsFor } =
    useResourceCenter();

  const res = reservations.find((r) => r.id === id);
  const [assignStaff, setAssignStaff] = useState(staff[0]?.id ?? "");
  const [assignType, setAssignType] = useState<AssignmentType>("checkout");

  if (!res) {
    return (
      <EmptyState
        title="Reservation not found"
        hint="It may have been removed."
        action={
          <Link to="/reservations">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
    );
  }

  const vehicle = vehicles.find((v) => v.id === res.vehicle_id);
  // Build #8 — ensure an operational deposit record exists (snapshotted from
  // the resolved policy so later policy changes never alter this reservation).
  const deposit = depositForReservation(res.id);
  if (!deposit && vehicle) {
    const resolved = resolveVehicleDeposit(
      vehicle,
      vehicleClasses,
      depositPolicies,
    );
    ensureDepositForReservation({
      reservationId: res.id,
      customerId: res.customer_id ?? "",
      vehicleId: res.vehicle_id,
      requiredAmount: resolved.amount,
      policyId: null,
      source:
        resolved.source === "override"
          ? "vehicle_override"
          : resolved.source === "default"
            ? "company_default"
            : "class",
      policyName: resolved.policyName,
      className: resolved.className,
    });
  }
  const resAssignments = assignments.filter((a) => a.reservation_id === res.id);
  const driver = drivers.find((d) => d.reservation_id === res.id);
  const addonTotal = 0; // computed inside ReservationAddons
  const grandTotal = res.total_price + addonTotal;
  const balanceDue = Math.max(0, grandTotal - res.amount_paid);

  // Route-line progress: checkout → active → checkin
  const progress = (() => {
    if (res.status === "completed") return 1;
    if (res.status === "active") return 0.66;
    if (res.status === "confirmed") return 0.33;
    return 0.05;
  })();

  const advance = (
    next: ReservationStatus,
    label: string,
    tone: "available" | "maintenance" | "out",
  ) => {
    updateReservation(res.id, { status: next });
    logActivity({ id: uid("act"), at: new Date().toISOString(), label, tone });
    toast.success(label);
  };

  // Gate logic: required+active categories must all be "passed" to confirm.
  const verifications = reservationVerificationsFor(res.id);
  const { ok: canConfirm, blockers } = canConfirmReservation(
    resourceCategories,
    verifications,
    res.id,
  );

  const confirm = () => {
    if (!canConfirm) {
      toast.error(
        `Cannot confirm — required checks not passed: ${blockers.join(", ")}.`,
      );
      return;
    }
    advance("confirmed", "Reservation verified and confirmed.", "available");
  };

  return (
    <div className="space-y-6">
      <Link
        to="/rental-management"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} /> Rental Management
      </Link>

      {/* Reservation → Rental traceability */}
      {res.converted_to_rental_id && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-muted-foreground">Converted to rental</span>
          <Link
            to={`/rentals/${res.converted_to_rental_id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {rentals.find((r) => r.id === res.converted_to_rental_id)
              ?.agreement_number ?? res.converted_to_rental_id}
          </Link>
        </div>
      )}

      <PageHeader
        title={res.renter_name}
        subtitle={
          <span className="font-mono tabular">
            {res.renter_email} · {res.renter_phone}
          </span>
        }
        actions={
          <StatusPill tone={reservationTone(res.status)}>
            {reservationStatusMeta[res.status].label}
          </StatusPill>
        }
      />

      {/* Route-line progress */}
      <SectionCard>
        <div className="flex items-center justify-between">
          {["Checkout", "Active rental", "Check-in"].map((label, i) => {
            const reached = progress >= [0.33, 0.66, 1][i] - 0.01;
            return (
              <div key={label} className="flex-1">
                <p
                  className={cn(
                    "text-xs font-medium",
                    reached ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {label}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <RouteProgress value={progress} stops={3} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: details + money */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Reservation details">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <div>
                <DataLabel>Vehicle</DataLabel>
                <DataValue>
                  {vehicle ? (
                    <Link
                      to={`/vehicles/${vehicle.id}`}
                      className="hover:text-primary"
                    >
                      {vehicle.make} {vehicle.model}
                    </Link>
                  ) : (
                    "—"
                  )}
                </DataValue>
              </div>
              <div>
                <DataLabel>Source</DataLabel>
                <DataValue>{sourceMeta[res.source]}</DataValue>
              </div>
              <div>
                <DataLabel>Dates</DataLabel>
                <DataValue mono>
                  {fmtDateShort(res.start_date)} → {fmtDateShort(res.end_date)}{" "}
                  <span className="text-muted-foreground">
                    ({daysBetween(res.start_date, res.end_date)}d)
                  </span>
                </DataValue>
              </div>
              <div>
                <DataLabel>Deposit</DataLabel>
                <DataValue mono>
                  {fmtMoneyExact(res.deposit_amount)} ·{" "}
                  {depositStatusMeta[res.deposit_status]}
                </DataValue>
              </div>
              <div>
                <DataLabel>Connect Pro ref</DataLabel>
                <DataValue mono>{res.ghl_opportunity_id ?? "—"}</DataValue>
              </div>
              <div>
                <DataLabel>Created</DataLabel>
                <DataValue mono>{fmtDateTime(res.created_at)}</DataValue>
                <p className="text-xs text-muted-foreground">
                  by {res.created_by_name}
                </p>
              </div>
            </dl>
          </SectionCard>

          <PricingSummaryCard res={res} />

          <DepositPanel reservationId={res.id} rentalId={null} />

          <ReservationAddons res={res} />

          {/* Staff assignments */}
          <SectionCard title="Staff assignments">
            {resAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No one assigned yet. Assign a staff member to checkout,
                check-in, or delivery.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {resAssignments.map((a) => {
                  const s = staff.find((x) => x.id === a.staff_id);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {s?.full_name ?? "—"}
                        </p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {a.assignment_type}
                        </p>
                      </div>
                      <span className="font-mono text-xs tabular text-muted-foreground">
                        {fmtDateTime(a.assigned_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <select
                value={assignStaff}
                onChange={(e) => setAssignStaff(e.target.value)}
                className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} · {s.role}
                  </option>
                ))}
              </select>
              <select
                value={assignType}
                onChange={(e) =>
                  setAssignType(e.target.value as AssignmentType)
                }
                className="rounded-md border border-input bg-surface px-3 py-2 text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(["checkout", "checkin", "delivery"] as AssignmentType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ),
                )}
              </select>
              <Button
                variant="outline"
                onClick={() => {
                  addAssignment({
                    id: uid("asg"),
                    reservation_id: res.id,
                    staff_id: assignStaff,
                    assignment_type: assignType,
                    assigned_at: new Date().toISOString(),
                    tenant_id: "tnt_connectpro",
                  });
                  toast.success("Staff member assigned.");
                }}
              >
                <UserPlus size={15} className="mr-1.5" /> Assign
              </Button>
            </div>
          </SectionCard>
        </div>

        {/* Right: actions + verification + driver */}
        <div className="space-y-6">
          <SectionCard title="Workflow actions">
            <div className="space-y-2">
              {res.status === "pending_verification" && (
                <>
                  <Button
                    className="w-full bg-primary text-primary-foreground hover:bg-primary-press"
                    onClick={confirm}
                  >
                    <ShieldCheck size={16} className="mr-1.5" /> Verify &
                    confirm
                  </Button>
                  {!canConfirm && blockers.length > 0 && (
                    <div className="flex items-start gap-1.5 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        Required checks not passed: {blockers.join(", ")}.
                      </span>
                    </div>
                  )}
                </>
              )}
              {res.status === "confirmed" && (
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary-press"
                  onClick={() => {
                    // Reuse the EXISTING reservation→rental conversion workflow,
                    // then route into the checkout workflow for the new rental.
                    const rentalId =
                      res.converted_to_rental_id ??
                      convertReservationToRental(res.id);
                    if (rentalId) {
                      navigate(`/checkout/${rentalId}`);
                    } else {
                      toast.error(
                        "Could not start rental — resolve any blockers first.",
                      );
                    }
                  }}
                >
                  <ClipboardCheck size={16} className="mr-1.5" /> Start rental
                </Button>
              )}
              {res.status === "active" && (
                <div
                  data-testid="reservation-return-redirect"
                  className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground"
                >
                  Once a rental is active, returns are handled through the
                  Rental Management return workflow — reservations no longer own
                  return/completion.{" "}
                  {res.converted_to_rental_id && (
                    <Link
                      to={`/return/${res.converted_to_rental_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Open return workflow →
                    </Link>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  navigate(`/inspections/new?res=${res.id}&type=checkout`)
                }
              >
                Open inspection wizard
              </Button>
              {!["completed", "cancelled"].includes(res.status) && (
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => {
                    advance("cancelled", "Reservation cancelled.", "out");
                  }}
                >
                  Cancel reservation
                </Button>
              )}
            </div>
          </SectionCard>

          <VerificationResourcesPanel reservationId={res.id} />

          {/* Driver verification */}
          <SectionCard title="Driver verification">
            {driver ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {driver.verification_status === "verified" ? (
                    <ShieldCheck size={16} className="text-status-available" />
                  ) : driver.verification_status === "failed" ? (
                    <ShieldAlert size={16} className="text-status-out" />
                  ) : (
                    <ShieldAlert
                      size={16}
                      className="text-status-maintenance"
                    />
                  )}
                  <span className="text-sm font-medium capitalize text-foreground">
                    {driver.verification_status}
                  </span>
                </div>
                <dl className="space-y-2">
                  <div>
                    <DataLabel>License</DataLabel>
                    <DataValue mono>
                      {driver.license_number} ({driver.license_state})
                    </DataValue>
                  </div>
                  <div>
                    <DataLabel>License expiry</DataLabel>
                    <DataValue mono>{fmtDate(driver.license_expiry)}</DataValue>
                  </div>
                  <div>
                    <DataLabel>Insurance</DataLabel>
                    <DataValue>
                      {driver.verification_status === "verified"
                        ? "On file"
                        : "Pending"}
                    </DataValue>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No driver record yet. Driver details are captured when
                verification runs.
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="lg:col-span-2">
        <ReservationPaymentDialog
          res={res}
          balanceDue={balanceDue}
          onPaid={() => {}}
        />
      </div>
    </div>
  );
}
