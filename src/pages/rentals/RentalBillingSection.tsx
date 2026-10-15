// Connect Pro Fleet — Rental billing section (Build #3).
// Extracted from RentalDetail.tsx (which is at its size ceiling). Renders the
// generalized billing configuration + billing-period history for a rental,
// replacing the old weekly-only billing card. Uses the billing context so the
// ledger stays the financial source of truth and periods are derived.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import {
  resolveBillingConfig,
  suggestBillingFrequency,
  rentalTermDays,
} from "@/lib/billing";
import { BILLING_FREQUENCY_LABELS } from "@/lib/billingTypes";
import type { RentalAgreement } from "@/lib/types";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  fmtMoney,
  fmtMoneyExact,
  fmtDateShort,
  statusToneClasses,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarClock, Settings2, Plus, Ban } from "lucide-react";
import {
  BillingConfigDialog,
  ManualPeriodDialog,
} from "@/pages/rentals/BillingDialogs";

export function RentalBillingSection({ rental }: { rental: RentalAgreement }) {
  const { vehicles } = useStore();
  const {
    rentalPeriods,
    rentalAllocation,
    setRentalBillingConfig,
    addManualPeriod,
    waivePeriod,
    cancelPeriod,
  } = useBilling();
  const [cfgOpen, setCfgOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const config = resolveBillingConfig(rental);
  const periods = rentalPeriods(rental.id);
  const alloc = rentalAllocation(rental.id);

  const vehicle = vehicles.find((v) => v.id === rental.vehicle_id);
  const termDays = rentalTermDays(rental);
  const isOpenEnded = !rental.scheduled_return_date;

  return (
    <SectionCard
      title="Billing"
      right={
        <button
          onClick={() => setCfgOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          title="Edit billing schedule"
        >
          <Settings2 size={13} /> Edit
        </button>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <DataLabel>Billing frequency</DataLabel>
          <DataValue>
            {BILLING_FREQUENCY_LABELS[config.billing_frequency]}
          </DataValue>
        </div>
        <div>
          <DataLabel>Next payment due</DataLabel>
          <DataValue mono>
            {rental.next_payment_due
              ? fmtDateShort(rental.next_payment_due)
              : "—"}
          </DataValue>
        </div>
        {config.recurring_amount != null && (
          <div>
            <DataLabel>Recurring amount</DataLabel>
            <DataValue mono>{fmtMoneyExact(config.recurring_amount)}</DataValue>
          </div>
        )}
        <div>
          <DataLabel>Billing anchor</DataLabel>
          <DataValue mono>
            {config.billing_anchor_date
              ? fmtDateShort(config.billing_anchor_date)
              : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Cutoff / grace</DataLabel>
          <DataValue mono>
            {rental.payment_cutoff_time ?? "—"} (grace {rental.grace_period}h)
          </DataValue>
        </div>
        <div>
          <DataLabel>Late fee</DataLabel>
          <DataValue mono>
            {fmtMoney(rental.late_fee)}{" "}
            {rental.late_fee_applied && (
              <span className="text-status-maintenance">(applied)</span>
            )}
          </DataValue>
        </div>
      </dl>

      {/* Billing history */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Billing history ({periods.length})
          </p>
          <button
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <Plus size={13} /> Add obligation
          </button>
        </div>
        {periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No billing periods yet. Run billing processing to generate the next
            obligation.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Period</th>
                  <th className="px-2 py-2 font-medium">Due</th>
                  <th className="px-2 py-2 text-right font-medium">Amount</th>
                  <th className="px-2 py-2 text-right font-medium">Paid</th>
                  <th className="px-2 py-2 text-right font-medium">Balance</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {periods.map((p) => {
                  const a = alloc.allocations.get(p.id);
                  const paid = a?.paid ?? 0;
                  const balance = a?.balance ?? p.total_amount;
                  const tone = periodTone(p.status);
                  return (
                    <tr key={p.id} className="hover:bg-surface-2">
                      <td
                        className={cn(
                          "status-border border-l-2 px-2 py-2.5 font-mono tabular text-xs text-muted-foreground",
                          statusToneClasses[tone].border,
                        )}
                      >
                        {p.period_start === p.period_end
                          ? fmtDateShort(p.period_start)
                          : `${fmtDateShort(p.period_start)} – ${fmtDateShort(p.period_end)}`}
                      </td>
                      <td className="px-2 py-2.5 font-mono tabular text-xs text-muted-foreground">
                        {fmtDateShort(p.due_at)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular text-foreground">
                        {fmtMoneyExact(p.total_amount)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular text-status-available">
                        {fmtMoneyExact(paid)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2.5 text-right font-mono tabular",
                          balance > 0
                            ? "text-status-maintenance"
                            : "text-status-available",
                        )}
                      >
                        {fmtMoneyExact(balance)}
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusPill tone={tone}>
                          {periodStatusLabel(p.status)}
                        </StatusPill>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {p.status !== "waived" &&
                            p.status !== "cancelled" &&
                            p.status !== "paid" && (
                              <>
                                <button
                                  onClick={() => {
                                    waivePeriod(p.id);
                                    toast.success("Billing period waived.");
                                  }}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
                                  title="Waive period"
                                >
                                  <Ban size={14} />
                                </button>
                                {p.status === "upcoming" && (
                                  <button
                                    onClick={() => {
                                      cancelPeriod(p.id);
                                      toast.success("Future period cancelled.");
                                    }}
                                    className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
                                    title="Cancel future period"
                                  >
                                    <CalendarClock size={14} />
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BillingConfigDialog
        open={cfgOpen}
        onOpenChange={setCfgOpen}
        rental={rental}
        onSave={(cfg) => {
          setRentalBillingConfig(rental.id, cfg);
          toast.success("Billing schedule updated.");
          setCfgOpen(false);
        }}
        suggested={suggestBillingFrequency(
          rental.rate_type,
          termDays,
          isOpenEnded,
        )}
      />

      <ManualPeriodDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSave={(input) => {
          addManualPeriod(rental.id, input);
          toast.success("Manual billing obligation added.");
          setManualOpen(false);
        }}
      />
    </SectionCard>
  );
}

function periodTone(
  status: string,
): "available" | "maintenance" | "out" | "rented" | "neutral" {
  switch (status) {
    case "paid":
      return "available";
    case "partially_paid":
      return "maintenance";
    case "due":
      return "maintenance";
    case "past_due":
      return "out";
    case "waived":
      return "neutral";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

function periodStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Dialogs (BillingConfigDialog + ManualPeriodDialog) extracted to
// BillingDialogs.tsx to stay under the file size limit.
