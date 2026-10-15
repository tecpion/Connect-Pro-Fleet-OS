// Connect Pro Fleet — shared Record Payment dialog (Build #14 cleanup).
//
// ONE authoritative payment-entry dialog used by every customer-payment entry
// point (rental detail, Payments Due, checkout, reservation, invoice). Staff
// choose a canonical TenderMethod + optional processor, a reference, and
// notes. The dialog calls back with the canonical value; the caller posts via
// the authoritative ledger path. No payment is duplicated.

import { useState } from "react";
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
import {
  PaymentMethodSelect,
  type PaymentMethodValue,
} from "@/components/PaymentMethodSelect";
import type { TenderMethod, PaymentProcessor } from "@/lib/paymentMethodTypes";
import { fmtMoneyExact } from "@/lib/format";

export interface RecordPaymentResult {
  amount: number;
  tender: TenderMethod;
  processor: PaymentProcessor | null;
  reference: string;
  notes: string;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  balanceDue,
  defaultAmount,
  title = "Record payment",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Balance owed — shown for context, not enforced. */
  balanceDue?: number;
  /** Initial amount (defaults to the balance due). */
  defaultAmount?: number;
  title?: string;
  onSubmit: (r: RecordPaymentResult) => void;
}) {
  const [amount, setAmount] = useState<number>(
    defaultAmount ?? balanceDue ?? 0,
  );
  const [method, setMethod] = useState<PaymentMethodValue>({
    tender: "credit_card",
    processor: "stripe",
  });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setAmount(defaultAmount ?? balanceDue ?? 0);
    setMethod({ tender: "credit_card", processor: "stripe" });
    setReference("");
    setNotes("");
  }

  function submit() {
    if (amount <= 0) return;
    onSubmit({
      amount,
      tender: method.tender,
      processor: method.processor,
      reference: reference.trim(),
      notes: notes.trim(),
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {balanceDue != null && (
            <p className="text-sm text-muted-foreground">
              Balance due:{" "}
              <span className="font-mono tabular text-foreground">
                {fmtMoneyExact(balanceDue)}
              </span>
            </p>
          )}
          <div>
            <Label>Amount received ($)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="mt-1 font-mono tabular"
            />
            {balanceDue != null && balanceDue > 0 && (
              <button
                onClick={() => setAmount(balanceDue)}
                className="mt-1 text-xs text-primary hover:underline"
              >
                Use full balance ({fmtMoneyExact(balanceDue)})
              </button>
            )}
          </div>
          <PaymentMethodSelect value={method} onChange={setMethod} />
          <div>
            <Label>Reference (optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction / confirmation ID"
              className="mt-1 font-mono tabular"
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
