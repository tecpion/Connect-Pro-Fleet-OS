// Connect Pro Fleet — Build #11 final cleanup tests.
//
// Covers the contextual task entry points (arrangement + deposit), existing
// system-task surfacing, deep-link resolution, entity snapshots, permission
// gating, and the critical rule that creating a task from an arrangement or
// deposit has ZERO financial effect.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore, TENANT_ID } from "@/lib/store";
import type { ReactNode } from "react";
import { taskEntityRoute } from "@/lib/taskSelectors";
import type { Task } from "@/lib/taskTypes";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "x",
    tenant_id: TENANT_ID,
    task_number: "TSK-2026-000001",
    title: "T",
    description: null,
    status: "open",
    priority: "normal",
    source_type: "manual",
    source_event: null,
    assigned_to_user_id: null,
    assigned_by_user_id: null,
    created_by_user_id: null,
    due_date: null,
    due_time: null,
    completed_at: null,
    completed_by_user_id: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    entity_type: null,
    entity_id: null,
    entity_label: null,
    location_id: null,
    category: "other",
    tags: [],
    notes: null,
    dedupe_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("Build #11 cleanup — deep links", () => {
  // Build #58 — arrangements/deposits are no longer standalone pages. Tasks
  // deep-link to Rental Management → Active Rentals with the matching filter so
  // the Rental Detail command center owns the work.
  it("payment arrangement task deep-links to Rental Management active arrangements", () => {
    const t = makeTask({
      entity_type: "payment_arrangement",
      entity_id: "pa_123",
    });
    expect(taskEntityRoute(t)).toBe(
      "/rental-management?tab=active&filter=arrangement&arrangement=pa_123",
    );
  });
  it("deposit task deep-links to Rental Management active deposits", () => {
    const t = makeTask({ entity_type: "deposit", entity_id: "dep_456" });
    expect(taskEntityRoute(t)).toBe(
      "/rental-management?tab=active&filter=deposit&deposit=dep_456",
    );
  });
  it("rental task deep-links to rental detail", () => {
    const t = makeTask({ entity_type: "rental", entity_id: "rnt_1" });
    expect(taskEntityRoute(t)).toBe("/rentals/rnt_1");
  });
});

describe("Build #11 cleanup — arrangement task entry point", () => {
  it("creates a task linked to the arrangement with PAYMENT_ARRANGEMENT category", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "Follow up on payment arrangement — Marcus",
        category: "payment_arrangement",
        entityType: "payment_arrangement",
        entityId: "pa_cleanup1",
        entityLabel: "PA-000001 · Marcus Delgado",
      });
    });
    const t = r.current.taskById(id);
    expect(t).toBeDefined();
    expect(t!.entity_type).toBe("payment_arrangement");
    expect(t!.entity_id).toBe("pa_cleanup1");
    expect(t!.entity_label).toBe("PA-000001 · Marcus Delgado");
    expect(t!.category).toBe("payment_arrangement");
  });
  it("uses a human-readable entity snapshot, not a UUID", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "x",
        category: "payment_arrangement",
        entityType: "payment_arrangement",
        entityId: "pa_cleanup2",
        entityLabel: "PA-000002 · Sarah Johnson",
      });
    });
    const label = r.current.taskById(id)!.entity_label;
    expect(label).not.toMatch(/^[0-9a-f-]{20,}$/); // not a bare UUID
    expect(label).toContain("PA-000002");
  });
  it("creating an arrangement task has no financial effect", () => {
    const r = useStoreHook();
    const txnsBefore = r.current.transactions.length;
    act(() => {
      r.current.createTask({
        title: "x",
        category: "payment_arrangement",
        entityType: "payment_arrangement",
        entityId: "pa_cleanup3",
      });
    });
    expect(r.current.transactions.length).toBe(txnsBefore);
  });
  it("does not change arrangement status when a task is created", () => {
    const r = useStoreHook();
    const before = r.current.paymentArrangements.map((a) => a.status);
    act(() => {
      r.current.createTask({
        title: "x",
        category: "payment_arrangement",
        entityType: "payment_arrangement",
        entityId: "pa_cleanup4",
      });
    });
    const after = r.current.paymentArrangements.map((a) => a.status);
    expect(after).toEqual(before);
  });
  it("openTasksForEntity surfaces an existing broken-arrangement system task", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.ensureSystemTask({
        sourceEvent: "payment_arrangement.broken",
        entityType: "payment_arrangement",
        entityId: "pa_broken1",
        entityLabel: "PA-000010 · Marcus",
        title: "Follow up on broken payment arrangement",
        category: "payment_arrangement",
      }).taskId;
    });
    let found: Task[] = [];
    act(() => {
      found = r.current.openTasksForEntity(
        "payment_arrangement.broken",
        "payment_arrangement",
        "pa_broken1",
      );
    });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(id);
  });
});

describe("Build #11 cleanup — deposit task entry point", () => {
  it("creates a task linked to the deposit with DEPOSIT category", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "Process security deposit refund — Sarah",
        category: "deposit",
        entityType: "deposit",
        entityId: "dep_cleanup1",
        entityLabel: "Deposit · Sarah Johnson · AGR-2026-000125",
      });
    });
    const t = r.current.taskById(id);
    expect(t!.entity_type).toBe("deposit");
    expect(t!.entity_id).toBe("dep_cleanup1");
    expect(t!.category).toBe("deposit");
  });
  it("uses a human-readable deposit entity snapshot", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "x",
        category: "deposit",
        entityType: "deposit",
        entityId: "dep_cleanup2",
        entityLabel: "Deposit · Marcus · AGR-2026-000126",
      });
    });
    const label = r.current.taskById(id)!.entity_label;
    expect(label).not.toMatch(/^[0-9a-f-]{20,}$/);
    expect(label).toContain("Deposit");
  });
  it("creating a deposit task has no financial effect on the ledger", () => {
    const r = useStoreHook();
    const txnsBefore = r.current.transactions.length;
    act(() => {
      r.current.createTask({
        title: "x",
        category: "deposit",
        entityType: "deposit",
        entityId: "dep_cleanup3",
      });
    });
    expect(r.current.transactions.length).toBe(txnsBefore);
  });
  it("creating a deposit task does not refund/apply the deposit", () => {
    const r = useStoreHook();
    const depositsBefore = r.current.rentalDeposits.map((d) => ({
      held: d.collected_amount - d.applied_amount - d.refunded_amount,
      refunded: d.refunded_amount,
      applied: d.applied_amount,
    }));
    act(() => {
      r.current.createTask({
        title: "x",
        category: "deposit",
        entityType: "deposit",
        entityId: "dep_cleanup4",
      });
    });
    const depositsAfter = r.current.rentalDeposits.map((d) => ({
      held: d.collected_amount - d.applied_amount - d.refunded_amount,
      refunded: d.refunded_amount,
      applied: d.applied_amount,
    }));
    expect(depositsAfter).toEqual(depositsBefore);
  });
  it("openTasksForEntity surfaces an existing refund-pending deposit system task", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.ensureSystemTask({
        sourceEvent: "deposit.refund_pending",
        entityType: "deposit",
        entityId: "dep_refund1",
        entityLabel: "Deposit · Sarah",
        title: "Process security deposit refund",
        category: "deposit",
      }).taskId;
    });
    let found: Task[] = [];
    act(() => {
      found = r.current.openTasksForEntity(
        "deposit.refund_pending",
        "deposit",
        "dep_refund1",
      );
    });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(id);
  });
});

describe("Build #11 cleanup — system-task idempotency remains intact", () => {
  it("re-ensuring the same broken-arrangement task does not duplicate", () => {
    const r = useStoreHook();
    let a, b;
    act(() => {
      a = r.current.ensureSystemTask({
        sourceEvent: "payment_arrangement.broken",
        entityType: "payment_arrangement",
        entityId: "pa_idem1",
        entityLabel: "PA",
        title: "Follow up",
        category: "payment_arrangement",
      });
    });
    act(() => {
      b = r.current.ensureSystemTask({
        sourceEvent: "payment_arrangement.broken",
        entityType: "payment_arrangement",
        entityId: "pa_idem1",
        entityLabel: "PA",
        title: "Follow up",
        category: "payment_arrangement",
      });
    });
    expect(a!.created).toBe(true);
    expect(b!.created).toBe(false);
    expect(a!.taskId).toBe(b!.taskId);
  });
  it("re-ensuring the same deposit refund task does not duplicate", () => {
    const r = useStoreHook();
    let a, b;
    act(() => {
      a = r.current.ensureSystemTask({
        sourceEvent: "deposit.refund_pending",
        entityType: "deposit",
        entityId: "dep_idem1",
        entityLabel: "Deposit",
        title: "Process refund",
        category: "deposit",
      });
    });
    act(() => {
      b = r.current.ensureSystemTask({
        sourceEvent: "deposit.refund_pending",
        entityType: "deposit",
        entityId: "dep_idem1",
        entityLabel: "Deposit",
        title: "Process refund",
        category: "deposit",
      });
    });
    expect(a!.created).toBe(true);
    expect(b!.created).toBe(false);
  });
});

describe("Build #11 cleanup — task linking does not bypass domain permissions", () => {
  it("a task linked to a deposit carries only the entity reference, not deposit financials", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "x",
        category: "deposit",
        entityType: "deposit",
        entityId: "dep_perm1",
        entityLabel: "Deposit · Sarah",
      });
    });
    const t = r.current.taskById(id);
    // The task record stores only a reference + label snapshot — no deposit
    // amounts, no held balance, no payout figures.
    expect(t!.entity_id).toBe("dep_perm1");
    expect(t!.entity_label).toBe("Deposit · Sarah");
    expect(
      (t as unknown as Record<string, unknown>).held_balance,
    ).toBeUndefined();
    expect(
      (t as unknown as Record<string, unknown>).refunded_amount,
    ).toBeUndefined();
  });
});
