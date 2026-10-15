// Connect Pro Fleet — Inspection review step + completion summary.
//
// Review summarizes all captured data before completion, with warnings
// (mileage lower than checkout, missing signature). CompletionSummary shows
// after submit with handoff actions (Create Damage Claim / Create Maintenance
// Work Order / View Vehicle / View Reservation). Pure presentation.

import { Link } from "@/lib/router-compat";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import type { Inspection } from "@/lib/inspectionTypes";
import type {
  ConditionItem,
  DamageItem,
  InspectionType,
} from "@/lib/inspectionWorkspaceTypes";
import {
  AlertTriangle,
  CheckCircle2,
  Car,
  Wrench,
  FileText,
} from "lucide-react";

export function ReviewStep({
  type,
  vehicle,
  res,
  odometer,
  fuel,
  photoCount,
  requiredCount,
  conditionItems,
  damageItems,
  comparison,
  customerSigned,
  staffSigned,
  checkoutInspection,
  mileageWarning,
}: {
  type: InspectionType;
  vehicle: { make: string; model: string; license_plate: string };
  res: { renter_name: string };
  odometer: number;
  fuel: number;
  photoCount: number;
  requiredCount: number;
  conditionItems: ConditionItem[];
  damageItems: DamageItem[];
  comparison: { area: string }[];
  customerSigned: boolean;
  staffSigned: boolean;
  checkoutInspection: Inspection | null;
  mileageWarning: boolean;
}) {
  const flagged = conditionItems.filter(
    (c) => c.state === "attention" || c.state === "damaged",
  );
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-2/60 p-3">
        <p className="font-display text-sm font-semibold text-foreground">
          Review before completing
        </p>
      </div>
      <dl className="space-y-1 rounded-md bg-surface-2/40 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium text-foreground">
            {type === "checkout" ? "Checkout" : "Check-in"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Vehicle</dt>
          <dd className="text-foreground">
            {vehicle.make} {vehicle.model}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="text-foreground">{res.renter_name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Odometer</dt>
          <dd className="font-mono tabular text-foreground">
            {fmtNumber(odometer)} mi
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Fuel</dt>
          <dd className="font-mono tabular text-foreground">{fuel}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Photos</dt>
          <dd className="font-mono tabular text-foreground">
            {photoCount}/{requiredCount} required
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Flagged condition</dt>
          <dd className="text-foreground">{flagged.length} items</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Damage items</dt>
          <dd className="text-foreground">{damageItems.length}</dd>
        </div>
        {comparison.length > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Potential new damage</dt>
            <dd className="font-medium text-status-out">{comparison.length}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Signature</dt>
          <dd className="text-foreground">
            {customerSigned || staffSigned ? "Captured" : "Missing"}
          </dd>
        </div>
      </dl>
      {mileageWarning && (
        <p className="flex items-center gap-1.5 rounded-md bg-status-out/10 px-3 py-2 text-sm text-status-out">
          <AlertTriangle size={15} /> Return mileage is lower than checkout —
          please verify.
        </p>
      )}
      {checkoutInspection && type === "checkin" && (
        <p className="text-xs text-muted-foreground">
          Compared against checkout inspection (
          {fmtDateTime(checkoutInspection.timestamp)}).
        </p>
      )}
    </div>
  );
}

export function CompletionSummary({
  type,
  vehicle,
  res,
  odometer,
  fuel,
  photoCount,
  requiredCount,
  damageCount,
  comparisonCount,
  customerSigned,
  staffSigned,
  inspectionId,
  onCreateClaim,
  onCreateWorkOrder,
  onDone,
  aiFindingsCount = 0,
  aiConfirmedCount = 0,
  hasAiReport = false,
  onViewAiReport,
}: {
  type: InspectionType;
  vehicle: { make: string; model: string; license_plate: string; id: string };
  res: { renter_name: string; id: string };
  odometer: number;
  fuel: number;
  photoCount: number;
  requiredCount: number;
  damageCount: number;
  comparisonCount: number;
  customerSigned: boolean;
  staffSigned: boolean;
  inspectionId: string;
  onCreateClaim: () => void;
  onCreateWorkOrder: () => void;
  onDone: () => void;
  aiFindingsCount?: number;
  aiConfirmedCount?: number;
  hasAiReport?: boolean;
  onViewAiReport?: () => void;
}) {
  const hasDamage =
    damageCount > 0 || comparisonCount > 0 || aiConfirmedCount > 0;
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex flex-col items-center justify-center rounded-xl border border-status-available/30 bg-status-available/5 px-6 py-10 text-center">
        <CheckCircle2 size={48} className="text-status-available" />
        <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">
          Inspection Complete
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {type === "checkout" ? "Checkout" : "Check-in"} · {vehicle.make}{" "}
          {vehicle.model} · {res.renter_name}
        </p>
      </div>

      <SectionCard title="Summary">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Inspection ID</dt>
            <dd className="font-mono tabular text-foreground">
              {inspectionId}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Required photos</dt>
            <dd className="font-mono tabular text-foreground">
              {photoCount} of {requiredCount} captured
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Mileage</dt>
            <dd className="font-mono tabular text-foreground">
              {fmtNumber(odometer)} mi
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Fuel</dt>
            <dd className="font-mono tabular text-foreground">{fuel}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Damage items</dt>
            <dd className="text-foreground">{damageCount}</dd>
          </div>
          {comparisonCount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Potential new damage</dt>
              <dd className="font-medium text-status-out">{comparisonCount}</dd>
            </div>
          )}
          {aiFindingsCount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">AI findings</dt>
              <dd className="text-foreground">{aiFindingsCount}</dd>
            </div>
          )}
          {aiConfirmedCount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">AI-confirmed damage</dt>
              <dd className="font-medium text-status-out">
                {aiConfirmedCount}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Signature</dt>
            <dd className="text-foreground">
              {customerSigned || staffSigned ? "Captured" : "—"}
            </dd>
          </div>
        </dl>
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        {hasAiReport && (
          <Button
            variant="outline"
            onClick={onViewAiReport}
            data-testid="view-ai-report"
          >
            <FileText size={15} className="mr-1.5" /> View AI Damage Report
          </Button>
        )}
        {hasDamage && (
          <Button
            onClick={onCreateClaim}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <AlertTriangle size={15} className="mr-1.5" /> Create Damage Claim
          </Button>
        )}
        <Button variant="outline" onClick={onCreateWorkOrder}>
          <Wrench size={15} className="mr-1.5" /> Create Maintenance Work Order
        </Button>
        <Link to={`/vehicles/${vehicle.id}`}>
          <Button variant="outline">
            <Car size={15} className="mr-1.5" /> View Vehicle
          </Button>
        </Link>
        <Link to={`/reservations/${res.id}`}>
          <Button variant="ghost">
            <FileText size={15} className="mr-1.5" /> View Reservation
          </Button>
        </Link>
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Sign-off toggle button used in the sign-off step. */
export function SignToggle({
  label,
  signed,
  onToggle,
  testId,
}: {
  label: string;
  signed: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onToggle}
      data-testid={testId}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors",
        signed
          ? "border-status-available bg-status-available/10"
          : "border-border hover:border-primary/40",
      )}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      {signed ? (
        <span className="inline-flex items-center gap-1 text-sm text-status-available">
          <CheckCircle2 size={15} /> Captured
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Tap to sign</span>
      )}
    </button>
  );
}
