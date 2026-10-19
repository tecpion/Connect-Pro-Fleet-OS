import { it, expect } from "vitest";
import { buildStoragePath } from "@/lib/supabase/storage";
import { expenseReceiptToRow } from "@/lib/supabase/phase5Mappers";
it.each(["expenses", "settlements"])(
  "Phase 5 %s private document paths retain the authenticated organization prefix",
  (kind) => {
    const a = buildStoragePath("org-a", kind, "record-a", "../../private.pdf");
    const b = buildStoragePath("org-b", kind, "record-b", "private.pdf");
    expect(a.split("/").slice(0, 3)).toEqual(["org-a", kind, "record-a"]);
    expect(b.startsWith("org-a/")).toBe(false);
    expect(a).not.toContain("/../");
  },
);
it("Phase 5 receipt metadata includes ownership required by storage RLS", () => {
  const row = expenseReceiptToRow({
    id: "receipt-a",
    tenant_id: "org-a",
    expense_id: "expense-a",
    file_name: "private.pdf",
    file_url: "org-a/expenses/expense-a/private.pdf",
    mime_type: "application/pdf",
    uploaded_by: null,
    uploaded_at: "2026-08-01",
    note: null,
    voided_at: null,
  });
  expect(row.organization_id).toBe("org-a");
  expect(row.storage_path).toBe("org-a/expenses/expense-a/private.pdf");
});

import { verifyPhase5PrivateDocument } from "@/lib/auth/phase5-e2e-isolation";
function storageClient(owner: boolean, leak = false, missingOwner = false) {
  return {
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        download: async () =>
          (owner && !missingOwner) || leak
            ? { data: new Blob(["private"]), error: null }
            : { data: null, error: { statusCode: "403", message: "Denied" } },
        createSignedUrl: async () =>
          (owner && !missingOwner) || leak
            ? {
                data: { signedUrl: "https://private.test/signed" },
                error: null,
              }
            : { data: null, error: { statusCode: "403", message: "Denied" } },
      }),
    },
  } as never;
}
it("Phase 5 private-document verifier accepts owner control plus denied foreign access", async () => {
  expect(
    await verifyPhase5PrivateDocument(
      storageClient(true),
      storageClient(false),
      "expense-receipts",
      "org-a/receipt.pdf",
    ),
  ).toBe(true);
});
it("Phase 5 private-document verifier rejects foreign download/signed URL leaks", async () => {
  expect(
    await verifyPhase5PrivateDocument(
      storageClient(true),
      storageClient(false, true),
      "rental-agreements",
      "org-a/payout.pdf",
    ),
  ).toBe(false);
});
it("Phase 5 missing owner object cannot be mistaken for isolation success", async () => {
  expect(
    await verifyPhase5PrivateDocument(
      storageClient(true, false, true),
      storageClient(false),
      "expense-receipts",
      "org-a/missing.pdf",
    ),
  ).toBe(false);
});

it("Phase 5 network failure cannot masquerade as private-document denial", async () => {
  const foreign = {
    storage: {
      from: () => ({
        download: async () => ({
          data: null,
          error: new Error("fetch failed"),
        }),
        createSignedUrl: async () => ({
          data: null,
          error: new Error("fetch failed"),
        }),
      }),
    },
  } as never;
  expect(
    await verifyPhase5PrivateDocument(
      storageClient(true),
      foreign,
      "expense-receipts",
      "org-a/receipt.pdf",
    ),
  ).toBe(false);
});
