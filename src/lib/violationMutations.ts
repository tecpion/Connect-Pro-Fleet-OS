// Connect Pro Fleet — violation mutations (Build #25).
//
// createViolation / chargeCustomer / recordCompanyPayment. Money-moving
// methods read the authoritative in-progress state via the violations ref +
// synchronous idempotency registries so rapid synchronous calls (double-click,
// batched act()) are safe and idempotent. Helpers + deps live in
// violationMutationHelpers.ts.

import { uid, TENANT_ID } from "./store/ids";
import { fmtMoney } from "./format";
import type {
  Violation,
  ViolationType,
  ViolationStatus,
  ViolationResponsibility,
  ResponsibilityReason,
} from "./violationTypes";
import {
  resolveVehiclePossessionAt,
  type PossessionResult,
} from "./violationPossession";
import type {
  CreateViolationInput,
  ChargeCustomerInput,
  RecordCompanyPaymentInput,
  IngestProviderEventResult,
} from "./violationStoreInterface";
import {
  makeViolationHelpers,
  nextViolationNumber,
  deriveTotal,
  type ViolationMutationDeps,
} from "./violationMutationHelpers";
import type { ViolationProviderEvent } from "./violationAdapters";
import {
  ingestViolationProviderEvent,
  adminFeeForType,
} from "./violationIngestion";
import type { MatchingConfidence } from "./violationTypes";

export function makeViolationMutations(deps: ViolationMutationDeps) {
  const h = makeViolationHelpers(deps);
  const { store, violationsRef, policyRef, chargeKeys, paymentKeys } = deps;

  function createViolation(input: CreateViolationInput): string {
    const now = new Date().toISOString();
    const id = uid("vio");
    const base = input.base_amount || 0;
    const penalties = input.penalties_amount || 0;
    const admin =
      input.admin_fee_amount ?? policyRef.current.admin_fee_amount ?? 0;
    const total = deriveTotal(base, penalties, admin);

    let rentalId = input.rental_id ?? null;
    let customerId = input.customer_id ?? null;
    let possession: PossessionResult | null = null;
    let confidence = input.matching_confidence ?? null;
    // Only run the possession resolver when the caller did not pass an explicit
    // rental override AND did not pass a pre-computed matching confidence
    // (inbound ingestion passes both).
    if (!rentalId && !confidence) {
      possession = resolveVehiclePossessionAt(
        input.vehicle_id,
        input.occurred_at,
        store.rentals,
        deps.exchanges,
      );
      if (possession.status === "exact_match" && possession.rental) {
        rentalId = possession.rental.id;
        customerId = possession.rental.customer_id;
      }
      // Derive a matching confidence from the resolver when not pre-supplied.
      if (possession.status === "exact_match") confidence = "matched";
      else if (possession.status === "multiple_match") confidence = "ambiguous";
      else if (
        possession.status === "before_rental" ||
        possession.status === "after_return"
      )
        confidence = "company_possession";
      else if (possession.status === "no_match") confidence = "unmatched";
    }

    const policy = policyRef.current;
    let responsibility: ViolationResponsibility = "unknown";
    let reason: ResponsibilityReason | null = null;
    if (possession?.status === "exact_match") {
      const def =
        input.violation_type === "toll"
          ? policy.default_toll_responsibility
          : input.violation_type === "parking_ticket"
            ? policy.default_parking_responsibility
            : input.violation_type === "red_light_camera" ||
                input.violation_type === "speed_camera"
              ? policy.default_camera_responsibility
              : "unknown";
      if (def === "customer") {
        responsibility = "customer";
        reason = "renter_possessed_vehicle";
      } else if (def === "company") responsibility = "company";
      else if (def === "third_party") responsibility = "third_party";
    }

    let status: ViolationStatus = "new";
    if (
      possession?.status === "no_match" ||
      possession?.status === "multiple_match" ||
      responsibility === "unknown"
    ) {
      status = "needs_review";
    }

    const plateSnapshot =
      input.plate_number_snapshot ??
      store.vehicles.find((v) => v.id === input.vehicle_id)?.license_plate ??
      null;

    const rec: Violation = {
      id,
      tenant_id: TENANT_ID,
      violation_number: nextViolationNumber(violationsRef.current),
      violation_type: input.violation_type,
      status,
      vehicle_id: input.vehicle_id,
      rental_id: rentalId,
      customer_id: customerId,
      occurred_at: input.occurred_at,
      received_at: input.received_at ?? null,
      due_at: input.due_at ?? null,
      issuing_authority: input.issuing_authority ?? null,
      citation_number: input.citation_number ?? null,
      plate_number_snapshot: plateSnapshot,
      state_jurisdiction: input.state_jurisdiction ?? null,
      location_description: input.location_description ?? null,
      description: input.description ?? null,
      base_amount: base,
      penalties_amount: penalties,
      admin_fee_amount: admin,
      total_amount: total,
      responsibility,
      responsibility_reason: reason,
      responsibility_notes: null,
      responsibility_decided_by: null,
      responsibility_decided_at: null,
      dispute_status: "not_disputed",
      dispute_reason: null,
      dispute_opened_at: null,
      dispute_resolved_at: null,
      dispute_decision_note: null,
      reduced_amount: null,
      company_payment_status: "not_paid",
      customer_charge_status: "not_charged",
      reimbursement_status: "none",
      linked_expense_id: null,
      customer_charge_transaction_id: null,
      charge_idempotency_key: null,
      assigned_staff_id:
        input.assigned_staff_id ?? policy.default_violation_owner_id ?? null,
      notes: input.notes ?? null,
      source: input.source ?? "manual",
      created_by: store.currentStaffId,
      created_at: now,
      updated_at: now,
      resolved_at: null,
      // V1 Tolls & Violations Automation — inbound provider provenance.
      provider: input.provider ?? null,
      external_event_id: input.external_event_id ?? null,
      matching_confidence: confidence,
      reviewed_by: null,
      reviewed_at: null,
    };
    h.commitViolations([rec, ...violationsRef.current]);
    h.logEvent(id, "created", "Violation created", null);
    if (possession?.status === "exact_match" && possession.rental) {
      const custName = store.customerName(possession.rental.customer_id);
      h.logEvent(
        id,
        "possession_suggested",
        `Possession match: ${custName} (${possession.rental.agreement_number})`,
        {
          rental_id: possession.rental.id,
          customer_id: possession.rental.customer_id,
        },
      );
    } else if (possession?.status === "no_match") {
      h.logEvent(
        id,
        "possession_suggested",
        "No rental possession match found",
        null,
      );
    } else if (possession?.status === "multiple_match") {
      h.logEvent(
        id,
        "possession_suggested",
        "Multiple conflicting possession matches",
        null,
      );
    }
    deps.logAct(
      `Violation created — ${rec.violation_number} · ${h.vehicleLabel(input.vehicle_id)}`,
      "maintenance",
    );
    return id;
  }

  function chargeCustomer(
    id: string,
    input: ChargeCustomerInput,
    requestKey: string,
  ): { ok: boolean; error?: string; transactionId?: string } {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return { ok: false, error: "Violation not found." };
    if (!v.rental_id)
      return { ok: false, error: "Violation has no linked rental to charge." };
    if (
      v.customer_charge_status === "charged" &&
      v.customer_charge_transaction_id
    )
      return {
        ok: true,
        transactionId: v.customer_charge_transaction_id ?? undefined,
      };
    if (chargeKeys.current.has(requestKey))
      return {
        ok: true,
        transactionId: v.customer_charge_transaction_id ?? undefined,
      };
    chargeKeys.current.add(requestKey);

    const policy = policyRef.current;
    const penaltyPart = policy.charge_penalties_to_customer
      ? v.penalties_amount
      : 0;
    const amount =
      input.amount ??
      deriveTotal(v.base_amount, penaltyPart, v.admin_fee_amount);
    if (amount <= 0)
      return { ok: false, error: "Charge amount must be positive." };

    const txnId = store.postCharge(v.rental_id, {
      type: "violation_charge",
      amount,
      description:
        input.description ??
        `Violation charge — ${v.violation_number}${v.citation_number ? ` (${v.citation_number})` : ""}`,
      notes: input.notes ?? `Violation ${v.violation_number}`,
    });
    store.tagTransactionMetadata(txnId, { violation_id: id });
    h.patchViolation(id, {
      customer_charge_transaction_id: txnId,
      customer_charge_status: "charged",
      charge_idempotency_key: requestKey,
      status: "customer_charged",
    });
    h.logEvent(
      id,
      "customer_charged",
      `Customer charged — ${fmtMoney(amount)}`,
      { amount, txnId },
    );
    deps.logAct(
      `Violation charge posted — ${fmtMoney(amount)} · ${v.violation_number}`,
      "maintenance",
    );
    return { ok: true, transactionId: txnId };
  }

  const categoryMap: Record<ViolationType, string> = {
    toll: "Toll",
    parking_ticket: "Parking Ticket",
    red_light_camera: "Citation",
    speed_camera: "Citation",
    moving_violation: "Citation",
    registration_citation: "Citation",
    insurance_citation: "Citation",
    tow_impound: "Impound/Tow",
    admin_fee: "Other",
    other: "Other",
  };

  function recordCompanyPayment(
    id: string,
    input: RecordCompanyPaymentInput,
    requestKey: string,
  ): { ok: boolean; error?: string; expenseId?: string } {
    const v = violationsRef.current.find((x) => x.id === id);
    if (!v) return { ok: false, error: "Violation not found." };
    if (input.amount <= 0)
      return { ok: false, error: "Amount must be positive." };
    if (paymentKeys.current.has(requestKey))
      return { ok: true, expenseId: v.linked_expense_id ?? undefined };
    paymentKeys.current.add(requestKey);

    const catName = categoryMap[v.violation_type];
    const cat = store.expenseCategories.find(
      (c) => c.name === catName && c.active,
    );
    const expenseId = store.createExpense({
      description: `Company payment — ${v.violation_number}${v.citation_number ? ` (${v.citation_number})` : ""}`,
      amount: input.amount,
      transaction_date: input.transaction_date,
      expense_category_id: cat?.id ?? null,
      vendor_id: input.vendor_id ?? null,
      payment_method: input.payment_method,
      processor: input.processor ?? null,
      paid_by_type: "company",
      location_id: input.location_id ?? null,
      vehicle_id: v.vehicle_id,
      rental_id: v.rental_id,
      memo: input.memo ?? `Violation ${v.violation_number}`,
    });
    store.tagExpenseMetadata(expenseId, { violation_id: id });
    h.patchViolation(id, {
      linked_expense_id: expenseId,
      company_payment_status: "paid",
      status: "paid_by_company",
    });
    h.logEvent(
      id,
      "company_expense_created",
      `Company payment recorded — ${fmtMoney(input.amount)}`,
      { amount: input.amount, expenseId },
    );
    deps.logAct(
      `Company payment recorded — ${fmtMoney(input.amount)} · ${v.violation_number}`,
      "neutral",
    );
    return { ok: true, expenseId };
  }

  /** V1 Tolls & Violations Automation — idempotent inbound provider ingestion.
   *  Resolves vehicle, runs exchange-aware possession matching, dedupes by
   *  provider + external_event_id. Creates a Customer Charge ONLY when policy
   *  allows auto_assign_exact AND the match is exact. Ambiguous records are
   *  NEVER auto-charged. */
  function ingestProviderEvent(
    event: ViolationProviderEvent,
  ): IngestProviderEventResult {
    const policy = policyRef.current;
    const result = ingestViolationProviderEvent(event, {
      vehicles: store.vehicles,
      rentals: store.rentals,
      exchanges: deps.exchanges,
      existing: violationsRef.current,
    });
    if (result.duplicateOf) {
      return {
        duplicate_of: result.duplicateOf,
        violation_id: null,
        confidence: result.confidence,
        auto_charged: false,
        issues: result.issues,
      };
    }

    const isToll = event.type === "toll";
    const handlingMode = isToll
      ? policy.toll_handling_mode
      : policy.violation_handling_mode;
    const adminFee = adminFeeForType(event.type, policy);

    // When no vehicle resolved, still record the inbound event so staff can
    // review the unmatched plate — but mark it needs_review with no charge.
    const violationId = createViolation({
      violation_type: event.type,
      vehicle_id: result.vehicle_id ?? "__no_vehicle__",
      occurred_at: event.occurred_at,
      issuing_authority: event.authority,
      citation_number: event.notice_number,
      due_at: event.due_date,
      base_amount: event.amount,
      penalties_amount: event.late_amount ?? 0,
      admin_fee_amount: adminFee,
      plate_number_snapshot: event.plate,
      location_description: event.location,
      description: event.location,
      received_at: new Date().toISOString(),
      source: "toll_provider",
      rental_id: result.rental_id,
      customer_id: result.customer_id,
      provider: event.provider,
      external_event_id: event.external_event_id,
      matching_confidence: result.confidence as MatchingConfidence,
      notes: result.issues.length ? result.issues.join("; ") : null,
    });

    // Auto-charge ONLY when policy is auto_assign_exact AND exact match.
    // Ambiguous / company / unmatched are NEVER auto-charged.
    let autoCharged = false;
    if (
      handlingMode === "auto_assign_exact" &&
      result.confidence === "matched" &&
      result.rental_id &&
      result.customer_id
    ) {
      const chargeKey = `${violationId}-auto-charge`;
      const charge = chargeCustomer(violationId, {}, chargeKey);
      autoCharged = charge.ok;
    }

    return {
      duplicate_of: null,
      violation_id: violationId,
      confidence: result.confidence,
      auto_charged: autoCharged,
      issues: result.issues,
    };
  }

  return {
    createViolation,
    chargeCustomer,
    recordCompanyPayment,
    ingestProviderEvent,
    helpers: h,
  };
}
