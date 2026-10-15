// Connect Pro Fleet — Compliance document list items (Build #26).
// Mobile card + desktop row for the Compliance Center document list. Sensitive
// document numbers are masked via useDocumentNumber unless the viewer has
// documents.view_sensitive.

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { fmtDate } from "@/lib/format";
import { useDocumentNumber } from "@/lib/compliancePermissionHooks";
import type { DocumentRecord } from "@/lib/complianceTypes";
import { documentTypeLabel } from "@/lib/complianceTypes";
import {
  documentStatusTone,
  documentStatusLabel,
  verificationLabel,
  entityTypeLabel,
} from "./shared";

export function DocCard({
  doc,
  onReview,
}: {
  doc: DocumentRecord;
  onReview: () => void;
}) {
  const maskedNumber = useDocumentNumber(doc);
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {documentTypeLabel(doc.document_type)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {doc.entity_label}
          </p>
        </div>
        <StatusPill tone={documentStatusTone(doc.status)}>
          {documentStatusLabel(doc.status)}
        </StatusPill>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Verification</dt>
        <dd className="text-foreground">
          {verificationLabel(doc.verification_status)}
        </dd>
        {maskedNumber && (
          <>
            <dt className="text-muted-foreground">Number</dt>
            <dd className="font-mono text-foreground">{maskedNumber}</dd>
          </>
        )}
        {doc.expiration_date && (
          <>
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="text-foreground">{fmtDate(doc.expiration_date)}</dd>
          </>
        )}
      </dl>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={onReview}>
          Review
        </Button>
      </div>
    </div>
  );
}

export function DocRow({
  doc,
  onReview,
}: {
  doc: DocumentRecord;
  onReview: () => void;
}) {
  const maskedNumber = useDocumentNumber(doc);
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">
        <p className="font-medium text-foreground">
          {documentTypeLabel(doc.document_type)}
        </p>
        {maskedNumber && (
          <p className="font-mono text-xs text-muted-foreground">
            {maskedNumber}
          </p>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{doc.entity_label}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {entityTypeLabel(doc.entity_type)}
      </td>
      <td className="px-3 py-2">
        <StatusPill tone={documentStatusTone(doc.status)}>
          {documentStatusLabel(doc.status)}
        </StatusPill>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {verificationLabel(doc.verification_status)}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {doc.expiration_date ? fmtDate(doc.expiration_date) : "—"}
      </td>
      <td className="px-3 py-2">
        <Button size="sm" variant="outline" onClick={onReview}>
          Review
        </Button>
      </td>
    </tr>
  );
}
