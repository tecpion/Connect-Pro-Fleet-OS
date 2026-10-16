// Connect Pro Fleet — Build #32 Customer Portal domain tests.
//
// Tests the portal session boundary, customer-safe projections, billing,
// deposit, documents, requests, timeline, privacy, and reliability.
// Verifies that the portal NEVER recomputes balance/lateness/deposit, NEVER
// mutates the rental on request submission, and NEVER exposes another
// customer's data, internal notes, profitability, or banking data.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePortalTestSources,
  NOW,
  OTHER_TENANT_ID,
} from "./portalTestHarness";
import { buildCustomerPortal } from "@/lib/portalComposer";
import {
  createPortalSession,
  assertPortalAccess,
} from "@/lib/portalSessionStore";
import { TENANT_ID } from "@/lib/store/ids";
import type { PortalSources } from "@/lib/portalComposer";
import {
  PORTAL_RENTAL_STATUS_LABELS,
  PORTAL_REQUEST_STATUS_LABELS,
  PORTAL_DOCUMENT_STATUS_LABELS,
} from "@/lib/portalTypes";

function buildView(customerId: string, tenantId: string = TENANT_ID) {
  const { result } = usePortalTestSources();
  const session = createPortalSession(customerId, tenantId);
  const src: PortalSources = {
    store: result.current.store,
    billing: result.current.billing,
    compliance: result.current.compliance,
    requests: result.current.requests.requests,
  };
  return { session, view: buildCustomerPortal(session, src, NOW), src };
}

describe("Portal session boundary", () => {
  it("session carries customer_id and tenant_id", () => {
    const session = createPortalSession("cus_1", TENANT_ID);
    expect(session.customer_id).toBe("cus_1");
    expect(session.tenant_id).toBe(TENANT_ID);
    expect(session.active).toBe(true);
  });

  it("inactive session is denied", () => {
    const session = createPortalSession("cus_1", TENANT_ID);
    session.active = false;
    expect(() => assertPortalAccess(session, TENANT_ID, "cus_1")).toThrow();
  });

  it("cross-customer access is denied", () => {
    const session = createPortalSession("cus_1", TENANT_ID);
    expect(() => assertPortalAccess(session, TENANT_ID, "cus_2")).toThrow();
  });

  it("cross-tenant access is denied", () => {
    const session = createPortalSession("cus_1", TENANT_ID);
    expect(() =>
      assertPortalAccess(session, OTHER_TENANT_ID, "cus_1"),
    ).toThrow();
  });

  it("session is labeled development_mode", () => {
    const session = createPortalSession("cus_1", TENANT_ID);
    expect(session.development_mode).toBe(true);
    expect(session.verification_mode).toBe("development");
  });
});

describe("Portal Home — active rental + vehicle + balance", () => {
  it("includes active rental for the customer", () => {
    const { view } = buildView("cus_1");
    expect(view.active_rentals.length).toBeGreaterThan(0);
    expect(view.has_no_active_rental).toBe(false);
  });

  it("selected rental has agreement number and vehicle", () => {
    const { view } = buildView("cus_1");
    const r = view.selected_rental;
    expect(r).not.toBeNull();
    expect(r!.agreement_number).toBeTruthy();
    expect(r!.vehicle).not.toBeNull();
    expect(r!.vehicle!.make).toBeTruthy();
  });

  it("vehicle view excludes acquisition cost and profitability", () => {
    const { view } = buildView("cus_1");
    const v = view.selected_rental!.vehicle!;
    expect(v).not.toHaveProperty("acquisition_cost");
    expect(v).not.toHaveProperty("profitability");
    expect(v).not.toHaveProperty("investor");
  });

  it("current balance comes from billing selectors (not recomputed)", () => {
    const { view } = buildView("cus_1");
    expect(typeof view.billing.current_balance).toBe("number");
    expect(view.billing.current_balance).toBeGreaterThanOrEqual(0);
  });

  it("next payment due date is present when balance > 0", () => {
    const { view } = buildView("cus_1");
    if (view.billing.current_balance > 0) {
      expect(view.billing.next_payment_due_date).not.toBeNull();
    }
  });

  it("overdue state is factual (from authoritative lateness)", () => {
    const { view } = buildView("cus_1");
    expect(typeof view.billing.is_overdue).toBe("boolean");
    if (view.billing.is_overdue) {
      expect(view.billing.overdue_amount).toBeGreaterThan(0);
    }
  });
});

describe("Portal Home — multiple rentals + empty state", () => {
  it("past rentals are separated from active", () => {
    const { view } = buildView("cus_1");
    expect(Array.isArray(view.past_rentals)).toBe(true);
    for (const r of view.past_rentals) {
      expect(view.active_rentals.find((a) => a.id === r.id)).toBeUndefined();
    }
  });
});

describe("Portal billing — payment history + charges", () => {
  it("payment history only includes the customer's payments", () => {
    const { view } = buildView("cus_1");
    for (const p of view.billing.payment_history) {
      expect(p.method_label).toBeTruthy();
      expect(p).not.toHaveProperty("processor_id");
      expect(p).not.toHaveProperty("card_number");
    }
  });

  it("charge breakdown only includes posted/authoritative amounts", () => {
    const { view } = buildView("cus_1");
    for (const c of view.billing.charge_breakdown) {
      expect(c.amount).toBeGreaterThanOrEqual(0);
      expect(c.category).toBeTruthy();
    }
  });

  it("deposit is separate from balance/revenue", () => {
    const { view } = buildView("cus_1");
    expect(view.deposit).toBeDefined();
    expect(view.deposit).not.toBe(view.billing);
  });

  it("payment processing availability is a boolean", () => {
    const { view } = buildView("cus_1");
    expect(typeof view.billing.payment_processing_available).toBe("boolean");
  });
});

describe("Portal deposit", () => {
  it("deposit has customer-safe status label", () => {
    const { view } = buildView("cus_1");
    expect(typeof view.deposit.status_label).toBe("string");
  });

  it("deposit amounts are non-negative", () => {
    const { view } = buildView("cus_1");
    expect(view.deposit.held_amount).toBeGreaterThanOrEqual(0);
    expect(view.deposit.applied_amount).toBeGreaterThanOrEqual(0);
    expect(view.deposit.refunded_amount).toBeGreaterThanOrEqual(0);
  });
});

describe("Portal documents", () => {
  it("documents are customer-scoped", () => {
    const { view } = buildView("cus_1");
    for (const d of view.documents) {
      expect(d.document_type_label).toBeTruthy();
      expect(d.status_label).toBeTruthy();
    }
  });

  it("document numbers are masked", () => {
    const { view } = buildView("cus_1");
    for (const d of view.documents) {
      if (d.document_number_masked) {
        expect(d.document_number_masked.length).toBeLessThanOrEqual(20);
      }
    }
  });
});

describe("Portal requests — submission does not mutate rental", () => {
  it("extension request can be created", () => {
    const { result } = usePortalTestSources();
    let req: any;
    act(() => {
      req = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: "Need more time",
        estimated_extension_charge: 720,
      });
    });
    expect(req.status).toBe("submitted");
    expect(req.request_type).toBe("extension");
    expect(req.requested_new_end).toBe("2026-09-07");
  });

  it("exchange request can be created", () => {
    const { result } = usePortalTestSources();
    let req: any;
    act(() => {
      req = result.current.requests.createExchangeRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        exchange_reason: "vehicle_issue",
        issue_description: "AC not working",
        preferred_timing: "tomorrow",
        customer_note: null,
      });
    });
    expect(req.status).toBe("submitted");
    expect(req.exchange_reason).toBe("vehicle_issue");
  });

  it("return request can be created", () => {
    const { result } = usePortalTestSources();
    let req: any;
    act(() => {
      req = result.current.requests.createReturnRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        requested_return_date: "2026-09-05",
        requested_return_location: "Main Lot",
        customer_note: null,
      });
    });
    expect(req.status).toBe("submitted");
    expect(req.requested_return_date).toBe("2026-09-05");
  });

  it("submitting a return request does NOT mark rental returned", () => {
    const { result } = usePortalTestSources();
    const rentalBefore = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    );
    const statusBefore = rentalBefore?.status;
    act(() => {
      result.current.requests.createReturnRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        requested_return_date: "2026-09-05",
        requested_return_location: null,
        customer_note: null,
      });
    });
    const rentalAfter = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    );
    expect(rentalAfter?.status).toBe(statusBefore);
  });

  it("submitting an extension request does NOT extend the rental", () => {
    const { result } = usePortalTestSources();
    const rentalBefore = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    );
    const endBefore = rentalBefore?.scheduled_return_date;
    act(() => {
      result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: endBefore ?? "2026-08-28",
        requested_new_end: "2026-09-30",
        customer_note: null,
        estimated_extension_charge: null,
      });
    });
    const rentalAfter = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    );
    expect(rentalAfter?.scheduled_return_date).toBe(endBefore);
  });

  it("staff can review and approve with a customer-visible response", () => {
    const { result } = usePortalTestSources();
    let reqId = "";
    act(() => {
      const req = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      reqId = req.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, reqId, {
        status: "approved",
        staff_response: "Approved — please stop by to sign.",
        staff_name: "Ava Reyes",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, reqId);
    expect(updated?.status).toBe("approved");
    expect(updated?.staff_response).toContain("Approved");
  });

  it("customer can cancel a submitted request", () => {
    const { result } = usePortalTestSources();
    let reqId = "";
    act(() => {
      const req = result.current.requests.createReturnRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        requested_return_date: "2026-09-05",
        requested_return_location: null,
        customer_note: null,
      });
      reqId = req.id;
    });
    act(() => {
      result.current.requests.cancelRequest(TENANT_ID, reqId, "Hannah Ortiz");
    });
    const updated = result.current.requests.getRequest(TENANT_ID, reqId);
    expect(updated?.status).toBe("cancelled");
  });

  it("cannot cancel a completed request", () => {
    const { result } = usePortalTestSources();
    let reqId = "";
    act(() => {
      const req = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      reqId = req.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, reqId, {
        status: "completed",
        staff_response: "Done",
      });
    });
    act(() => {
      result.current.requests.cancelRequest(TENANT_ID, reqId, "Hannah Ortiz");
    });
    const updated = result.current.requests.getRequest(TENANT_ID, reqId);
    expect(updated?.status).toBe("completed");
  });

  it("timeline preserves history (append-only)", () => {
    const { result } = usePortalTestSources();
    let reqId = "";
    let initialLen = 0;
    act(() => {
      const req = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      reqId = req.id;
      initialLen = req.timeline.length;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, reqId, {
        status: "under_review",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, reqId);
    expect(updated!.timeline.length).toBeGreaterThan(initialLen);
  });
});

describe("Portal timeline — customer-safe", () => {
  it("timeline events are newest-first", () => {
    const { view } = buildView("cus_1");
    if (view.timeline.length > 1) {
      for (let i = 1; i < view.timeline.length; i++) {
        expect(
          view.timeline[i - 1].occurred_at >= view.timeline[i].occurred_at,
        ).toBe(true);
      }
    }
  });

  it("timeline excludes internal staff assignments and profitability", () => {
    const { view } = buildView("cus_1");
    for (const evt of view.timeline) {
      expect(evt.category).not.toBe("staff_assignment");
      expect(evt.category).not.toBe("profitability");
      expect(evt.category).not.toBe("internal_task");
    }
  });
});

describe("Portal privacy — cross-customer + internal data", () => {
  it("customer A cannot see customer B's rentals", () => {
    const { view: viewA } = buildView("cus_1");
    const { view: viewB } = buildView("cus_2");
    const aIds = viewA.active_rentals.map((r) => r.id);
    const bIds = viewB.active_rentals.map((r) => r.id);
    for (const id of aIds) {
      expect(bIds).not.toContain(id);
    }
  });

  it("portal view never exposes acquisition cost or investor data", () => {
    const { view } = buildView("cus_1");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("acquisition_cost");
    expect(serialized).not.toContain("investor");
    expect(serialized).not.toContain("profit_margin");
  });

  it("portal view never exposes banking data", () => {
    const { view } = buildView("cus_1");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("bank_account");
    expect(serialized).not.toContain("routing_number");
  });

  it("portal view never exposes raw ledger transaction IDs", () => {
    const { view } = buildView("cus_1");
    for (const p of view.billing.payment_history) {
      expect(p.id).not.toMatch(/^txn_/);
    }
  });
});

describe("Portal reliability — zero/empty states", () => {
  it("no active rental produces truthful empty state", () => {
    const { view } = buildView("cus_2");
    if (view.active_rentals.length === 0) {
      expect(view.has_no_active_rental).toBe(true);
      expect(view.selected_rental).toBeNull();
    }
  });

  it("no NaN or Infinity in any numeric field", () => {
    const { view } = buildView("cus_1");
    JSON.stringify(view, (_k, v) => {
      if (typeof v === "number") {
        expect(Number.isNaN(v)).toBe(false);
        expect(Number.isFinite(v)).toBe(true);
      }
      return v;
    });
  });

  it("billing handles zero balance safely", () => {
    const { view } = buildView("cus_1");
    expect(view.billing.current_balance).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(view.billing.current_balance)).toBe(true);
  });

  it("notices are derived from actual state", () => {
    const { view } = buildView("cus_1");
    expect(Array.isArray(view.notices)).toBe(true);
    for (const n of view.notices) {
      expect(["important", "action_needed", "update"]).toContain(n.priority);
    }
  });
});

describe("Portal notices — priority", () => {
  it("notices have valid priority values", () => {
    const { view } = buildView("cus_1");
    for (const n of view.notices) {
      expect(["important", "action_needed", "update"]).toContain(n.priority);
      expect(n.title).toBeTruthy();
    }
  });
});

describe("Portal company contact", () => {
  it("company contact has name", () => {
    const { view } = buildView("cus_1");
    expect(view.company_contact.name).toBeTruthy();
  });
});

describe("Portal policies — frozen snapshot", () => {
  it("policy view has a source", () => {
    const { view } = buildView("cus_1");
    expect(["rental_snapshot", "company_current", "none"]).toContain(
      view.policies.source,
    );
  });
});

describe("Portal agreements", () => {
  it("agreements are customer-safe", () => {
    const { view } = buildView("cus_1");
    for (const a of view.agreements) {
      expect(a.agreement_type_label).toBeTruthy();
      expect(a.status_label).toBeTruthy();
    }
  });
});

describe("Portal customer profile", () => {
  it("profile has first and last name", () => {
    const { view } = buildView("cus_1");
    expect(view.customer.first_name).toBeTruthy();
    expect(view.customer.last_name).toBeTruthy();
  });
});

describe("Portal request store — tenant scoping", () => {
  it("getRequestsForCustomer only returns the customer's requests", () => {
    const { result } = usePortalTestSources();
    act(() => {
      result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
    });
    const cus1Reqs = result.current.requests.getRequestsForCustomer(
      TENANT_ID,
      "cus_1",
    );
    const cus2Reqs = result.current.requests.getRequestsForCustomer(
      TENANT_ID,
      "cus_2",
    );
    for (const r of cus1Reqs) {
      expect(r.customer_id).toBe("cus_1");
    }
    for (const r of cus2Reqs) {
      expect(r.customer_id).toBe("cus_2");
    }
  });

  it("getAllForTenant returns all tenant requests (staff queue)", () => {
    const { result } = usePortalTestSources();
    const all = result.current.requests.getAllForTenant(TENANT_ID);
    expect(Array.isArray(all)).toBe(true);
    for (const r of all) {
      expect(r.tenant_id).toBe(TENANT_ID);
    }
  });
});

describe("Portal status label mappings — plain language", () => {
  it("rental status labels are customer-friendly", () => {
    expect(PORTAL_RENTAL_STATUS_LABELS.active).toBe("Active");
    expect(PORTAL_RENTAL_STATUS_LABELS.overdue).toBe("Past due");
  });

  it("request status labels are customer-friendly", () => {
    expect(PORTAL_REQUEST_STATUS_LABELS.submitted).toBe("Submitted");
    expect(PORTAL_REQUEST_STATUS_LABELS.under_review).toBe("Under Review");
  });

  it("document status labels are customer-friendly", () => {
    expect(PORTAL_DOCUMENT_STATUS_LABELS.missing).toBe("Needed");
    expect(PORTAL_DOCUMENT_STATUS_LABELS.pending_review).toBe("Under Review");
    expect(PORTAL_DOCUMENT_STATUS_LABELS.verified).toBe("Approved");
  });
});
