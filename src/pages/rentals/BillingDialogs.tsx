// Connect Pro Fleet — Billing config + manual period dialogs (Build #3).
// Extracted from RentalBillingSection.tsx (which exceeds the file size limit
// after formatting). These dialogs edit a rental's billing schedule and add
// one-off billing obligations.

import { useState } from "react";
import { resolveBillingConfig } from "@/lib/billing";
import {
  BILLING_FREQUENCY_LABELS,
  type BillingFrequency,
  type CustomScheduleInstallment,
  type RentalBillingConfig,
} from "@/lib/billingTypes";
import type { RentalAgreement } from "@/lib/types";
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
import { Plus, Ban } from "lucide-react";

const FREQ_OPTIONS: BillingFrequency[] = [
  "upfront",
  "daily",
  "weekly",
  "biweekly",
  "custom",
];

export function BillingConfigDialog({
  open,
  onOpenChange,
  rental,
  onSave,
  suggested,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rental: RentalAgreement;
  onSave: (cfg: RentalBillingConfig) => void;
  suggested: BillingFrequency;
}) {
  const current = resolveBillingConfig(rental);
  const [freq, setFreq] = useState<BillingFrequency>(current.billing_frequency);
  const [recurring, setRecurring] = useState<string>(
    current.recurring_amount != null ? String(current.recurring_amount) : "",
  );
  const [anchor, setAnchor] = useState<string>(
    current.billing_anchor_date ?? rental.checkout_date ?? "",
  );
  const [schedule, setSchedule] = useState<CustomScheduleInstallment[]>(
    current.custom_schedule ?? [{ due_at: "", amount: 0 }],
  );

  const save = () => {
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
    onSave(cfg);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Billing schedule</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Billing frequency</Label>
            <select
              value={freq}
              onChange={(e) => setFreq(e.target.value as BillingFrequency)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {BILLING_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Suggested for this rental: {BILLING_FREQUENCY_LABELS[suggested]}.
              You can change it.
            </p>
          </div>
          {freq !== "custom" && freq !== "upfront" && (
            <div>
              <Label>Recurring amount ($)</Label>
              <Input
                type="number"
                min={0}
                value={recurring}
                onChange={(e) => setRecurring(e.target.value)}
                placeholder={String(rental.rate_amount)}
                className="mt-1 font-mono tabular"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Stored as the agreed amount — won't change if class pricing
                changes later.
              </p>
            </div>
          )}
          <div>
            <Label>Billing anchor date</Label>
            <Input
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
              className="mt-1 font-mono tabular"
            />
          </div>
          {freq === "custom" && (
            <div>
              <Label>Custom installments</Label>
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
                            j === i
                              ? { ...x, amount: Number(e.target.value) }
                              : x,
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManualPeriodDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (input: { dueAt: string; amount: number; label?: string }) => void;
}) {
  const [dueAt, setDueAt] = useState("");
  const [amount, setAmount] = useState(0);
  const [label, setLabel] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add billing obligation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Due date</Label>
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 font-mono tabular"
            />
          </div>
          <div>
            <Label>Amount ($)</Label>
            <Input
              type="number"
              min={0}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="mt-1 font-mono tabular"
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Manual billing obligation"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!dueAt || amount <= 0}
            onClick={() => onSave({ dueAt, amount, label: label || undefined })}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add obligation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
