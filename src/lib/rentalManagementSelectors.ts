// Connect Pro Fleet — Rental Management workspace selectors (UX consolidation).
//
// This module groups Reservations and Rentals into ONE operational workspace
// ("Rental Management") split across lifecycle stages:
//
//   Reservations → Ready for Checkout → Active Rentals → Returns → Completed
//
// IMPORTANT: This is a NAVIGATION + UX consolidation only. It does NOT merge
// the Reservation and Rental domain models. Each selector derives its rows
// from the EXISTING authoritative store state (reservations[], rentals[],
// customers[], vehicles[]) and reuses the EXISTING checkout-readiness gate
// (canConfirmReservation) and deposit gate (depositBlocksCheckout). No new
// billing, checkout, or lifecycle logic is introduced.
//
// All row types are presentation shapes — they never mutate domain state.

import type { RentalAgreement, Reservation, Customer, Vehicle } from "./types";
import type {
  ResourceCategory,
  ReservationVerification,
} from "./resourceCenter";
import type { RentalDeposit } from "./depositTypes";
import { canConfirmReservation } from "@/components/VerificationResourcesPanel";
import { depositBlocksCheckout, getDepositCollectDue } from "./deposit";

export type RentalManagementTab =
  "booking" | "reservations" | "ready" | "active" | "returns" | "completed";

export const RENTAL_MANAGEMENT_TABS: {
  key: RentalManagementTab;
  label: string;
}[] = [
  // CRM handoff foundation — Booking Requests are the intake stage BEFORE a
  // Reservation exists. A lead/request is NOT automatically a confirmed
  // Reservation; staff review + approve before converting.
  { key: "booking", label: "Booking Requests" },
  { key: "reservations", label: "Reservations" },
  { key: "ready", label: "Ready for Checkout" },
  { key: "active", label: "Active Reservations" },
  { key: "returns", label: "Returns" },
  { key: "completed", label: "Completed" },
];

// ---------------------------------------------------------------------------
// Shared search — one field across the whole workspace.
// Matches reservation #, rental #, customer name, phone/email, vehicle, plate.
// ---------------------------------------------------------------------------

export function rentalManagementSearchMatch(args: {
  query: string;
  text: string;
}): boolean {
  const q = args.query.trim().toLowerCase();
  if (!q) return true;
  return args.text.toLowerCase().includes(q);
}

// ---------------------------------------------------------------------------
// RESERVATIONS tab — future bookings that have not yet started.
// Excludes reservations already converted to a rental (those move to the
// Ready / Active / Completed tabs depending on the rental's stage).
// ---------------------------------------------------------------------------

export interface ReservationRow {
  id: string;
  created_at: string;
  renter_name: string;
  renter_email: string;
  renter_phone: string;
  customer_id: string | null;
  status: Reservation["status"];
  start_date: string;
  end_date: string;
  vehicleName: string;
  vehiclePlate: string | null;
  vehicleId: string | null;
  amount_paid: number;
  total_price: number;
  deposit_amount: number;
  deposit_status: Reservation["deposit_status"];
  converted_to_rental_id: string | null;
  source: Reservation["source"];
  created_by_name: string;
}

export interface ReservationFilter {
  // "all" | "needs_action" | "pending_verification" | "confirmed" | "blocked_license"
  value: string;
}

const ACTIONABLE_STATUSES: Reservation["status"][] = [
  "pending_verification",
  "manual_review",
  "pending_insurance_addon",
];

/** Reservations that have NOT been converted to a rental (still pure bookings). */
export function isUnconvertedReservation(r: Reservation): boolean {
  return !r.converted_to_rental_id;
}

export function selectReservationRows(args: {
  reservations: Reservation[];
  vehicles: Vehicle[];
  query: string;
  filter: string;
}): ReservationRow[] {
  const { reservations, vehicles, query, filter } = args;
  return reservations
    .filter(isUnconvertedReservation)
    .filter((r) => {
      if (filter === "needs_action") {
        if (!ACTIONABLE_STATUSES.includes(r.status)) return false;
      } else if (filter === "all") {
        // keep all unconverted
      } else if (filter !== r.status) {
        return false;
      }
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      const text = [
        r.id,
        r.renter_name,
        r.renter_email,
        r.renter_phone,
        v ? `${v.make} ${v.model}` : "",
        v?.license_plate ?? "",
      ].join(" ");
      return rentalManagementSearchMatch({ query, text });
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      return {
        id: r.id,
        created_at: r.created_at,
        renter_name: r.renter_name,
        renter_email: r.renter_email,
        renter_phone: r.renter_phone,
        customer_id: r.customer_id ?? null,
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
        vehicleName: v ? `${v.make} ${v.model}` : "—",
        vehiclePlate: v?.license_plate ?? null,
        vehicleId: v?.id ?? null,
        amount_paid: r.amount_paid,
        total_price: r.total_price,
        deposit_amount: r.deposit_amount,
        deposit_status: r.deposit_status,
        converted_to_rental_id: r.converted_to_rental_id ?? null,
        source: r.source,
        created_by_name: r.created_by_name,
      };
    });
}

// ---------------------------------------------------------------------------
// READY FOR CHECKOUT tab — confirmed reservations eligible to begin checkout.
//
// Reuses the EXISTING authoritative eligibility logic:
//   - reservation is "confirmed" (verification gate passed)
//   - not yet converted to a rental
//   - the deposit gate (depositBlocksCheckout) determines readiness sub-status
//
// This does NOT invent a second checkout-readiness formula. It surfaces the
// same facts the CheckoutWorkflow uses, as a queue.
// ---------------------------------------------------------------------------

export type CheckoutReadiness =
  | "ready"
  | "deposit_needed"
  | "payment_due"
  | "verification_needed"
  | "vehicle_issue"
  | "not_ready";

export interface ReadyForCheckoutRow {
  reservationId: string;
  rentalId: string | null;
  renter_name: string;
  customer_id: string | null;
  vehicleName: string;
  vehiclePlate: string | null;
  vehicleId: string | null;
  start_date: string;
  end_date: string;
  amount_paid: number;
  total_price: number;
  balanceDue: number;
  depositRequired: number;
  depositCollectDue: number;
  depositBlocks: boolean;
  readiness: CheckoutReadiness;
  readinessLabel: string;
}

export function checkoutReadinessFor(args: {
  reservation: Reservation;
  deposit: RentalDeposit | null;
  verificationsOk: boolean;
}): CheckoutReadiness {
  const { reservation, deposit, verificationsOk } = args;
  // Verification gate not passed → still needs verification.
  if (!verificationsOk) return "verification_needed";
  // Deposit uncollected → deposit needed.
  if (depositBlocksCheckout(deposit)) return "deposit_needed";
  // Balance outstanding (more than half unpaid mirrors the checkout payment gate).
  const balanceDue = Math.max(
    0,
    reservation.total_price - reservation.amount_paid,
  );
  if (reservation.amount_paid < reservation.total_price * 0.5)
    return "payment_due";
  // No vehicle linked → vehicle issue.
  if (!reservation.vehicle_id) return "vehicle_issue";
  return "ready";
}

export const CHECKOUT_READINESS_LABELS: Record<CheckoutReadiness, string> = {
  ready: "Ready",
  deposit_needed: "Deposit Needed",
  payment_due: "Missing Payment",
  verification_needed: "Verification Needed",
  vehicle_issue: "Vehicle Issue",
  not_ready: "Not Ready",
};

export function selectReadyForCheckoutRows(args: {
  reservations: Reservation[];
  vehicles: Vehicle[];
  deposits: RentalDeposit[];
  resourceCategories: ResourceCategory[];
  verifications: ReservationVerification[];
  query: string;
}): ReadyForCheckoutRow[] {
  const {
    reservations,
    vehicles,
    deposits,
    resourceCategories,
    verifications,
    query,
  } = args;
  return reservations
    .filter(isUnconvertedReservation)
    .filter((r) => r.status === "confirmed")
    .filter((r) => {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      const text = [
        r.id,
        r.renter_name,
        r.renter_email,
        r.renter_phone,
        v ? `${v.make} ${v.model}` : "",
        v?.license_plate ?? "",
      ].join(" ");
      return rentalManagementSearchMatch({ query, text });
    })
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    .map((r) => {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      const deposit = deposits.find((d) => d.reservation_id === r.id) ?? null;
      const { ok } = canConfirmReservation(
        resourceCategories,
        verifications,
        r.id,
      );
      // A confirmed reservation has already passed verification, but we still
      // surface the gate result for the readiness sub-status.
      const readiness = checkoutReadinessFor({
        reservation: r,
        deposit,
        verificationsOk: ok,
      });
      const balanceDue = Math.max(0, r.total_price - r.amount_paid);
      return {
        reservationId: r.id,
        rentalId: r.converted_to_rental_id ?? null,
        renter_name: r.renter_name,
        customer_id: r.customer_id ?? null,
        vehicleName: v ? `${v.make} ${v.model}` : "—",
        vehiclePlate: v?.license_plate ?? null,
        vehicleId: v?.id ?? null,
        start_date: r.start_date,
        end_date: r.end_date,
        amount_paid: r.amount_paid,
        total_price: r.total_price,
        balanceDue,
        depositRequired: r.deposit_amount,
        depositCollectDue: deposit ? getDepositCollectDue(deposit) : 0,
        depositBlocks: depositBlocksCheckout(deposit),
        readiness,
        readinessLabel: CHECKOUT_READINESS_LABELS[readiness],
      };
    });
}

// ---------------------------------------------------------------------------
// ACTIVE RENTALS tab — customers currently in vehicles.
// ---------------------------------------------------------------------------

export interface ActiveRentalRow {
  id: string;
  agreement_number: string;
  created_at: string;
  customerName: string;
  customerId: string | null;
  vehicleName: string;
  vehicleId: string | null;
  checkout: string | null;
  scheduledReturn: string;
  balance: number;
  nextPaymentDue: string | null;
  status: RentalAgreement["status"];
  reservationId: string | null;
}

const ACTIVE_RENTAL_STATUSES: RentalAgreement["status"][] = [
  "active",
  "payment_due",
  "late",
  "overdue",
  "return_pending",
];

export function isActiveRental(r: RentalAgreement): boolean {
  return ACTIVE_RENTAL_STATUSES.includes(r.status);
}

export function selectActiveRentalRows(args: {
  rentals: RentalAgreement[];
  customers: Customer[];
  vehicles: Vehicle[];
  query: string;
  filter: string;
  /** Active payment arrangements (for the "arrangement" filter). Omit to treat
   *  the arrangement filter as empty. */
  arrangements?: import("./paymentArrangementTypes").PaymentArrangement[];
  /** Rental deposits (for the "deposit" filter). Omit to treat the deposit
   *  filter as empty. */
  deposits?: import("./depositTypes").RentalDeposit[];
}): ActiveRentalRow[] {
  const {
    rentals,
    customers,
    vehicles,
    query,
    filter,
    arrangements,
    deposits,
  } = args;
  const arrangementRentalIds = new Set(
    (arrangements ?? [])
      .filter(
        (a) =>
          a.status === "active" ||
          a.status === "draft" ||
          a.status === "broken",
      )
      .map((a) => a.rental_id)
      .filter(Boolean) as string[],
  );
  const depositRentalIds = new Set(
    (deposits ?? [])
      .filter(
        (d) =>
          d.status === "held" ||
          d.status === "refund_pending" ||
          d.status === "partially_refunded" ||
          d.status === "partially_applied",
      )
      .map((d) => d.rental_id)
      .filter(Boolean) as string[],
  );
  return rentals
    .filter(isActiveRental)
    .filter((r) => {
      if (filter === "all") return true;
      if (filter === "payment_due") return r.status === "payment_due";
      if (filter === "late") return ["late", "overdue"].includes(r.status);
      if (filter === "return_pending") return r.status === "return_pending";
      if (filter === "arrangement") return arrangementRentalIds.has(r.id);
      if (filter === "deposit") return depositRentalIds.has(r.id);
      return r.status === filter;
    })
    .filter((r) => {
      const customer = customers.find((c) => c.id === r.customer_id);
      const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
      const text = [
        r.agreement_number,
        r.id,
        customer ? `${customer.first_name} ${customer.last_name}` : "",
        vehicle ? `${vehicle.make} ${vehicle.model}` : "",
        vehicle?.license_plate ?? "",
      ].join(" ");
      return rentalManagementSearchMatch({ query, text });
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => {
      const customer = customers.find((c) => c.id === r.customer_id);
      const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
      return {
        id: r.id,
        agreement_number: r.agreement_number,
        created_at: r.created_at,
        customerName: customer
          ? `${customer.first_name} ${customer.last_name}`
          : "—",
        customerId: customer?.id ?? null,
        vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : "—",
        vehicleId: vehicle?.id ?? null,
        checkout: r.checkout_date,
        scheduledReturn: r.scheduled_return_date,
        balance: r.balance_due,
        nextPaymentDue: r.next_payment_due ?? null,
        status: r.status,
        reservationId: r.reservation_id,
      };
    });
}

// ---------------------------------------------------------------------------
// RETURNS tab — rentals due back / return pending / overdue return.
// ---------------------------------------------------------------------------

export interface ReturnRow {
  id: string;
  agreement_number: string;
  customerName: string;
  customerId: string | null;
  vehicleName: string;
  vehicleId: string | null;
  scheduledReturn: string;
  status: RentalAgreement["status"];
  balance: number;
  reservationId: string | null;
}

export type ReturnFilter = "today" | "pending" | "overdue" | "all";

export function selectReturnRows(args: {
  rentals: RentalAgreement[];
  customers: Customer[];
  vehicles: Vehicle[];
  query: string;
  filter: ReturnFilter;
  todayISO: string;
}): ReturnRow[] {
  const { rentals, customers, vehicles, query, filter, todayISO } = args;
  return rentals
    .filter(isActiveRental)
    .filter((r) => {
      if (filter === "all") return true;
      if (filter === "today") {
        return r.scheduled_return_date === todayISO;
      }
      if (filter === "pending") return r.status === "return_pending";
      if (filter === "overdue") return r.status === "overdue";
      return true;
    })
    .filter((r) => {
      const customer = customers.find((c) => c.id === r.customer_id);
      const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
      const text = [
        r.agreement_number,
        r.id,
        customer ? `${customer.first_name} ${customer.last_name}` : "",
        vehicle ? `${vehicle.make} ${vehicle.model}` : "",
        vehicle?.license_plate ?? "",
      ].join(" ");
      return rentalManagementSearchMatch({ query, text });
    })
    .sort((a, b) =>
      a.scheduled_return_date < b.scheduled_return_date ? -1 : 1,
    )
    .map((r) => {
      const customer = customers.find((c) => c.id === r.customer_id);
      const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
      return {
        id: r.id,
        agreement_number: r.agreement_number,
        customerName: customer
          ? `${customer.first_name} ${customer.last_name}`
          : "—",
        customerId: customer?.id ?? null,
        vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : "—",
        vehicleId: vehicle?.id ?? null,
        scheduledReturn: r.scheduled_return_date,
        status: r.status,
        balance: r.balance_due,
        reservationId: r.reservation_id,
      };
    });
}

// ---------------------------------------------------------------------------
// COMPLETED tab — historical completed rentals.
// ---------------------------------------------------------------------------

export interface CompletedRentalRow {
  id: string;
  agreement_number: string;
  created_at: string;
  customerName: string;
  customerId: string | null;
  vehicleName: string;
  vehicleId: string | null;
  checkout: string | null;
  actualReturn: string | null;
  finalAmount: number;
  status: RentalAgreement["status"];
  reservationId: string | null;
}

export function selectCompletedRentalRows(args: {
  rentals: RentalAgreement[];
  customers: Customer[];
  vehicles: Vehicle[];
  query: string;
}): CompletedRentalRow[] {
  const { rentals, customers, vehicles, query } = args;
  return rentals
    .filter((r) => r.status === "completed")
    .filter((r) => {
      const customer = customers.find((c) => c.id === r.customer_id);
      const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
      const text = [
        r.agreement_number,
        r.id,
        customer ? `${customer.first_name} ${customer.last_name}` : "",
        vehicle ? `${vehicle.make} ${vehicle.model}` : "",
        vehicle?.license_plate ?? "",
      ].join(" ");
      return rentalManagementSearchMatch({ query, text });
    })
    .sort((a, b) =>
      (a.actual_return_date ?? a.created_at) <
      (b.actual_return_date ?? b.created_at)
        ? 1
        : -1,
    )
    .map((r) => {
      const customer = customers.find((c) => c.id === r.customer_id);
      const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
      return {
        id: r.id,
        agreement_number: r.agreement_number,
        created_at: r.created_at,
        customerName: customer
          ? `${customer.first_name} ${customer.last_name}`
          : "—",
        customerId: customer?.id ?? null,
        vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : "—",
        vehicleId: vehicle?.id ?? null,
        checkout: r.checkout_date,
        actualReturn: r.actual_return_date,
        finalAmount: r.subtotal + r.fees,
        status: r.status,
        reservationId: r.reservation_id,
      };
    });
}

// ---------------------------------------------------------------------------
// LIFECYCLE VISUALIZATION — subtle stage indicator.
// Reservation → Ready → Active Rental → Return → Completed
// ---------------------------------------------------------------------------

export type LifecycleStage =
  "reservation" | "ready" | "active" | "return" | "completed";

export const LIFECYCLE_STAGES: { key: LifecycleStage; label: string }[] = [
  { key: "reservation", label: "Reservation" },
  { key: "ready", label: "Ready" },
  { key: "active", label: "Active Rental" },
  { key: "return", label: "Return" },
  { key: "completed", label: "Completed" },
];

/** Resolve the current lifecycle stage for a reservation. */
export function reservationLifecycleStage(r: Reservation): LifecycleStage {
  if (r.status === "cancelled") return "reservation";
  if (r.converted_to_rental_id) return "active";
  if (r.status === "confirmed") return "ready";
  return "reservation";
}

/** Resolve the current lifecycle stage for a rental. */
export function rentalLifecycleStage(r: RentalAgreement): LifecycleStage {
  if (r.status === "completed") return "completed";
  if (r.status === "ready_for_checkout") return "ready";
  if (r.status === "return_pending") return "return";
  if (["active", "payment_due", "late", "overdue"].includes(r.status))
    return "active";
  return "reservation";
}
