// Connect Pro Fleet — Universal rental billing store (Build #3 / Build #9 cleanup).
//
// Standalone context (mirrors the resource-center / incidents / investor
// pattern) because the main fleet store module is at its size ceiling. Holds
// BillingPeriod state and the generalized processing engine. Consumes the
// existing store's ledger/rental methods so the ledger stays the financial
// source of truth — BillingPeriods are schedule/obligation context only.
//
// Build #9 cleanup — processRentalBilling now posts each period's FULL
// obligation (base + per-period fees + taxes) via store.postPeriodCharges,
// instead of only the base rental charge. Each component posts as its own
// ledger charge linked to the period via metadata.billing_period_id, so the
// period's total obligation = sum of its linked charges (authoritative).
// Payments Due / settlement / dashboard derive from the same allocation.
// All records are tenant-scoped. Designed to become Supabase tables + a
// scheduled function.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStore, uid, TENANT_ID } from "./store";
import {
  allocatePayments,
  generatePeriodSpecs,
  lateFeeEligibility,
  nextPaymentDue,
  periodDedupeKey,
  periodStatus,
  resolveBillingConfig,
  rentalLateStatus,
  rentalTermDays,
  type AllocationResult,
} from "./billing";
import { roundMoney } from "./taxEngine";
import type { BillingPeriod, RentalBillingConfig } from "./billingTypes";
import type { RentalAgreement } from "./types";
import { fmtMoney } from "./format";
import { makePeriod, seedPeriods } from "./billingPeriodFactory";
import { getIntegrationEmitter } from "./integrationEmitterRef";

export interface BillingContextValue {
  billingPeriods: BillingPeriod[];
  rentalPeriods: (rentalId: string) => BillingPeriod[];
  rentalAllocation: (rentalId: string) => AllocationResult;
  processRentalBilling: () => {
    periodsGenerated: number;
    chargesPosted: number;
    lateFeesApplied: number;
  };
  processWeeklyBilling: () => void;
  setRentalBillingConfig: (
    rentalId: string,
    config: RentalBillingConfig,
  ) => void;
  addManualPeriod: (
    rentalId: string,
    input: { dueAt: string; amount: number; label?: string },
  ) => void;
  waivePeriod: (periodId: string) => void;
  cancelPeriod: (periodId: string) => void;
}

const BillingContext = createContext<BillingContextValue | null>(null);

function labelForFrequency(f: BillingPeriod["billing_frequency"]): string {
  switch (f) {
    case "weekly":
      return "Weekly";
    case "daily":
      return "Daily";
    case "biweekly":
      return "Biweekly";
    case "upfront":
      return "Upfront";
    case "custom":
      return "Custom";
    case "monthly":
      return "Monthly";
    default:
      return "Rental";
  }
}

/** Days covered by a period spec (inclusive start, exclusive end convention
 *  matches generatePeriodSpecs: weekly = 7, daily = 1, biweekly = 14). */
function periodDays(
  spec: { period_start: string; period_end: string },
  rental: RentalAgreement,
): number {
  const ms =
    new Date(spec.period_end + "T00:00:00").getTime() -
    new Date(spec.period_start + "T00:00:00").getTime();
  const days = Math.round(ms / 86_400_000) + 1; // inclusive
  if (days > 0) return days;
  // Fallback for same-day periods (custom installments).
  return Math.max(1, rentalTermDays(rental));
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { rentals, transactions } = store;
  const [periodState, setPeriods] = useState<BillingPeriod[]>(() =>
    seedPeriods(rentals, transactions),
  );

  const value = useMemo<BillingContextValue>(() => {
    const rentalPeriods = (rentalId: string) =>
      periodState
        .filter((p) => p.rental_id === rentalId)
        .sort((a, b) =>
          a.sequence_number === b.sequence_number
            ? a.due_at < b.due_at
              ? -1
              : 1
            : a.sequence_number - b.sequence_number,
        );

    const rentalAllocation = (rentalId: string) =>
      allocatePayments(rentalPeriods(rentalId), transactions, rentalId);

    const processRentalBilling = () => {
      let periodsGenerated = 0;
      let chargesPosted = 0;
      let lateFeesApplied = 0;
      const now = new Date().toISOString();
      const newEvents: { rentalId: string; label: string }[] = [];
      const updated = [...periodState];
      // Read the latest rentals from the store directly so a stale memo
      // closure never misses a just-added rental. (Transactions are read
      // live in the late-fee/allocation pass below — see that comment.)
      const currentRentals = store.rentals;

      for (const r of currentRentals) {
        if (!["active", "payment_due", "late", "overdue"].includes(r.status))
          continue;
        const config = resolveBillingConfig(r);
        const specs = generatePeriodSpecs(r, config);
        for (const spec of specs) {
          const key = periodDedupeKey(r.id, spec.period_start, spec.period_end);
          if (updated.some((p) => p.dedupe_key === key)) continue;
          const seq = updated.filter((p) => p.rental_id === r.id).length + 1;
          const periodId = uid("bp");
          const vehicle = store.vehicles.find((v) => v.id === r.vehicle_id);

          // Build #9 cleanup — post the period's FULL obligation (base +
          // per-period fees + taxes) via the authoritative tax/fee engine.
          // Each component posts as its own ledger charge linked to this
          // period via metadata.billing_period_id. Idempotent per period.
          const { baseTxnId, feeTxnIds, taxTxnIds, feeTotal, taxTotal } =
            store.postPeriodCharges({
              rentalId: r.id,
              customerId: r.customer_id,
              vehicleId: r.vehicle_id,
              reservationId: r.reservation_id,
              locationId: vehicle?.location ?? null,
              effectiveDate: spec.due_at,
              billingPeriodId: periodId,
              periodStart: spec.period_start,
              periodEnd: spec.period_end,
              baseAmount: spec.base_amount,
              periodDays: periodDays(spec, r),
            });
          chargesPosted +=
            feeTxnIds.length + taxTxnIds.length + (baseTxnId ? 1 : 0);

          // The period total = base + per-period fees + taxes (returned by the
          // engine, authoritative). This matches the sum of the posted ledger
          // charges linked to this period via metadata.billing_period_id.
          const postedTotal = roundMoney(
            spec.base_amount + feeTotal + taxTotal,
          );

          updated.push({
            id: periodId,
            tenant_id: TENANT_ID,
            rental_id: r.id,
            invoice_id: null,
            sequence_number: seq,
            period_start: spec.period_start,
            period_end: spec.period_end,
            due_at: spec.due_at,
            billing_frequency: config.billing_frequency,
            rate_type: r.rate_type,
            base_amount: spec.base_amount,
            additional_amount: 0,
            tax_amount: taxTotal,
            fee_amount: feeTotal,
            total_amount: postedTotal,
            status: "upcoming",
            generated_at: now,
            paid_at: null,
            dedupe_key: key,
            source: "engine",
            transaction_id: baseTxnId,
            fee_transaction_ids: feeTxnIds,
            tax_transaction_ids: taxTxnIds,
            late_fee_applied: false,
            created_at: now,
            updated_at: now,
          });
          periodsGenerated++;
          newEvents.push({
            rentalId: r.id,
            label: `${labelForFrequency(config.billing_frequency)} billing period generated — ${fmtMoney(postedTotal)} due ${spec.due_at}`,
          });
          // Build #21 — emit BILLING_PERIOD_CREATED + PAYMENT_DUE so Connect Pro
          // can present the invoice / send a reminder. Idempotent per period.
          const emitter = getIntegrationEmitter();
          if (emitter.enabled) {
            emitter.enqueueOutbound({
              event_type: "billing_period.created",
              entity_type: "billing_period",
              entity_id: periodId,
              payload: {
                kind: "billing_period_created",
                customer_id: r.customer_id,
                rental_id: r.id,
                billing_period_id: periodId,
                sequence_number: seq,
                period_start: spec.period_start,
                period_end: spec.period_end,
                due_at: spec.due_at,
                due_time: null,
                total_amount: postedTotal,
                billing_frequency: config.billing_frequency,
              },
              event_key: `outbound_billing_period_created:${periodId}`,
              origin_system: "fleet",
            });
            emitter.enqueueOutbound({
              event_type: "payment.due",
              entity_type: "billing_period",
              entity_id: periodId,
              payload: {
                kind: "payment_due",
                customer_id: r.customer_id,
                rental_id: r.id,
                billing_period_id: periodId,
                invoice_id: null,
                due_amount: postedTotal,
                outstanding_amount: postedTotal,
                due_date: spec.due_at,
                due_time: null,
                timezone: "America/Detroit",
                vehicle_label: vehicle
                  ? `${vehicle.make} ${vehicle.model}`
                  : null,
              },
              event_key: `outbound_payment_due:${periodId}`,
              origin_system: "fleet",
            });
          }
        }
      }

      for (const r of currentRentals) {
        if (!["active", "payment_due", "late", "overdue"].includes(r.status))
          continue;
        const periods = updated.filter((p) => p.rental_id === r.id);
        // Allocate against the live ledger. NOTE: inside a single batched act(),
        // the period charges posted moments ago (via store.postPeriodCharges)
        // are NOT yet reflected in `store.transactions` — the store hook's
        // transactions snapshot is the pre-flush state until the next render.
        // allocatePayments therefore computes a zero charge / zero balance for
        // a just-generated period, which would make lateFeeEligibility read the
        // period as "paid" and DEFER the late fee to the next billing pass —
        // non-deterministic and date-dependent (the late fee would post on a
        // *later* run, breaking idempotency).
        //
        // The period's authoritative obligation is its own `total_amount`
        // (base + per-period fees + taxes, set at generation). We floor each
        // period's outstanding charge at `total_amount` so the late-fee decision
        // is based on the real obligation, not the stale ledger snapshot, and
        // is immediate + idempotent on re-runs.
        const alloc = allocatePayments(periods, store.transactions, r.id);
        for (const p of periods) {
          const a = alloc.allocations.get(p.id);
          const paid = a?.paid ?? 0;
          // Authoritative outstanding charge: the ledger allocation when the
          // ledger is fresh; otherwise the period's own total obligation.
          const ledgerCharge = a ? a.balance + a.paid : 0;
          const charge = Math.max(ledgerCharge, p.total_amount);
          const balance = Math.max(0, charge - paid);
          const elig = lateFeeEligibility(
            p,
            balance > 0
              ? {
                  periodId: p.id,
                  paid,
                  balance,
                  status: a?.status ?? "partially_paid",
                }
              : a,
            r,
          );
          if (elig.eligible && !p.late_fee_applied && r.late_fee > 0) {
            store.postTransaction({
              rental_id: r.id,
              reservation_id: r.reservation_id,
              customer_id: r.customer_id,
              vehicle_id: r.vehicle_id,
              transaction_type: "late_fee",
              category: "charge",
              description: `Late fee — ${r.agreement_number} (period ${p.period_start})`,
              amount: r.late_fee,
              direction: "charge",
              status: "posted",
              effective_date: now.slice(0, 10),
              billing_period: p.period_start,
              metadata: { billing_period_id: p.id, late_fee: true },
            });
            lateFeesApplied++;
            p.late_fee_applied = true;
            p.status = "past_due";
            p.updated_at = now;
          } else {
            const ns = periodStatus(p, paid, charge);
            p.status = ns;
            p.paid_at = ns === "paid" ? now : null;
            p.updated_at = now;
          }
        }
        const next = nextPaymentDue(periods, alloc.allocations);
        const lateStatus = rentalLateStatus(periods, alloc.allocations, r);
        const currentBalance = store.rentalFinancials(r.id).balance;
        store.updateRental(r.id, {
          next_payment_due: next,
          status:
            currentBalance <= 0 &&
            ["payment_due", "late", "overdue"].includes(r.status)
              ? "active"
              : (lateStatus ?? r.status),
        });
      }

      if (periodsGenerated > 0 || lateFeesApplied > 0) {
        store.logActivity({
          id: uid("act"),
          at: now,
          label: `Billing processed — ${periodsGenerated} period(s) generated, ${lateFeesApplied} late fee(s) applied.`,
          tone: periodsGenerated > 0 ? "available" : "neutral",
        });
      }
      for (const ev of newEvents) {
        store.addRentalEvent({
          id: uid("rev"),
          rental_id: ev.rentalId,
          type: "payment",
          label: ev.label,
          at: now,
          tone: "neutral",
          staff_id: null,
        });
      }
      setPeriods(updated);
      return { periodsGenerated, chargesPosted, lateFeesApplied };
    };

    const setRentalBillingConfig = (
      rentalId: string,
      config: RentalBillingConfig,
    ) => {
      store.updateRental(rentalId, { billing_config: config });
      store.logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Billing schedule changed — ${labelForFrequency(config.billing_frequency)} on rental.`,
        tone: "neutral",
      });
    };

    const addManualPeriod = (
      rentalId: string,
      input: { dueAt: string; amount: number; label?: string },
    ) => {
      const r = rentals.find((x) => x.id === rentalId);
      if (!r) return;
      const seq =
        periodState.filter((p) => p.rental_id === rentalId).length + 1;
      const now = new Date().toISOString();
      const chargeId = store.postTransaction({
        rental_id: rentalId,
        reservation_id: r.reservation_id,
        customer_id: r.customer_id,
        vehicle_id: r.vehicle_id,
        transaction_type: "rental_charge",
        category: "charge",
        description:
          input.label ?? `Manual billing obligation — ${r.agreement_number}`,
        amount: input.amount,
        direction: "charge",
        status: "posted",
        effective_date: input.dueAt,
        billing_period: input.dueAt,
        metadata: { manual_period: true },
      });
      setPeriods((ps) => [
        ...ps,
        {
          id: uid("bp"),
          tenant_id: TENANT_ID,
          rental_id: rentalId,
          invoice_id: null,
          sequence_number: seq,
          period_start: input.dueAt,
          period_end: input.dueAt,
          due_at: input.dueAt,
          billing_frequency: "custom",
          rate_type: r.rate_type,
          base_amount: input.amount,
          additional_amount: 0,
          tax_amount: 0,
          fee_amount: 0,
          total_amount: input.amount,
          status: "upcoming",
          generated_at: now,
          paid_at: null,
          dedupe_key: periodDedupeKey(rentalId, input.dueAt, input.dueAt),
          source: "manual",
          transaction_id: chargeId,
          fee_transaction_ids: [],
          tax_transaction_ids: [],
          late_fee_applied: false,
          created_at: now,
          updated_at: now,
        },
      ]);
    };

    const waivePeriod = (periodId: string) => {
      setPeriods((ps) =>
        ps.map((p) =>
          p.id === periodId
            ? { ...p, status: "waived", updated_at: new Date().toISOString() }
            : p,
        ),
      );
      store.logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Billing period waived.`,
        tone: "neutral",
      });
    };

    const cancelPeriod = (periodId: string) => {
      setPeriods((ps) =>
        ps.map((p) =>
          p.id === periodId
            ? {
                ...p,
                status: "cancelled",
                updated_at: new Date().toISOString(),
              }
            : p,
        ),
      );
    };

    return {
      billingPeriods: periodState,
      rentalPeriods,
      rentalAllocation,
      processRentalBilling,
      processWeeklyBilling: () => processRentalBilling(),
      setRentalBillingConfig,
      addManualPeriod,
      waivePeriod,
      cancelPeriod,
    };
  }, [periodState, rentals, transactions, store]);

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used within BillingProvider");
  return ctx;
}
