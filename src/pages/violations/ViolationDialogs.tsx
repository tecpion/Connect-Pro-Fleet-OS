// Connect Pro Fleet — violation action dialogs (Build #25).
// Responsibility, charge, company payment, dispute, reverse-charge dialogs
// extracted from ViolationDetail to keep files focused.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/Status";
import { fmtMoney } from "@/lib/format";
import type { TenderMethod } from "@/lib/paymentMethodTypes";
import type {
  Violation,
  ViolationResponsibility,
  ResponsibilityReason,
  DisputeStatus,
} from "@/lib/violationTypes";
import {
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_REASON_LABELS,
  DISPUTE_STATUS_LABELS,
} from "@/lib/violationTypes";

export function ResponsibilityDialog({
  current,
  onClose,
  onSave,
}: {
  current: Violation;
  onClose: () => void;
  onSave: (
    r: ViolationResponsibility,
    reason: ResponsibilityReason | null,
    notes: string | null,
  ) => void;
}) {
  const [resp, setResp] = useState<ViolationResponsibility>(
    current.responsibility,
  );
  const [reason, setReason] = useState<ResponsibilityReason | "">(
    current.responsibility_reason ?? "",
  );
  const [notes, setNotes] = useState(current.responsibility_notes ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign responsibility</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Responsibility</Label>
            <select
              value={resp}
              onChange={(e) =>
                setResp(e.target.value as ViolationResponsibility)
              }
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {(
                [
                  "customer",
                  "company",
                  "shared",
                  "unknown",
                  "third_party",
                ] as ViolationResponsibility[]
              ).map((r) => (
                <option key={r} value={r}>
                  {RESPONSIBILITY_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Reason</Label>
            <select
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as ResponsibilityReason)
              }
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {Object.entries(RESPONSIBILITY_REASON_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="resp-notes">Notes</Label>
            <Textarea
              id="resp-notes"
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            onClick={() =>
              onSave(
                resp,
                (reason || null) as ResponsibilityReason | null,
                notes.trim() || null,
              )
            }
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChargeDialog({
  violation,
  projected,
  canViewFinancials,
  onClose,
  onConfirm,
}: {
  violation: Violation;
  projected: number;
  canViewFinancials: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Charge customer</DialogTitle>
          <DialogDescription>
            Posts one customer ledger charge. Repeated clicks will not post a
            duplicate.
          </DialogDescription>
        </DialogHeader>
        {canViewFinancials && (
          <div className="space-y-1 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Citation</span>
              <span className="font-mono">
                {fmtMoney(violation.base_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Penalties</span>
              <span className="font-mono">
                {fmtMoney(violation.penalties_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Admin fee</span>
              <span className="font-mono">
                {fmtMoney(violation.admin_fee_amount)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-medium">
              <span>Customer charge</span>
              <span className="font-mono">{fmtMoney(projected)}</span>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            onClick={onConfirm}
          >
            Confirm charge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompanyPayDialog({
  violation,
  onClose,
  onConfirm,
}: {
  violation: Violation;
  onClose: () => void;
  onConfirm: (amount: number, date: string, method: TenderMethod) => void;
}) {
  const [amount, setAmount] = useState(String(violation.total_amount));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<TenderMethod>("ach");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record company payment</DialogTitle>
          <DialogDescription>
            Creates an expense ledger entry. The expense is preserved even if
            the customer later reimburses.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="cp-amt">Amount</Label>
            <Input
              id="cp-amt"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="cp-date">Payment date</Label>
            <Input
              id="cp-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cp-method">Payment method</Label>
            <select
              id="cp-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as TenderMethod)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="ach">ACH</option>
              <option value="credit_card">Credit Card</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="zelle">Zelle</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!amount || Number(amount) <= 0}
            onClick={() =>
              onConfirm(Number(amount), `${date}T12:00:00Z`, method)
            }
          >
            Record payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DisputeDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (reason: string, status: DisputeStatus, note: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<DisputeStatus>("customer_disputed");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open dispute</DialogTitle>
          <DialogDescription>
            Opening a dispute does not automatically reverse any charge.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="d-status">Dispute status</Label>
            <select
              id="d-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as DisputeStatus)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {(
                [
                  "customer_disputed",
                  "company_disputed_authority",
                  "under_review",
                ] as DisputeStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {DISPUTE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="d-reason">Reason</Label>
            <Textarea
              id="d-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="d-note">Decision note</Label>
            <Input
              id="d-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!reason.trim()}
            onClick={() => onSave(reason.trim(), status, note.trim() || null)}
          >
            Open dispute
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseChargeDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse customer charge</DialogTitle>
          <DialogDescription>
            Voids the posted ledger charge. The original charge is preserved in
            history.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="rev-reason">Reason</Label>
          <Textarea
            id="rev-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Reverse
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WaiveDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string, note: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Waive violation</DialogTitle>
          <DialogDescription>
            Waiving closes the violation without further collection. The
            original violation record is preserved; only the obligation is
            removed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="w-reason">Reason</Label>
            <Textarea
              id="w-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Duplicate citation, agency dismissed, goodwill…"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="w-note">Note</Label>
            <Input
              id="w-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim(), note.trim() || null)}
          >
            Waive
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CreateTaskDialog({
  violationNumber,
  vehicleLabel,
  customerName,
  onClose,
  onConfirm,
}: {
  violationNumber: string;
  vehicleLabel: string;
  customerName: string | null;
  onClose: () => void;
  onConfirm: (title: string, description: string | null) => void;
}) {
  const [title, setTitle] = useState(`Follow up on ${violationNumber}`);
  const [description, setDescription] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>
            Links a task to this violation, {vehicleLabel}
            {customerName ? ` · ${customerName}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="t-desc">Description</Label>
            <Textarea
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!title.trim()}
            onClick={() => onConfirm(title.trim(), description.trim() || null)}
          >
            Create task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MatchBadge({
  status,
}: {
  status: "unmatched" | "suggested" | "confirmed";
}) {
  const map = {
    unmatched: { tone: "out" as const, label: "Unmatched" },
    suggested: { tone: "maintenance" as const, label: "Suggested Match" },
    confirmed: { tone: "available" as const, label: "Confirmed Match" },
  };
  const m = map[status];
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

export function billingLabel(
  bs: "not_billed" | "billed" | "partially_paid" | "paid" | "waived",
): string {
  const map = {
    not_billed: "Not Billed",
    billed: "Customer Charged",
    partially_paid: "Partially Paid",
    paid: "Paid by Customer",
    waived: "Waived",
  };
  return map[bs];
}

export function MatchDialog({
  violation,
  rentals,
  customerName,
  onClose,
  onConfirm,
  onUnmatch,
}: {
  violation: { id: string; vehicle_id: string; rental_id: string | null };
  rentals: {
    id: string;
    agreement_number: string;
    customer_id: string | null;
  }[];
  customerName: (id: string | null) => string;
  onClose: () => void;
  onConfirm: (rentalId: string) => void;
  onUnmatch: () => void;
}) {
  const [rentalId, setRentalId] = useState(violation.rental_id ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change rental match</DialogTitle>
          <DialogDescription>
            Select an eligible rental. Confirming a match means the renter had
            the vehicle — it does NOT automatically assign financial
            responsibility.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <select
            value={rentalId}
            onChange={(e) => setRentalId(e.target.value)}
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
          >
            <option value="">— No rental —</option>
            {rentals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.agreement_number} · {customerName(r.customer_id)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => onUnmatch()}>
            Mark Unmatched
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              disabled={!rentalId}
              onClick={() => onConfirm(rentalId)}
            >
              Confirm Match
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
