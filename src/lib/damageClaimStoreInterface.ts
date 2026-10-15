// Connect Pro Fleet — DamageClaimStore interface (Build #17).
// Extracted to keep the provider implementation under the line limit.

import type {
  DamageClaim,
  DamageClaimEvent,
  DamageClaimStatus,
  DamageEvidence,
  DamageInsuranceClaim,
  DamageRecovery,
  DamageSource,
  DamageSeverity,
  EvidenceType,
  RecoveryType,
  ResponsibilityStatus,
  ResponsiblePartyType,
} from "./damageClaimTypes";

export interface DamageClaimStore {
  // state
  damageClaims: DamageClaim[];
  damageEvidence: DamageEvidence[];
  damageInsuranceClaims: DamageInsuranceClaim[];
  damageRecoveries: DamageRecovery[];
  damageClaimEvents: DamageClaimEvent[];

  // selectors
  claimById: (id: string) => DamageClaim | undefined;
  claimEvents: (claimId: string) => DamageClaimEvent[];
  claimEvidence: (claimId: string) => DamageEvidence[];
  allClaimEvidence: (claimId: string) => DamageEvidence[];
  claimInsurance: (claimId: string) => DamageInsuranceClaim | null;
  claimRecoveries: (claimId: string) => DamageRecovery[];
  vehicleClaims: (vehicleId: string) => DamageClaim[];

  // lifecycle
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
  }) => string;
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
  ) => void;
  setClaimStatus: (id: string, status: DamageClaimStatus) => void;
  setResponsibility: (
    id: string,
    input: {
      responsibility_status: ResponsibilityStatus;
      responsible_party_type?: ResponsiblePartyType | null;
      customer_responsibility_percent?: number | null;
    },
  ) => void;
  assignClaim: (id: string, userId: string | null) => void;
  closeClaim: (id: string, reason?: string) => void;
  cancelClaim: (id: string, reason: string) => void;
  reopenClaim: (id: string) => void;

  // evidence
  addEvidence: (input: {
    claim_id: string;
    evidence_type: EvidenceType;
    file_url: string;
    inspection_photo_id?: string | null;
    description?: string | null;
    captured_at?: string | null;
  }) => string;
  voidEvidence: (evidenceId: string) => void;

  // financial
  chargeCustomer: (
    claimId: string,
    input: { amount: number; description?: string; notes?: string },
    requestKey: string,
  ) => { ok: boolean; error?: string; transactionId?: string };
  reverseCustomerCharge: (claimId: string, reason: string) => void;
  applyDeposit: (
    claimId: string,
    input: { amount: number; notes?: string },
    requestKey: string,
  ) => { ok: boolean; error?: string };
  recordRecovery: (
    claimId: string,
    input: {
      recovery_type: RecoveryType;
      amount: number;
      date: string;
      source_reference?: string | null;
      insurance_claim_id?: string | null;
      notes?: string | null;
    },
    requestKey: string,
  ) => { ok: boolean; error?: string; recoveryId?: string };
  reverseRecovery: (recoveryId: string, reason: string) => void;

  // insurance
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
  ) => string;
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
  ) => void;

  // linking
  linkWorkOrder: (claimId: string, workOrderId: string) => void;
  linkExpense: (claimId: string, expenseId: string) => void;
  addClaimNote: (claimId: string, text: string) => void;
}
