// Connect Pro Fleet — dashboard attention items hook (Build #10 cleanup).
// Extracted from Dashboard.tsx to keep it under the line limit. Builds the
// "Needs attention" list from operational exceptions. Build #10 cleanup:
// arrangement attention items now receive the authoritative outstanding resolver
// so arrangements whose debt was resolved by credits (not payments) stop
// surfacing as actionable.

import { useMemo } from "react";
import type {
  Driver,
  Inspection,
  MaintenanceRecord,
  RentalAgreement,
  Reservation,
  Vehicle,
} from "@/lib/types";
import type { RentalDeposit } from "@/lib/depositTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "@/lib/paymentArrangementTypes";
import type { FinancialTransaction } from "@/lib/types";
import {
  overdueRentals,
  maintenanceAttention,
  arrangementAttentionItems,
} from "@/lib/dashboard";
import { getDepositCollectDue } from "@/lib/deposit";
import { fmtMoney } from "@/lib/format";
import type { PaymentObligation } from "@/lib/billingSelectors";

type Tone = "available" | "maintenance" | "out" | "rented" | "neutral";

export interface AttentionItem {
  key: string;
  title: string;
  detail: string;
  tone: Tone;
  to: string;
  cta: string;
}

export function useDashboardAttention(opts: {
  rentals: RentalAgreement[];
  reservations: Reservation[];
  vehicles: Vehicle[];
  maintenance: MaintenanceRecord[];
  drivers: Driver[];
  inspections: Inspection[];
  rentalDeposits: RentalDeposit[];
  paymentArrangements: PaymentArrangement[];
  arrangementInstallments: PaymentArrangementInstallment[];
  transactions: FinancialTransaction[];
  lateObligations: PaymentObligation[];
  lateTotal: number;
  rentalFinancials: (rentalId: string) => { balance: number };
  /** When false, verification attention items are hidden (Verification = Off). */
  verificationEnabled?: boolean;
}) {
  return useMemo(() => {
    const items: AttentionItem[] = [];
    const {
      rentals,
      vehicles,
      maintenance,
      drivers,
      inspections,
      rentalDeposits,
      paymentArrangements,
      arrangementInstallments,
      transactions,
      lateObligations,
      lateTotal,
      rentalFinancials,
      verificationEnabled = true,
    } = opts;

    if (lateObligations.length > 0)
      items.push({
        key: "late",
        title: "Late payments",
        detail: `${lateObligations.length} ${lateObligations.length === 1 ? "customer" : "customers"} · ${fmtMoney(lateTotal)} outstanding`,
        tone: "out",
        to: "/payments-due",
        cta: "View payments",
      });
    const overdue = overdueRentals(rentals);
    if (overdue.length > 0)
      items.push({
        key: "overdue",
        title: "Overdue rentals",
        detail: `${overdue.length} ${overdue.length === 1 ? "vehicle" : "vehicles"} past return date`,
        tone: "out",
        to: "/rentals?filter=overdue",
        cta: "View rentals",
      });
    // Verification attention is surfaced only when the tenant uses
    // verification (Basic or Required). When Verification = Off these items
    // never appear in the Dashboard / Action Center attention list.
    if (verificationEnabled) {
      const pendingVerifications = drivers.filter(
        (d) => d.verification_status === "pending",
      );
      if (pendingVerifications.length > 0)
        items.push({
          key: "pending_verif",
          title: "Driver verification",
          detail: `${pendingVerifications.length} awaiting manual review`,
          tone: "maintenance",
          to: "/drivers",
          cta: "Review",
        });
      const failedVerifications = drivers.filter(
        (d) => d.verification_status === "failed",
      );
      if (failedVerifications.length > 0)
        items.push({
          key: "failed_verif",
          title: "Failed verification",
          detail: `${failedVerifications.length} ${failedVerifications.length === 1 ? "driver" : "drivers"} failed checks`,
          tone: "out",
          to: "/drivers",
          cta: "Review",
        });
    }
    const maintAttention = maintenanceAttention(maintenance, vehicles);
    if (maintAttention.length > 0)
      items.push({
        key: "maint",
        title: "Maintenance due",
        detail: `${maintAttention.length} ${maintAttention.length === 1 ? "vehicle" : "vehicles"} overdue for service`,
        tone: "maintenance",
        to: "/maintenance",
        cta: "View maintenance",
      });
    const damageFlagged = inspections.filter(
      (i) => i.damage_detected && i.inspection_type === "checkin",
    );
    if (damageFlagged.length > 0)
      items.push({
        key: "damage",
        title: "Damage flagged",
        detail: `${damageFlagged.length} ${damageFlagged.length === 1 ? "return" : "returns"} need staff review`,
        tone: "maintenance",
        to: "/inspections",
        cta: "Review",
      });
    const refundPending = rentalDeposits.filter(
      (d) => d.status === "refund_pending",
    );
    if (refundPending.length > 0)
      items.push({
        key: "dep_refund",
        title: "Deposit refunds owed",
        detail: `${refundPending.length} ${refundPending.length === 1 ? "deposit" : "deposits"} awaiting refund`,
        tone: "maintenance",
        to: "/deposits",
        cta: "View deposits",
      });
    const uncollected = rentalDeposits.filter(
      (d) => getDepositCollectDue(d) > 0 && d.status !== "cancelled",
    );
    if (uncollected.length > 0)
      items.push({
        key: "dep_uncollected",
        title: "Deposits to collect",
        detail: `${uncollected.length} ${uncollected.length === 1 ? "deposit" : "deposits"} required before pickup`,
        tone: "maintenance",
        to: "/deposits",
        cta: "View deposits",
      });
    items.push(
      ...arrangementAttentionItems(
        paymentArrangements,
        arrangementInstallments,
        transactions,
        (a) => (a.rental_id ? rentalFinancials(a.rental_id).balance : 0),
      ),
    );
    return items;
  }, [opts]);
}
