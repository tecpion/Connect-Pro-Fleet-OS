// Connect Pro Fleet — Inspection wizard (Workspace enhancement).
//
// A professional vehicle-condition & handoff workflow:
//   Step 0 — Type & Context
//   Step 1 — Vehicle Condition (checklist + flag details)
//   Step 2 — Photos (angle tiles + mobile camera mode)
//   Step 3 — Mileage, Fuel & Sign-Off
//   Step 4 — Review & Complete (with checkout comparison + completion summary)
//
// Preserves the existing authoritative submit behavior (addInspection +
// updateReservation lifecycle). The AI-damage mock is replaced by a
// deterministic, reviewable checkout↔check-in comparison. No domain logic
// changes.
//
// Resume deep-link: when opened with ?step=<resumeStep>&resume=<inspId>, the
// wizard jumps to the requested step. This is a navigation convenience only —
// it does NOT mutate or reload authoritative inspection state (the wizard
// remains a fresh capture flow; resuming simply positions staff at the right
// step instead of forcing them back to Step 1).

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Fuel,
  Gauge,
  PenLine,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { fmtNumber } from "@/lib/format";
import type { Inspection } from "@/lib/inspectionTypes";
import type {
  ConditionItem,
  ConditionState,
  DamageItem,
  DamageType,
  DamageSeverity,
  DamageReviewDecision,
  InspectionEvent,
  InspectionType,
} from "@/lib/inspectionWorkspaceTypes";
import {
  DAMAGE_TYPE_LABELS,
  REQUIRED_PHOTO_ANGLES,
  freshConditionItems,
} from "@/lib/inspectionWorkspaceTypes";
import {
  findCheckoutForCheckin,
  compareCheckInToCheckout,
  mileageDelta,
} from "@/lib/inspectionSelectors";
import type { AiDamageFinding, PhotoPair } from "@/lib/aiDamageTypes";
import { buildReport } from "@/lib/aiDamageSelectors";
import { isProductionAiConnected } from "@/lib/aiDamageProvider";
import { InspectionPicker } from "./inspections/InspectionPicker";
import { ConditionChecklist } from "./inspections/InspectionCondition";
import { PhotoStep } from "./inspections/InspectionPhotos";
import { AiReviewStep } from "./inspections/AiReviewStep";
import { ReviewStep, SignToggle } from "./inspections/InspectionReview";
import { InspectionCompletion } from "./inspections/InspectionCompletion";
import { resolveResumeStepIndex } from "./inspections/inspectionResume";

// Check-in inspections get an AI Damage Review step between Photos and Sign-Off.
const BASE_STEPS = [
  "Type",
  "Condition",
  "Photos",
  "Sign-Off",
  "Review",
] as const;
const CHECKIN_STEPS = [
  "Type",
  "Condition",
  "Photos",
  "AI Review",
  "Sign-Off",
  "Review",
] as const;

export default function InspectionWizard() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const {
    reservations,
    vehicles,
    inspections,
    addInspection,
    updateReservation,
    logActivity,
    createWorkOrder,
  } = useStore();
  const dc = useDamageClaims();

  const resId = params.get("res") ?? "";
  const initialType = (params.get("type") as InspectionType) ?? "checkout";
  const returnTo = params.get("return");
  const resumeStepParam = params.get("step");
  const res = reservations.find((r) => r.id === resId);

  // Resume deep-link: jump to the requested step (photos / ai_review / signoff
  // / review). Navigation convenience only — does not reload authoritative
  // state. See inspectionResume.ts.
  const [step, setStep] = useState(
    resolveResumeStepIndex(initialType, resumeStepParam),
  );
  const [type, setType] = useState<InspectionType>(initialType);
  const [photoData, setPhotoData] = useState<Record<string, string>>({});
  const [odometer, setOdometer] = useState<number>(0);
  const [fuel, setFuel] = useState<number>(100);
  const [damageNotes, setDamageNotes] = useState("");
  const [customerSigned, setCustomerSigned] = useState(false);
  const [staffSigned, setStaffSigned] = useState(false);
  const [conditionItems, setConditionItems] = useState<ConditionItem[]>(
    freshConditionItems(),
  );
  const [damageItems, setDamageItems] = useState<DamageItem[]>([]);
  const [completed, setCompleted] = useState(false);
  // AI Damage Detection V1 state (check-in only).
  const [aiFindings, setAiFindings] = useState<AiDamageFinding[]>([]);
  const [aiPairs, setAiPairs] = useState<PhotoPair[]>([]);
  const [aiCoverage, setAiCoverage] = useState<{
    photos_compared: number;
    angles_analyzed: number;
    angles_not_analyzed: number;
  } | null>(null);
  const [aiProviderConnected, setAiProviderConnected] = useState(false);
  const [aiOutcome, setAiOutcome] = useState<
    "success" | "partial" | "failed" | null
  >(null);
  const [aiFailedAngles, setAiFailedAngles] = useState<string[]>([]);
  const [showAiReport, setShowAiReport] = useState(false);
  const [claimCreated, setClaimCreated] = useState(false);
  const [woCreated, setWoCreated] = useState(false);

  // Steps depend on inspection type (check-in gets the AI Review step).
  const STEPS = type === "checkin" ? CHECKIN_STEPS : BASE_STEPS;

  const vehicle = res
    ? vehicles.find((v) => v.id === res.vehicle_id)
    : undefined;

  const checkoutInspection = useMemo(
    () =>
      res
        ? (inspections.find(
            (i) =>
              i.inspection_type === "checkout" && i.reservation_id === res.id,
          ) ?? null)
        : null,
    [inspections, res],
  );

  const comparison = useMemo(() => {
    if (type !== "checkin" || !checkoutInspection) return [];
    const transient = {
      ...({} as Inspection),
      condition_items: conditionItems,
    } as Inspection;
    return compareCheckInToCheckout(transient, checkoutInspection);
  }, [type, checkoutInspection, conditionItems]);

  const mDelta = useMemo(() => {
    if (type !== "checkin" || !checkoutInspection) return null;
    return mileageDelta(
      { ...({} as Inspection), odometer_reading: odometer } as Inspection,
      checkoutInspection,
    );
  }, [type, checkoutInspection, odometer]);

  const mileageWarning = mDelta !== null && mDelta < 0;

  if (!res || !vehicle) {
    return <InspectionPicker reservations={reservations} vehicles={vehicles} />;
  }

  const requiredPhotosCaptured = REQUIRED_PHOTO_ANGLES.filter(
    (a) => photoData[a],
  ).length;
  const missingRequired = REQUIRED_PHOTO_ANGLES.filter((a) => !photoData[a]);

  const canAdvance = (() => {
    const label = STEPS[step];
    if (label === "Type") return true;
    if (label === "Condition") return true;
    if (label === "Photos")
      return requiredPhotosCaptured >= REQUIRED_PHOTO_ANGLES.length;
    if (label === "AI Review") return true; // analysis is optional / can be deferred
    if (label === "Sign-Off")
      return odometer > 0 && (customerSigned || staffSigned);
    if (label === "Review") return true;
    return false;
  })();

  const setConditionState = (key: string, state: ConditionState) => {
    setConditionItems((items) =>
      items.map((c) => (c.key === key ? { ...c, state } : c)),
    );
  };

  const addDamageItem = (area: string) => {
    setDamageItems((items) => [
      ...items,
      {
        id: uid("dmg"),
        area,
        damage_type: "scratch",
        severity: "minor",
        note: "",
        provenance: type === "checkin" ? "new" : "pre_existing",
        review_decision: type === "checkin" ? "pending" : "marked_pre_existing",
        photo_angle: null,
      },
    ]);
  };

  const updateDamageItem = (id: string, patch: Partial<DamageItem>) => {
    setDamageItems((items) =>
      items.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  };

  const removeDamageItem = (id: string) => {
    setDamageItems((items) => items.filter((d) => d.id !== id));
  };

  const submit = () => {
    const events: InspectionEvent[] = [
      {
        id: uid("evt"),
        at: new Date().toISOString(),
        label: "Inspection started",
        tone: "neutral",
      },
      {
        id: uid("evt"),
        at: new Date().toISOString(),
        label: `${type === "checkout" ? "Checkout" : "Check-in"} type selected`,
        tone: "neutral",
      },
      ...REQUIRED_PHOTO_ANGLES.filter((a) => photoData[a]).map((a) => ({
        id: uid("evt"),
        at: new Date().toISOString(),
        label: `Photo captured: ${a}`,
        tone: "available" as const,
      })),
      ...damageItems.map((d) => ({
        id: uid("evt"),
        at: new Date().toISOString(),
        label: `Damage flagged: ${d.area} (${DAMAGE_TYPE_LABELS[d.damage_type]})`,
        tone: "out" as const,
      })),
      ...(customerSigned || staffSigned
        ? [
            {
              id: uid("evt"),
              at: new Date().toISOString(),
              label: "Signature captured",
              tone: "available" as const,
            },
          ]
        : []),
      // AI Damage Detection audit events (spec §48).
      ...(aiOutcome
        ? [
            {
              id: uid("evt"),
              at: new Date().toISOString(),
              label: `AI analysis ${aiOutcome}: ${aiCoverage?.angles_analyzed ?? 0} angle(s) analyzed, ${aiFindings.length} finding(s)`,
              tone: (aiOutcome === "failed" ? "out" : "neutral") as
                "out" | "neutral",
            },
          ]
        : []),
      ...aiFindings.map((f) => ({
        id: uid("evt"),
        at: new Date().toISOString(),
        label: `AI finding: ${f.approximate_location} — staff ${f.staff_decision}`,
        tone: (f.staff_decision === "confirmed" ? "out" : "neutral") as
          "out" | "neutral",
      })),
      {
        id: uid("evt"),
        at: new Date().toISOString(),
        label: "Inspection completed",
        tone: "available" as const,
      },
    ];

    const hasAiConfirmedDamage =
      type === "checkin" &&
      aiFindings.some((f) => f.staff_decision === "confirmed");

    const hasNewDamage =
      type === "checkin" &&
      (comparison.length > 0 ||
        damageItems.some((d) => d.review_decision === "confirmed_new") ||
        hasAiConfirmedDamage);

    const inspection = {
      id: uid("ins"),
      reservation_id: res.id,
      vehicle_id: vehicle.id,
      inspection_type: type,
      photos: Object.keys(photoData),
      odometer_reading: odometer,
      fuel_level: fuel,
      damage_notes:
        damageNotes +
        (comparison.length
          ? ` | Potential new damage: ${comparison.map((c) => c.area).join(", ")}`
          : ""),
      damage_detected: hasNewDamage || damageItems.length > 0 || !!damageNotes,
      damage_ai_confidence: 0,
      damage_ai_flagged_regions: [],
      inspector_signature_url:
        customerSigned || staffSigned ? `sig_${uid("sig")}` : null,
      timestamp: new Date().toISOString(),
      tenant_id: TENANT_ID,
      condition_items: conditionItems,
      damage_items: damageItems,
      customer_signature: customerSigned,
      staff_signature: staffSigned,
      inspection_events: events,
      linked_damage_claim_ids: [],
      linked_work_order_ids: [],
      // AI Damage Detection V1 — persisted findings + report metadata.
      ai_damage_findings: aiFindings,
      ai_pairs: aiPairs,
      ai_coverage: aiCoverage,
      ai_provider_connected: aiProviderConnected,
      ai_outcome: aiOutcome,
    } as Inspection;

    addInspection(inspection);
    logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label: `${type === "checkout" ? "Checkout" : "Check-in"} inspection completed — ${vehicle.make} ${vehicle.model}`,
      tone:
        type === "checkout"
          ? "available"
          : hasNewDamage
            ? "maintenance"
            : "available",
    });
    if (type === "checkout") updateReservation(res.id, { status: "active" });
    if (type === "checkin")
      updateReservation(res.id, {
        status: "completed",
        deposit_status: "released",
      });
    toast.success(
      type === "checkout"
        ? "Checkout complete — rental is now active."
        : "Check-in complete — rental closed.",
    );
    setCompleted(true);
  };

  if (completed) {
    const found = inspections.find(
      (i) =>
        i.reservation_id === res.id &&
        i.inspection_type === type &&
        i.odometer_reading === odometer,
    );
    return (
      <InspectionCompletion
        type={type}
        vehicle={vehicle}
        res={res}
        odometer={odometer}
        fuel={fuel}
        photoCount={requiredPhotosCaptured}
        requiredCount={REQUIRED_PHOTO_ANGLES.length}
        damageCount={damageItems.length}
        comparisonCount={comparison.length}
        customerSigned={customerSigned}
        staffSigned={staffSigned}
        inspectionId={found?.id ?? ""}
        checkoutInspection={checkoutInspection}
        aiFindings={aiFindings}
        aiPairs={aiPairs}
        aiCoverage={aiCoverage}
        returnTo={returnTo}
        damageNotes={damageNotes}
        damageItems={damageItems}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to={returnTo ?? `/reservations/${res.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} />{" "}
        {returnTo ? "Back to workflow" : "Back to reservation"}
      </Link>

      <PageHeader
        title={`${type === "checkout" ? "Checkout" : "Check-in"} inspection`}
        subtitle={`${vehicle.make} ${vehicle.model} · ${vehicle.license_plate} · ${res.renter_name}`}
      />

      {/* Progress */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  i < step
                    ? "bg-status-available text-white"
                    : i === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground",
                )}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline",
                  i === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && (
                <div className="h-0.5 flex-1 rounded bg-border" />
              )}
            </div>
          ))}
        </div>
      </div>

      <SectionCard>
        {STEPS[step] === "Type" && (
          <div className="space-y-4">
            <Label>Inspection type</Label>
            <div className="grid grid-cols-2 gap-3">
              {(["checkout", "checkin"] as InspectionType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  data-testid={`type-${t}`}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    type === t
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <p className="font-display text-base font-semibold text-foreground">
                    {t === "checkout" ? "Checkout" : "Check-in"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t === "checkout"
                      ? "Capture vehicle condition at handoff."
                      : "Compare return condition against checkout."}
                  </p>
                </button>
              ))}
            </div>
            {type === "checkin" && !checkoutInspection && (
              <p className="flex items-center gap-2 rounded-md bg-status-maintenance/10 px-3 py-2 text-sm text-status-maintenance">
                <AlertTriangle size={16} /> No checkout inspection on file for
                this reservation — comparison won't run. Capture condition
                as-is.
              </p>
            )}
            {type === "checkin" && checkoutInspection && (
              <p className="flex items-center gap-2 rounded-md bg-status-available/10 px-3 py-2 text-sm text-status-available">
                <CheckCircle2 size={16} /> Checkout inspection found — return
                condition will be compared against it.
              </p>
            )}
          </div>
        )}

        {STEPS[step] === "Condition" && (
          <ConditionChecklist
            items={conditionItems}
            onSetState={setConditionState}
            damageItems={damageItems}
            onAddDamage={addDamageItem}
            onUpdateDamage={updateDamageItem}
            onRemoveDamage={removeDamageItem}
            comparison={comparison}
            isCheckin={type === "checkin"}
          />
        )}

        {STEPS[step] === "Photos" && (
          <PhotoStep
            photoData={photoData}
            setPhotoData={setPhotoData}
            vehicleType={vehicle.vehicle_type}
            requiredCaptured={requiredPhotosCaptured}
            requiredCount={REQUIRED_PHOTO_ANGLES.length}
            missing={missingRequired}
          />
        )}

        {STEPS[step] === "AI Review" && type === "checkin" && (
          <AiReviewStep
            checkin={
              {
                ...({} as Inspection),
                id: "transient_checkin",
                reservation_id: res.id,
                vehicle_id: vehicle.id,
                inspection_type: "checkin",
                photos: Object.keys(photoData),
                odometer_reading: odometer,
                fuel_level: fuel,
                timestamp: new Date().toISOString(),
                tenant_id: TENANT_ID,
              } as Inspection
            }
            checkout={checkoutInspection}
            rentalId={res.id}
            reviewerId={null}
            onFindingsChange={setAiFindings}
            onAnalysisComplete={(r) => {
              setAiPairs(r.pairs);
              setAiCoverage(r.coverage);
              setAiProviderConnected(r.providerConnected);
              setAiOutcome(r.outcome);
              setAiFailedAngles(r.failedAngles);
            }}
          />
        )}

        {STEPS[step] === "Sign-Off" && (
          <div className="space-y-5">
            <div>
              <Label className="flex items-center gap-1.5">
                <Gauge size={15} /> Odometer reading (mi)
              </Label>
              <Input
                type="number"
                value={odometer || ""}
                onChange={(e) => setOdometer(Number(e.target.value))}
                placeholder="0"
                inputMode="numeric"
                className="mt-1.5 h-14 font-mono text-2xl tabular"
                data-testid="odometer-input"
              />
              {mileageWarning && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-status-out">
                  <AlertTriangle size={14} /> Return mileage is lower than
                  checkout (
                  {fmtNumber(checkoutInspection?.odometer_reading ?? 0)} mi).
                  Review before continuing.
                </p>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Fuel size={15} /> Fuel level
              </Label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={fuel}
                  onChange={(e) => setFuel(Number(e.target.value))}
                  className="flex-1 accent-primary"
                  aria-label="Fuel level"
                />
                <span className="w-14 text-right font-mono text-lg tabular text-foreground">
                  {fuel}%
                </span>
              </div>
              {checkoutInspection && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Checkout fuel: {checkoutInspection.fuel_level}% · Difference:{" "}
                  <span
                    className={cn(
                      fuel - checkoutInspection.fuel_level < 0
                        ? "text-status-maintenance"
                        : "text-foreground",
                    )}
                  >
                    {fuel - checkoutInspection.fuel_level >= 0 ? "+" : ""}
                    {fuel - checkoutInspection.fuel_level}%
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <Label className="flex items-center gap-1.5">
                <PenLine size={15} /> Sign-off
              </Label>
              <SignToggle
                label="Customer signature"
                signed={customerSigned}
                onToggle={() => setCustomerSigned((s) => !s)}
                testId="customer-sign"
              />
              <SignToggle
                label="Staff / inspector sign-off"
                signed={staffSigned}
                onToggle={() => setStaffSigned((s) => !s)}
                testId="staff-sign"
              />
            </div>
          </div>
        )}

        {STEPS[step] === "Review" && (
          <ReviewStep
            type={type}
            vehicle={vehicle}
            res={res}
            odometer={odometer}
            fuel={fuel}
            photoCount={requiredPhotosCaptured}
            requiredCount={REQUIRED_PHOTO_ANGLES.length}
            conditionItems={conditionItems}
            damageItems={damageItems}
            comparison={comparison}
            customerSigned={customerSigned}
            staffSigned={staffSigned}
            checkoutInspection={checkoutInspection}
            mileageWarning={mileageWarning}
          />
        )}
      </SectionCard>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="lg"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="px-6"
        >
          <ChevronLeft size={18} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            size="lg"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="bg-primary px-6 text-primary-foreground hover:bg-primary-press"
            data-testid="wizard-continue"
          >
            Continue <ChevronRight size={18} />
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={!canAdvance}
            onClick={submit}
            className="bg-primary px-6 text-primary-foreground hover:bg-primary-press"
            data-testid="wizard-submit"
          >
            <Check size={18} /> Submit {type}
          </Button>
        )}
      </div>
    </div>
  );
}
