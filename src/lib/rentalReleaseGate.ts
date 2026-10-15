// Connect Pro Fleet — Rental Release Safety Gate (pure derived selector).
//
// Composes — does NOT duplicate — existing authoritative logic:
//  - Compliance blocking (complianceAvailability.getComplianceBlock)
//  - Maintenance blocking (MaintenanceWorkOrder.blocks_vehicle_use + safety types)
//  - Vehicle out-of-service status
//  - Signed rental agreement (SEPARATE from inspection signature)
//  - Driver license verification (canonical RentalDriver model)
//  - Checkout inspection completion
//
// Each ReleaseBlockReason carries a severity:
//  - hard_block: safety-critical — CANNOT be manager-overridden
//  - override_eligible: administrative — may be overridden with audit
//  - warning: does not prevent release but is recorded
//
// No second rules engine. Reuses authoritative maintenance/compliance logic.

import type {
  ReleaseBlockReason,
  ReleaseBlockSeverity,
  ReleaseGateResult,
  RentalDriver,
  ReleaseMaintenanceItem,
} from "./defenseTypes";
import type { RentalAgreement, Vehicle } from "./types";
import type { Inspection } from "./inspectionTypes";
import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type { ResolvedVerificationRequirement } from "./verificationTypes";
import { getEntityComplianceStatus } from "./complianceStatus";
import { deriveInspectionStatus } from "./inspectionSelectors";
import {
  doesResolvedRequirementBlock,
  verificationBlockReasons,
} from "./verificationSelectors";
import {
  WORK_ORDER_ACTIVE_STATUSES,
  type MaintenanceType,
} from "./maintenanceTypes";

/** Maintenance types that are safety-critical. A blocking active work order
 *  for one of these is a HARD block — it cannot be manager-overridden. */
export const SAFETY_CRITICAL_MAINTENANCE_TYPES: ReadonlySet<MaintenanceType> =
  new Set<MaintenanceType>([
    "brakes",
    "engine",
    "transmission",
    "tires",
    "steering" as MaintenanceType,
    "suspension" as MaintenanceType,
  ]);

/** A maintenance type is safety-critical when it affects braking, steering,
 *  tires, or the drivetrain. */
export function isSafetyCriticalMaintenance(type: MaintenanceType): boolean {
  return (
    SAFETY_CRITICAL_MAINTENANCE_TYPES.has(type) ||
    type === "brakes" ||
    type === "engine" ||
    type === "transmission" ||
    type === "tires"
  );
}

/** Build the frozen list of maintenance items open at release (or now). Pure. */
export function buildMaintenanceItemsOpen(
  vehicleId: string,
  workOrders: MaintenanceWorkOrder[],
): ReleaseMaintenanceItem[] {
  return workOrders
    .filter(
      (w) =>
        w.vehicle_id === vehicleId &&
        WORK_ORDER_ACTIVE_STATUSES.includes(w.status),
    )
    .map((w) => ({
      work_order_id: w.id,
      work_order_number: w.work_order_number,
      maintenance_type: w.maintenance_type,
      title: w.title,
      status: w.status,
      blocks_vehicle_use: w.blocks_vehicle_use,
      safety_critical: isSafetyCriticalMaintenance(w.maintenance_type),
    }));
}

/** Evaluate the release gate for a rental + vehicle. Returns severity-classified
 *  blockers. Pure — operates on the passed-in authoritative records. */
export function evaluateRentalReleaseGate(input: {
  rental: RentalAgreement;
  vehicle: Vehicle;
  drivers: RentalDriver[]; // canonical rental drivers for this rental
  checkoutInspection: Inspection | null;
  workOrders: MaintenanceWorkOrder[];
  requirements: ComplianceRequirement[];
  documents: DocumentRecord[];
  overrides: ComplianceOverride[];
  /** Whether the rental agreement itself is signed (SEPARATE from inspection
   *  signature). */
  agreementSigned: boolean;
  /** Resolved customer-verification requirements (company policy + per-rental
   *  staff requirements). When provided, REQUIRED + unsatisfied checks block
   *  release as override_eligible (administrative). Optional unrun checks NEVER
   *  block. This is the ONE place verification policy meets the release gate —
   *  screens must NOT duplicate it. */
  verificationRequirements?: ResolvedVerificationRequirement[];
  now?: Date;
}): ReleaseGateResult {
  const {
    rental,
    vehicle,
    drivers,
    checkoutInspection,
    workOrders,
    requirements,
    documents,
    overrides,
    agreementSigned,
    verificationRequirements,
    now = new Date(),
  } = input;

  const reasons: ReleaseBlockReason[] = [];

  // 1. Signed rental agreement missing (override_eligible — administrative).
  if (!agreementSigned) {
    reasons.push({
      key: "agreement_not_signed",
      label: "Rental agreement not signed",
      severity: "override_eligible",
      detail: "The rental agreement itself has not been signed by the renter.",
      source_ref: rental.id,
    });
  }

  // 2. Driver license verification incomplete (override_eligible).
  const activeDrivers = drivers.filter(
    (d) => d.authorization_status === "active",
  );
  const unverifiedDrivers = activeDrivers.filter(
    (d) => d.verification_status !== "verified",
  );
  if (unverifiedDrivers.length > 0) {
    reasons.push({
      key: "license_verification_incomplete",
      label: "Driver license verification incomplete",
      severity: "override_eligible",
      detail: `${unverifiedDrivers.length} authorized driver(s) lack verified licenses: ${unverifiedDrivers.map((d) => d.full_name).join(", ")}.`,
      source_ref: null,
    });
  }

  // 2b. Resolved customer-verification requirements (company policy + staff
  //     per-rental requirements). Only REQUIRED + unsatisfied + not-overridden
  //     checks block. Optional unrun checks NEVER block. These are
  //     override_eligible (administrative) — a manager may override with audit.
  if (verificationRequirements) {
    const blocking = verificationRequirements.filter((r) =>
      doesResolvedRequirementBlock(r, now),
    );
    for (const r of blocking) {
      const [label] = verificationBlockReasons([r], now);
      reasons.push({
        key: `verification_required:${r.verification_type}`,
        label: label ?? `Required verification pending`,
        severity: "override_eligible",
        detail: label ?? `Required verification pending`,
        source_ref: r.latest_request?.id ?? null,
      });
    }
  }

  // 3. Checkout inspection incomplete (override_eligible).
  if (!checkoutInspection) {
    reasons.push({
      key: "checkout_inspection_missing",
      label: "Checkout inspection not completed",
      severity: "override_eligible",
      detail: "No checkout inspection record exists for this rental.",
      source_ref: null,
    });
  } else {
    const status = deriveInspectionStatus(checkoutInspection);
    if (status === "incomplete" || status === "in_progress") {
      reasons.push({
        key: "checkout_inspection_incomplete",
        label: "Checkout inspection incomplete",
        severity: "override_eligible",
        detail: `Inspection status: ${status}. Required photos or signature missing.`,
        source_ref: checkoutInspection.id,
      });
    }
  }

  // 4. Safety-critical maintenance unresolved (HARD BLOCK).
  const openMaintenance = buildMaintenanceItemsOpen(vehicle.id, workOrders);
  const safetyCriticalBlocking = openMaintenance.filter(
    (m) => m.blocks_vehicle_use && m.safety_critical,
  );
  for (const m of safetyCriticalBlocking) {
    reasons.push({
      key: `safety_maintenance_open:${m.work_order_id}`,
      label: `Safety-critical maintenance open: ${m.title}`,
      severity: "hard_block",
      detail: `Active ${m.maintenance_type} work order ${m.work_order_number} blocks vehicle use. Safety-critical — cannot be overridden.`,
      source_ref: m.work_order_id,
    });
  }

  // 5. Vehicle explicitly out of service (HARD BLOCK).
  if (vehicle.status === "out_of_service") {
    reasons.push({
      key: "vehicle_out_of_service",
      label: "Vehicle is out of service",
      severity: "hard_block",
      detail:
        "Vehicle status is explicitly Out of Service. Cannot be released.",
      source_ref: vehicle.id,
    });
  }

  // 6. Compliance blocking. Each blocking reason is tied to the EXACT
  //    originating requirement (not a generic .find() against any blocking
  //    requirement), so severity reflects that specific requirement:
  //      manager_override_allowed === false → hard_block (cannot be overridden)
  //      otherwise                          → override_eligible
  //    We enumerate the per-requirement evaluations from getEntityComplianceStatus
  //    (the same authority getComplianceBlock wraps) so each reason maps to its
  //    own requirement and override flag.
  const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const complianceEval = getEntityComplianceStatus(
    "vehicle",
    vehicle.id,
    vehicleLabel,
    requirements,
    documents,
    overrides,
    now,
  );
  for (const ev of complianceEval.evaluations) {
    if (!ev.blocking || !ev.reason) continue;
    const req = ev.requirement;
    const reasonText = `${req.document_type} — ${ev.reason.replace(/_/g, " ")}`;
    const severity: ReleaseBlockSeverity =
      req.manager_override_allowed === false
        ? "hard_block"
        : "override_eligible";
    reasons.push({
      key: `compliance:${req.id}`,
      label: reasonText,
      severity,
      detail: reasonText,
      source_ref: req.id,
    });
  }

  // 7. Insurance expiring soon (warning — does not block).
  const insuranceDoc = documents.find(
    (d) =>
      d.entity_type === "vehicle" &&
      d.entity_id === vehicle.id &&
      d.document_type === "insurance" &&
      d.status !== "archived",
  );
  if (insuranceDoc?.expiration_date) {
    const exp = new Date(insuranceDoc.expiration_date);
    const daysUntilExpiry = Math.floor(
      (exp.getTime() - now.getTime()) / 86_400_000,
    );
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
      reasons.push({
        key: "insurance_expiring_soon",
        label: "Insurance expiring soon",
        severity: "warning",
        detail: `Insurance expires ${insuranceDoc.expiration_date} (in ${daysUntilExpiry} days).`,
        source_ref: insuranceDoc.id,
      });
    }
  }

  const hardBlocks = reasons.filter((r) => r.severity === "hard_block");
  const overrideEligible = reasons.filter(
    (r) => r.severity === "override_eligible",
  );
  const hardBlocked = hardBlocks.length > 0;
  const blocked = hardBlocked || overrideEligible.length > 0;

  return {
    blocked,
    hard_blocked: hardBlocked,
    reasons,
    // Override is eligible ONLY when there are no hard blocks and at least one
    // override_eligible reason exists.
    override_eligible: !hardBlocked && overrideEligible.length > 0,
  };
}

/** Whether a manager override is permitted for a given gate result. Hard
 *  blocks can NEVER be overridden through the normal workflow. */
export function canOverrideGate(result: ReleaseGateResult): boolean {
  return result.override_eligible;
}
