// Connect Pro Fleet — Document review dialog (Build #26).
// Verify / Reject / Request Replacement. Rejection requires a reason. Verifying
// moves the document to "verified"; rejecting moves it to "rejected" with a
// reason. Neither deletes history. "Request replacement" is an internal state
// flag (notes) — no customer SMS/email is sent from Fleet.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useComplianceCan } from "@/lib/compliancePermissionHooks";
import { useDocumentNumber } from "@/lib/compliancePermissionHooks";
import type { DocumentRecord } from "@/lib/complianceTypes";
import { documentTypeLabel } from "@/lib/complianceTypes";
import { fmtDate } from "@/lib/format";

const REJECT_REASONS = [
  "unreadable",
  "expired",
  "wrong_document",
  "information_mismatch",
  "incomplete",
];

export function DocumentReviewDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: DocumentRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { verifyDocument, rejectDocument, updateDocument } = useCompliance();
  const { canReview } = useComplianceCan();
  const maskedNumber = useDocumentNumber(
    doc ?? { document_type: "registration", document_number: null },
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [mode, setMode] = useState<"verify" | "reject" | "replace" | null>(
    null,
  );

  if (!doc) return null;

  const reset = () => {
    setRejectReason("");
    setRejectNote("");
    setMode(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const confirm = () => {
    if (mode === "verify") {
      verifyDocument(doc.id);
    } else if (mode === "reject") {
      if (!rejectReason.trim()) return;
      rejectDocument(doc.id, { reason: rejectReason });
    } else if (mode === "replace") {
      updateDocument(doc.id, {
        notes: `${doc.notes ?? ""}\n[Replacement requested]`.trim(),
      });
    }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="font-medium text-foreground">
              {documentTypeLabel(doc.document_type)}
            </p>
            <p className="text-muted-foreground">{doc.entity_label}</p>
            {maskedNumber && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                # {maskedNumber}
              </p>
            )}
            {doc.issuer && (
              <p className="text-xs text-muted-foreground">
                Issuer: {doc.issuer}
              </p>
            )}
            {doc.expiration_date && (
              <p className="text-xs text-muted-foreground">
                Expires: {fmtDate(doc.expiration_date)}
              </p>
            )}
          </div>

          {!mode && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                disabled={!canReview}
                onClick={() => setMode("verify")}
                className="flex-1"
              >
                Verify
              </Button>
              <Button
                variant="outline"
                disabled={!canReview}
                onClick={() => setMode("reject")}
                className="flex-1"
              >
                Reject
              </Button>
              <Button
                variant="outline"
                disabled={!canReview}
                onClick={() => setMode("replace")}
                className="flex-1"
              >
                Request replacement
              </Button>
            </div>
          )}

          {mode === "verify" && (
            <p className="rounded-md border border-border p-3">
              Mark this document as verified? It will satisfy any requirement
              that accepts this document type.
            </p>
          )}

          {mode === "reject" && (
            <div className="space-y-3">
              <div>
                <Label>Rejection reason (required)</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {REJECT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRejectReason(r)}
                      className={
                        "rounded-full border px-3 py-1 text-xs " +
                        (rejectReason === r
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground")
                      }
                    >
                      {r.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Additional note</Label>
                <Textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {mode === "replace" && (
            <p className="rounded-md border border-border p-3">
              Flag this document for replacement. The old record is retained for
              history; the requester should upload a new version (which will
              supersede this one).
            </p>
          )}
        </div>
        {mode && (
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={mode === "reject" && !rejectReason.trim()}
            >
              Confirm
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
