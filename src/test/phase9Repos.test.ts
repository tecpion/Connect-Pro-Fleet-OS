// Phase 9B — repository registration + query scoping + idempotency tests.

import { describe, it, expect, vi } from "vitest";
import type { RentalEvent } from "@/lib/types";
import type { Invoice } from "@/lib/invoiceTypes";
import type {
  PaymentArrangement,
  ArrangementEvent,
} from "@/lib/paymentArrangementTypes";
import type { ActivityEntry } from "@/lib/store/storeContext";

vi.mock("@/lib/supabase/client", () => {
  let db: object | null = null;
  return {
    getSupabase: () => db,
    getBackendMode: () => (db ? "supabase" : "memory"),
    __setDb: (v: object | null) => {
      db = v;
    },
  };
});

const ORG = "org-a-123";

function makeMockChain() {
  const calls: Record<string, { eq: [string, unknown][] }> = {};
  const select = vi.fn(() => chain);
  // Capture the last inserted row so single() can echo it back (the real
  // adapter does .insert(row).select().single()).
  let lastInserted: unknown = null;
  const insert = vi.fn((row: unknown) => {
    lastInserted = row;
    return chain;
  });
  const update = vi.fn(() => chain);
  const del = vi.fn(() => chain);
  const single = vi.fn(() => ({ data: lastInserted, error: null }));
  const maybeSingle = vi.fn(() => ({ data: lastInserted, error: null }));
  const order = vi.fn(() => chain);
  const limit = vi.fn(() => chain);
  let curTable = "";
  const eq = vi.fn((col: string, val: unknown) => {
    calls[curTable] = calls[curTable] || { eq: [] };
    calls[curTable].eq.push([col, val]);
    return chain;
  });
  const chain: Record<string, unknown> = {
    select,
    insert,
    update,
    delete: del,
    single,
    maybeSingle,
    order,
    limit,
    eq,
  };
  const from = vi.fn((table: string) => {
    curTable = table;
    lastInserted = null;
    return chain;
  });
  return { from, calls };
}

describe("repository factory registration — Phase 9", () => {
  it("memory mode returns all Phase 9 repos as null", async () => {
    const mod = await import("@/lib/supabase/client");
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb(null);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    expect(r.rentalEvents).toBeNull();
    expect(r.invoices).toBeNull();
    expect(r.receipts).toBeNull();
    expect(r.paymentArrangements).toBeNull();
    expect(r.agreements).toBeNull();
    expect(r.activityAudit).toBeNull();
  });

  it("supabase mode returns real Phase 9 repos that scope by organization_id", async () => {
    const mod = await import("@/lib/supabase/client");
    const { from, calls } = makeMockChain();
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    expect(r.rentalEvents).not.toBeNull();
    expect(r.invoices).not.toBeNull();
    expect(r.receipts).not.toBeNull();
    expect(r.paymentArrangements).not.toBeNull();
    expect(r.agreements).not.toBeNull();
    expect(r.activityAudit).not.toBeNull();

    await r.rentalEvents!.listAll(ORG);
    await r.invoices!.list(ORG);
    await r.receipts!.list(ORG);
    await r.paymentArrangements!.list(ORG);
    await r.agreements!.listTemplates(ORG);
    await r.agreements!.listMasterAgreements(ORG);
    await r.agreements!.listInstances(ORG);
    await r.activityAudit!.list(ORG);

    for (const table of [
      "rental_events",
      "invoices",
      "receipts",
      "payment_arrangements",
      "agreement_templates",
      "master_agreements",
      "agreement_instances",
      "activity_log",
    ]) {
      expect(calls[table]?.eq).toContainEqual(["organization_id", ORG]);
    }
  });

  it("payment arrangements repo scopes installments + events by org + arrangement", async () => {
    const mod = await import("@/lib/supabase/client");
    const { from, calls } = makeMockChain();
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.paymentArrangements!.listInstallments(ORG, "pa-1");
    await r.paymentArrangements!.listEvents(ORG, "pa-1");
    expect(calls["payment_arrangement_installments"]?.eq).toContainEqual([
      "organization_id",
      ORG,
    ]);
    expect(calls["payment_arrangement_installments"]?.eq).toContainEqual([
      "arrangement_id",
      "pa-1",
    ]);
    expect(calls["payment_arrangement_events"]?.eq).toContainEqual([
      "organization_id",
      ORG,
    ]);
    expect(calls["payment_arrangement_events"]?.eq).toContainEqual([
      "arrangement_id",
      "pa-1",
    ]);
  });

  it("rental events insert routes through the rental_events table", async () => {
    const mod = await import("@/lib/supabase/client");
    const { from } = makeMockChain();
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    const e: RentalEvent = {
      id: "re-1",
      rental_id: "rental-1",
      type: "created",
      label: "Created",
      at: "2026-01-01T00:00:00Z",
      tone: "neutral",
      staff_id: null,
    };
    await r.rentalEvents!.insert(ORG, e);
    const insertCall = (
      from as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => c[0] === "rental_events");
    expect(insertCall).toBeTruthy();
  });

  it("activity audit insert routes through the activity_log table", async () => {
    const mod = await import("@/lib/supabase/client");
    const { from } = makeMockChain();
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    const e: ActivityEntry = {
      id: "act-1",
      at: "2026-01-01T00:00:00Z",
      label: "Done",
      tone: "neutral",
    };
    await r.activityAudit!.insert(ORG, e, "staff-9");
    const insertCall = (
      from as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => c[0] === "activity_log");
    expect(insertCall).toBeTruthy();
  });
});

describe("Phase 9 repos — idempotency / unique conflicts", () => {
  function conflictChain() {
    const chain = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      single: vi.fn(() => ({
        data: null,
        error: {
          code: "23505",
          message: "duplicate key violates unique constraint",
        },
      })),
      maybeSingle: vi.fn(() => ({ data: null, error: null })),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      eq: vi.fn(() => chain),
    };
    return chain;
  }

  it("invoice insert with a duplicate invoice_number surfaces a conflict error", async () => {
    const mod = await import("@/lib/supabase/client");
    const chain = conflictChain();
    const from = vi.fn(() => chain);
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    const i: Invoice = {
      id: "inv-1",
      tenant_id: ORG,
      invoice_number: "INV-001",
      customer_id: "c-1",
      rental_id: null,
      reservation_id: null,
      billing_period_start: null,
      billing_period_end: null,
      issue_date: "2026-01-01",
      due_date: "2026-01-15",
      status: "open",
      line_items: [],
      subtotal: 100,
      tax: 0,
      total: 100,
      amount_paid: 0,
      balance_due: 100,
      notes: null,
      created_at: "x",
      created_by: null,
    };
    await expect(r.invoices!.insert(i)).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("arrangement insert with a duplicate arrangement_number surfaces a conflict error", async () => {
    const mod = await import("@/lib/supabase/client");
    const chain = conflictChain();
    const from = vi.fn(() => chain);
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    const a: PaymentArrangement = {
      id: "pa-1",
      tenant_id: ORG,
      arrangement_number: "PA-000123",
      customer_id: "c-1",
      rental_id: null,
      invoice_id: null,
      billing_period_ids: [],
      original_outstanding_amount: 100,
      arrangement_amount: 100,
      status: "active",
      start_date: "2026-01-01",
      grace_period_days: 0,
      terms_summary: "x",
      reason: null,
      created_by: null,
      created_at: "x",
      updated_at: "x",
      completed_at: null,
      broken_at: null,
      cancelled_at: null,
    };
    await expect(r.paymentArrangements!.insert(a)).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("arrangement event insert routes through payment_arrangement_events", async () => {
    const mod = await import("@/lib/supabase/client");
    const { from } = makeMockChain();
    (mod as unknown as { __setDb: (v: object | null) => void }).__setDb({
      from,
    });
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    const e: ArrangementEvent = {
      id: "ae-1",
      tenant_id: ORG,
      arrangement_id: "pa-1",
      type: "created",
      label: "Created",
      at: "2026-01-01T00:00:00Z",
      staff_id: null,
    };
    await r.paymentArrangements!.insertEvent(e);
    const insertCall = (
      from as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => c[0] === "payment_arrangement_events");
    expect(insertCall).toBeTruthy();
  });
});
