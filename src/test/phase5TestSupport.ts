// A recording PostgREST transport for adapter contracts, not a simulation of RLS.
// Real tenant/storage enforcement is asserted only by /api/phase5-e2e.
import { vi } from "vitest";
export function recordingDb(
  rows: Record<string, unknown>[] = [],
  error: unknown = null,
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "order",
        "insert",
        "update",
        "delete",
      ]) {
        q[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return q;
        };
      }
      q.single = async () => ({ data: rows[0] ?? null, error });
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error });
      q.then = (resolve: (r: unknown) => unknown) =>
        Promise.resolve({ data: rows, error }).then(resolve);
      return q;
    },
  };
  return { db: db as never, calls };
}
export function setters() {
  const state: Record<string, unknown[]> = {};
  const handles = new Proxy(
    {},
    {
      get: (_, name) =>
        vi.fn((update: (prev: unknown[]) => unknown[]) => {
          state[String(name)] = update([{ stale: true }]);
        }),
    },
  );
  return { handles, state };
}
