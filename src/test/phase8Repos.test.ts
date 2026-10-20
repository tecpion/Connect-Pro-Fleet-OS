// Phase 8B — repository registration + query scoping tests.
//
// Verifies the repository factory registers the Phase 8 adapters: memory mode
// returns nulls (demo stays intact), a stubbed supabase client yields real
// repositories that scope every query by organization_id, and Phase 1-7 repos
// do not regress.

import { describe, it, expect, vi } from "vitest";

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

function makeMockChain() {
  const calls: Record<string, { eq: [string, unknown][] }> = {};
  const select = vi.fn(() => chain);
  const insert = vi.fn(() => chain);
  const update = vi.fn(() => chain);
  const del = vi.fn(() => chain);
  const single = vi.fn(() => ({ data: lastData, error: null }));
  const maybeSingle = vi.fn(() => ({ data: lastData, error: null }));
  const order = vi.fn(() => chain);
  let lastData: unknown = null;
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
    eq,
  };
  const from = vi.fn((table: string) => {
    curTable = table;
    return chain;
  });
  return { from, calls };
}

describe("repository factory registration", () => {
  it("memory mode returns all Phase 8 repos as null", async () => {
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    expect(r.locations).toBeNull();
    expect(r.staffAssignments).toBeNull();
    expect(r.tasks).toBeNull();
    expect(r.notifications).toBeNull();
    expect(r.companySettings).toBeNull();
    expect(r.vehicleClasses).toBeNull();
    expect(r.addons).toBeNull();
    // Phase 1-7 repos must not regress.
    expect(r.customers).toBeNull();
    expect(r.maintenance).toBeNull();
  });

  it("supabase mode returns real Phase 8 repositories (non-null)", async () => {
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(makeMockChain());
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    expect(r.locations).not.toBeNull();
    expect(r.staffAssignments).not.toBeNull();
    expect(r.tasks).not.toBeNull();
    expect(r.notifications).not.toBeNull();
    expect(r.companySettings).not.toBeNull();
    expect(r.vehicleClasses).not.toBeNull();
    expect(r.addons).not.toBeNull();
    clientMod.__setDb(null);
  });

  it("locations repo list() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.locations!.list("org-A");
    const locCalls = mock.calls["locations"];
    expect(locCalls).toBeDefined();
    expect(locCalls.eq).toContainEqual(["organization_id", "org-A"]);
    clientMod.__setDb(null);
  });

  it("staff repo listStaff() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.staffAssignments!.listStaff("org-B");
    expect(mock.calls["staff"].eq).toContainEqual(["organization_id", "org-B"]);
    clientMod.__setDb(null);
  });

  it("tasks repo list() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.tasks!.list("org-A");
    expect(mock.calls["tasks"].eq).toContainEqual(["organization_id", "org-A"]);
    clientMod.__setDb(null);
  });

  it("notifications repo list() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.notifications!.list("org-A");
    expect(mock.calls["notifications"].eq).toContainEqual([
      "organization_id",
      "org-A",
    ]);
    clientMod.__setDb(null);
  });

  it("vehicle classes repo list() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.vehicleClasses!.list("org-A");
    expect(mock.calls["vehicle_classes"].eq).toContainEqual([
      "organization_id",
      "org-A",
    ]);
    clientMod.__setDb(null);
  });

  it("addons repo listCategories() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.addons!.listCategories("org-A");
    expect(mock.calls["addon_categories"].eq).toContainEqual([
      "organization_id",
      "org-A",
    ]);
    clientMod.__setDb(null);
  });

  it("company settings repo returns null when no row exists", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    const got = await r.companySettings!.get("org-A");
    expect(got).toBeNull();
    clientMod.__setDb(null);
  });

  it("drivers repo listDrivers() scopes by organization_id", async () => {
    const mock = makeMockChain();
    const clientMod = (await import("@/lib/supabase/client")) as unknown as {
      __setDb: (v: object | null) => void;
    };
    clientMod.__setDb(mock);
    const { createRepositories } = await import("@/lib/supabase/repository");
    const r = createRepositories();
    await r.staffAssignments!.listDrivers("org-A");
    expect(mock.calls["drivers"].eq).toContainEqual([
      "organization_id",
      "org-A",
    ]);
    clientMod.__setDb(null);
  });
});
