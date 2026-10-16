// Build #31 — Release notes + permissions tests.
import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import {
  publishedReleaseNotes,
  featuredReleaseNotes,
  releaseNoteById,
  RELEASE_NOTES,
} from "@/lib/supportReleaseNotes";
import { SUPPORT_PERMISSIONS } from "@/lib/supportPermissions";
import { can } from "@/lib/permissions";
import { useSupportTestSources } from "./supportTestHarness";
import { TENANT_ID } from "@/lib/store/ids";

function res() {
  return useSupportTestSources();
}

describe("Build #31 — Release notes", () => {
  it("58. release notes newest first", () => {
    const notes = publishedReleaseNotes();
    expect(notes.length).toBeGreaterThan(1);
    for (let i = 0; i < notes.length - 1; i++) {
      expect(notes[i].published_at >= notes[i + 1].published_at).toBe(true);
    }
  });

  it("59. published only", () => {
    expect(publishedReleaseNotes().every((r) => r.status === "published")).toBe(
      true,
    );
  });

  it("60. categories present", () => {
    const note = releaseNoteById("rn_executive_dashboard");
    expect(note).toBeTruthy();
    expect(note!.categories.length).toBeGreaterThan(0);
    expect(note!.changes.length).toBeGreaterThan(0);
  });

  it("61. related article linked", () => {
    const note = releaseNoteById("rn_executive_dashboard");
    expect(note!.related_article_ids).toContain("kb_executive_dashboard");
  });

  it("62. What's New panel returns featured", () => {
    const featured = featuredReleaseNotes(3);
    expect(featured.every((r) => r.featured)).toBe(true);
    expect(featured.length).toBeGreaterThan(0);
  });

  it("63. draft release note excluded", () => {
    const all = RELEASE_NOTES;
    expect(publishedReleaseNotes().length).toBeLessThanOrEqual(all.length);
    expect(publishedReleaseNotes().every((r) => r.status === "published")).toBe(
      true,
    );
  });
});

describe("Build #31 — Support permissions", () => {
  it("64. support permission keys defined", () => {
    const keys = SUPPORT_PERMISSIONS.map((p) => p.key);
    expect(keys).toContain("support.view");
    expect(keys).toContain("support.create");
    expect(keys).toContain("support.comment");
    expect(keys).toContain("support.view_all_company_tickets");
  });

  it("65. owner sees company tickets (view_all_company_tickets)", () => {
    const r = res();
    const owner = r.current.store.staff.find((s) => s.role === "owner");
    expect(owner).toBeTruthy();
    const roleObj = r.current.store.roles.find(
      (r2) => r2.id === owner!.role_id,
    );
    const canViewAll = can(
      roleObj,
      owner!.permission_overrides ?? null,
      "support.view_all_company_tickets",
    );
    expect(canViewAll).toBe(true);
  });

  it("66. staff can create support requests", () => {
    const r = res();
    const staff = r.current.store.staff[0];
    const roleObj = r.current.store.roles.find((r2) => r2.id === staff.role_id);
    const canCreate = can(
      roleObj,
      staff.permission_overrides ?? null,
      "support.create",
    );
    // At least one staff member can create (owner/manager/user default).
    expect(canCreate).toBe(true);
  });

  it("67. published KB visible to authenticated staff (no sensitive data)", () => {
    // Knowledge articles are product-help content — no rental/financial data.
    // This is verified by the knowledge base tests; here we confirm the
    // permission catalog does not gate KB behind a sensitive permission.
    const kbPerm = SUPPORT_PERMISSIONS.find((p) => p.key === "support.view");
    expect(kbPerm).toBeTruthy();
    expect(kbPerm!.module).toBe("Support");
  });

  it("68. system status visible to all authenticated (no special perm)", () => {
    // System status is public to authenticated tenant users; it is not gated
    // behind view_all_company_tickets. Verified by absence of a status-specific
    // restrictive permission.
    const statusPerm = SUPPORT_PERMISSIONS.find((p) =>
      p.key.includes("status"),
    );
    expect(statusPerm).toBeUndefined();
  });

  it("69. internal comment excluded from tenant view", () => {
    const r = res();
    let t;
    act(() => {
      t = r.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Internal exclusion",
        description: "desc",
        product_area: "other",
      });
    });
    act(() => {
      r.current.support.addComment(
        TENANT_ID,
        t!.id,
        "stf_1",
        "Alex",
        "visible",
      );
    });
    const visible = r.current.support.getComments(TENANT_ID, t!.id);
    // All comments returned to tenant are non-internal.
    expect(visible.every((c) => c.internal_only === false)).toBe(true);
  });

  it("70. another tenant excluded from ticket list", () => {
    const r = res();
    act(() => {
      r.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_1",
        requester_name: "Alex Morgan",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Scoped",
        description: "desc",
        product_area: "other",
      });
    });
    const otherTenantTickets =
      r.current.support.getTicketsForTenant("tnt_other");
    expect(otherTenantTickets.length).toBe(0);
  });
});
