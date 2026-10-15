// Connect Pro Fleet — Billing schedule picker (Build #3).
// Compact selector shown during checkout/conversion so staff can confirm how
// the rental bills (upfront / daily / weekly / biweekly / custom). Defaults
// intelligently from the rental context but is always staff-controllable.
//
// Build #5 cleanup: when an `onConfirm` callback is passed (checkout context),
// the picker holds DRAFT state locally and only hands the confirmed config up
// to the caller — it does NOT persist to the rental, so there's a single
// authoritative persistence path at `startCheckout`. Without `onConfirm`
// (RentalBillingSection, post-checkout) it persists immediately as before.

import { useState } from "react";
import { useBilling } from "@/lib/billingStore";
import {
  resolveBillingConfig,
  suggestBillingFrequency,
  rentalTermDays,
} from "@/lib/billing";
import {
  BILLING_FREQUENCY_LABELS,
  type BillingFrequency,
  type CustomScheduleInstallment,
  type RentalBillingConfig,
} from "@/lib/billingTypes";
import type { RentalAgreement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Ban } from "lucide-react";
import { toast } from "sonner";

const OPTIONS: BillingFrequency[] = [
  "upfront",
  "daily",
  "weekly",
  "biweekly",
  "custom",
];

export function BillingSchedulePicker({
  rental,
  onConfirm,
}: {
  rental: RentalAgreement;
  /** When provided, the picker confirms DRAFT state to this callback and does
   *  not persist — the caller persists at `startCheckout`. Omit to persist now. */
  onConfirm?: (cfg: RentalBillingConfig) => void;
}) {
  const { setRentalBillingConfig } = useBilling();
  const current = resolveBillingConfig(rental);
  const termDays = rentalTermDays(rental);
  const isOpenEnded = !rental.scheduled_return_date;
  const suggested = suggestBillingFrequency(
    rental.rate_type,
    termDays,
    isOpenEnded,
  );

  const [freq, setFreq] = useState<BillingFrequency>(current.billing_frequency);
  const [recurring, setRecurring] = useState(
    current.recurring_amount != null ? String(current.recurring_amount) : "",
  );
  const [anchor, setAnchor] = useState(
    current.billing_anchor_date ?? rental.checkout_date ?? "",
  );
  const [schedule, setSchedule] = useState<CustomScheduleInstallment[]>(
    current.custom_schedule ?? [{ due_at: "", amount: 0 }],
  );
  const [saved, setSaved] = useState(false);

  const apply = () => {
    const cfg: RentalBillingConfig = {
      billing_frequency: freq,
      billing_anchor_date: anchor || null,
      recurring_amount:
        freq === "custom" ? null : recurring ? Number(recurring) : null,
      auto_generate_periods: true,
      custom_schedule:
        freq === "custom"
          ? schedule.filter((s) => s.due_at && s.amount > 0)
          : null,
    };
    if (onConfirm) {
      // Draft mode (checkout): hand the confirmed config up to the caller.
      // The caller persists it atomically at `startCheckout` — no premature
      // write to the rental, so there's one authoritative persistence path.
      onConfirm(cfg);
    } else {
      setRentalBillingConfig(rental.id, cfg);
    }
    setSaved(true);
    toast.success("Billing schedule confirmed.");
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-2 px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Billing schedule
        </p>
        {saved && (
          <span className="text-xs text-status-available">Confirmed</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => {
              setFreq(f);
              setSaved(false);
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium",
              freq === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {BILLING_FREQUENCY_LABELS[f]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Suggested: {BILLING_FREQUENCY_LABELS[suggested]}. You can change it.
      </p>
      {freq !== "custom" && freq !== "upfront" && (
        <div>
          <Label>Recurring amount ($)</Label>
          <Input
            type="number"
            min={0}
            value={recurring}
            onChange={(e) => {
              setRecurring(e.target.value);
              setSaved(false);
            }}
            placeholder={String(rental.rate_amount)}
            className="mt-1 font-mono tabular"
          />
        </div>
      )}
      <div>
        <Label>First payment due (anchor)</Label>
        <Input
          type="date"
          value={anchor}
          onChange={(e) => {
            setAnchor(e.target.value);
            setSaved(false);
          }}
          className="mt-1 font-mono tabular"
        />
      </div>
      {freq === "custom" && (
        <div>
          <Label>Installments</Label>
          <div className="mt-1 space-y-2">
            {schedule.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  type="date"
                  value={s.due_at}
                  onChange={(e) =>
                    setSchedule((arr) =>
                      arr.map((x, j) =>
                        j === i ? { ...x, due_at: e.target.value } : x,
                      ),
                    )
                  }
                  className="font-mono tabular"
                />
                <Input
                  type="number"
                  min={0}
                  value={s.amount || ""}
                  onChange={(e) =>
                    setSchedule((arr) =>
                      arr.map((x, j) =>
                        j === i ? { ...x, amount: Number(e.target.value) } : x,
                      ),
                    )
                  }
                  placeholder="0"
                  className="font-mono tabular"
                />
                <button
                  onClick={() =>
                    setSchedule((arr) => arr.filter((_, j) => j !== i))
                  }
                  className="rounded-md px-2 text-muted-foreground hover:text-status-out"
                >
                  <Ban size={14} />
                </button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSchedule((arr) => [...arr, { due_at: "", amount: 0 }])
              }
            >
              <Plus size={14} className="mr-1" /> Add installment
            </Button>
          </div>
        </div>
      )}
      <Button
        size="sm"
        onClick={apply}
        className="bg-primary text-primary-foreground hover:bg-primary-press"
      >
        Confirm schedule
      </Button>
    </div>
  );
}
