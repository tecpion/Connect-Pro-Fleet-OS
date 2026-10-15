// Connect Pro Fleet — Investor V1 agreement mutation helpers.
//
// Pure-ish functions that operate on agreement state. Extracted from the
// store provider to keep each file focused. These do NOT duplicate investor
// or compensation state — they compose onto the existing pairing.

import { TENANT_ID } from "./store/ids";
import type { CompensationArrangement } from "./ownershipTypes";
import type { VehicleOwnershipType } from "./ownershipTypes";
import type {
  AgreementExpenseRule,
  AgreementStatus,
  PartnerPaymentPreference,
  PartnershipAgreement,
  PartnerTimelineEventType,
  SettlementFrequency,
} from "./investorWorkspaceTypes";
import {
  basisFromComp,
  detectAgreementOverlap,
  settlementFrequencyFromComp,
} from "./investorWorkspaceSelectors";
import { makeTimelineEvent } from "./investorWorkspaceSelectors";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export interface AgreementMutationDeps {
  agreements: PartnershipAgreement[];
  staffId: string | null;
  logTimeline: (event: {
    investor_id: string;
    event_type: PartnerTimelineEventType;
    detail?: string | null;
    vehicle_id?: string | null;
    agreement_id?: string | null;
  }) => void;
}

export function buildCreateAgreement(deps: AgreementMutationDeps) {
  return (input: {
    investor_id: string;
    vehicle_id: string;
    pairing_id: string;
    ownership_type: VehicleOwnershipType;
    compensation: CompensationArrangement;
    company_share_pct: number;
    partner_share_pct: number;
    expense_rules: AgreementExpenseRule[];
    settlement_frequency?: SettlementFrequency;
    payment_preference?: PartnerPaymentPreference | null;
    effective_start: string;
    notes?: string | null;
  }): { agreement: PartnershipAgreement; errors: string[] } => {
    const errors: string[] = [];
    if (input.company_share_pct + input.partner_share_pct !== 100) {
      errors.push("Company and partner shares must total 100%.");
    }
    const overlap = detectAgreementOverlap(input.vehicle_id, deps.agreements);
    if (overlap) {
      errors.push(
        "This vehicle already has an active agreement. End the existing agreement or transfer ownership first.",
      );
    }
    if (errors.length > 0) return { agreement: null as never, errors };

    const version = 1;
    const agreement: PartnershipAgreement = {
      id: uid("agr"),
      tenant_id: TENANT_ID,
      investor_id: input.investor_id,
      vehicle_id: input.vehicle_id,
      pairing_id: input.pairing_id,
      version,
      ownership_type: input.ownership_type,
      compensation: input.compensation,
      basis: basisFromComp(input.compensation),
      company_share_pct: input.company_share_pct,
      partner_share_pct: input.partner_share_pct,
      expense_rules: input.expense_rules,
      settlement_frequency:
        input.settlement_frequency ??
        settlementFrequencyFromComp(input.compensation),
      payment_preference: input.payment_preference ?? null,
      effective_start: input.effective_start,
      effective_end: null,
      status: "active",
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      created_by: deps.staffId,
      superseded_by: null,
    };
    deps.logTimeline({
      investor_id: input.investor_id,
      event_type: "agreement_started",
      detail: `Agreement v${version} — ${input.company_share_pct}%/${input.partner_share_pct}%`,
      vehicle_id: input.vehicle_id,
      agreement_id: agreement.id,
    });
    return { agreement, errors };
  };
}

export function buildChangeAgreementTerms(deps: AgreementMutationDeps) {
  return (
    agreementId: string,
    input: {
      compensation: CompensationArrangement;
      company_share_pct: number;
      partner_share_pct: number;
      expense_rules: AgreementExpenseRule[];
      effective_start: string;
      notes?: string | null;
    },
  ): { agreement: PartnershipAgreement; errors: string[] } => {
    const errors: string[] = [];
    const old = deps.agreements.find((a) => a.id === agreementId);
    if (!old)
      return { agreement: null as never, errors: ["Agreement not found."] };
    if (input.company_share_pct + input.partner_share_pct !== 100) {
      errors.push("Company and partner shares must total 100%.");
    }
    if (errors.length > 0) return { agreement: null as never, errors };

    const newVersion = old.version + 1;
    const newAgreement: PartnershipAgreement = {
      id: uid("agr"),
      tenant_id: TENANT_ID,
      investor_id: old.investor_id,
      vehicle_id: old.vehicle_id,
      pairing_id: old.pairing_id,
      version: newVersion,
      ownership_type: old.ownership_type,
      compensation: input.compensation,
      basis: basisFromComp(input.compensation),
      company_share_pct: input.company_share_pct,
      partner_share_pct: input.partner_share_pct,
      expense_rules: input.expense_rules,
      settlement_frequency: old.settlement_frequency,
      payment_preference: old.payment_preference,
      effective_start: input.effective_start,
      effective_end: null,
      status: "active",
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
      created_by: deps.staffId,
      superseded_by: null,
    };

    deps.logTimeline({
      investor_id: old.investor_id,
      event_type: "agreement_terms_changed",
      detail: `Terms changed — v${old.version} → v${newVersion} (${input.company_share_pct}%/${input.partner_share_pct}%)`,
      vehicle_id: old.vehicle_id,
      agreement_id: newAgreement.id,
    });
    return { agreement: newAgreement, errors };
  };
}

/** The patch to apply to the old agreement when superseded. */
export function supersedeOldAgreement(
  oldId: string,
  effectiveEnd: string,
  newId: string,
): (a: PartnershipAgreement) => PartnershipAgreement {
  return (a) =>
    a.id === oldId
      ? {
          ...a,
          status: "superseded" as AgreementStatus,
          effective_end: effectiveEnd,
          superseded_by: newId,
        }
      : a;
}

export function buildEndAgreement(deps: AgreementMutationDeps) {
  return (
    agreementId: string,
    effectiveEnd: string,
  ): {
    patch: (a: PartnershipAgreement) => PartnershipAgreement;
    investorId: string;
    vehicleId: string;
    version: number;
  } | null => {
    const agreement = deps.agreements.find((a) => a.id === agreementId);
    if (!agreement) return null;
    deps.logTimeline({
      investor_id: agreement.investor_id,
      event_type: "agreement_ended",
      detail: `Agreement v${agreement.version} ended`,
      vehicle_id: agreement.vehicle_id,
      agreement_id: agreementId,
    });
    return {
      patch: (a) =>
        a.id === agreementId
          ? {
              ...a,
              status: "ended" as AgreementStatus,
              effective_end: effectiveEnd,
            }
          : a,
      investorId: agreement.investor_id,
      vehicleId: agreement.vehicle_id,
      version: agreement.version,
    };
  };
}
