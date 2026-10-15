// Connect Pro Fleet — Violation store interface (Build #25).

import type {
  Violation,
  ViolationEvidence,
  ViolationEvent,
  ViolationType,
  ViolationStatus,
  ViolationResponsibility,
  ResponsibilityReason,
  DisputeStatus,
  ViolationSource,
} from "./violationTypes";
import type { TenderMethod, PaymentProcessor } from "./paymentMethodTypes";
import type { PossessionResult } from "./violationPossession";

export interface CreateViolationInput {
  violation_type: ViolationType;
  vehicle_id: string;
  occurred_at: string;
  issuing_authority?: string | null;
  citation_number?: string | null;
  due_at?: string | null;
  base_amount: number;
  penalties_amount?: number;
  admin_fee_amount?: number;
  plate_number_snapshot?: string | null;
  state_jurisdiction?: string | null;
  location_description?: string | null;
  description?: string | null;
  received_at?: string | null;
  source?: ViolationSource;
  notes?: string | null;
  /** Explicit rental/customer override (skips resolver). */
  rental_id?: string | null;
  customer_id?: string | null;
  assigned_staff_id?: string | null;
  /** V1 Tolls & Violations Automation — inbound provider provenance. */
  provider?: string | null;
  external_event_id?: string | null;
  matching_confidence?: import("./violationTypes").MatchingConfidence | null;
}

/** Result of idempotent inbound provider ingestion. */
export interface IngestProviderEventResult {
  /** Existing violation id when this was a duplicate (no new record). */
  duplicate_of: string | null;
  /** New violation id when ingested. */
  violation_id: string | null;
  /** Possession-match confidence. */
  confidence: import("./violationTypes").MatchingConfidence;
  /** Whether a new Customer Charge was auto-created (only when policy allows
   *  auto_assign_exact AND confidence === matched). False otherwise. */
  auto_charged: boolean;
  /** Issues requiring staff review. */
  issues: string[];
}

export interface ChargeCustomerInput {
  /** Override the computed charge amount (e.g. shared responsibility portion). */
  amount?: number;
  description?: string;
  notes?: string;
}

export interface RecordCompanyPaymentInput {
  amount: number;
  transaction_date: string;
  payment_method: TenderMethod;
  processor?: PaymentProcessor | null;
  vendor_id?: string | null;
  location_id?: string | null;
  memo?: string | null;
}

export interface DisputeInput {
  reason: string;
  status?: DisputeStatus;
  decision_note?: string | null;
}

export interface ViolationStore {
  violations: Violation[];
  violationEvidence: ViolationEvidence[];
  violationEvents: ViolationEvent[];

  // queries
  violationById: (id: string) => Violation | undefined;
  violationsForVehicle: (vehicleId: string) => Violation[];
  violationsForCustomer: (customerId: string) => Violation[];
  violationsForRental: (rentalId: string) => Violation[];
  evidenceFor: (violationId: string) => ViolationEvidence[];
  eventsFor: (violationId: string) => ViolationEvent[];

  // possession
  resolvePossession: (
    vehicleId: string,
    occurredAt: string,
  ) => PossessionResult;

  // mutations
  createViolation: (input: CreateViolationInput) => string;
  updateViolation: (id: string, patch: Partial<Violation>) => void;
  assignResponsibility: (
    id: string,
    responsibility: ViolationResponsibility,
    reason: ResponsibilityReason | null,
    notes?: string | null,
  ) => void;
  assignStaff: (id: string, staffId: string | null) => void;
  setStatus: (id: string, status: ViolationStatus) => void;

  // financial
  chargeCustomer: (
    id: string,
    input: ChargeCustomerInput,
    requestKey: string,
  ) => { ok: boolean; error?: string; transactionId?: string };
  reverseCustomerCharge: (id: string, reason: string) => void;
  recordCompanyPayment: (
    id: string,
    input: RecordCompanyPaymentInput,
    requestKey: string,
  ) => { ok: boolean; error?: string; expenseId?: string };
  linkExistingExpense: (id: string, expenseId: string) => void;

  // dispute
  openDispute: (id: string, input: DisputeInput) => void;
  resolveDispute: (
    id: string,
    status: DisputeStatus,
    decisionNote?: string | null,
    reducedAmount?: number | null,
  ) => void;

  // resolve/close
  resolveViolation: (id: string) => void;
  cancelViolation: (id: string, reason?: string | null) => void;

  // evidence
  addEvidence: (
    id: string,
    input: {
      type: ViolationEvidence["type"];
      file_ref?: string | null;
      source?: string | null;
      description?: string | null;
    },
  ) => void;

  // notes
  addNote: (id: string, text: string) => void;

  // duplicate detection (import + manual)
  findDuplicate: (
    authority: string | null,
    citationNumber: string | null,
  ) => Violation | undefined;

  // V1 Tolls & Violations Automation — idempotent inbound provider ingestion.
  ingestProviderEvent: (
    event: import("./violationAdapters").ViolationProviderEvent,
  ) => IngestProviderEventResult;
}
