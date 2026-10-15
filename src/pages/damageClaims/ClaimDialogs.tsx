// Connect Pro Fleet — damage claim sub-dialogs (Build #17).
// Charge customer, apply deposit, record recovery, add evidence, file
// insurance, close, cancel. Extracted from ClaimDetail to stay under the limit.

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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import type { EvidenceType, RecoveryType } from "@/lib/damageClaimTypes";
import {
  EVIDENCE_TYPE_LABELS,
  RECOVERY_TYPE_LABELS,
} from "@/lib/damageClaimTypes";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";

const EVIDENCE_TYPES: EvidenceType[] = [
  "photo",
  "video",
  "inspection_image",
  "document",
  "estimate",
  "police_report",
  "customer_message",
  "other",
];
const RECOVERY_TYPES: RecoveryType[] = ["insurance", "third_party", "other"];

export function ChargeCustomerDialog({
  claimId,
  onClose,
}: {
  claimId: string;
  onClose: () => void;
}) {
  const dc = useDamageClaims();
  const [amount, setAmount] = useState("");
  function post() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    const res = dc.chargeCustomer(
      claimId,
      { amount: amt },
      `charge-${claimId}`,
    );
    if (res.ok) {
      toast.success("Customer charged for damage.");
      onClose();
    } else toast.error(res.error ?? "Could not charge customer.");
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Charge customer</DialogTitle>
          <DialogDescription>
            Posts a damage charge to the rental ledger. The customer's balance
            updates immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="charge-amt">Amount</Label>
          <Input
            id="charge-amt"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 font-mono"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={post}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Post charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApplyDepositDialog({
  claimId,
  onClose,
}: {
  claimId: string;
  onClose: () => void;
}) {
  const dc = useDamageClaims();
  const [amount, setAmount] = useState("");
  function apply() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    const res = dc.applyDeposit(claimId, { amount: amt }, `dep-${claimId}`);
    if (res.ok) {
      toast.success("Deposit applied to damage.");
      onClose();
    } else toast.error(res.error ?? "Could not apply deposit.");
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Apply security deposit</DialogTitle>
          <DialogDescription>
            Applies held deposit toward the damage obligation. This settles an
            existing charge — it does not create new revenue.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="dep-amt">Amount</Label>
          <Input
            id="dep-amt"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 font-mono"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={apply}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Apply deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RecordRecoveryDialog({
  claimId,
  insuranceId,
  onClose,
}: {
  claimId: string;
  insuranceId: string | null;
  onClose: () => void;
}) {
  const dc = useDamageClaims();
  const [type, setType] = useState<RecoveryType>("insurance");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  function record() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    const res = dc.recordRecovery(
      claimId,
      {
        recovery_type: type,
        amount: amt,
        date,
        insurance_claim_id: insuranceId,
      },
      `rec-${claimId}-${type}-${date}`,
    );
    if (res.ok) {
      toast.success("Recovery recorded.");
      onClose();
    } else toast.error(res.error ?? "Could not record recovery.");
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record recovery</DialogTitle>
          <DialogDescription>
            Record an insurance, third-party, or other recovery. This is claim
            recovery tracking — not a rental payment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="rec-type">Recovery type</Label>
            <select
              id="rec-type"
              value={type}
              onChange={(e) => setType(e.target.value as RecoveryType)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {RECOVERY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RECOVERY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-amt">Amount</Label>
            <Input
              id="rec-amt"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="rec-date">Date</Label>
            <Input
              id="rec-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={record}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddEvidenceDialog({
  claimId,
  onClose,
}: {
  claimId: string;
  onClose: () => void;
}) {
  const dc = useDamageClaims();
  const [type, setType] = useState<EvidenceType>("photo");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  function add() {
    if (!url.trim()) return;
    dc.addEvidence({
      claim_id: claimId,
      evidence_type: type,
      file_url: url.trim(),
      description: desc.trim() || null,
    });
    toast.success("Evidence added.");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add evidence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="ev-type">Type</Label>
            <select
              id="ev-type"
              value={type}
              onChange={(e) => setType(e.target.value as EvidenceType)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {EVIDENCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVIDENCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ev-url">File URL / reference</Label>
            <Input
              id="ev-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="placeholder://photo-url"
            />
          </div>
          <div>
            <Label htmlFor="ev-desc">Description</Label>
            <Input
              id="ev-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={add}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FileInsuranceDialog({
  claimId,
  onClose,
}: {
  claimId: string;
  onClose: () => void;
}) {
  const dc = useDamageClaims();
  const [insurer, setInsurer] = useState("");
  const [ref, setRef] = useState("");
  const [claimed, setClaimed] = useState("");
  function file() {
    dc.fileInsurance(claimId, {
      insurer_name: insurer || null,
      claim_reference: ref || null,
      claimed_amount: claimed ? Number(claimed) : null,
    });
    toast.success("Insurance claim filed.");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>File insurance claim</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="ins-name">Insurer</Label>
            <Input
              id="ins-name"
              value={insurer}
              onChange={(e) => setInsurer(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ins-ref">Claim reference</Label>
            <Input
              id="ins-ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="ins-amt">Claimed amount</Label>
            <Input
              id="ins-amt"
              type="number"
              value={claimed}
              onChange={(e) => setClaimed(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={file}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            File claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseClaimDialog({
  claimId,
  outstandingBalance,
  onClose,
  onClosed,
}: {
  claimId: string;
  outstandingBalance: number;
  onClose: () => void;
  onClosed: () => void;
}) {
  const dc = useDamageClaims();
  const [reason, setReason] = useState("");
  function close() {
    dc.closeClaim(claimId, reason || undefined);
    toast.success("Claim closed.");
    onClosed();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Close claim</DialogTitle>
          <DialogDescription>
            {outstandingBalance > 0
              ? `Outstanding customer balance: ${fmtMoney(outstandingBalance)}. Closing with a balance owed is allowed but requires a reason.`
              : "Close this damage claim."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="close-reason">Closure reason</Label>
          <Textarea
            id="close-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={close}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Close claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelClaimDialog({
  claimId,
  onClose,
  onClosed,
}: {
  claimId: string;
  onClose: () => void;
  onClosed: () => void;
}) {
  const dc = useDamageClaims();
  const [reason, setReason] = useState("");
  function cancel() {
    if (!reason.trim()) return;
    dc.cancelClaim(claimId, reason);
    toast.success("Claim cancelled.");
    onClosed();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel claim</DialogTitle>
          <DialogDescription>
            Cancellation is for duplicates, false alarms, or pre-existing
            damage. A claim with a posted customer charge cannot be cancelled
            without reversing the charge first.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={cancel}
            disabled={!reason.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Cancel claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
