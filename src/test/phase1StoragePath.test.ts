// Phase 1 — org-scoped private storage path convention test.
//
// Verifies the storage path is <org_id>/<entity_type>/<entity_id>/<filename>
// so the storage RLS policy (which checks the first path segment against
// membership) enforces tenant isolation.

import { describe, it, expect } from "vitest";
import { buildStoragePath } from "@/lib/supabase/storage";

describe("org-scoped storage path convention", () => {
  it("places the organization_id as the first path segment", () => {
    const path = buildStoragePath(
      "org-abc",
      "customers",
      "cust-123",
      "license.jpg",
    );
    const segments = path.split("/");
    expect(segments[0]).toBe("org-abc");
    expect(segments[1]).toBe("customers");
    expect(segments[2]).toBe("cust-123");
  });

  it("sanitizes the filename but keeps the org segment intact", () => {
    const path = buildStoragePath(
      "org-xyz",
      "rentals",
      "rent-1",
      "weird name!!!.pdf",
    );
    const segments = path.split("/");
    expect(segments[0]).toBe("org-xyz");
    expect(segments[1]).toBe("rentals");
    expect(segments[2]).toBe("rent-1");
    // The filename segment should not contain the original spaces/! chars.
    expect(segments[3]).not.toContain("!!!");
  });
});