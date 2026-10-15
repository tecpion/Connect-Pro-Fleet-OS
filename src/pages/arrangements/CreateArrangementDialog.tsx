// Connect Pro Fleet — Create / Restructure Payment Arrangement dialog (Build #10).
//
// Staff record the customer's promise to pay an outstanding balance over time.
// Supports one-time, generated equal installments (daily/weekly/biweekly), and a
// custom schedule. Validates installments sum EXACTLY to the arrangement amount.
// Creating the arrangement posts NO ledger entries — it is a promise only.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
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
import { Textarea } from "@/components/ui/textarea";
import { fmtMoneyExact } from "@/lib/format";
import {
  generateSchedule,
  validateCustomSchedule,
  type ScheduleFrequency,
} from "@/lib/paymentArrangements";
import { SCHEDULE_FREQUENCY_LABELS } from "@/lib/paymentArrangementTypes";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "create" | "restructure";

export function CreateArrangementDialog({
  open,
  onOpenChange,
  rentalId,
  mode = "create",
  existingArrangementId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rentalId: string;
  mode?: Mode;
  existingArrangementId?: string;
}) {
  const {
    rentals,
    createPaymentArrangement,
    restructureArrangement,
    activeArrangementForRental,
    arrangementInstallments,
    transactions,
  } = useStore();

  const rental = rentals.find((r) => r.id === rentalId);
  const existing =
    mode === "restructure" && existingArrangementId
      ? useStore().paymentArrangements.find(
          (a) => a.id === existingArrangementId,
        )
      : activeArrangementForRental(rentalId);

  // For restructure, the amount to schedule = remaining promised amount.
  const alreadyPaid = useMemo(() => {
    if (mode !== "restructure" || !existingArrangementId) return 0;
    const ins = arrangementInstallments.filter(
      (i) => i.arrangement_id === existingArrangementId,
    );
    return ins.reduce(
      (s, i) =>
        s +
        i.linked_payment_transaction_ids.reduce((sum, tid) => {
          const t = transactions.find((x) => x.id === tid);
          return t && t.status === "posted" && t.category === "payment"
            ? sum + t.amount
            : sum;
        }, 0),
      0,
    );
  }, [mode, existingArrangementId, arrangementInstallments, transactions]);

  const baseOutstanding = rental ? rental.balance_due : 0;
  const remainingForRestructure =
    existing && mode === "restructure"
      ? Math.max(0, existing.arrangement_amount - alreadyPaid)
      : 0;

  const [arrangementAmount, setArrangementAmount] = useState(
    mode === "restructure" ? remainingForRestructure : baseOutstanding,
  );
  const [graceDays, setGraceDays] = useState(1);
  const [reason, setReason] = useState("");
  const [termsSummary, setTermsSummary] = useState("");
  const [scheduleType, setScheduleType] = useState<
    "one_time" | "generated" | "custom"
  >("generated");
  const [count, setCount] = useState(2);
  const [frequency, setFrequency] = useState<ScheduleFrequency>("weekly");
  const [firstDate, setFirstDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [custom, setCustom] = useState<{ amount: number; due_date: string }[]>([
    { amount: 0, due_date: new Date().toISOString().slice(0, 10) },
  ]);

  const schedule = useMemo(() => {
    if (scheduleType === "one_time")
      return [{ amount: arrangementAmount, due_date: firstDate }];
    if (scheduleType === "generated")
      return generateSchedule(arrangementAmount, count, firstDate, frequency);
    return custom;
  }, [scheduleType, arrangementAmount, count, firstDate, frequency, custom]);

  const scheduleTotal =
    Math.round(schedule.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const matches =
    Math.round(scheduleTotal * 100) === Math.round(arrangementAmount * 100);

  if (!rental) return null;

  const submit = () => {
    if (arrangementAmount <= 0) {
      toast.error("Arrangement amount must be greater than zero.");
      return;
    }
    if (mode === "create" && arrangementAmount > baseOutstanding) {
      toast.error(
        `Arrangement can't exceed the outstanding balance of ${fmtMoneyExact(baseOutstanding)}.`,
      );
      return;
    }
    if (scheduleType === "custom") {
      const v = validateCustomSchedule(custom, arrangementAmount);
      if (!v.ok) {
        toast.error(v.error ?? "Custom schedule is invalid.");
        return;
      }
    }
    if (!matches) {
      toast.error(
        `Installments total ${fmtMoneyExact(scheduleTotal)} but the arrangement is ${fmtMoneyExact(arrangementAmount)}.`,
      );
      return;
    }
    const summary =
      termsSummary ||
      (scheduleType === "one_time"
        ? `${fmtMoneyExact(arrangementAmount)} due ${firstDate}`
        : `${count} ${SCHEDULE_FREQUENCY_LABELS[frequency].toLowerCase()} payments of ${fmtMoneyExact(arrangementAmount / count)}`);

    if (mode === "restructure" && existingArrangementId) {
      const res = restructureArrangement(existingArrangementId, {
        newInstallments: schedule,
        termsSummary: summary,
        reason,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not restructure arrangement.");
        return;
      }
      toast.success("Arrangement restructured.");
    } else {
      const res = createPaymentArrangement({
        customerId: rental.customer_id,
        rentalId,
        arrangementAmount,
        originalOutstandingAmount: baseOutstanding,
        startDate: new Date().toISOString().slice(0, 10),
        gracePeriodDays: graceDays,
        termsSummary: summary,
        reason: reason || null,
        installments: schedule,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Could not create arrangement.");
        return;
      }
      toast.success("Payment arrangement created.");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "restructure"
              ? "Restructure payment arrangement"
              : "Create payment arrangement"}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {mode === "restructure"
                ? "Remaining promised amount"
                : "Outstanding balance"}
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular text-status-maintenance">
              {fmtMoneyExact(
                mode === "restructure"
                  ? remainingForRestructure
                  : baseOutstanding,
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {mode === "restructure"
                ? "Schedule the remaining promised amount."
                : "A promise is not a payment — the balance stays unchanged until money is received."}
            </p>
          </div>

          <div>
            <Label>Arrangement amount ($)</Label>
            <Input
              type="number"
              min={0}
              max={
                mode === "restructure"
                  ? remainingForRestructure
                  : baseOutstanding
              }
              value={arrangementAmount}
              onChange={(e) =>
                setArrangementAmount(Math.max(0, Number(e.target.value)))
              }
              className="mt-1 font-mono tabular"
            />
          </div>

          <div>
            <Label>Schedule type</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                { k: "one_time", l: "One-time promise" },
                { k: "generated", l: "Equal installments" },
                { k: "custom", l: "Custom schedule" },
              ].map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setScheduleType(opt.k as any)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    scheduleType === opt.k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {scheduleType === "one_time" && (
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          {scheduleType === "generated" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Number of payments</Label>
                <Input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) =>
                    setCount(Math.max(1, Number(e.target.value)))
                  }
                  className="mt-1 font-mono tabular"
                />
              </div>
              <div>
                <Label>Frequency</Label>
                <select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as ScheduleFrequency)
                  }
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm"
                >
                  {Object.entries(SCHEDULE_FREQUENCY_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <Label>First payment due</Label>
                <Input
                  type="date"
                  value={firstDate}
                  onChange={(e) => setFirstDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {scheduleType === "custom" && (
            <div className="space-y-2">
              {custom.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Amount"
                    value={row.amount}
                    onChange={(e) => {
                      const next = [...custom];
                      next[idx] = {
                        ...next[idx],
                        amount: Number(e.target.value),
                      };
                      setCustom(next);
                    }}
                    className="font-mono tabular"
                  />
                  <Input
                    type="date"
                    value={row.due_date}
                    onChange={(e) => {
                      const next = [...custom];
                      next[idx] = { ...next[idx], due_date: e.target.value };
                      setCustom(next);
                    }}
                  />
                  <button
                    onClick={() =>
                      setCustom(custom.filter((_, i) => i !== idx))
                    }
                    className="rounded-md p-2 text-muted-foreground hover:bg-surface-2 hover:text-status-out"
                    aria-label="Remove installment"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setCustom([
                    ...custom,
                    {
                      amount: 0,
                      due_date: new Date().toISOString().slice(0, 10),
                    },
                  ])
                }
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-press"
              >
                <Plus size={14} /> Add installment
              </button>
            </div>
          )}

          {schedule.length > 0 && (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total scheduled
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular",
                    matches ? "text-status-available" : "text-status-out",
                  )}
                >
                  {fmtMoneyExact(scheduleTotal)}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {schedule.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono tabular text-muted-foreground">
                      {s.due_date}
                    </span>
                    <span className="font-mono tabular text-foreground">
                      {fmtMoneyExact(s.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Grace period (days)</Label>
              <Input
                type="number"
                min={0}
                value={graceDays}
                onChange={(e) =>
                  setGraceDays(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Terms summary (optional)</Label>
              <Input
                value={termsSummary}
                onChange={(e) => setTermsSummary(e.target.value)}
                placeholder="$200 today, $400 Friday"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Reason / notes</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer lost job, agreed to catch up Friday."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!matches || arrangementAmount <= 0}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            {mode === "restructure" ? "Restructure" : "Create arrangement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
