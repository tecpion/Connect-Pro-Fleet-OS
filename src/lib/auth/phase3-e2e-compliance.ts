// Phase 3 E2E — compliance runtime verification steps.
// Split out so the main runner stays focused on orchestration.

import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "@/lib/complianceTypes";
import type { ResolvedVerificationRequirement } from "@/lib/verificationTypes";
import type { Vehicle, RentalAgreement } from "@/lib/types";
import type { RentalDriver } from "@/lib/defenseTypes";
import { evaluateRentalReleaseGate } from "@/lib/rentalReleaseGate";
import type { SupabaseComplianceRepository } from "@/lib/supabase/complianceVerificationAdapters";
import {
  makeDocument,
  makeRequirement,
  makeComplianceOverride,
  type Phase3Context,
} from "./phase3-e2e-builders";

export interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface GateInputs {
  rental: RentalAgreement;
  vehicle: Vehicle;
  drivers: RentalDriver[];
  now: Date;
}

export function gateFromCloud(
  inputs: GateInputs,
  requirements: ComplianceRequirement[],
  documents: DocumentRecord[],
  overrides: ComplianceOverride[],
  verificationReqs?: ResolvedVerificationRequirement[],
) {
  return evaluateRentalReleaseGate({
    rental: inputs.rental,
    vehicle: inputs.vehicle,
    drivers: inputs.drivers,
    checkoutInspection: null,
    workOrders: [],
    requirements,
    documents,
    overrides,
    agreementSigned: true,
    verificationRequirements: verificationReqs,
    now: inputs.now,
  });
}

export async function runComplianceSteps(
  ctx: Phase3Context,
  repoA: { compliance: SupabaseComplianceRepository },
  repoA2: { compliance: SupabaseComplianceRepository },
  repoB: { compliance: SupabaseComplianceRepository },
  inputs: GateInputs,
  createdDocIds: string[],
  createdReqIds: string[],
  createdOverrideIds: string[],
): Promise<Step[]> {
  const steps: Step[] = [];

  // 1. Org A creates valid compliance record (registration, verified, far future).
  const validReq = makeRequirement(ctx, "registration", {
    required: true,
    blocksMissing: true,
    blocksExpired: true,
    managerOverride: true,
  });
  const validDoc = makeDocument(ctx, "registration", "verified", "2030-01-01", "verified");
  createdReqIds.push(validReq.id);
  createdDocIds.push(validDoc.id);
  await repoA.compliance.upsertRequirement(validReq);
  await repoA.compliance.insertDocument(validDoc);
  steps.push({ step: "1_orgA_create_valid_compliance", ok: true, detail: `req=${validReq.id} doc=${validDoc.id}` });

  // 2. Persistence after logout/login: fresh client reads back.
  const docsAfterRelogin = await repoA2.compliance.listDocuments(ctx.orgA);
  const persistedValid = docsAfterRelogin.some((d) => d.id === validDoc.id);
  steps.push({ step: "2_compliance_persists_relogin", ok: persistedValid, detail: persistedValid ? "found after relogin" : "missing after relogin" });

  // 3. Release gate = clear (valid doc satisfies required reg).
  const reqsA = await repoA.compliance.listRequirements(ctx.orgA);
  const docsA = await repoA.compliance.listDocuments(ctx.orgA);
  const overridesA = await repoA.compliance.listOverrides(ctx.orgA);
  const gateValid = gateFromCloud(inputs, reqsA, docsA, overridesA);
  const complianceBlockedValid = gateValid.reasons.some((r) => r.key.startsWith("compliance:"));
  steps.push({ step: "3_gate_clear_valid_compliance", ok: !complianceBlockedValid, detail: `blocked=${gateValid.blocked} complianceReasons=${gateValid.reasons.filter((r) => r.key.startsWith("compliance:")).length}` });

  // 4. Create warning/expiring condition (insurance expiring in 10 days).
  const warnReq = makeRequirement(ctx, "insurance", { required: true, blocksMissing: true, blocksExpired: true, warningDays: 30, managerOverride: true });
  const warnDoc = makeDocument(ctx, "insurance", "expiring_soon", new Date(ctx.now.getTime() + 10 * 86_400_000).toISOString().slice(0, 10), "verified");
  createdReqIds.push(warnReq.id);
  createdDocIds.push(warnDoc.id);
  await repoA.compliance.upsertRequirement(warnReq);
  await repoA.compliance.insertDocument(warnDoc);
  const reqsWarn = await repoA.compliance.listRequirements(ctx.orgA);
  const docsWarn = await repoA.compliance.listDocuments(ctx.orgA);
  const overridesWarn = await repoA.compliance.listOverrides(ctx.orgA);
  const gateWarn = gateFromCloud(inputs, reqsWarn, docsWarn, overridesWarn);
  const warnReason = gateWarn.reasons.find((r) => r.key === "insurance_expiring_soon");
  const hasHardBlockWarn = gateWarn.hard_blocked;
  steps.push({ step: "4_create_warning_condition", ok: true, detail: `doc=${warnDoc.id}` });
  steps.push({ step: "5_gate_preserves_warning_classification", ok: !!warnReason && warnReason.severity === "warning" && !hasHardBlockWarn, detail: `warnReason=${!!warnReason} severity=${warnReason?.severity ?? "none"} hardBlocked=${hasHardBlockWarn}` });

  // 6. Create blocking/expired/invalid condition (registration expired).
  const blockReq = makeRequirement(ctx, "registration", { required: true, blocksMissing: true, blocksExpired: true, managerOverride: true });
  const blockDoc = makeDocument(ctx, "registration", "expired", "2020-01-01", "verified");
  createdReqIds.push(blockReq.id);
  createdDocIds.push(blockDoc.id);
  await repoA.compliance.upsertRequirement(blockReq);
  await repoA.compliance.insertDocument(blockDoc);
  const reqsBlock = await repoA.compliance.listRequirements(ctx.orgA);
  const docsBlock = await repoA.compliance.listDocuments(ctx.orgA);
  const overridesBlock = await repoA.compliance.listOverrides(ctx.orgA);
  const gateBlock = gateFromCloud(inputs, reqsBlock, docsBlock, overridesBlock);
  const complianceBlockReasons = gateBlock.reasons.filter((r) => r.key.startsWith("compliance:"));
  steps.push({ step: "6_create_blocking_condition", ok: true, detail: `doc=${blockDoc.id}` });
  steps.push({ step: "7_gate_blocks_blocking_condition", ok: complianceBlockReasons.length > 0 && gateBlock.blocked, detail: `blocked=${gateBlock.blocked} complianceReasons=${complianceBlockReasons.length} severities=${complianceBlockReasons.map((r) => r.severity).join(",")}` });

  // 8. Unknown/missing condition: a required doc with NO document record.
  const unknownReq = makeRequirement(ctx, "title", { required: true, blocksMissing: true, blocksExpired: true, managerOverride: true });
  createdReqIds.push(unknownReq.id);
  await repoA.compliance.upsertRequirement(unknownReq);
  const reqsUnknown = await repoA.compliance.listRequirements(ctx.orgA);
  const docsUnknown = await repoA.compliance.listDocuments(ctx.orgA);
  const overridesUnknown = await repoA.compliance.listOverrides(ctx.orgA);
  const gateUnknown = gateFromCloud(inputs, reqsUnknown, docsUnknown, overridesUnknown);
  const unknownReason = gateUnknown.reasons.find((r) => r.key.startsWith("compliance:") && r.detail?.includes("missing"));
  steps.push({ step: "8_create_unknown_missing_condition", ok: true, detail: `req=${unknownReq.id}` });
  steps.push({ step: "9_unknown_not_silently_valid", ok: !!unknownReason, detail: `missingReasonFound=${!!unknownReason} detail=${unknownReason?.detail ?? "none"}` });

  // 10. Org B cannot read Org A compliance.
  const bDocs = await repoB.compliance.listDocuments(ctx.orgA);
  steps.push({ step: "10_orgB_cannot_read_orgA_compliance", ok: bDocs.length === 0, detail: `returned=${bDocs.length} (RLS should return 0)` });

  // 11. Org B cannot update Org A compliance.
  let bUpdateOk = false;
  try {
    await repoB.compliance.updateDocument(ctx.orgA, validDoc.id, { notes: "hacked" });
    const check = await repoA.compliance.listDocumentsForEntity(ctx.orgA, "vehicle", ctx.vehId);
    const still = check.find((d) => d.id === validDoc.id);
    bUpdateOk = still?.notes !== "hacked";
  } catch {
    bUpdateOk = true;
  }
  steps.push({ step: "11_orgB_cannot_update_orgA_compliance", ok: bUpdateOk, detail: bUpdateOk ? "blocked/no-op" : "update leaked" });

  // 12. Org B cannot insert using Org A organization_id.
  let bInsertOk = false;
  try {
    const bDoc = makeDocument(ctx, "registration", "verified", "2030-01-01");
    bDoc.tenant_id = ctx.orgA;
    await repoB.compliance.insertDocument(bDoc);
    const aCheck = await repoA.compliance.listDocuments(ctx.orgA);
    bInsertOk = !aCheck.some((d) => d.id === bDoc.id);
  } catch {
    bInsertOk = true;
  }
  steps.push({ step: "12_orgB_cannot_insert_orgA_scope", ok: bInsertOk, detail: bInsertOk ? "blocked" : "insert leaked" });

  // 24. Eligible compliance override persists actor/reason/timestamp.
  const cOverride = makeComplianceOverride(ctx, "title", unknownReq.id, "Title in transit — override approved", ctx.userAId);
  createdOverrideIds.push(cOverride.id);
  await repoA.compliance.insertOverride(cOverride);
  const overridesAfter = await repoA.compliance.listOverrides(ctx.orgA);
  const cOverrideFound = overridesAfter.find((o) => o.id === cOverride.id);
  steps.push({ step: "24_compliance_override_persists", ok: !!cOverrideFound && cOverrideFound.reason === cOverride.reason && cOverrideFound.created_by === ctx.userAId && !!cOverrideFound.created_at, detail: `found=${!!cOverrideFound} reason=${cOverrideFound?.reason ?? ""} actor=${cOverrideFound?.created_by ?? ""} at=${cOverrideFound?.created_at ?? ""}` });

  // 26. Unauthorized override fails: Org B attempts to insert an override scoped to Org A.
  let bOverrideOk = false;
  try {
    const bOv = makeComplianceOverride(ctx, "registration", null, "hacked override", ctx.userBId);
    await repoB.compliance.insertOverride(bOv);
    const aCheck = await repoA.compliance.listOverrides(ctx.orgA);
    bOverrideOk = !aCheck.some((o) => o.id === bOv.id);
  } catch {
    bOverrideOk = true;
  }
  steps.push({ step: "26_unauthorized_override_fails", ok: bOverrideOk, detail: bOverrideOk ? "blocked" : "override leaked" });

  // 27. Hard non-overridable block remains non-overridable.
  const hardReq = makeRequirement(ctx, "emissions", { required: true, blocksMissing: true, blocksExpired: true, managerOverride: false });
  createdReqIds.push(hardReq.id);
  await repoA.compliance.upsertRequirement(hardReq);
  const reqsHard = await repoA.compliance.listRequirements(ctx.orgA);
  const docsHard = await repoA.compliance.listDocuments(ctx.orgA);
  const overridesHard = await repoA.compliance.listOverrides(ctx.orgA);
  const gateHard = gateFromCloud(inputs, reqsHard, docsHard, overridesHard);
  const hardReason = gateHard.reasons.find((r) => r.key.startsWith("compliance:") && r.severity === "hard_block");
  steps.push({ step: "27_hard_block_non_overridable", ok: !!hardReason && !gateHard.override_eligible && gateHard.hard_blocked, detail: `hardReason=${!!hardReason} overrideEligible=${gateHard.override_eligible} hardBlocked=${gateHard.hard_blocked}` });

  return steps;
}
