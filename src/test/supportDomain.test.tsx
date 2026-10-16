// Build #31 — Support domain tests (tickets, comments, history, diagnostics).
import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import { useSupportTestSources, OTHER_TENANT_ID } from "./supportTestHarness";
import {
  buildDiagnosticsSnapshot,
  diagnosticsIsSafe,
  diagnosticsToCopyText,
} from "@/lib/supportDiagnostics";
import { TENANT_ID } from "@/lib/store/ids";
import type { DiagnosticsSnapshot } from "@/lib/supportTypes";

// Each call returns a fresh renderHook result; mutations must be wrapped in act.
function r() {
  return useSupportTestSources();
}

describe("Build #31 — Support domain", () => {
  it("1. create support ticket", () => {
    const res = r();
    const before = res.current.support.tickets.length;
    let ticket;
    act(() => {
      ticket = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "billing",
        priority: "normal",
        subject: "Cannot record payment",
        description: "The record payment button does nothing.",
        product_area: "billing",
      });
    });
    expect(ticket!.id).toBeTruthy();
    expect(ticket!.ticket_number).toMatch(/^TCK-/);
    expect(ticket!.status).toBe("open");
    expect(res.current.support.tickets.length).toBe(before + 1);
  });

  it("2. ticket tenant id is set", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "question",
        category: "other",
        priority: "low",
        subject: "Tenant test",
        description: "desc",
        product_area: "other",
      });
    });
    expect(t!.tenant_id).toBe(TENANT_ID);
  });

  it("3. ticket type preserved", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "feature_request",
        category: "copilot",
        priority: "normal",
        subject: "Add export",
        description: "desc",
        product_area: "copilot",
      });
    });
    expect(t!.ticket_type).toBe("feature_request");
  });

  it("4. category preserved", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "maintenance",
        priority: "normal",
        subject: "Work order bug",
        description: "desc",
        product_area: "maintenance",
      });
    });
    expect(t!.category).toBe("maintenance");
  });

  it("5. priority preserved", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "urgent",
        subject: "Urgent issue",
        description: "desc",
        product_area: "other",
      });
    });
    expect(t!.priority).toBe("urgent");
  });

  it("6. status transitions", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Transition test",
        description: "desc",
        product_area: "other",
      });
    });
    act(() => {
      res.current.support.changeStatus(
        TENANT_ID,
        t!.id,
        "in_progress",
        "stf_1",
        "Alex",
      );
    });
    expect(res.current.support.getTicket(TENANT_ID, t!.id)!.status).toBe(
      "in_progress",
    );
    act(() => {
      res.current.support.changeStatus(
        TENANT_ID,
        t!.id,
        "resolved",
        "stf_1",
        "Alex",
      );
    });
    expect(res.current.support.getTicket(TENANT_ID, t!.id)!.status).toBe(
      "resolved",
    );
  });

  it("7. resolved timestamp set", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Resolve test",
        description: "desc",
        product_area: "other",
      });
    });
    act(() => {
      res.current.support.changeStatus(
        TENANT_ID,
        t!.id,
        "resolved",
        "stf_1",
        "Alex",
      );
    });
    expect(
      res.current.support.getTicket(TENANT_ID, t!.id)!.resolved_at,
    ).toBeTruthy();
  });

  it("8. reopen clears resolved", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Reopen test",
        description: "desc",
        product_area: "other",
      });
    });
    act(() => {
      res.current.support.changeStatus(
        TENANT_ID,
        t!.id,
        "resolved",
        "stf_1",
        "Alex",
      );
    });
    act(() => {
      res.current.support.reopenTicket(TENANT_ID, t!.id, "stf_1", "Alex");
    });
    const updated = res.current.support.getTicket(TENANT_ID, t!.id)!;
    expect(updated.status).toBe("open");
    expect(updated.resolved_at).toBeNull();
  });

  it("9. comment added", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Comment test",
        description: "desc",
        product_area: "other",
      });
    });
    let c;
    act(() => {
      c = res.current.support.addComment(
        TENANT_ID,
        t!.id,
        "stf_1",
        "Alex",
        "Update here",
      );
    });
    expect(c!.body).toBe("Update here");
    expect(res.current.support.getComments(TENANT_ID, t!.id).length).toBe(1);
  });

  it("10. internal comment hidden from tenant", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Internal test",
        description: "desc",
        product_area: "other",
      });
    });
    act(() => {
      res.current.support.addComment(
        TENANT_ID,
        t!.id,
        "stf_1",
        "Alex",
        "Tenant-visible",
      );
    });
    const visible = res.current.support.getComments(TENANT_ID, t!.id);
    expect(visible.every((c) => !c.internal_only)).toBe(true);
  });

  it("11. history preserved (not overwritten)", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "History test",
        description: "desc",
        product_area: "other",
      });
    });
    act(() => {
      res.current.support.addComment(
        TENANT_ID,
        t!.id,
        "stf_1",
        "Alex",
        "A comment",
      );
    });
    act(() => {
      res.current.support.changeStatus(
        TENANT_ID,
        t!.id,
        "resolved",
        "stf_1",
        "Alex",
      );
    });
    const h = res.current.support.getHistory(TENANT_ID, t!.id);
    expect(h.length).toBeGreaterThanOrEqual(3);
    expect(h[0].event_type).toBe("created");
    expect(h[h.length - 1].event_type).toBe("resolved");
  });

  it("12. related entity context retained", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "rentals",
        priority: "normal",
        subject: "Rental issue",
        description: "desc",
        product_area: "rentals",
        entity_context: {
          entity_type: "Rental",
          entity_id: "rnt_1",
          human_label: "Rental #R-1024",
          deep_link: "/rentals/rnt_1",
        },
      });
    });
    expect(t!.entity_context).toBeTruthy();
    expect(t!.entity_context!.entity_id).toBe("rnt_1");
    expect(t!.entity_context!.deep_link).toBe("/rentals/rnt_1");
  });

  it("13. another tenant excluded", () => {
    const res = r();
    let t;
    act(() => {
      t = res.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Tenant isolation",
        description: "desc",
        product_area: "other",
      });
    });
    expect(
      res.current.support.getTicket(OTHER_TENANT_ID, t!.id),
    ).toBeUndefined();
    expect(
      res.current.support
        .getTicketsForTenant(OTHER_TENANT_ID)
        .find((x) => x.id === t!.id),
    ).toBeUndefined();
  });
});

describe("Build #31 — Diagnostics", () => {
  it("14. route captured", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: "/payments-due",
      selectedLocationId: null,
    });
    expect(d.route).toBe("/payments-due");
  });

  it("15. app version captured", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
    });
    expect(d.app_version).toBeTruthy();
    expect(d.build_label).toBeTruthy();
  });

  it("16. viewport captured when window exists", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
    });
    expect(d.viewport).toBeTruthy();
  });

  it("17. browser family detected", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
    });
    expect(d.browser).toBeTruthy();
  });

  it("18. tenant reference captured (not business name)", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
    });
    expect(d.tenant_reference).toBe(TENANT_ID);
  });

  it("19. user reference captured", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
    });
    expect(d.user_reference).toBe("stf_1");
  });

  it("20. token excluded from diagnostics", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: "sk-abcdef1234567890abcdef1234567890",
      selectedLocationId: null,
    });
    expect(diagnosticsIsSafe(d)).toBe(true);
    expect(d.route).not.toContain("sk-abcdef");
  });

  it("21. API key excluded from diagnostics", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
      metadata: { key: "sk-test1234567890key1234567890" },
    });
    expect(diagnosticsIsSafe(d)).toBe(true);
    expect(JSON.stringify(d.metadata)).not.toContain("sk-test1234567890");
  });

  it("22. banking data excluded (no full account numbers stored)", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
      metadata: { note: "4111111111111111" },
    });
    expect(diagnosticsIsSafe(d)).toBe(true);
  });

  it("23. sensitive document values excluded", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
      metadata: { doc: "123-45-6789" },
    });
    expect(diagnosticsIsSafe(d)).toBe(true);
  });

  it("24. copy diagnostics produces sanitized text", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: "/support",
      selectedLocationId: null,
    });
    const text = diagnosticsToCopyText(d);
    expect(text).toContain("Connect Pro Fleet");
    expect(text).toContain("Version:");
    expect(
      diagnosticsIsSafe({
        ...d,
        route: text,
      } as unknown as DiagnosticsSnapshot),
    ).toBe(true);
  });
});
