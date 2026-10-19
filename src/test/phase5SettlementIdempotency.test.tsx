import { it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/client", () => ({
  getBackendMode: () => "memory",
  getSupabase: () => null,
  hasSupabaseConfig: () => false,
}));
import { renderHook, act } from "@testing-library/react";
import { InvestorProvider, useInvestors } from "@/lib/investorStore";
import type { ReactNode } from "react";
const wrapper = ({ children }: { children: ReactNode }) => (
  <InvestorProvider>{children}</InvestorProvider>
);
it("Phase 5 settlement generation retry returns the original authoritative period", () => {
  const { result } = renderHook(() => useInvestors(), { wrapper });
  const input = {
    investorId: "inv_1",
    vehicleId: "veh_1",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    operatorFeePct: 0,
    transactions: [],
  };
  let first: unknown, second: unknown;
  act(() => {
    first = result.current.generateSettlement(input);
  });
  const count = result.current.settlements.length;
  act(() => {
    second = result.current.generateSettlement(input);
  });
  expect(first).toBeTruthy();
  expect(second).toBe(first);
  expect(result.current.settlements).toHaveLength(count);
});

it("Phase 5 two settlement clicks before a render cannot duplicate the cache", () => {
  const { result } = renderHook(() => useInvestors(), { wrapper });
  const input = {
    investorId: "inv_1",
    vehicleId: "veh_1",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    operatorFeePct: 0,
    transactions: [],
  };
  let first: unknown, second: unknown;
  act(() => {
    first = result.current.generateSettlement(input);
    second = result.current.generateSettlement(input);
  });
  expect(first).toBeTruthy();
  expect(second).toBe(first);
  expect(
    result.current.settlements.filter(
      (s) =>
        s.period_start === input.periodStart &&
        s.vehicle_id === input.vehicleId,
    ),
  ).toHaveLength(1);
});
