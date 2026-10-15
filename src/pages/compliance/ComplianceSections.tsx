// Connect Pro Fleet — compliance sections for entity profiles (Build #26).
// Reusable sections for Customer Profile, Vehicle Detail, and Rental Detail.
// Compliance is DERIVED from requirements + documents + verification via the
// compliance store; sensitive document numbers are masked unless the viewer has
// documents.view_sensitive. Upload ≠ verification is surfaced in the UI.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useComplianceCan } from "@/lib/compliancePermissionHooks";
import { useDocumentNumber } from "@/lib/compliancePermissionHooks";
import { fmtDate } from "@/lib/format";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { FilePlus } from "lucide-react";
import type { DocumentRecord, DocumentType } from "@/lib/complianceTypes";
import { documentTypeLabel } from "@/lib/complianceTypes";
import {
  complianceStatusTone,
  complianceStatusLabel,
  documentStatusTone,
  documentStatusLabel,
  verificationLabel,
} from "./shared";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import type { UploadContext } from "./DocumentUploadDialog";

const NOW = new Date("2026-09-02T12:00:00Z");

/** A single requirement row: current document (or missing) + its status. */
function RequirementRow({
  docType,
  doc,
  onUpload,
}: {
  docType: DocumentType;
  doc: DocumentRecord | undefined;
  onUpload: (docType: DocumentType) => void;
}) {
  const maskedNumber = useDocumentNumber(
    doc ?? { document_type: docType, document_number: null },
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {documentTypeLabel(docType)}
        </p>
        {doc ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{verificationLabel(doc.verification_status)}</span>
            {maskedNumber && <span className="font-mono">{maskedNumber}</span>}
            {doc.expiration_date && (
              <span>· expires {fmtDate(doc.expiration_date)}</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-status-out">Missing</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {doc && (
          <StatusPill tone={documentStatusTone(doc.status)}>
            {documentStatusLabel(doc.status)}
          </StatusPill>
        )}
        <Button size="sm" variant="outline" onClick={() => onUpload(docType)}>
          <FilePlus size={14} className="mr-1.5" />
          {doc ? "Replace" : "Upload"}
        </Button>
      </div>
    </li>
  );
}

/** Shared body: overall status pill + blocking reasons + requirement rows. */
function ComplianceBody({
  entityType,
  entityId,
  entityLabel,
  onUpload,
}: {
  entityType: "vehicle" | "customer" | "rental";
  entityId: string;
  entityLabel: string;
  onUpload: (docType: DocumentType) => void;
}) {
  const comp = useCompliance();
  const { canView } = useComplianceCan();
  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to view compliance.
      </p>
    );
  }
  const result = comp.entityComplianceStatus(entityType, entityId, entityLabel);
  const docs = comp.documentsForEntity(entityType, entityId);
  // Distinct document types present + required types (from evaluations).
  const types = new Set<DocumentType>();
  for (const ev of result.issues) types.add(ev.document_type);
  for (const d of docs) types.add(d.document_type);
  // Always show the configured requirement types even if no doc yet.
  for (const ev of comp.entityComplianceStatus(
    entityType,
    entityId,
    entityLabel,
  ).issues)
    types.add(ev.document_type);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill tone={complianceStatusTone(result.status)}>
          {complianceStatusLabel(result.status)}
        </StatusPill>
        {result.blockingReasons.length > 0 && (
          <div className="flex flex-col gap-1">
            {result.blockingReasons.map((r) => (
              <span key={r} className="text-xs font-medium text-status-out">
                Blocks operation — {r}
              </span>
            ))}
          </div>
        )}
      </div>
      {types.size === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents or requirements configured for this entity.
        </p>
      ) : (
        <ul className="space-y-2">
          {Array.from(types).map((t) => (
            <RequirementRow
              key={t}
              docType={t}
              doc={comp.currentDocument(entityType, entityId, t)}
              onUpload={onUpload}
            />
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Vehicle compliance
// ---------------------------------------------------------------------------

export function VehicleComplianceSection({
  vehicleId,
  vehicleLabel,
}: {
  vehicleId: string;
  vehicleLabel: string;
}) {
  const [uploadCtx, setUploadCtx] = useState<UploadContext | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const open = (docType: DocumentType) => {
    setUploadCtx({
      entity_type: "vehicle",
      entity_id: vehicleId,
      entity_label: vehicleLabel,
      document_type: docType,
    });
    setUploadOpen(true);
  };
  return (
    <>
      <SectionCard title="Documents & Compliance">
        <ComplianceBody
          entityType="vehicle"
          entityId={vehicleId}
          entityLabel={vehicleLabel}
          onUpload={open}
        />
      </SectionCard>
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        context={uploadCtx}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Customer compliance
// ---------------------------------------------------------------------------

export function CustomerComplianceSection({
  customerId,
  customerLabel,
}: {
  customerId: string;
  customerLabel: string;
}) {
  const [uploadCtx, setUploadCtx] = useState<UploadContext | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const open = (docType: DocumentType) => {
    setUploadCtx({
      entity_type: "customer",
      entity_id: customerId,
      entity_label: customerLabel,
      document_type: docType,
    });
    setUploadOpen(true);
  };
  return (
    <>
      <SectionCard title="Documents & Compliance">
        <ComplianceBody
          entityType="customer"
          entityId={customerId}
          entityLabel={customerLabel}
          onUpload={open}
        />
      </SectionCard>
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        context={uploadCtx}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Rental documents
// ---------------------------------------------------------------------------

export function RentalComplianceSection({
  rentalId,
  rentalLabel,
}: {
  rentalId: string;
  rentalLabel: string;
}) {
  const [uploadCtx, setUploadCtx] = useState<UploadContext | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const open = (docType: DocumentType) => {
    setUploadCtx({
      entity_type: "rental",
      entity_id: rentalId,
      entity_label: rentalLabel,
      document_type: docType,
    });
    setUploadOpen(true);
  };
  return (
    <>
      <SectionCard title="Rental Documents">
        <ComplianceBody
          entityType="rental"
          entityId={rentalId}
          entityLabel={rentalLabel}
          onUpload={open}
        />
      </SectionCard>
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        context={uploadCtx}
      />
    </>
  );
}
