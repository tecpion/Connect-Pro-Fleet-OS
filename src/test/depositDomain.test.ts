// Connect Pro Fleet — Build #8 deposit domain helper + permission tests.

import { describe, it, expect } from "vitest";
import type { RentalDeposit } from "@/lib/depositTypes";
import {
  getDepositHeldBalance,
  getDepositCollectDue,
  getDepositRefundDue,
  isDepositCollected,
  depositBlocksCheckout,
  deriveDepositStatus,
  getDepositSettlementImpact,
} from "@/lib/deposit";
import { can } from "@/lib/permissions";
import { TENANT_ID } from "@/lib/store/ids";

const baseDeposit = (over: Partial<RentalDeposit> = {}): RentalDeposit => ({
  id: "dep_1",
  tenant_id: TENANT_ID,
  reservation_id: "res_1",
  rental_id: "rnt_1",
  customer_id: "cus_1",
  vehicle_id: "veh_1",
  policy_id: null,
  required_amount: 300,
  collected_amount: 0,
  applied_amount: 0,
  refunded_amount: 0,
  forfeited_amount: 0,
  status: "required",
  currency: "USD",
  source_snapshot: { source: "class", policy_name: "Standard Deposit" },
  collected_at: null,
  refund_due_at: null,
  completed_at: null,
  notes: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  created_by: null,
  ...over,
});

describe("Build #8 — deposit domain helpers", () => {
  it("held balance = collected − applied − refunded − forfeited", () => {
    expect(getDepositHeldBalance(baseDeposit({ collected_amount: 300 }))).toBe(
      300,
    );
    expect(
      getDepositHeldBalance(
        baseDeposit({ collected_amount: 300, applied_amount: 100 }),
      ),
    ).toBe(200);
    expect(
      getDepositHeldBalance(
        baseDeposit({
          collected_amount: 300,
          applied_amount: 100,
          refunded_amount: 150,
        }),
      ),
    ).toBe(50);
    expect(
      getDepositHeldBalance(
        baseDeposit({
          collected_amount: 300,
          applied_amount: 100,
          refunded_amount: 150,
          forfeited_amount: 50,
        }),
      ),
    ).toBe(0);
  });

  it("collect due = required − collected", () => {
    expect(getDepositCollectDue(baseDeposit({ collected_amount: 0 }))).toBe(
      300,
    );
    expect(getDepositCollectDue(baseDeposit({ collected_amount: 150 }))).toBe(
      150,
    );
    expect(getDepositCollectDue(baseDeposit({ collected_amount: 300 }))).toBe(
      0,
    );
  });

  it("refund due = collected − applied − forfeited − refunded", () => {
    expect(
      getDepositRefundDue(
        baseDeposit({ collected_amount: 300, applied_amount: 100 }),
      ),
    ).toBe(200);
    expect(
      getDepositRefundDue(
        baseDeposit({ collected_amount: 300, applied_amount: 300 }),
      ),
    ).toBe(0);
  });

  it("zero deposit does not block checkout", () => {
    expect(depositBlocksCheckout(null)).toBe(false);
    expect(depositBlocksCheckout(baseDeposit({ required_amount: 0 }))).toBe(
      false,
    );
  });

  it("uncollected deposit blocks checkout", () => {
    expect(depositBlocksCheckout(baseDeposit({ collected_amount: 0 }))).toBe(
      true,
    );
    expect(depositBlocksCheckout(baseDeposit({ collected_amount: 300 }))).toBe(
      false,
    );
  });

  it("isDepositCollected handles null and zero", () => {
    expect(isDepositCollected(null)).toBe(true);
    expect(isDepositCollected(baseDeposit({ collected_amount: 300 }))).toBe(
      true,
    );
    expect(isDepositCollected(baseDeposit({ collected_amount: 150 }))).toBe(
      false,
    );
  });

  it("derives status from amounts", () => {
    expect(deriveDepositStatus(baseDeposit({ collected_amount: 0 }))).toBe(
      "required",
    );
    expect(deriveDepositStatus(baseDeposit({ collected_amount: 150 }))).toBe(
      "pending",
    );
    expect(deriveDepositStatus(baseDeposit({ collected_amount: 300 }))).toBe(
      "held",
    );
    expect(
      deriveDepositStatus(
        baseDeposit({ collected_amount: 300, applied_amount: 100 }),
      ),
    ).toBe("partially_applied");
    expect(
      deriveDepositStatus(
        baseDeposit({ collected_amount: 300, applied_amount: 300 }),
      ),
    ).toBe("fully_applied");
    expect(
      deriveDepositStatus(
        baseDeposit({ collected_amount: 300, refunded_amount: 300 }),
      ),
    ).toBe("refunded");
    expect(
      deriveDepositStatus(
        baseDeposit({ collected_amount: 300, forfeited_amount: 300 }),
      ),
    ).toBe("forfeited");
  });

  it("settlement impact derives from deposit record", () => {
    const impact = getDepositSettlementImpact(
      baseDeposit({
        collected_amount: 300,
        applied_amount: 100,
        refunded_amount: 150,
      }),
    );
    expect(impact.collected).toBe(300);
    expect(impact.applied).toBe(100);
    expect(impact.refunded).toBe(150);
    expect(impact.held).toBe(50);
    expect(impact.refundDue).toBe(50);
  });
});

describe("Build #8 — deposit permissions", () => {
  it("owner can collect, apply, refund, forfeit, override", () => {
    const ownerRole = {
      id: "owner",
      name: "Owner",
      permissions: Object.fromEntries(
        [
          "deposits.collect",
          "deposits.apply",
          "deposits.refund",
          "deposits.forfeit",
          "rentals.override_deposit_requirement",
        ].map((k) => [k, true]),
      ),
    } as any;
    expect(can(ownerRole, null, "deposits.collect")).toBe(true);
    expect(can(ownerRole, null, "deposits.apply")).toBe(true);
    expect(can(ownerRole, null, "deposits.refund")).toBe(true);
    expect(can(ownerRole, null, "deposits.forfeit")).toBe(true);
    expect(can(ownerRole, null, "rentals.override_deposit_requirement")).toBe(
      true,
    );
  });

  it("user without deposits.refund cannot refund", () => {
    const userRole = {
      id: "user",
      name: "User",
      permissions: { "deposits.collect": true, "deposits.refund": false },
    } as any;
    expect(can(userRole, null, "deposits.collect")).toBe(true);
    expect(can(userRole, null, "deposits.refund")).toBe(false);
  });

  it("custom override can grant refund to a user", () => {
    const userRole = {
      id: "user",
      name: "User",
      permissions: { "deposits.refund": false },
    } as any;
    expect(can(userRole, { "deposits.refund": true }, "deposits.refund")).toBe(
      true,
    );
  });
});
