// Connect Pro Fleet — rental lifecycle actions (Build #5): rate change,
// vehicle exchange, extension, and the legacy weekly billing wrapper.
// These are explicit domain events — history is preserved, never overwritten.

import { fmtMoney } from "../format";
import type { RentalEvent, RentalStatus } from "../types";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import type { RentalVehicleExchange } from "./storeContext";

const DAY = 86_400_000;

export function buildRentalLifecycleMethods(s: StoreState) {
  function addEvent(e: RentalEvent) {
    s.setRentalEvents((es) => [e, ...es]);
  }
  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "neutral",
  ) {
    s.setActivity((a) =>
      [
        { id: uid("act"), at: new Date().toISOString(), label, tone },
        ...a,
      ].slice(0, 30),
    );
  }

  return {
    changeRentalRate: (input: {
      rentalId: string;
      newRate: number;
      effectiveDate: string;
      reason?: string;
    }) => {
      const rental = s.rentals.find((r) => r.id === input.rentalId);
      if (!rental) return;
      const now = new Date().toISOString();
      const oldRate = rental.rate_amount;
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === input.rentalId
            ? {
                ...r,
                rate_amount: input.newRate,
                billing_config: r.billing_config
                  ? { ...r.billing_config, recurring_amount: input.newRate }
                  : r.billing_config,
                updated_at: now,
              }
            : r,
        ),
      );
      addEvent({
        id: uid("rev"),
        rental_id: input.rentalId,
        type: "extended",
        label: `Rate changed — ${fmtMoney(oldRate)} → ${fmtMoney(input.newRate)} effective ${input.effectiveDate}${input.reason ? ` · ${input.reason}` : ""}`,
        at: now,
        tone: "neutral",
        staff_id: s.currentStaffId,
      });
      logAct(
        `Rate changed on ${rental.agreement_number} — ${fmtMoney(oldRate)} → ${fmtMoney(input.newRate)}`,
        "neutral",
      );
      s.setSettingsAudit((a) =>
        [
          {
            id: uid("aud"),
            tenant_id: TENANT_ID,
            at: now,
            actor_id: s.currentStaffId,
            action: "Rental rate changed",
            detail: input.reason ?? null,
            old_value: String(oldRate),
            new_value: String(input.newRate),
          },
          ...a,
        ].slice(0, 100),
      );
    },

    exchangeVehicle: (input: {
      rentalId: string;
      newVehicleId: string;
      reason: string;
      oldMileageIn: number;
      oldFuelIn: number;
      newMileageOut: number;
      newFuelOut: number;
      newVehicleDisposition?: "available" | "maintenance" | "out_of_service";
      rateChange?: { newRate: number; reason: string } | null;
    }) => {
      const rental = s.rentals.find((r) => r.id === input.rentalId);
      if (!rental) return;
      const newVehicle = s.vehicles.find((v) => v.id === input.newVehicleId);
      if (!newVehicle) return;
      const now = new Date().toISOString();
      const oldVehicleId = rental.vehicle_id;
      const oldRate = rental.rate_amount;
      const rateChanged = !!input.rateChange;
      const newRate = input.rateChange?.newRate ?? rental.rate_amount;

      const exch: RentalVehicleExchange = {
        id: uid("exch"),
        tenant_id: TENANT_ID,
        rental_id: input.rentalId,
        customer_id: rental.customer_id,
        old_vehicle_id: oldVehicleId,
        new_vehicle_id: input.newVehicleId,
        exchange_at: now,
        reason: input.reason,
        old_mileage_in: input.oldMileageIn,
        old_fuel_in: input.oldFuelIn,
        new_mileage_out: input.newMileageOut,
        new_fuel_out: input.newFuelOut,
        old_vehicle_disposition: input.newVehicleDisposition ?? "available",
        rate_changed: rateChanged,
        old_rate: oldRate,
        new_rate: rateChanged ? newRate : null,
        created_by: s.currentStaffId,
        created_at: now,
      };
      s.setVehicleExchanges((xs) => [...xs, exch]);

      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === input.rentalId
            ? {
                ...r,
                vehicle_id: input.newVehicleId,
                mileage_out: input.newMileageOut,
                fuel_out: input.newFuelOut,
                rate_amount: newRate,
                billing_config:
                  rateChanged && r.billing_config
                    ? { ...r.billing_config, recurring_amount: newRate }
                    : r.billing_config,
                updated_at: now,
              }
            : r,
        ),
      );

      s.setVehicles((vs) =>
        vs.map((v) => {
          if (v.id === oldVehicleId) {
            return {
              ...v,
              status: input.newVehicleDisposition ?? "available",
              current_mileage: input.oldMileageIn,
              updated_at: now,
            };
          }
          if (v.id === input.newVehicleId) {
            return {
              ...v,
              status: "rented",
              current_mileage: input.newMileageOut,
              updated_at: now,
            };
          }
          return v;
        }),
      );

      addEvent({
        id: uid("rev"),
        rental_id: input.rentalId,
        type: "exchanged",
        label: `Vehicle exchanged — ${input.reason}${rateChanged ? ` · rate ${fmtMoney(oldRate)} → ${fmtMoney(newRate)}` : ""}`,
        at: now,
        tone: "neutral",
        staff_id: s.currentStaffId,
      });
      logAct(
        `Vehicle exchanged on ${rental.agreement_number} — ${input.reason}`,
        "neutral",
      );
    },

    vehicleExchanges: (rentalId: string) =>
      s.vehicleExchanges.filter((x) => x.rental_id === rentalId),

    extendRental: (rentalId: string, days: number) => {
      const rental = s.rentals.find((r) => r.id === rentalId);
      if (!rental || !rental.scheduled_return_date) return;
      const now = new Date().toISOString();
      const prevReturn = rental.scheduled_return_date;
      const newReturn = new Date(
        new Date(prevReturn + "T00:00:00").getTime() + days * DAY,
      )
        .toISOString()
        .slice(0, 10);
      const extensionCost =
        rental.rate_type === "weekly"
          ? days >= 7
            ? rental.rate_amount
            : Math.round((rental.rate_amount / 7) * days)
          : rental.rate_amount * days;
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === rentalId
            ? {
                ...r,
                scheduled_return_date: newReturn,
                subtotal: r.subtotal + extensionCost,
                balance_due: r.balance_due + extensionCost,
                weeks_rented:
                  rental.rate_type === "weekly"
                    ? r.weeks_rented + Math.floor(days / 7)
                    : r.weeks_rented,
                updated_at: now,
              }
            : r,
        ),
      );
      addEvent({
        id: uid("rev"),
        rental_id: rentalId,
        type: "extended",
        label: `Rental extended ${days} days — ${fmtMoney(extensionCost)} added (return ${newReturn})`,
        at: now,
        tone: "available",
        staff_id: s.currentStaffId,
      });
      logAct(
        `Rental extended — ${rental.agreement_number} (+${days}d)`,
        "available",
      );
    },

    processWeeklyBilling: () => {
      const now = new Date();
      const newEvents: RentalEvent[] = [];
      s.setRentals((rs) =>
        rs.map((r) => {
          if (
            r.rate_type !== "weekly" ||
            !r.next_payment_due ||
            !["active", "payment_due", "late", "overdue"].includes(r.status)
          )
            return r;
          const due = new Date(r.next_payment_due + "T00:00:00");
          const diffDays = Math.round((now.getTime() - due.getTime()) / DAY);
          const gracePassed = diffDays * 24 + now.getHours() >= r.grace_period;
          const isLate =
            gracePassed &&
            r.balance_due > 0 &&
            !r.late_fee_applied &&
            r.status !== "overdue";
          let nextDue = r.next_payment_due;
          let weeks = r.weeks_rented;
          if (diffDays >= 1) {
            const next = new Date(due.getTime() + 7 * DAY);
            nextDue = next.toISOString().slice(0, 10);
            weeks = r.weeks_rented + 1;
            newEvents.push({
              id: uid("rev"),
              rental_id: r.id,
              type: "payment",
              label: `Weekly billing period opened — ${fmtMoney(r.rate_amount)} due ${nextDue}`,
              at: now.toISOString(),
              tone: "neutral",
              staff_id: null,
            });
          }
          const status: RentalStatus = isLate
            ? "late"
            : r.balance_due > 0 && gracePassed
              ? "overdue"
              : r.balance_due > 0
                ? "payment_due"
                : "active";
          return {
            ...r,
            next_payment_due: nextDue,
            weeks_rented: weeks,
            status,
            late_fee_applied:
              isLate && r.late_fee > 0 ? true : r.late_fee_applied,
            balance_due:
              isLate && r.late_fee > 0
                ? r.balance_due + r.late_fee
                : r.balance_due,
            fees: isLate && r.late_fee > 0 ? r.fees + r.late_fee : r.fees,
            updated_at: now.toISOString(),
          };
        }),
      );
      if (newEvents.length) s.setRentalEvents((es) => [...newEvents, ...es]);
    },

    /** Build #19 — purge an imported-legacy rental and its migration-only
     *  financial records (opening-balance charge + migrated held-deposit
     *  transaction + deposit record). Used by import-batch rollback. Safe only
     *  when the rental has NO native payments — callers must verify first. */
    purgeImportedRental: (rentalId: string) => {
      s.setRentals((rs) => rs.filter((r) => r.id !== rentalId));
      s.setTransactions((ts) =>
        ts.filter((t) => {
          if (t.rental_id !== rentalId) return true;
          if (t.transaction_type === "migration_opening_balance") return false;
          const md = t.metadata as Record<string, unknown> | null;
          if (md?.migration === true && md?.deposit_kind === "collection")
            return false;
          return true;
        }),
      );
      s.setRentalDeposits((ds) =>
        ds.filter(
          (d) =>
            !(d.rental_id === rentalId && (d.notes ?? "").includes("Migrated")),
        ),
      );
    },
  };
}
