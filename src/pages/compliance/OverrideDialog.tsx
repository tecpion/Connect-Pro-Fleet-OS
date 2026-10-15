// Connect Pro Fleet — Compliance override dialog (workspace).
//
// A manager override is an authorized, audited bypass of a blocking
// compliance requirement. It requires a reason and records the staff
// identity + timestamp via addOverride (which appends an "override_added"
// ComplianceEvent). An overridden item is NOT compliant — it stays
// surfaced at lower severity (see complianceStatus.ts) so it never looks
// fully compliant. This dialog never deletes records or alters blocking
// flags on the requirement itself.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Field } from "@/pages/settings/shared";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useComplianceCan } from "@/lib/compliancePermissionHooks";
import type { DocumentEntityType, DocumentType } from "@/lib/complianceTypes";
import { documentTypeLabel } from "@/lib/complianceTypes";

export interface OverrideContext {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_type: DocumentType;
}

export function OverrideDialog({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: OverrideContext | null;
}) {
  const { addOverride } = useCompliance();
  const { canOverride } = useComplianceCan();
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");

  if (!context) return null;

  const reset = () => {
    setReason("");
    setExpiresAt("");
    setNote("");
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const submit = () => {
    if (!reason.trim()) return;
    addOverride({
      entity_type: context.entity_type,
      entity_id: context.entity_id,
      document_type: context.document_type,
      reason: note.trim() ? `${reason.trim()} — ${note.trim()}` : reason.trim(),
      expires_at: expiresAt || null,
    });
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Override compliance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Override {documentTypeLabel(context.document_type)} for{" "}
            <span className="font-medium text-foreground">
              {context.entity_label}
            </span>
            . The item stays visible as overridden — it never looks fully
            compliant. This action is recorded in the audit trail.
          </p>
          <Field label="Reason (required)">
            <Input
              disabled={!canOverride}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Temp tag pending at DMV"
            />
          </Field>
          <Field label="Override expires (optional)">
            <Input
              type="date"
              disabled={!canOverride}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
          <div>
            <Label>Manager note</Label>
            <Textarea
              disabled={!canOverride}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canOverride || !reason.trim()}>
            Apply override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
