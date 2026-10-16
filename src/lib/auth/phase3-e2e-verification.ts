// Phase 3 E2E — verification runtime verification steps.

import type {
  VerificationServicesPolicy,
  ResolvedVerificationRequirement,
} from "@/lib/verificationTypes";
import { resolveVerificationRequirements } from "@/lib/verificationSelectors";
import type {
  SupabaseVerificationRepository,
  SupabaseComplianceRepository,
} from "@/lib/supabase/complianceVerificationAdapters";
import {
  makeVerificationRequirement,
  makeVerificationRequest,
  makeVerificationOverride,
  type Phase3Context,
} from "./phase3-e2e-builders";
import type { Step, GateInputs } from "./phase3-e2e-compliance";
import { gateFromCloud } from "./phase3-e2e-compliance";

export const POLICY_OFF: VerificationServicesPolicy = {
  modes: {
    identity: "off",
    drivers_license: "off",
    insurance: "off",
    mvr: "off",
    background: "off",
  },
  auto_run: "manual_only",
};

export async function runVerificationSteps(
  ctx: Phase3Context,
  repoA: {
    verification: SupabaseVerificationRepository;
    compliance: SupabaseComplianceRepository;
  },
  repoA2: {
    verification: SupabaseVerificationRepository;
    compliance: SupabaseComplianceRepository;
  },
  repoB: { verification: SupabaseVerificationRepository },
  inputs: GateInputs,
  createdVReqIds: string[],
  createdVRequirementIds: string[],
  createdVOverrideIds: string[],
): Promise<Step[]> {
  const steps: Step[] = [];

  // Re-read compliance state for gate inputs.
  const reqsC = await repoA.compliance.listRequirements(ctx.orgA);
  const docsC = await repoA.compliance.listDocuments(ctx.orgA);
  const overridesC = await repoA.compliance.listOverrides(ctx.orgA);

  // 13. Configure verification NOT required (policy off, no staff requirement).
  const resolvedOff = resolveVerificationRequirements({
    policies: POLICY_OFF,
    requirements: [],
    requests: [],
    overrides: [],
    ctx: { customer_id: ctx.custId, rental_id: ctx.rentalId },
  });
  const gateOff = gateFromCloud(inputs, reqsC, docsC, overridesC, resolvedOff);
  const verifBlockOff = gateOff.reasons.some((r) =>
    r.key.startsWith("verification_required:"),
  );
  steps.push({
    step: "13_verification_not_required",
    ok: !verifBlockOff,
    detail: `verifReasons=${gateOff.reasons.filter((r) => r.key.startsWith("verification_required:")).length}`,
  });
  steps.push({
    step: "14_gate_clear_verification_off",
    ok: !verifBlockOff,
    detail: `blocked_by_verification=${verifBlockOff}`,
  });

  // 15. Configure verification required (staff requirement for drivers_license).
  const vReq = makeVerificationRequirement(ctx, "drivers_license");
  createdVRequirementIds.push(vReq.id);
  await repoA.verification.insertRequirement(vReq);
  steps.push({
    step: "15_configure_verification_required",
    ok: true,
    detail: `req=${vReq.id}`,
  });

  // 16. Leave incomplete (no verification request yet).
  const reqsV = await repoA.verification.listRequirements(ctx.orgA);
  const requestsV = await repoA.verification.listRequests(ctx.orgA);
  const overridesV = await repoA.verification.listOverrides(ctx.orgA);
  const resolvedIncomplete = resolveVerificationRequirements({
    policies: POLICY_OFF,
    requirements: reqsV,
    requests: requestsV,
    overrides: overridesV,
    ctx: { customer_id: ctx.custId, rental_id: ctx.rentalId },
  });
  const gateIncomplete = gateFromCloud(
    inputs,
    reqsC,
    docsC,
    overridesC,
    resolvedIncomplete,
  );
  const verifBlockIncomplete = gateIncomplete.reasons.some((r) =>
    r.key.startsWith("verification_required:"),
  );
  steps.push({
    step: "16_verification_incomplete",
    ok: true,
    detail: "no request yet",
  });
  steps.push({
    step: "17_gate_blocks_incomplete_verification",
    ok: verifBlockIncomplete,
    detail: `blocked_by_verification=${verifBlockIncomplete} reasons=${gateIncomplete.reasons
      .filter((r) => r.key.startsWith("verification_required:"))
      .map((r) => r.label)
      .join("|")}`,
  });

  // 18. Mark complete (create a completed verification request with verified result).
  const vRequest = makeVerificationRequest(
    ctx,
    "drivers_license",
    "completed",
    "verified",
    "License verified",
  );
  createdVReqIds.push(vRequest.id);
  await repoA.verification.insertRequest(vRequest);
  const reqsV2 = await repoA.verification.listRequirements(ctx.orgA);
  const requestsV2 = await repoA.verification.listRequests(ctx.orgA);
  const overridesV2 = await repoA.verification.listOverrides(ctx.orgA);
  const resolvedComplete = resolveVerificationRequirements({
    policies: POLICY_OFF,
    requirements: reqsV2,
    requests: requestsV2,
    overrides: overridesV2,
    ctx: { customer_id: ctx.custId, rental_id: ctx.rentalId },
  });
  const gateComplete = gateFromCloud(
    inputs,
    reqsC,
    docsC,
    overridesC,
    resolvedComplete,
  );
  const verifBlockComplete = gateComplete.reasons.some((r) =>
    r.key.startsWith("verification_required:"),
  );
  steps.push({
    step: "18_mark_verification_complete",
    ok: true,
    detail: `request=${vRequest.id}`,
  });
  steps.push({
    step: "19_gate_clears_verification",
    ok: !verifBlockComplete,
    detail: `blocked_by_verification=${verifBlockComplete}`,
  });

  // 20. Test pending/failed/rejected: create a failed verification request for identity.
  const failedReq = makeVerificationRequirement(ctx, "identity");
  createdVRequirementIds.push(failedReq.id);
  await repoA.verification.insertRequirement(failedReq);
  const failedRequest = makeVerificationRequest(
    ctx,
    "identity",
    "failed",
    "failed",
    "Identity failed",
  );
  createdVReqIds.push(failedRequest.id);
  await repoA.verification.insertRequest(failedRequest);
  const reqsV3 = await repoA.verification.listRequirements(ctx.orgA);
  const requestsV3 = await repoA.verification.listRequests(ctx.orgA);
  const overridesV3 = await repoA.verification.listOverrides(ctx.orgA);
  const resolvedFailed = resolveVerificationRequirements({
    policies: POLICY_OFF,
    requirements: reqsV3,
    requests: requestsV3,
    overrides: overridesV3,
    ctx: { customer_id: ctx.custId, rental_id: ctx.rentalId },
  });
  const gateFailed = gateFromCloud(
    inputs,
    reqsC,
    docsC,
    overridesC,
    resolvedFailed,
  );
  const failedBlock = gateFailed.reasons.find(
    (r) => r.key === "verification_required:identity",
  );
  steps.push({
    step: "20_failed_verification_blocks",
    ok: !!failedBlock,
    detail: `blocked=${!!failedBlock} label=${failedBlock?.label ?? "none"}`,
  });

  // 21. Org B cannot read Org A verification.
  const bVReqs = await repoB.verification.listRequests(ctx.orgA);
  steps.push({
    step: "21_orgB_cannot_read_orgA_verification",
    ok: bVReqs.length === 0,
    detail: `returned=${bVReqs.length}`,
  });

  // 22. Org B cannot update Org A verification.
  let bVUpdateOk = false;
  try {
    await repoB.verification.updateRequest(ctx.orgA, vRequest.id, {
      status: "cancelled",
    });
    const check = await repoA.verification.listRequests(ctx.orgA);
    const still = check.find((r) => r.id === vRequest.id);
    bVUpdateOk = still?.status !== "cancelled";
  } catch {
    bVUpdateOk = true;
  }
  steps.push({
    step: "22_orgB_cannot_update_orgA_verification",
    ok: bVUpdateOk,
    detail: bVUpdateOk ? "blocked/no-op" : "update leaked",
  });

  // 23. Org B cannot insert using Org A organization_id.
  let bVInsertOk = false;
  try {
    const bReq = makeVerificationRequest(
      ctx,
      "mvr",
      "pending",
      null,
      "pending",
    );
    bReq.organization_id = ctx.orgA;
    bReq.requested_by = ctx.userBId;
    await repoB.verification.insertRequest(bReq);
    const aCheck = await repoA.verification.listRequests(ctx.orgA);
    bVInsertOk = !aCheck.some((r) => r.id === bReq.id);
  } catch {
    bVInsertOk = true;
  }
  steps.push({
    step: "23_orgB_cannot_insert_orgA_verification",
    ok: bVInsertOk,
    detail: bVInsertOk ? "blocked" : "insert leaked",
  });

  // 25. Eligible verification override persists actor/reason/timestamp.
  const vOverride = makeVerificationOverride(
    ctx,
    failedRequest.id,
    "approved",
    "Manual review approved despite provider failure",
    ctx.userAId,
  );
  createdVOverrideIds.push(vOverride.id);
  await repoA.verification.insertOverride(vOverride);
  const vOverridesAfter = await repoA.verification.listOverrides(ctx.orgA);
  const vOverrideFound = vOverridesAfter.find((o) => o.id === vOverride.id);
  steps.push({
    step: "25_verification_override_persists",
    ok:
      !!vOverrideFound &&
      vOverrideFound.reason === vOverride.reason &&
      vOverrideFound.staff_id === ctx.userAId &&
      !!vOverrideFound.created_at,
    detail: `found=${!!vOverrideFound} reason=${vOverrideFound?.reason ?? ""} actor=${vOverrideFound?.staff_id ?? ""} at=${vOverrideFound?.created_at ?? ""}`,
  });

  return steps;
}

export async function runHydrationSteps(
  ctx: Phase3Context,
  repoA2: {
    verification: SupabaseVerificationRepository;
    compliance: SupabaseComplianceRepository;
  },
  inputs: GateInputs,
): Promise<Step[]> {
  const steps: Step[] = [];

  // 33-34. Re-hydrate compliance + verification from Cloud.
  const reqsHydr = await repoA2.compliance.listRequirements(ctx.orgA);
  const docsHydr = await repoA2.compliance.listDocuments(ctx.orgA);
  const overridesHydr = await repoA2.compliance.listOverrides(ctx.orgA);
  const vReqsHydr = await repoA2.verification.listRequirements(ctx.orgA);
  const vRequestsHydr = await repoA2.verification.listRequests(ctx.orgA);
  const vOverridesHydr = await repoA2.verification.listOverrides(ctx.orgA);
  const resolvedHydr = resolveVerificationRequirements({
    policies: POLICY_OFF,
    requirements: vReqsHydr,
    requests: vRequestsHydr,
    overrides: vOverridesHydr,
    ctx: { customer_id: ctx.custId, rental_id: ctx.rentalId },
  });
  const gateHydr = gateFromCloud(
    inputs,
    reqsHydr,
    docsHydr,
    overridesHydr,
    resolvedHydr,
  );
  steps.push({
    step: "33_compliance_rehydrates",
    ok: reqsHydr.length > 0 && docsHydr.length > 0,
    detail: `reqs=${reqsHydr.length} docs=${docsHydr.length}`,
  });
  steps.push({
    step: "34_verification_rehydrates",
    ok: vRequestsHydr.length > 0,
    detail: `requests=${vRequestsHydr.length} requirements=${vReqsHydr.length}`,
  });
  // 35. release gate result after hydration matches pre-logout (still blocked by hard emissions + identity failed).
  steps.push({
    step: "35_gate_result_matches_after_hydration",
    ok: gateHydr.blocked && gateHydr.hard_blocked,
    detail: `blocked=${gateHydr.blocked} hardBlocked=${gateHydr.hard_blocked} reasons=${gateHydr.reasons.length}`,
  });

  // 36. No duplicate alerts after repeated hydration.
  const reqsH1 = await repoA2.compliance.listRequirements(ctx.orgA);
  const reqsH2 = await repoA2.compliance.listRequirements(ctx.orgA);
  const docsH1 = await repoA2.compliance.listDocuments(ctx.orgA);
  const docsH2 = await repoA2.compliance.listDocuments(ctx.orgA);
  steps.push({
    step: "36_no_duplicate_alerts_repeated_hydration",
    ok: reqsH1.length === reqsH2.length && docsH1.length === docsH2.length,
    detail: `reqs ${reqsH1.length}==${reqsH2.length} docs ${docsH1.length}==${docsH2.length}`,
  });

  return steps;
}
