// Smart Capture — reusable UI shell for document/photo capture + review.
//
// This is a UI/UX foundation ONLY. There is no OCR, AI provider, image
// recognition, or automatic extraction wired up. The flow is:
//   SCAN/UPLOAD → (information prepared) → HUMAN REVIEW → HUMAN CONFIRM
// Nothing is ever saved automatically. Any save goes through the same
// validation and permissions as a human entering the information manually.
//
// The "extraction" step is represented as a safe placeholder: when no live
// extraction service is connected, the review screen opens empty and the user
// fills in the fields by hand. This keeps the workflow honest and ready for a
// future extraction provider without faking it today.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  FileText,
  ScanLine,
  X,
  Check,
  RefreshCw,
  AlertCircle,
  ImageIcon,
  Loader2,
  Pencil,
} from "lucide-react";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SmartCaptureDomain =
  "vehicle" | "customer" | "expense" | "maintenance" | "compliance";

export interface SmartCaptureDocOption {
  /** Stable id for this document kind. */
  id: string;
  /** Customer-facing label, e.g. "Registration". */
  label: string;
}

export interface SmartCaptureField {
  /** Key matching the destination form field. */
  key: string;
  label: string;
  /** Optional input type hint for the review form. */
  type?: "text" | "number" | "date";
  /** Whether the field is required before confirm. */
  required?: boolean;
  /** Placeholder shown in the review input. */
  placeholder?: string;
}

export interface SmartCapturePreset {
  domain: SmartCaptureDomain;
  /** Document kinds the user can choose from. */
  documentOptions: SmartCaptureDocOption[];
  /** Fields that may be prefilled by a future extraction service. */
  fields: SmartCaptureField[];
  /** Optional quick-scan labels (e.g. "Scan Plate", "Scan VIN"). */
  quickScan?: { id: string; label: string }[];
}

export interface SmartCaptureFieldValue {
  key: string;
  value: string;
  /** Placeholder confidence state. Never a fake accuracy %. */
  confidence: "high" | "needs_review";
}

export interface SmartCaptureResult {
  domain: SmartCaptureDomain;
  documentId: string;
  /** Object URL for the captured/uploaded file preview (not persisted here). */
  previewUrl: string | null;
  fileName: string | null;
  fields: SmartCaptureFieldValue[];
}

// ---------------------------------------------------------------------------
// Presets per domain
// ---------------------------------------------------------------------------

export const VEHICLE_PRESET: SmartCapturePreset = {
  domain: "vehicle",
  documentOptions: [
    { id: "registration", label: "Registration" },
    { id: "title", label: "Vehicle Title" },
    { id: "insurance_card", label: "Insurance Card" },
    { id: "license_plate", label: "License Plate" },
    { id: "vin_plate", label: "VIN / VIN Plate" },
    { id: "purchase_document", label: "Purchase Document" },
    { id: "other_vehicle", label: "Other Vehicle Document" },
  ],
  fields: [
    { key: "vin", label: "VIN", type: "text", placeholder: "17-character VIN" },
    { key: "license_plate", label: "License plate", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "year", label: "Year", type: "number" },
    { key: "make", label: "Make", type: "text" },
    { key: "model", label: "Model", type: "text" },
    { key: "color", label: "Color", type: "text" },
    { key: "registered_owner", label: "Registered owner", type: "text" },
    {
      key: "registration_expiration",
      label: "Registration expiration",
      type: "date",
    },
    { key: "insurance_company", label: "Insurance company", type: "text" },
    {
      key: "insurance_policy_number",
      label: "Insurance policy #",
      type: "text",
    },
    {
      key: "insurance_expiration",
      label: "Insurance expiration",
      type: "date",
    },
    { key: "purchase_price", label: "Purchase price", type: "number" },
    { key: "purchase_date", label: "Purchase date", type: "date" },
    { key: "odometer", label: "Odometer", type: "number" },
  ],
  quickScan: [
    { id: "plate", label: "Scan Plate" },
    { id: "vin", label: "Scan VIN" },
  ],
};

export const CUSTOMER_PRESET: SmartCapturePreset = {
  domain: "customer",
  documentOptions: [
    { id: "drivers_license", label: "Driver's License" },
    { id: "state_id", label: "State ID" },
    { id: "insurance_card", label: "Insurance Card" },
    { id: "proof_of_address", label: "Proof of Address" },
    { id: "other_customer", label: "Other Customer Document" },
  ],
  fields: [
    { key: "first_name", label: "First name", type: "text", required: true },
    { key: "middle_name", label: "Middle name", type: "text" },
    { key: "last_name", label: "Last name", type: "text", required: true },
    { key: "date_of_birth", label: "Date of birth", type: "date" },
    { key: "address", label: "Address", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "zip", label: "ZIP", type: "text" },
    {
      key: "drivers_license_number",
      label: "Driver's license #",
      type: "text",
    },
    { key: "license_state", label: "License state", type: "text" },
    { key: "issue_date", label: "Issue date", type: "date" },
    { key: "expiration_date", label: "Expiration date", type: "date" },
    { key: "insurance_provider", label: "Insurance provider", type: "text" },
    {
      key: "insurance_policy_number",
      label: "Insurance policy #",
      type: "text",
    },
    {
      key: "insurance_expiration",
      label: "Insurance expiration",
      type: "date",
    },
  ],
};

export const EXPENSE_PRESET: SmartCapturePreset = {
  domain: "expense",
  documentOptions: [
    { id: "receipt", label: "Receipt" },
    { id: "invoice", label: "Invoice" },
    { id: "other_expense", label: "Other Expense Document" },
  ],
  fields: [
    { key: "merchant", label: "Merchant / vendor", type: "text" },
    { key: "transaction_date", label: "Transaction date", type: "date" },
    { key: "total", label: "Total", type: "number" },
    { key: "subtotal", label: "Subtotal", type: "number" },
    { key: "tax", label: "Tax", type: "number" },
    { key: "category", label: "Suggested expense category", type: "text" },
    { key: "payment_method", label: "Payment method", type: "text" },
    { key: "receipt_number", label: "Receipt / invoice #", type: "text" },
    { key: "odometer", label: "Odometer (if present)", type: "number" },
    {
      key: "vehicle_reference",
      label: "Vehicle reference (if present)",
      type: "text",
    },
    { key: "description", label: "Description / notes", type: "text" },
  ],
};

export const MAINTENANCE_PRESET: SmartCapturePreset = {
  domain: "maintenance",
  documentOptions: [
    { id: "service_receipt", label: "Service Receipt" },
    { id: "invoice", label: "Vendor Invoice" },
    { id: "other_maintenance", label: "Other Maintenance Document" },
  ],
  fields: [
    { key: "vendor", label: "Vendor", type: "text" },
    { key: "vehicle", label: "Vehicle", type: "text" },
    { key: "service_date", label: "Service date", type: "date" },
    { key: "odometer", label: "Odometer", type: "number" },
    { key: "services_performed", label: "Services performed", type: "text" },
    { key: "parts", label: "Parts", type: "text" },
    { key: "labor", label: "Labor", type: "number" },
    { key: "tax", label: "Tax", type: "number" },
    { key: "total", label: "Total", type: "number" },
    { key: "next_service", label: "Recommended next service", type: "text" },
    { key: "notes", label: "Notes", type: "text" },
  ],
};

export const COMPLIANCE_PRESET: SmartCapturePreset = {
  domain: "compliance",
  documentOptions: [
    { id: "registration", label: "Registration" },
    { id: "insurance", label: "Insurance" },
    { id: "other_compliance", label: "Other Vehicle Document" },
  ],
  fields: [
    ...VEHICLE_PRESET.fields.filter((f) =>
      [
        "vin",
        "license_plate",
        "state",
        "registration_expiration",
        "insurance_company",
        "insurance_policy_number",
        "insurance_expiration",
      ].includes(f.key),
    ),
  ],
};

export const PRESETS: Record<SmartCaptureDomain, SmartCapturePreset> = {
  vehicle: VEHICLE_PRESET,
  customer: CUSTOMER_PRESET,
  expense: EXPENSE_PRESET,
  maintenance: MAINTENANCE_PRESET,
  compliance: COMPLIANCE_PRESET,
};

// ---------------------------------------------------------------------------
// Reusable action button
// ---------------------------------------------------------------------------

export function SmartCaptureButton({
  onClick,
  label = "Smart Capture",
  variant = "outline",
  size,
  className,
  disabled,
}: {
  onClick: () => void;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      variant={variant}
      size={size}
      disabled={disabled}
      className={cn("gap-2", className)}
    >
      <ScanLine size={16} />
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Capture + Review dialog
// ---------------------------------------------------------------------------

type Stage = "choose" | "capture" | "review";

function fileToPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function SmartCaptureDialog({
  open,
  onOpenChange,
  preset,
  onConfirm,
  title = "Smart Capture",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset: SmartCapturePreset;
  onConfirm: (result: SmartCaptureResult) => void;
  title?: string;
}) {
  const [stage, setStage] = useState<Stage>("choose");
  const [docId, setDocId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setStage("choose");
    setDocId("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileName(null);
    setIsImage(false);
    setExtracting(false);
    setFields({});
  }, [previewUrl]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleFile = useCallback(
    (file: File | undefined, via: "upload" | "camera") => {
      if (!file) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = fileToPreviewUrl(file);
      setPreviewUrl(url);
      setFileName(file.name);
      setIsImage(file.type.startsWith("image/"));
      setStage("review");
      setExtracting(true);
      // Placeholder: no live extraction service is connected. We simulate the
      // "information prepared" step with a brief delay, then surface an empty
      // review form so the human fills in every field by hand. This is the
      // honest "not yet connected" state — it never fabricates detected data.
      const t = window.setTimeout(() => {
        setExtracting(false);
        toast.info(
          "Smart Capture is being prepared. Review and fill in the details below.",
        );
      }, 700);
      // Clean up the timer if the dialog closes mid-extraction.
      void via;
      return () => window.clearTimeout(t);
    },
    [previewUrl],
  );

  const rescan = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileName(null);
    setIsImage(false);
    setFields({});
    setStage("capture");
  };

  const confirm = () => {
    // Required-field guard — the human must review before anything is saved.
    const missing = preset.fields
      .filter((f) => f.required && !fields[f.key]?.trim())
      .map((f) => f.label);
    if (missing.length) {
      toast.error(`Please review required fields: ${missing.join(", ")}`);
      return;
    }
    onConfirm({
      domain: preset.domain,
      documentId: docId,
      previewUrl,
      fileName,
      fields: preset.fields.map((f) => ({
        key: f.key,
        value: fields[f.key] ?? "",
        confidence: fields[f.key]?.trim() ? "high" : "needs_review",
      })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine size={18} /> {title}
          </DialogTitle>
          <DialogDescription>
            Take a photo or upload a document and let Connect Pro prefill the
            details for you. You'll review everything before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {/* STAGE: choose document kind */}
        {stage === "choose" && (
          <div className="space-y-4">
            <div>
              <Label>What are you capturing?</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {preset.documentOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setDocId(opt.id);
                      setStage("capture");
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left text-sm transition-colors",
                      "hover:border-primary/50 hover:bg-surface-2",
                    )}
                  >
                    <FileText size={18} className="text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {preset.quickScan && preset.quickScan.length > 0 && (
              <div className="rounded-lg border border-dashed border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quick scan
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {preset.quickScan.map((q) => (
                    <Button
                      key={q.id}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setDocId(q.id);
                        setStage("capture");
                      }}
                    >
                      <ScanLine size={14} /> {q.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STAGE: capture / upload */}
        {stage === "capture" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-surface-2"
              >
                <Camera size={28} className="text-primary" />
                <span className="font-medium text-foreground">Take Photo</span>
                <span className="text-xs text-muted-foreground">
                  Use your phone camera
                </span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-surface-2"
              >
                <Upload size={28} className="text-muted-foreground" />
                <span className="font-medium text-foreground">
                  Upload Document
                </span>
                <span className="text-xs text-muted-foreground">
                  Choose a file from your device
                </span>
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0], "camera")}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0], "upload")}
            />
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setStage("choose")}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* STAGE: review */}
        {stage === "review" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-status-maintenance/40 bg-status-maintenance/10 p-3">
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-status-maintenance"
                />
                <p className="text-foreground">
                  Smart Capture is being prepared. Document scanning will be
                  enabled once the AI extraction service is connected. Please
                  review and fill in the details below.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Preview */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Document preview
                </p>
                <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
                  {previewUrl && isImage ? (
                    <img
                      src={previewUrl}
                      alt={fileName ?? "Captured document"}
                      className="max-h-[320px] w-full object-contain"
                    />
                  ) : previewUrl ? (
                    <div className="flex flex-col items-center gap-2 p-6 text-center">
                      <FileText size={32} className="text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        {fileName ?? "Document"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF preview not available in this view.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
                      <ImageIcon size={28} />
                      <p className="text-xs">No preview</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={rescan}
                  >
                    <RefreshCw size={14} /> Retake / Replace
                  </Button>
                </div>
              </div>

              {/* Detected / editable fields */}
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Review captured information
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Please verify the information before saving.
                  </p>
                </div>
                {extracting ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" />
                    Preparing information…
                  </div>
                ) : (
                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {preset.fields.map((f) => (
                      <div key={f.key}>
                        <Label className="text-xs">
                          {f.label}
                          {f.required && (
                            <span className="ml-1 text-destructive">*</span>
                          )}
                        </Label>
                        <Input
                          type={f.type ?? "text"}
                          value={fields[f.key] ?? ""}
                          placeholder={f.placeholder}
                          onChange={(e) =>
                            setFields((prev) => ({
                              ...prev,
                              [f.key]: e.target.value,
                            }))
                          }
                          className="mt-1"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === "review" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                <X size={16} className="mr-1" /> Cancel
              </Button>
              <Button variant="outline" onClick={rescan} disabled={extracting}>
                <RefreshCw size={16} className="mr-1" /> Rescan
              </Button>
              <Button
                onClick={confirm}
                disabled={extracting}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary-press"
              >
                <Check size={16} /> Confirm &amp; Continue
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Convenience hook for callers that just want the confirmed values as a map.
// ---------------------------------------------------------------------------

export function useSmartCaptureApply() {
  return useCallback((result: SmartCaptureResult) => {
    const out: Record<string, string> = {};
    for (const f of result.fields) {
      if (f.value.trim()) out[f.key] = f.value.trim();
    }
    return out;
  }, []);
}

export { Pencil };
