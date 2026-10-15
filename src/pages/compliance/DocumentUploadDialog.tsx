// Connect Pro Fleet — Document upload dialog (Build #26).
// Reusable upload dialog. Context prefills entity (vehicle/customer/rental/
// company). Upload ≠ verification: a new document starts at "uploaded" /
// "not_reviewed". File references are memory-mode only (Build #22 private
// storage is deferred). When replacing an existing current document, the old
// record is superseded (archived + linked), preserving history.

import { useEffect, useState } from "react";
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
import { Field, selectClass } from "@/pages/settings/shared";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useComplianceCan } from "@/lib/compliancePermissionHooks";
import type { DocumentEntityType, DocumentType } from "@/lib/complianceTypes";
import {
  VEHICLE_DOCUMENT_LABELS,
  CUSTOMER_DOCUMENT_LABELS,
  RENTAL_DOCUMENT_LABELS,
  COMPANY_DOCUMENT_LABELS,
} from "@/lib/complianceTypes";

const ALL_DOC_OPTIONS: { value: DocumentType; label: string }[] = [
  ...Object.entries(VEHICLE_DOCUMENT_LABELS).map(([value, label]) => ({
    value: value as DocumentType,
    label,
  })),
  ...Object.entries(CUSTOMER_DOCUMENT_LABELS).map(([value, label]) => ({
    value: value as DocumentType,
    label,
  })),
  ...Object.entries(RENTAL_DOCUMENT_LABELS).map(([value, label]) => ({
    value: value as DocumentType,
    label,
  })),
  ...Object.entries(COMPANY_DOCUMENT_LABELS).map(([value, label]) => ({
    value: value as DocumentType,
    label,
  })),
];

export interface UploadContext {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  /** Restrict the document-type picker to this type (e.g. from "Replace"). */
  document_type?: DocumentType;
  /** When set, the new doc supersedes this old doc id. */
  supersedes_document_id?: string;
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: UploadContext | null;
}) {
  const { addDocument } = useCompliance();
  const { canUpload } = useComplianceCan();
  const [documentType, setDocumentType] =
    useState<DocumentType>("registration");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [state, setState] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [fileRef, setFileRef] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && context) {
      if (context.document_type) setDocumentType(context.document_type);
      setDocumentNumber("");
      setIssuer("");
      setState("");
      setEffectiveDate("");
      setExpirationDate("");
      setFileRef("");
      setNotes("");
    }
  }, [open, context]);

  if (!context) return null;

  const submit = () => {
    addDocument({
      entity_type: context.entity_type,
      entity_id: context.entity_id,
      entity_label: context.entity_label,
      document_type: documentType,
      document_number: documentNumber || null,
      issuer: issuer || null,
      state_jurisdiction: state || null,
      effective_date: effectiveDate || null,
      expiration_date: expirationDate || null,
      file_reference: fileRef || null,
      notes: notes || null,
      source: "upload",
      supersedes_document_id: context.supersedes_document_id,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {context.supersedes_document_id
              ? "Replace document"
              : "Upload document"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Attached to {context.entity_label}. Upload does not equal
            verification — a reviewer must verify before it satisfies a
            requirement.
          </p>
          <Field label="Document type">
            <select
              disabled={!canUpload || !!context.document_type}
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className={selectClass}
            >
              {ALL_DOC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Document number" hint="License #, policy #, etc.">
              <Input
                disabled={!canUpload}
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </Field>
            <Field label="Issuer">
              <Input
                disabled={!canUpload}
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </Field>
            <Field label="State / jurisdiction">
              <Input
                disabled={!canUpload}
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </Field>
            <Field
              label="File reference"
              hint="Memory-mode; private storage is Build #22."
            >
              <Input
                disabled={!canUpload}
                value={fileRef}
                onChange={(e) => setFileRef(e.target.value)}
                placeholder="mem://docs/..."
              />
            </Field>
            <Field label="Effective date">
              <Input
                type="date"
                disabled={!canUpload}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </Field>
            <Field label="Expiration date" hint="Leave blank for non-expiring.">
              <Input
                type="date"
                disabled={!canUpload}
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </Field>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              disabled={!canUpload}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canUpload}>
            {context.supersedes_document_id ? "Replace" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
