// Connect Pro Fleet — Build #20 shared confirmation dialog.
//
// ONE authoritative confirmation pattern for danger/destructive actions
// (reverse payment, reverse deposit, cancel claim, void expense, rollback
// migration, close rental unexpectedly, cancel reservation, void evidence).
// Never triggers a destructive action from a single accidental tap: it always
// names the object and shows the consequence. An optional reason field is
// supported for actions that require one.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Action verb + object, e.g. "Reverse payment", "Cancel claim". */
  title: string;
  /** Concise consequence, e.g. "This will reverse the $400 payment recorded on Aug 30." */
  description: React.ReactNode;
  /** When true, a required reason field is shown. */
  requireReason?: boolean;
  /** Label for the reason field (default "Reason"). */
  reasonLabel?: string;
  /** Confirm button label (default "Confirm"). */
  confirmLabel?: string;
  /** When true the confirm button uses the destructive style. */
  destructive?: boolean;
  onConfirm: (reason?: string) => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  requireReason = false,
  reasonLabel = "Reason",
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");

  function close() {
    setReason("");
    onOpenChange(false);
  }

  function confirm() {
    if (requireReason && !reason.trim()) return;
    onConfirm(reason.trim() || undefined);
    setReason("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {requireReason && (
          <div className="pt-1">
            <Label>{reasonLabel}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`${reasonLabel} (required)`}
              className="mt-1"
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={requireReason && !reason.trim()}
            onClick={confirm}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary-press"
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
