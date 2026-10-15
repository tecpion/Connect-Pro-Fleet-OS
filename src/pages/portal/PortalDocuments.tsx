// Connect Pro Fleet — Portal Documents page (Build #32).
//
// Shows customer-relevant documents (DL, insurance, etc.) with customer-friendly
// statuses. Sensitive numbers are masked. Uploads become "Pending Review" —
// never automatically Verified. Rejected documents show a safe reason and
// "Upload Replacement".

import { useState } from "react";
import { usePortalView } from "@/lib/usePortalSources";
import { usePortalSession } from "@/lib/portalSessionStore";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { fmtDate } from "@/lib/format";
import {
  FolderOpen,
  Upload,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function PortalDocuments() {
  const { session } = usePortalSession();
  const view = usePortalView(session);
  const compliance = useCompliance();
  const [showUpload, setShowUpload] = useState(false);

  if (!view) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const { documents } = view;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Documents
        </h1>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload size={16} />
          Upload
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <FolderOpen size={32} className="mx-auto text-muted-foreground" />
          <p className="mt-2 font-medium text-foreground">
            No documents are needed right now.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            If your rental requires documents, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {doc.document_type_label}
                  </p>
                  {doc.document_number_masked && (
                    <p className="text-xs text-muted-foreground">
                      {doc.document_number_masked}
                    </p>
                  )}
                  {doc.issuer && (
                    <p className="text-xs text-muted-foreground">
                      Issuer: {doc.issuer}
                    </p>
                  )}
                </div>
                <StatusBadge status={doc.status} label={doc.status_label} />
              </div>

              {/* Expiration */}
              {doc.expiration_date && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Expires {fmtDate(doc.expiration_date)}
                </p>
              )}

              {/* Rejection reason */}
              {doc.status === "rejected" && doc.rejected_reason && (
                <div className="mt-2 rounded-lg bg-destructive/5 p-2">
                  <p className="text-xs text-destructive">
                    {doc.rejected_reason}
                  </p>
                </div>
              )}

              {/* Upload dates */}
              {doc.uploaded_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {fmtDate(doc.uploaded_at)}
                </p>
              )}
              {doc.reviewed_at && (
                <p className="text-xs text-muted-foreground">
                  Reviewed {fmtDate(doc.reviewed_at)}
                </p>
              )}

              {/* Replacement action */}
              {(doc.status === "rejected" ||
                doc.status === "expired" ||
                doc.status === "missing") && (
                <button
                  onClick={() => setShowUpload(true)}
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  Upload Replacement
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showUpload && session && (
        <PortalDocumentUploadDialog
          documentTypes={documents.map((d) => ({
            id: d.id,
            label: d.document_type_label,
            type: d.document_type,
          }))}
          onClose={() => setShowUpload(false)}
          onSubmit={(docType, fileRef) => {
            // Submit as uploaded/pending_review — never auto-verified.
            compliance.addDocument({
              entity_type: "customer",
              entity_id: session.customer_id,
              entity_label:
                view.customer.first_name + " " + view.customer.last_name,
              document_type: docType as any,
              file_reference: fileRef,
              source: "upload",
            });
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const icon =
    {
      verified: CheckCircle2,
      pending_review: Clock,
      uploaded: Clock,
      rejected: XCircle,
      expired: FileWarning,
      expiring_soon: AlertCircle,
      missing: AlertCircle,
    }[status] ?? AlertCircle;

  const color =
    {
      verified: "text-success",
      pending_review: "text-muted-foreground",
      uploaded: "text-muted-foreground",
      rejected: "text-destructive",
      expired: "text-destructive",
      expiring_soon: "text-warning",
      missing: "text-warning",
    }[status] ?? "text-muted-foreground";

  const Icon = icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", color)}>
      <Icon size={14} />
      {label}
    </span>
  );
}

function PortalDocumentUploadDialog({
  documentTypes,
  onClose,
  onSubmit,
}: {
  documentTypes: { id: string; label: string; type: string }[];
  onClose: () => void;
  onSubmit: (docType: string, fileRef: string) => void;
}) {
  const [selectedType, setSelectedType] = useState(
    documentTypes[0]?.type ?? "",
  );
  const [fileRef, setFileRef] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 sm:rounded-2xl">
        <h2 className="font-display text-lg font-bold text-foreground">
          Upload Document
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your document will be reviewed by our team. It won't be approved
          automatically.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-foreground">
              Document Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {documentTypes.map((d) => (
                <option key={d.id} value={d.type}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              File Reference
            </label>
            <input
              type="text"
              value={fileRef}
              onChange={(e) => setFileRef(e.target.value)}
              placeholder="Enter file name or reference"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              selectedType && fileRef && onSubmit(selectedType, fileRef)
            }
            disabled={!selectedType || !fileRef}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Submit for Review
          </button>
        </div>
      </div>
    </div>
  );
}
