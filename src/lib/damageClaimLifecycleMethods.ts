// Connect Pro Fleet — damage claim lifecycle methods (Build #17).
// Create, update, status/responsibility, assign, close, cancel, reopen,
// evidence, insurance, work-order/expense linking, notes. Non-hook functions
// taking the helpers + state setters. Split from the financial methods.

import type {
  DamageClaim,
  DamageClaimStatus,
  DamageEvidence,
  DamageInsuranceClaim,
  DamageSource,
  DamageSeverity,
  EvidenceType,
  ResponsibilityStatus,
  ResponsiblePartyType,
} from "./damageClaimTypes";
import { isClaimActive, nextDamageClaimNumber } from "./damageClaimSelectors";
import { TENANT_ID, uid, type ClaimHelpers } from "./damageClaimHelpers";

export function makeLifecycleMethods(
  h: ClaimHelpers,
  claims: DamageClaim[],
  setClaims: React.Dispatch<React.SetStateAction<DamageClaim[]>>,
  setEvidence: React.Dispatch<React.SetStateAction<DamageEvidence[]>>,
  setInsurance: React.Dispatch<React.SetStateAction<DamageInsuranceClaim[]>>,
) {
  return {
    createClaim: (input: {
      vehicle_id: string;
      rental_id?: string | null;
      reservation_id?: string | null;
      customer_id?: string | null;
      inspection_id?: string | null;
      incident_id?: string | null;
      damage_source: DamageSource;
      description: string;
      severity: DamageSeverity;
      blocks_vehicle_use?: boolean;
      pre_existing?: boolean | "undetermined";
      estimated_repair_cost?: number | null;
      discovered_at?: string | null;
      damage_date?: string | null;
      location_id?: string | null;
      assigned_user_id?: string | null;
      external_reference?: string | null;
    }): string => {
      const now = new Date().toISOString();
      const id = uid("dmg");
      const claim: DamageClaim = {
        id,
        tenant_id: TENANT_ID,
        claim_number: nextDamageClaimNumber(claims),
        vehicle_id: input.vehicle_id,
        rental_id: input.rental_id ?? null,
        reservation_id: input.reservation_id ?? null,
        customer_id: input.customer_id ?? null,
        inspection_id: input.inspection_id ?? null,
        incident_id: input.incident_id ?? null,
        claim_status: "open",
        damage_source: input.damage_source,
        discovered_at: input.discovered_at ?? now,
        discovered_by_user_id: h.store.currentStaffId,
        damage_date: input.damage_date ?? null,
        location_id: input.location_id ?? null,
        responsibility_status: "undetermined",
        responsible_party_type: null,
        customer_responsibility_percent: null,
        description: input.description,
        severity: input.severity,
        blocks_vehicle_use: input.blocks_vehicle_use ?? false,
        pre_existing: input.pre_existing ?? "undetermined",
        estimated_repair_cost: input.estimated_repair_cost ?? null,
        approved_repair_cost: null,
        customer_charge_transaction_id: null,
        maintenance_work_order_id: null,
        insurance_claim_id: null,
        external_reference: input.external_reference ?? null,
        assigned_user_id: input.assigned_user_id ?? null,
        closed_at: null,
        closed_by_user_id: null,
        closure_reason: null,
        created_at: now,
        updated_at: now,
        metadata: null,
      };
      setClaims((cs) => [claim, ...cs]);
      h.logEvent(id, "created", `Damage claim created — ${claim.claim_number}`);
      h.logAct(
        `Damage claim created — ${claim.claim_number} · ${h.vehicleLabel(input.vehicle_id)}`,
      );
      if (claim.blocks_vehicle_use) {
        h.setVehicleStatus(input.vehicle_id, "out_of_service");
        h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
      }
      if (input.assigned_user_id)
        h.logEvent(
          id,
          "status_changed",
          `Assigned to ${h.staffName(input.assigned_user_id)}`,
        );
      if (input.inspection_id)
        h.store.resolveSystemTasksForEntity(
          "inspection.damage_review",
          "inspection",
          input.inspection_id,
          `Damage claim created — ${claim.claim_number}`,
        );
      return id;
    },

    updateClaim: (
      id: string,
      patch: Partial<
        Pick<
          DamageClaim,
          | "description"
          | "severity"
          | "blocks_vehicle_use"
          | "pre_existing"
          | "estimated_repair_cost"
          | "approved_repair_cost"
          | "location_id"
          | "external_reference"
          | "damage_date"
        >
      >,
    ) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim) return;
      const blockingChanged =
        patch.blocks_vehicle_use !== undefined &&
        patch.blocks_vehicle_use !== claim.blocks_vehicle_use;
      h.patchClaim(id, patch);
      if (patch.estimated_repair_cost !== undefined)
        h.logEvent(id, "estimate_updated", "Estimate updated", {
          newValue:
            patch.estimated_repair_cost != null
              ? h.fmtMoney(patch.estimated_repair_cost)
              : "—",
        });
      if (blockingChanged) {
        if (patch.blocks_vehicle_use && isClaimActive(claim)) {
          h.setVehicleStatus(claim.vehicle_id, "out_of_service");
          h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
        } else if (
          !patch.blocks_vehicle_use &&
          h.maybeRestoreVehicle(claim.vehicle_id, id)
        )
          h.logEvent(id, "vehicle_released", "Vehicle returned to service");
      }
    },

    setClaimStatus: (id: string, status: DamageClaimStatus) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim || claim.claim_status === status) return;
      h.patchClaim(id, { claim_status: status });
      h.logEvent(id, "status_changed", `Status changed to ${status}`, {
        oldValue: claim.claim_status,
        newValue: status,
      });
    },

    setResponsibility: (
      id: string,
      input: {
        responsibility_status: ResponsibilityStatus;
        responsible_party_type?: ResponsiblePartyType | null;
        customer_responsibility_percent?: number | null;
      },
    ) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim) return;
      const pct = input.customer_responsibility_percent;
      if (pct != null && (pct < 0 || pct > 100)) return;
      h.patchClaim(id, {
        responsibility_status: input.responsibility_status,
        responsible_party_type: input.responsible_party_type ?? null,
        customer_responsibility_percent: pct ?? null,
      });
      h.logEvent(
        id,
        "responsibility_changed",
        `Responsibility set — ${input.responsibility_status}`,
        {
          oldValue: claim.responsibility_status,
          newValue: input.responsibility_status,
        },
      );
    },

    assignClaim: (id: string, userId: string | null) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim) return;
      const oldA = claim.assigned_user_id
        ? h.staffName(claim.assigned_user_id)
        : "Unassigned";
      const newA = userId ? h.staffName(userId) : "Unassigned";
      h.patchClaim(id, { assigned_user_id: userId });
      h.logEvent(id, "status_changed", `Assigned from ${oldA} to ${newA}`, {
        oldValue: oldA,
        newValue: newA,
      });
      if (userId && userId !== h.store.currentStaffId)
        h.store.notify({
          recipientUserId: userId,
          type: "task.assigned",
          title: `Damage claim assigned: ${claim.claim_number}`,
          message: `${h.staffName(h.store.currentStaffId)} assigned you a damage claim for ${h.vehicleLabel(claim.vehicle_id)}.`,
          entityType: "damage_claim",
          entityId: id,
          entityLabel: `${claim.claim_number} · ${h.vehicleLabel(claim.vehicle_id)}`,
          actionUrl: `/damage-claims?claim=${id}`,
          sourceEventId: id,
          occurrence: "1",
          actorUserId: h.store.currentStaffId,
          metadata: { damage_claim_id: id },
        });
    },

    closeClaim: (id: string, reason?: string) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim || !isClaimActive(claim)) return;
      const now = new Date().toISOString();
      h.patchClaim(id, {
        claim_status: "closed",
        closed_at: now,
        closed_by_user_id: h.store.currentStaffId,
        closure_reason: reason ?? null,
      });
      h.logEvent(id, "closed", `Claim closed${reason ? ` — ${reason}` : ""}`);
      h.logAct(`Damage claim closed — ${claim.claim_number}`, "available");
      if (
        claim.blocks_vehicle_use &&
        h.maybeRestoreVehicle(claim.vehicle_id, id)
      )
        h.logEvent(id, "vehicle_released", "Vehicle returned to service");
    },

    cancelClaim: (id: string, reason: string) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim || !isClaimActive(claim)) return;
      if (claim.customer_charge_transaction_id) {
        h.logEvent(
          id,
          "cancelled",
          `Cancellation blocked — claim has a posted customer charge. Reverse the charge first if appropriate.`,
          { note: reason },
        );
        return;
      }
      const now = new Date().toISOString();
      h.patchClaim(id, {
        claim_status: "cancelled",
        closed_at: now,
        closed_by_user_id: h.store.currentStaffId,
        closure_reason: reason,
      });
      h.logEvent(id, "cancelled", `Claim cancelled — ${reason}`, {
        newValue: reason,
      });
      h.logAct(`Damage claim cancelled — ${claim.claim_number}`, "neutral");
      if (
        claim.blocks_vehicle_use &&
        h.maybeRestoreVehicle(claim.vehicle_id, id)
      )
        h.logEvent(id, "vehicle_released", "Vehicle returned to service");
    },

    reopenClaim: (id: string) => {
      const claim = claims.find((c) => c.id === id);
      if (!claim || claim.claim_status !== "closed") return;
      h.patchClaim(id, {
        claim_status: "open",
        closed_at: null,
        closed_by_user_id: null,
        closure_reason: null,
      });
      h.logEvent(id, "reopened", "Claim reopened");
      if (claim.blocks_vehicle_use) {
        h.setVehicleStatus(claim.vehicle_id, "out_of_service");
        h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
      }
    },

    addEvidence: (input: {
      claim_id: string;
      evidence_type: EvidenceType;
      file_url: string;
      inspection_photo_id?: string | null;
      description?: string | null;
      captured_at?: string | null;
    }): string => {
      const claim = claims.find((c) => c.id === input.claim_id);
      if (!claim) return "";
      const now = new Date().toISOString();
      const id = uid("dev");
      setEvidence((es) => [
        {
          id,
          tenant_id: TENANT_ID,
          damage_claim_id: input.claim_id,
          evidence_type: input.evidence_type,
          file_url: input.file_url,
          inspection_photo_id: input.inspection_photo_id ?? null,
          description: input.description ?? null,
          captured_at: input.captured_at ?? null,
          uploaded_by_user_id: h.store.currentStaffId,
          created_at: now,
          voided_at: null,
        },
        ...es,
      ]);
      h.logEvent(
        input.claim_id,
        "evidence_added",
        `Evidence added — ${input.evidence_type}`,
      );
      return id;
    },

    voidEvidence: (
      evidenceId: string,
      evidence: DamageEvidence[],
      setEvidence: React.Dispatch<React.SetStateAction<DamageEvidence[]>>,
    ) => {
      const ev = evidence.find((e) => e.id === evidenceId);
      if (!ev || ev.voided_at) return;
      setEvidence((es) =>
        es.map((e) =>
          e.id === evidenceId
            ? { ...e, voided_at: new Date().toISOString() }
            : e,
        ),
      );
      h.logEvent(
        ev.damage_claim_id,
        "evidence_voided",
        `Evidence voided — ${ev.evidence_type}`,
      );
    },

    fileInsurance: (
      claimId: string,
      input: {
        insurer_name?: string | null;
        policy_reference?: string | null;
        claim_reference?: string | null;
        deductible_amount?: number | null;
        claimed_amount?: number | null;
        filed_at?: string | null;
        notes?: string | null;
      },
    ): string => {
      const claim = claims.find((c) => c.id === claimId);
      if (!claim) return "";
      const now = new Date().toISOString();
      const id = uid("dic");
      setInsurance((is) => [
        {
          id,
          tenant_id: TENANT_ID,
          damage_claim_id: claimId,
          insurer_name: input.insurer_name ?? null,
          policy_reference: input.policy_reference ?? null,
          claim_reference: input.claim_reference ?? null,
          claim_status: "filed",
          deductible_amount: input.deductible_amount ?? null,
          claimed_amount: input.claimed_amount ?? null,
          approved_amount: null,
          paid_amount: null,
          filed_at: input.filed_at ?? now,
          approved_at: null,
          paid_at: null,
          adjuster_name: null,
          adjuster_contact: null,
          notes: input.notes ?? null,
          created_at: now,
          updated_at: now,
        },
        ...is,
      ]);
      h.patchClaim(claimId, {
        insurance_claim_id: id,
        claim_status: "insurance_pending",
      });
      h.logEvent(claimId, "insurance_filed", "Insurance claim filed");
      h.logAct(`Insurance claim filed — ${claim.claim_number}`, "maintenance");
      return id;
    },

    updateInsurance: (
      insuranceId: string,
      patch: Partial<
        Pick<
          DamageInsuranceClaim,
          | "claim_status"
          | "deductible_amount"
          | "claimed_amount"
          | "approved_amount"
          | "paid_amount"
          | "approved_at"
          | "paid_at"
          | "adjuster_name"
          | "adjuster_contact"
          | "notes"
        >
      >,
      setInsurance: React.Dispatch<
        React.SetStateAction<DamageInsuranceClaim[]>
      >,
    ) => {
      setInsurance((is) =>
        is.map((i) =>
          i.id === insuranceId
            ? { ...i, ...patch, updated_at: new Date().toISOString() }
            : i,
        ),
      );
    },

    linkWorkOrder: (claimId: string, workOrderId: string) => {
      const claim = claims.find((c) => c.id === claimId);
      if (!claim) return;
      h.patchClaim(claimId, {
        maintenance_work_order_id: workOrderId,
        claim_status: "repair_in_progress",
      });
      h.logEvent(
        claimId,
        "work_order_linked",
        `Work order linked — ${workOrderId}`,
      );
    },

    linkExpense: (claimId: string, expenseId: string) => {
      const claim = claims.find((c) => c.id === claimId);
      if (!claim) return;
      h.store.tagExpenseMetadata(expenseId, { damage_claim_id: claimId });
      h.logEvent(claimId, "expense_linked", `Expense linked — ${expenseId}`);
    },

    addClaimNote: (claimId: string, text: string) => {
      h.logEvent(claimId, "note_added", `Note added — ${text}`);
    },
  };
}
