// Connect Pro Fleet — Inspection completion view (summary + AI report router).
//
// Extracted from InspectionWizard to keep it focused. Renders either the
// standard CompletionSummary or, when AI analysis ran on a check-in, the full
// AiDamageReportView. Handoff actions (Create Damage Claim / Create Maintenance
// Work Order) are always explicit — never automatic.

import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { toast } from "sonner";
import type { Inspection } from "@/lib/inspectionTypes";
import type { AiDamageFinding, PhotoPair } from "@/lib/aiDamageTypes";
import { buildReport } from "@/lib/aiDamageSelectors";
import { DAMAGE_TYPE_LABELS } from "@/lib/inspectionWorkspaceTypes";
import { CompletionSummary } from "./InspectionReview";
import { AiDamageReportView } from "./AiDamageReportView";

export interface InspectionCompletionProps {
  type: "checkout" | "checkin";
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    license_plate: string;
  };
  res: { id: string; renter_name: string; customer_id?: string | null };
  odometer: number;
  fuel: number;
  photoCount: number;
  requiredCount: number;
  damageCount: number;
  comparisonCount: number;
  customerSigned: boolean;
  staffSigned: boolean;
  inspectionId: string;
  checkoutInspection: Inspection | null;
  // AI Damage Detection V1 state.
  aiFindings: AiDamageFinding[];
  aiPairs: PhotoPair[];
  aiCoverage: {
    photos_compared: number;
    angles_analyzed: number;
    angles_not_analyzed: number;
  } | null;
  returnTo?: string | null;
  damageNotes: string;
  damageItems: {
    area: string;
    damage_type: keyof typeof DAMAGE_TYPE_LABELS;
    severity: string;
    note: string;
    review_decision: string;
  }[];
}

export function InspectionCompletion({
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
  checkoutInspection,
  aiFindings,
  aiPairs,
  aiCoverage,
  returnTo,
  damageNotes,
  damageItems,
}: InspectionCompletionProps) {
  const navigate = useNavigate();
  const dc = useDamageClaims();
  const { createWorkOrder } = useStore();
  const [showAiReport, setShowAiReport] = useState(false);
  const [claimCreated, setClaimCreated] = useState(false);
  const [woCreated, setWoCreated] = useState(false);

  const hasAiReport = !!aiCoverage && type === "checkin";

  // --- AI Damage Report view ---
  if (showAiReport && aiCoverage && type === "checkin") {
    const report = buildReport({
      checkin: {
        ...({} as Inspection),
        id: inspectionId || "transient",
        reservation_id: res.id,
        vehicle_id: vehicle.id,
        inspection_type: "checkin",
        tenant_id: TENANT_ID,
      } as Inspection,
      checkout: checkoutInspection,
      findings: aiFindings,
      pairs: aiPairs,
      coverage: aiCoverage,
      rentalId: res.id,
      customerId: res.customer_id ?? null,
      analysisRun: true,
    });
    return (
      <AiDamageReportView
        report={report}
        vehicle={vehicle}
        reservation={res}
        claimCreated={claimCreated}
        workOrderCreated={woCreated}
        onCreateClaim={() => {
          dc.createClaim({
            vehicle_id: vehicle.id,
            reservation_id: res.id,
            customer_id: res.customer_id ?? null,
            inspection_id: inspectionId || null,
            damage_source: "checkin_inspection",
            description:
              aiFindings
                .filter((f) => f.staff_decision === "confirmed")
                .map((f) => `${f.approximate_location}: ${f.description}`)
                .join("; ") || "AI-confirmed damage from check-in inspection",
            severity: aiFindings.some(
              (f) => f.severity === "major" && f.staff_decision === "confirmed",
            )
              ? "major"
              : "moderate",
          });
          setClaimCreated(true);
          toast.success("Damage claim created from AI findings.");
        }}
        onCreateWorkOrder={() => {
          createWorkOrder({
            vehicle_id: vehicle.id,
            title: `Repair from inspection ${inspectionId}`,
            maintenance_type: "other",
            priority: "normal",
            source: "inspection",
            reported_issue:
              aiFindings
                .filter((f) => f.staff_decision === "confirmed")
                .map((f) => `${f.approximate_location}: ${f.description}`)
                .join("; ") || "Damage requiring repair flagged at check-in.",
          });
          setWoCreated(true);
          toast.success("Maintenance work order created.");
        }}
        onDone={() => navigate(returnTo ?? `/reservations/${res.id}`)}
      />
    );
  }

  // --- Standard completion summary ---
  return (
    <CompletionSummary
      type={type}
      vehicle={vehicle}
      res={res}
      odometer={odometer}
      fuel={fuel}
      photoCount={photoCount}
      requiredCount={requiredCount}
      damageCount={damageCount}
      comparisonCount={comparisonCount}
      customerSigned={customerSigned}
      staffSigned={staffSigned}
      inspectionId={inspectionId}
      aiFindingsCount={aiFindings.length}
      aiConfirmedCount={
        aiFindings.filter((f) => f.staff_decision === "confirmed").length
      }
      hasAiReport={hasAiReport}
      onViewAiReport={() => setShowAiReport(true)}
      onCreateClaim={() => {
        dc.createClaim({
          vehicle_id: vehicle.id,
          reservation_id: res.id,
          customer_id: res.customer_id ?? null,
          inspection_id: inspectionId || null,
          damage_source:
            type === "checkin" ? "checkin_inspection" : "checkout_inspection",
          description:
            damageItems
              .map((d) => `${d.area}: ${DAMAGE_TYPE_LABELS[d.damage_type]}`)
              .join("; ") ||
            damageNotes ||
            "Damage flagged during inspection",
          severity: damageItems.some((d) => d.severity === "major")
            ? "major"
            : "moderate",
        });
        toast.success("Damage claim created.");
      }}
      onCreateWorkOrder={() => {
        createWorkOrder({
          vehicle_id: vehicle.id,
          title: `Service issue from inspection`,
          maintenance_type: "other",
          priority: "normal",
          source: "inspection",
          reported_issue:
            damageItems
              .filter((d) => d.damage_type === "mechanical")
              .map((d) => `${d.area}: ${d.note}`)
              .join("; ") || "Mechanical concern flagged during inspection.",
        });
        toast.success("Maintenance work order created.");
      }}
      onDone={() => navigate(returnTo ?? `/reservations/${res.id}`)}
    />
  );
}
