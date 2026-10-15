// Connect Pro Fleet — deposit action dialogs (Build #8 / Build #14).
//
// Dialogs for collecting, applying, refunding, and forfeiting a security
// deposit, plus the override (waive) dialog. Build #14: collect/refund use the
// shared canonical PaymentMethodSelect so deposit tender methods match the
// standardized taxonomy. Deposit accounting semantics are unchanged
// (collection = held money, application = obligation reduction, refund = held
// money out, forfeiture = recognized charge).

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
import { fmtMoneyExact } from "@/lib/format";
import {
  FORFEITURE_REASON_LABELS,
  type ForfeitureReason,
} from "@/lib/depositTypes";
import type { PaymentMethod } from "@/lib/types";
import type { TenderMethod } from "@/lib/paymentMethodTypes";
import {
  normalizePaymentMethod,
  toLegacyPaymentMethod,
} from "@/lib/paymentMethodTypes";
import { PaymentMethodSelect } from "@/components/PaymentMethodSelect";
import { ShieldCheck } from "lucide-react";

export function CollectDialog({
  max,
  onClose,
  onSubmit,
}: {
  max: number;
  onClose: () => void;
  onSubmit: (amount: number, method: PaymentMethod, ref: string) => void;
}) {
  const [amount, setAmount] = useState(max);
  const [method, setMethod] = useState<{
    tender: TenderMethod;
    processor: any;
  }>({
    tender: "credit_card",
    processor: null,
  });
  const [ref, setRef] = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Collect deposit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Remaining to collect:{" "}
            <span className="font-mono tabular text-foreground">
              {fmtMoneyExact(max)}
            </span>
          </p>
          <div>
            <Label>Amount ($)</Label>
            <Input
              type="number"
              min={0}
              max={max}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="mt-1 font-mono tabular"
            />
          </div>
          <PaymentMethodSelect
            value={method}
            onChange={setMethod}
            showProcessor={false}
          />
          <div>
            <Label>Reference (optional)</Label>
            <Input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="mt-1 font-mono tabular"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={() =>
              onSubmit(amount, toLegacyPaymentMethod(method.tender), ref)
            }
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Collect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RefundDialog({
  max,
  onClose,
  onSubmit,
}: {
  max: number;
  onClose: () => void;
  onSubmit: (amount: number, method: PaymentMethod) => void;
}) {
  const [amount, setAmount] = useState(max);
  const [method, setMethod] = useState<{
    tender: TenderMethod;
    processor: any;
  }>({
    tender: "credit_card",
    processor: null,
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Refund deposit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Refundable:{" "}
            <span className="font-mono tabular text-foreground">
              {fmtMoneyExact(max)}
            </span>
          </p>
          <div>
            <Label>Amount to refund ($)</Label>
            <Input
              type="number"
              min={0}
              max={max}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="mt-1 font-mono tabular"
            />
          </div>
          <PaymentMethodSelect
            value={method}
            onChange={setMethod}
            showProcessor={false}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={() =>
              onSubmit(amount, toLegacyPaymentMethod(method.tender))
            }
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ForfeitDialog({
  max,
  onClose,
  onSubmit,
}: {
  max: number;
  onClose: () => void;
  onSubmit: (amount: number, reason: ForfeitureReason, notes: string) => void;
}) {
  const [amount, setAmount] = useState(max);
  const [reason, setReason] = useState<ForfeitureReason>("damage");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Forfeit deposit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-status-out">
            Forfeiture retains held deposit funds. Prefer applying the deposit
            to a confirmed charge when the forfeiture maps to a specific cost.
          </p>
          <div>
            <Label>Amount to forfeit ($)</Label>
            <Input
              type="number"
              min={0}
              max={max}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="mt-1 font-mono tabular"
            />
          </div>
          <div>
            <Label>Reason</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ForfeitureReason)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {(
                Object.keys(FORFEITURE_REASON_LABELS) as ForfeitureReason[]
              ).map((r) => (
                <option key={r} value={r}>
                  {FORFEITURE_REASON_LABELS[r]}
                </option>
              ))}
            </select>
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={() => onSubmit(amount, reason, notes)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Forfeit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AmountDialog({
  title,
  max,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  max: number;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (amount: number, notes: string) => void;
}) {
  const [amount, setAmount] = useState(max);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Available:{" "}
            <span className="font-mono tabular text-foreground">
              {fmtMoneyExact(max)}
            </span>
          </p>
          <div>
            <Label>Amount ($)</Label>
            <Input
              type="number"
              min={0}
              max={max}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={amount <= 0}
            onClick={() => onSubmit(amount, notes)}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OverrideButton({
  currentRequired,
  onOverride,
}: {
  currentRequired: number;
  onOverride: (amount: number, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <ShieldCheck size={14} className="mr-1" /> Waive / override
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Override deposit requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current required:{" "}
              <span className="font-mono tabular text-foreground">
                {fmtMoneyExact(currentRequired)}
              </span>
            </p>
            <div>
              <Label>New required amount ($)</Label>
              <Input
                type="number"
                min={0}
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="mt-1 font-mono tabular"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Set to $0 to waive the deposit entirely.
              </p>
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim()}
              onClick={() => {
                onOverride(amount, reason);
                setOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
