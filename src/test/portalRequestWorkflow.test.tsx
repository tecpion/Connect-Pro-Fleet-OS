// Connect Pro Fleet — Build #32 Portal request workflow + staff orchestration tests.
//
// Verifies the full request lifecycle through the real store: extension /
// exchange / return forms create requests only (never mutate the rental),
// status transitions render customer-friendly labels, cancel is gated by
// status, staff review works through the tenant queue, and the staff queue is
// tenant-scoped. Also checks that approving a request does NOT bypass the
// rental domain (the rental lifecycle is untouched by request submission).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePortalTestSources, OTHER_TENANT_ID } from "./portalTestHarness";
import { TENANT_ID } from "@/lib/store/ids";
import {
  PORTAL_REQUEST_STATUS_LABELS,
  PORTAL_REQUEST_TYPE_LABELS,
  type PortalRequestStatus,
} from "@/lib/portalTypes";

describe("Build #32 — Request workflow: submission does not mutate rental", () => {
  it("extension form creates a request only (rental end unchanged)", () => {
    const { result } = usePortalTestSources();
    const before = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.scheduled_return_date;
    act(() => {
      result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: before ?? "2026-08-28",
        requested_new_end: "2026-09-30",
        customer_note: null,
        estimated_extension_charge: null,
      });
    });
    const after = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.scheduled_return_date;
    expect(after).toBe(before);
  });

  it("return form creates a request only (rental status unchanged)", () => {
    const { result } = usePortalTestSources();
    const before = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.status;
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
    const after = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.status;
    expect(after).toBe(before);
  });

  it("exchange form creates a request only (vehicle unchanged)", () => {
    const { result } = usePortalTestSources();
    const before = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.vehicle_id;
    act(() => {
      result.current.requests.createExchangeRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        exchange_reason: "vehicle_issue",
        issue_description: "AC broken",
        preferred_timing: null,
        customer_note: null,
      });
    });
    const after = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.vehicle_id;
    expect(after).toBe(before);
  });
});

describe("Build #32 — Request status transitions + labels", () => {
  it("new request starts as Submitted", () => {
    const { result } = usePortalTestSources();
    let req: any;
    act(() => {
      req = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
    });
    expect(req.status).toBe("submitted");
    expect(
      PORTAL_REQUEST_STATUS_LABELS[req.status as PortalRequestStatus],
    ).toBe("Submitted");
  });

  it("staff can move a request to Under Review", () => {
    const { result } = usePortalTestSources();
    let id = "";
    act(() => {
      const r = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "under_review",
        staff_name: "Ava Reyes",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated?.status).toBe("under_review");
    expect(PORTAL_REQUEST_STATUS_LABELS[updated!.status]).toBe("Under Review");
  });

  it("staff can Approve with a customer-visible response", () => {
    const { result } = usePortalTestSources();
    let id = "";
    act(() => {
      const r = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "approved",
        staff_response: "Approved — come sign the extension.",
        staff_name: "Ava Reyes",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated?.status).toBe("approved");
    expect(updated?.staff_response).toContain("Approved");
    expect(updated?.resolved_at).not.toBeNull();
  });

  it("staff can Decline with a safe reason", () => {
    const { result } = usePortalTestSources();
    let id = "";
    act(() => {
      const r = result.current.requests.createReturnRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        requested_return_date: "2026-09-05",
        requested_return_location: null,
        customer_note: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "declined",
        staff_response: "Vehicle has a future reservation; cannot accept yet.",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated?.status).toBe("declined");
    expect(updated?.staff_response).toBeTruthy();
    expect(updated?.resolved_at).not.toBeNull();
  });

  it("staff can Complete a request", () => {
    const { result } = usePortalTestSources();
    let id = "";
    act(() => {
      const r = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "completed",
        staff_response: "Extension processed.",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated?.status).toBe("completed");
  });

  it("customer can Cancel a Submitted request", () => {
    const { result } = usePortalTestSources();
    let id = "";
    act(() => {
      const r = result.current.requests.createReturnRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        requested_return_date: "2026-09-05",
        requested_return_location: null,
        customer_note: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.cancelRequest(TENANT_ID, id, "Hannah Ortiz");
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated?.status).toBe("cancelled");
  });

  it("cannot cancel a Completed request", () => {
    const { result } = usePortalTestSources();
    let id = "";
    act(() => {
      const r = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "completed",
      });
    });
    act(() => {
      result.current.requests.cancelRequest(TENANT_ID, id, "Hannah Ortiz");
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated?.status).toBe("completed");
  });

  it("request timeline preserves history (append-only)", () => {
    const { result } = usePortalTestSources();
    let id = "";
    let initialLen = 0;
    act(() => {
      const r = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: "2026-08-28",
        requested_new_end: "2026-09-07",
        customer_note: null,
        estimated_extension_charge: null,
      });
      id = r.id;
      initialLen = r.timeline.length;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "under_review",
      });
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "approved",
      });
    });
    const updated = result.current.requests.getRequest(TENANT_ID, id);
    expect(updated!.timeline.length).toBeGreaterThan(initialLen);
    // First entry is still the submission.
    expect(updated!.timeline[0].event_type).toBe("submitted");
  });
});

describe("Build #32 — Staff request queue: tenant scoping", () => {
  it("tenant queue includes requests for that tenant", () => {
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
    const queue = result.current.requests.getAllForTenant(TENANT_ID);
    expect(queue.length).toBeGreaterThan(0);
    for (const r of queue) {
      expect(r.tenant_id).toBe(TENANT_ID);
    }
  });

  it("other tenant's queue excludes this tenant's requests", () => {
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
    const otherQueue = result.current.requests.getAllForTenant(OTHER_TENANT_ID);
    for (const r of otherQueue) {
      expect(r.tenant_id).not.toBe(TENANT_ID);
    }
  });

  it("getRequestsForCustomer only returns that customer's requests", () => {
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
    const cus1 = result.current.requests.getRequestsForCustomer(
      TENANT_ID,
      "cus_1",
    );
    const cus2 = result.current.requests.getRequestsForCustomer(
      TENANT_ID,
      "cus_2",
    );
    for (const r of cus1) expect(r.customer_id).toBe("cus_1");
    for (const r of cus2) expect(r.customer_id).toBe("cus_2");
  });
});

describe("Build #32 — Staff approval does not bypass rental domain", () => {
  it("approving an extension request does NOT extend the rental", () => {
    const { result } = usePortalTestSources();
    const endBefore = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.scheduled_return_date;
    let id = "";
    act(() => {
      const r = result.current.requests.createExtensionRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        current_scheduled_end: endBefore ?? "2026-08-28",
        requested_new_end: "2026-10-15",
        customer_note: null,
        estimated_extension_charge: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "approved",
        staff_response: "Approved",
      });
    });
    const endAfter = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.scheduled_return_date;
    // The rental's scheduled end is unchanged — approval is a request status,
    // not a domain mutation. Staff must use the real extension workflow.
    expect(endAfter).toBe(endBefore);
  });

  it("approving a return request does NOT mark the rental returned", () => {
    const { result } = usePortalTestSources();
    const statusBefore = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.status;
    let id = "";
    act(() => {
      const r = result.current.requests.createReturnRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        requested_return_date: "2026-09-05",
        requested_return_location: null,
        customer_note: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "approved",
        staff_response: "Approved",
      });
    });
    const statusAfter = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.status;
    expect(statusAfter).toBe(statusBefore);
  });

  it("approving an exchange request does NOT change the vehicle", () => {
    const { result } = usePortalTestSources();
    const vehBefore = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.vehicle_id;
    let id = "";
    act(() => {
      const r = result.current.requests.createExchangeRequest({
        tenant_id: TENANT_ID,
        customer_id: "cus_1",
        rental_id: "rnt_1",
        exchange_reason: "comfort_preference",
        issue_description: null,
        preferred_timing: null,
        customer_note: null,
      });
      id = r.id;
    });
    act(() => {
      result.current.requests.staffReview(TENANT_ID, id, {
        status: "approved",
        staff_response: "Approved",
      });
    });
    const vehAfter = result.current.store.rentals.find(
      (r) => r.id === "rnt_1",
    )?.vehicle_id;
    expect(vehAfter).toBe(vehBefore);
  });
});

describe("Build #32 — Request type labels (customer-friendly)", () => {
  it("request type labels are plain language", () => {
    expect(PORTAL_REQUEST_TYPE_LABELS.extension).toBe("Extension Request");
    expect(PORTAL_REQUEST_TYPE_LABELS.exchange).toBe(
      "Vehicle Exchange Request",
    );
    expect(PORTAL_REQUEST_TYPE_LABELS.return).toBe("Return Request");
  });

  it("all request statuses have customer-friendly labels", () => {
    expect(PORTAL_REQUEST_STATUS_LABELS.submitted).toBe("Submitted");
    expect(PORTAL_REQUEST_STATUS_LABELS.under_review).toBe("Under Review");
    expect(PORTAL_REQUEST_STATUS_LABELS.approved).toBe("Approved");
    expect(PORTAL_REQUEST_STATUS_LABELS.declined).toBe("Declined");
    expect(PORTAL_REQUEST_STATUS_LABELS.completed).toBe("Completed");
    expect(PORTAL_REQUEST_STATUS_LABELS.cancelled).toBe("Cancelled");
  });
});
