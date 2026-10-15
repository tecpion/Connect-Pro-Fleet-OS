// Connect Pro Fleet — dashboard selectors.
//
// Derived operational metrics for the command-center dashboard. Pure functions
// over the existing store data — no duplicate state, no fabricated values.
// Everything here is computed from vehicles / reservations / rentals /
// maintenance / drivers / inspections / transactions so the dashboard scales
// from 5 to 500+ vehicles without per-record hard-coding.
//
// Build #5 cleanup: the legacy financial helpers (collectedThisWeek,
// outstandingBalance, revenueThisMonth, netContribution) and the weekly-only
// payment derivations (paymentObligations, weeklyPayments, paymentsDueToday,
// latePayments) were removed — they duplicated the authoritative selectors in
// financialSelectors.ts and billingSelectors.ts. Dashboard now imports those.

import type {
  MaintenanceRecord,
  RentalAgreement,
  Reservation,
  Vehicle,
} from "./types";
import { startOfWeek, startOfMonth } from "./financialSelectors";

const DAY = 86_400_000;
const todayStr = () => new Date().toISOString().slice(0, 10);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export interface FleetStatusCounts {
  total: number;
  rentable: number;
  available: number;
  rented: number;
  reserved: number;
  maintenance: number;
  out_of_service: number;
  utilization: number; // %
}

export function fleetStatusCounts(
  vehicles: Vehicle[],
  reservations: Reservation[],
): FleetStatusCounts {
  const total = vehicles.length;
  const available = vehicles.filter((v) => v.status === "available").length;
  const rented = vehicles.filter((v) => v.status === "rented").length;
  const maintenance = vehicles.filter((v) => v.status === "maintenance").length;
  const out_of_service = vehicles.filter(
    (v) => v.status === "out_of_service",
  ).length;
  // Reserved = available vehicles with a confirmed (not yet active) reservation
  // starting today or later.
  const today = todayStr();
  const reservedVehicleIds = new Set(
    reservations
      .filter(
        (r) =>
          r.status === "confirmed" && r.start_date >= today && r.vehicle_id,
      )
      .map((r) => r.vehicle_id),
  );
  const reserved = vehicles.filter(
    (v) => v.status === "available" && reservedVehicleIds.has(v.id),
  ).length;
  const rentable = total - out_of_service;
  const utilization = rentable ? Math.round((rented / rentable) * 100) : 0;
  return {
    total,
    rentable,
    available,
    rented,
    reserved,
    maintenance,
    out_of_service,
    utilization,
  };
}

export function activeRentalCount(rentals: RentalAgreement[]): number {
  return rentals.filter((r) =>
    ["active", "late", "overdue", "payment_due"].includes(r.status),
  ).length;
}

// --- Returns / pickups today ----------------------------------------------

export function returnsToday(rentals: RentalAgreement[]): RentalAgreement[] {
  const today = todayStr();
  return rentals.filter(
    (r) =>
      !r.actual_return_date &&
      r.scheduled_return_date === today &&
      ["active", "late", "overdue", "payment_due", "return_pending"].includes(
        r.status,
      ),
  );
}

export function overdueRentals(rentals: RentalAgreement[]): RentalAgreement[] {
  const today = startOfDay(new Date());
  return rentals
    .filter((r) => r.status === "overdue" || r.status === "late")
    .map((r) => {
      const due = new Date(
        (r.scheduled_return_date ?? r.next_payment_due ?? "") + "T00:00:00",
      );
      return { r, due };
    })
    .filter(({ due }) => !isNaN(due.getTime()) && due < today)
    .map(({ r }) => r);
}

export function pickupsToday(
  reservations: Reservation[],
  rentals: RentalAgreement[],
): { reservation: Reservation | null; rental: RentalAgreement | null }[] {
  const today = todayStr();
  // Pickups = confirmed reservations starting today that aren't yet active,
  // plus rentals in ready_for_checkout status checked out today.
  const confirmedToday = reservations.filter(
    (r) => r.start_date === today && r.status === "confirmed",
  );
  const readyRentals = rentals.filter(
    (r) => r.status === "ready_for_checkout" && r.checkout_date === null,
  );
  const out: {
    reservation: Reservation | null;
    rental: RentalAgreement | null;
  }[] = [];
  for (const res of confirmedToday)
    out.push({ reservation: res, rental: null });
  for (const rnt of readyRentals) {
    if (out.some((o) => o.rental?.id === rnt.id)) continue;
    const res = reservations.find((x) => x.id === rnt.reservation_id) ?? null;
    out.push({ reservation: res, rental: rnt });
  }
  return out;
}

// --- Maintenance ---------------------------------------------------------

export function maintenanceAttention(
  maintenance: MaintenanceRecord[],
  vehicles: Vehicle[],
): MaintenanceRecord[] {
  const today = new Date();
  return maintenance.filter((m) => {
    if (m.completed_date) return false;
    if (new Date(m.scheduled_date) < today) return true; // overdue scheduled
    if (m.next_service_mileage_estimate) {
      const v = vehicles.find((x) => x.id === m.vehicle_id);
      if (v && v.current_mileage >= m.next_service_mileage_estimate)
        return true;
    }
    if (
      m.next_service_date_estimate &&
      new Date(m.next_service_date_estimate) <= today
    )
      return true;
    return false;
  });
}

// Daily collections series for the small chart (most recent N days).
export function collectionsSeries(
  transactions: import("./types").FinancialTransaction[],
  days: number,
): { date: string; amount: number }[] {
  const today = startOfDay(new Date());
  const buckets: { date: string; amount: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY);
    buckets.push({ date: d.toISOString().slice(0, 10), amount: 0 });
  }
  const map = new Map(buckets.map((b) => [b.date, b]));
  for (const t of transactions) {
    if (t.category !== "payment" || t.status !== "posted") continue;
    const b = map.get(t.effective_date);
    if (b) b.amount += t.amount;
  }
  return buckets;
}

// --- Interval-based collections series (Today / This Week / This Month) -----

export type CollectionsInterval = "today" | "week" | "month";

export interface CollectionPoint {
  key: string;
  label: string;
  amount: number;
}

function endOfWeek(now: Date): Date {
  const day = (now.getDay() + 6) % 7; // Monday = 0
  return startOfDay(new Date(now.getTime() + (6 - day) * DAY));
}

function endOfMonth(now: Date): Date {
  return startOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function hourLabel(h: number): string {
  const period = h < 12 ? "a" : "p";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

// Collections series keyed to a named interval. "today" buckets by hour
// (using the transaction timestamp) so a single-day view is still meaningful;
// "week" and "month" bucket by day using effective_date, matching the legacy
// collectionsSeries behavior.
export function collectionsSeriesForInterval(
  transactions: import("./types").FinancialTransaction[],
  interval: CollectionsInterval,
): CollectionPoint[] {
  const now = new Date();
  const posted = transactions.filter(
    (t) => t.category === "payment" && t.status === "posted",
  );

  if (interval === "today") {
    const start = startOfDay(now);
    const curHour = now.getHours();
    const buckets: CollectionPoint[] = [];
    for (let h = 0; h <= curHour; h++) {
      const d = new Date(start);
      d.setHours(h, 0, 0, 0);
      buckets.push({
        key: d.toISOString().slice(0, 13),
        label: hourLabel(h),
        amount: 0,
      });
    }
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const t of posted) {
      const td = new Date(t.created_at);
      if (isNaN(td.getTime()) || td < start || td > now) continue;
      const key = td.toISOString().slice(0, 13);
      const b = map.get(key);
      if (b) b.amount += t.amount;
    }
    return buckets;
  }

  const start = interval === "week" ? startOfWeek(now) : startOfMonth(now);
  const end = interval === "week" ? endOfWeek(now) : endOfMonth(now);
  const last = end > now ? now : end;
  const buckets: CollectionPoint[] = [];
  for (let d = new Date(start); d <= last; d = new Date(d.getTime() + DAY)) {
    buckets.push({
      key: d.toISOString().slice(0, 10),
      label: dayFmt.format(d),
      amount: 0,
    });
  }
  // Guard against an empty range (e.g. clock skew).
  if (buckets.length === 0) {
    buckets.push({
      key: now.toISOString().slice(0, 10),
      label: dayFmt.format(now),
      amount: 0,
    });
  }
  const map = new Map(buckets.map((b) => [b.key, b]));
  for (const t of posted) {
    const b = map.get(t.effective_date);
    if (b) b.amount += t.amount;
  }
  return buckets;
}

// Build #10 — payment arrangement attention items (promises due today + broken).
export interface ArrangementAttention {
  promisesDueToday: number;
  broken: number;
}

import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "./paymentArrangementTypes";
import type { FinancialTransaction } from "./types";
import {
  getPromisesDueToday,
  getBrokenArrangements,
} from "./paymentArrangements";

export interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  tone: "available" | "maintenance" | "out" | "rented" | "neutral";
  to: string;
  cta: string;
}

export function arrangementAttentionItems(
  arrangements: PaymentArrangement[],
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  outstandingFor?: (arrangement: PaymentArrangement) => number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const byArr = (id: string) =>
    installments.filter((i) => i.arrangement_id === id);
  const promisesDue = getPromisesDueToday(
    arrangements,
    byArr,
    transactions,
    outstandingFor,
  );
  if (promisesDue.length > 0)
    items.push({
      key: "promises_due",
      title: "Promises due today",
      detail: `${promisesDue.length} ${promisesDue.length === 1 ? "promise" : "promises"} to pay due today`,
      tone: "maintenance",
      to: "/payment-arrangements",
      cta: "View arrangements",
    });
  const brokenArr = getBrokenArrangements(
    arrangements,
    byArr,
    transactions,
    outstandingFor,
  );
  if (brokenArr.length > 0)
    items.push({
      key: "broken_arr",
      title: "Broken arrangements",
      detail: `${brokenArr.length} ${brokenArr.length === 1 ? "promise" : "promises"} missed`,
      tone: "out",
      to: "/payment-arrangements",
      cta: "View arrangements",
    });
  return items;
}
