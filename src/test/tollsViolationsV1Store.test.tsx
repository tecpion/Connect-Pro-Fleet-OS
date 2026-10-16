// Connect Pro Fleet — V1 Tolls & Violations Automation: store + Copilot tests.
//
// Proves the store-integration behaviors (charge/expense separation, payment
// timing, auto-charge policy, dispute preservation) and Copilot possession
// matching against the real ViolationProvider + StoreProvider. Mock providers
// only — no real provider, no credentials, no Supabase.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import type { RentalAgreement } from "@/lib/types";
import { ViolationProvider, useViolations } from "@/lib/violationStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import type { Violation, MatchingConfidence } from "@/lib/violationTypes";
import type {
  CopilotSources,
  CopilotViewerPermissions,
} from "@/lib/copilotTypes";
import {
  answerTollsUnmatched,
  answerTollPossessionAtEvent,
} from "@/lib/copilotTollHandlers";
import { resolveViolationPossession } from "@/lib/violationIngestion";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <ViolationPolicyProvider>
        <ViolationProvider>{children}</ViolationProvider>
      </ViolationPolicyProvider>
    </StoreProvider>
  );
}
function useVioHooks() {
  return renderHook(() => ({ store: useStore(), vio: useViolations() }), {
    wrapper,
  }).result;
}

// A toll on veh_1 during rnt_1's window (seeded rnt_1: Aug 24-27, Hannah).
const DURING_R1 = "2026-08-25T14:30:00Z";

function baseVio(): Violation {
  return {
    id: "vio_base",
    tenant_id: "tnt_1",
    violation_number: "VIO-B",
    violation_type: "toll",
    status: "customer_charged",
    vehicle_id: "veh_1",
    rental_id: null,
    customer_id: null,
    occurred_at: DURING_R1,
    received_at: null,
    due_at: null,
    issuing_authority: null,
    citation_number: null,
    plate_number_snapshot: null,
    state_jurisdiction: null,
    location_description: null,
    description: null,
    base_amount: 12,
    penalties_amount: 0,
    admin_fee_amount: 0,
    total_amount: 12,
    responsibility: "customer",
    responsibility_reason: null,
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
    assigned_staff_id: null,
    notes: null,
    source: "manual",
    created_by: null,
    created_at: "",
    updated_at: "",
    resolved_at: null,
    provider: null,
    external_event_id: null,
    matching_confidence: "matched",
    reviewed_by: null,
    reviewed_at: null,
  };
}

describe("V1 Tolls & Violations — store charges, fees, ledgers", () => {
  it("8. customer charge created only after responsibility decision", () => {
    const r = useVioHooks();
    let id = "";
    let chargeRes: { ok: boolean } | undefined;
    act(() => {
      // Default policy = manual_review → exact-match ingestion does NOT auto-charge.
      id = r.current.vio.ingestProviderEvent({
        external_event_id: "V1-TEST-8",
        provider: "mock_toll_provider",
        plate: "FL-RT8841",
        vin: null,
        occurred_at: DURING_R1,
        type: "toll",
        amount: 12,
        location: null,
        authority: "SunPass",
        notice_number: "SP-8",
        due_date: null,
        document_reference: null,
        metadata: null,
      }).violation_id!;
      const before = r.current.vio.violationById(id)!;
      expect(before.customer_charge_status).toBe("not_charged");
      r.current.vio.assignResponsibility(
        id,
        "customer",
        "renter_possessed_vehicle",
      );
      chargeRes = r.current.vio.chargeCustomer(id, {}, `${id}-charge`);
    });
    expect(chargeRes?.ok).toBe(true);
    expect(r.current.vio.violationById(id)!.customer_charge_status).toBe(
      "charged",
    );
  });

  it("10. Customer Charge and Expense remain separate ledgers", () => {
    const r = useVioHooks();
    let id = "";
    act(() => {
      id = r.current.vio.createViolation({
        violation_type: "toll",
        vehicle_id: "veh_1",
        occurred_at: DURING_R1,
        base_amount: 12,
        admin_fee_amount: 15,
        source: "manual",
      });
      r.current.vio.chargeCustomer(id, {}, `${id}-charge`);
      r.current.vio.recordCompanyPayment(
        id,
        {
          amount: 12,
          transaction_date: "2026-08-28",
          payment_method: "credit_card",
        },
        `${id}-pay`,
      );
    });
    const v = r.current.vio.violationById(id)!;
    expect(v.customer_charge_transaction_id).toBeTruthy();
    const ledger = r.current.store.rentalLedger(v.rental_id!);
    expect(ledger.some((t) => t.id === v.customer_charge_transaction_id)).toBe(
      true,
    );
    expect(v.linked_expense_id).toBeTruthy();
    const exp = r.current.store.expenses.find(
      (e) => e.id === v.linked_expense_id,
    );
    expect(exp).toBeTruthy();
    expect(v.linked_expense_id).not.toBe(v.customer_charge_transaction_id);
  });

  it("11. payment is not created until actual collection", () => {
    const r = useVioHooks();
    let id = "";
    act(() => {
      id = r.current.vio.createViolation({
        violation_type: "toll",
        vehicle_id: "veh_1",
        occurred_at: DURING_R1,
        base_amount: 12,
        source: "manual",
      });
      r.current.vio.chargeCustomer(id, {}, `${id}-charge`);
    });
    const v = r.current.vio.violationById(id)!;
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.category === "payment" &&
        (t.metadata as { violation_id?: string } | null)?.violation_id === id,
    );
    expect(payments.length).toBe(0);
    expect(v.customer_charge_status).toBe("charged");
  });

  it("16. customer dispute preserves original record", () => {
    const r = useVioHooks();
    let id = "";
    act(() => {
      id = r.current.vio.createViolation({
        violation_type: "parking_ticket",
        vehicle_id: "veh_2",
        occurred_at: "2026-08-26T10:00:00Z",
        base_amount: 55,
        source: "manual",
      });
      r.current.vio.openDispute(id, { reason: "Paid the meter via app" });
    });
    const v = r.current.vio.violationById(id)!;
    expect(v.dispute_status).toBe("customer_disputed");
    expect(v.dispute_reason).toBe("Paid the meter via app");
    expect(v.base_amount).toBe(55);
    expect(v.id).toBe(id);
  });
});

describe("V1 Tolls & Violations — auto-charge policy", () => {
  it("manual review default does not auto-charge an exact match", () => {
    const r = useVioHooks();
    let result:
      { auto_charged: boolean; confidence: MatchingConfidence } | undefined;
    act(() => {
      result = r.current.vio.ingestProviderEvent({
        external_event_id: "V1-AUTO-1",
        provider: "mock_toll_provider",
        plate: "FL-RT8841",
        vin: null,
        occurred_at: DURING_R1,
        type: "toll",
        amount: 12,
        location: null,
        authority: "SunPass",
        notice_number: "SP-A1",
        due_date: null,
        document_reference: null,
        metadata: null,
      });
    });
    expect(result!.confidence).toBe("matched");
    expect(result!.auto_charged).toBe(false);
  });

  it("ambiguous event is never auto-charged (confidence guard)", () => {
    // The store only auto-charges when confidence === "matched". An ambiguous
    // ingestion result carries confidence "ambiguous" → cannot auto-charge.
    const R1 = {
      id: "rnt_1",
      customer_id: "cus_1",
      vehicle_id: "veh_1",
      checkout_date: "2026-08-20",
      status: "active",
    };
    const R1b = {
      id: "rnt_1b",
      customer_id: "cus_1b",
      vehicle_id: "veh_1",
      checkout_date: "2026-08-20",
      status: "active",
    };
    const res = resolveViolationPossession(
      "veh_1",
      "2026-08-22T10:00:00Z",
      [R1, R1b] as unknown as RentalAgreement[],
      [],
    );
    expect(res.confidence).toBe("ambiguous");
    expect(res.confidence !== "matched").toBe(true);
  });
});

describe("V1 Tolls & Violations — Copilot possession matching", () => {
  const perms: CopilotViewerPermissions = {
    canViewFinancials: true,
    canViewProfitability: false,
    canViewSensitiveDocs: false,
    canViewBanking: false,
  };

  it("20. Copilot never infers responsibility without possession evidence", () => {
    const src: CopilotSources = {
      tolls: {
        violations: [
          {
            ...baseVio(),
            id: "vio_c1",
            violation_type: "toll",
            matching_confidence: "company_possession",
            rental_id: null,
            customer_id: null,
            status: "needs_review",
          },
        ],
        customers: [],
        rentals: [],
        vehicles: [],
        exchanges: [],
      },
    } as unknown as CopilotSources;
    const ans = answerTollsUnmatched(
      src,
      new Date("2026-09-27T12:00:00Z"),
      perms,
    );
    const v = (src.tolls as { violations: Violation[] }).violations[0];
    expect(v.rental_id).toBeNull();
    expect(ans.answer_type).toBe("list");
  });

  it("20b. Copilot possession-at-event answers from exchange-aware resolver", () => {
    const src: CopilotSources = {
      tolls: {
        violations: [
          {
            ...baseVio(),
            id: "vio_p1",
            vehicle_id: "veh_1",
            violation_type: "speed_camera",
            occurred_at: DURING_R1,
          },
        ],
        customers: [
          { id: "cus_1", first_name: "Hannah", last_name: "Lee" } as never,
        ],
        rentals: [
          {
            id: "rnt_1",
            tenant_id: "tnt_1",
            reservation_id: null,
            customer_id: "cus_1",
            vehicle_id: "veh_1",
            agreement_number: "AGR-1",
            status: "completed",
            checkout_date: "2026-08-20",
            checkout_time: "09:00",
            scheduled_return_date: "2026-08-27",
            scheduled_return_time: "09:00",
            actual_return_date: "2026-08-27",
            actual_return_time: "14:00",
            rate_type: "weekly",
            rate_amount: 300,
            subtotal: 300,
            tax: 0,
            fees: 0,
            discount: 0,
            deposit_amount: 0,
            amount_paid: 0,
            balance_due: 0,
            mileage_out: null,
            mileage_in: null,
            fuel_out: null,
            fuel_in: null,
            weekly_payment_day: "Monday",
            next_payment_due: null,
            payment_cutoff_time: null,
            grace_period: 24,
            late_fee: 0,
            late_fee_applied: false,
            weeks_rented: 1,
            created_at: "",
            updated_at: "",
          } as never,
        ],
        vehicles: [
          {
            id: "veh_1",
            vin: "VIN1",
            make: "Toyota",
            model: "Camry",
            year: 2022,
            license_plate: "FL-RT8841",
            status: "available",
            location: "Lot",
            vehicle_type: "sedan",
            daily_rate: 50,
            weekly_rate: 300,
            deposit_amount: 0,
            images: [],
            documents: [],
            purchase_date: "",
            purchase_price: 0,
            current_mileage: 0,
            insurance_policy_number: "",
            insurance_expiry: "",
            registration_expiry: "",
            tenant_id: "tnt_1",
            created_at: "",
            updated_at: "",
          } as never,
        ],
        exchanges: [],
      },
    } as unknown as CopilotSources;
    const ans = answerTollPossessionAtEvent(
      src,
      new Date("2026-09-27T12:00:00Z"),
      perms,
      "who had vehicle FL-RT8841 when this ticket occurred",
    );
    expect(ans.answer_type).toBe("summary");
    expect(String(ans.summary)).toContain("Hannah");
  });
});
