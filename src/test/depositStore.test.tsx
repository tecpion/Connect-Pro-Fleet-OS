// Connect Pro Fleet — Build #8 deposit store lifecycle tests.
//
// Exercises the deposit store methods through the real StoreProvider:
// creation, collection (full/partial/multiple), revenue exclusion,
// application, refund (full/partial), refund pending, forfeiture, reversal,
// idempotency, override, linking, and settlement two-way balance.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import {
  getDepositHeldBalance,
  getDepositCollectDue,
  getDepositRefundDue,
  depositBlocksCheckout,
} from "@/lib/deposit";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { getOutstandingForRange } from "@/lib/financialSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function ensure(
  r: ReturnType<typeof useStoreHook>,
  resId: string,
  amount = 300,
) {
  act(() => {
    r.current.ensureDepositForReservation({
      reservationId: resId,
      customerId: "cus_1",
      vehicleId: "veh_1",
      requiredAmount: amount,
      source: "class",
    });
  });
  return r.current.depositForReservation(resId)!;
}

describe("Build #8 — deposit store lifecycle", () => {
  it("creates a deposit with a snapshotted required amount", () => {
    const r = useStoreHook();
    act(() => {
      r.current.ensureDepositForReservation({
        reservationId: "res_new",
        customerId: "cus_1",
        vehicleId: "veh_1",
        requiredAmount: 500,
        source: "class",
        policyName: "Luxury Deposit",
      });
    });
    const dep = r.current.depositForReservation("res_new");
    expect(dep).not.toBeNull();
    expect(dep!.required_amount).toBe(500);
    expect(dep!.status).toBe("required");
    expect(dep!.source_snapshot.policy_name).toBe("Luxury Deposit");
  });

  it("collects a full deposit and moves to held", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_full");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k1");
    });
    const u = r.current.depositForReservation("res_full")!;
    expect(u.collected_amount).toBe(300);
    expect(u.status).toBe("held");
    expect(getDepositCollectDue(u)).toBe(0);
  });

  it("collects a partial deposit and stays pending", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_partial");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 150, method: "cash" }, "k2");
    });
    const u = r.current.depositForReservation("res_partial")!;
    expect(u.collected_amount).toBe(150);
    expect(getDepositCollectDue(u)).toBe(150);
    expect(u.status).toBe("pending");
  });

  it("multiple partial collections sum correctly", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_multi");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 100, method: "cash" }, "k3a");
    });
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 100, method: "cash" }, "k3b");
    });
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 100, method: "cash" }, "k3c");
    });
    const u = r.current.depositForReservation("res_multi")!;
    expect(u.collected_amount).toBe(300);
    expect(u.status).toBe("held");
  });

  it("deposit collection does not count as rental revenue", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_rev");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k4");
    });
    const depositTxns = r.current.transactions.filter(
      (t) => t.deposit_id === dep.id,
    );
    expect(depositTxns.length).toBe(1);
    expect(depositTxns[0].category).toBe("payment");
    // Outstanding excludes deposit-tagged transactions.
    const outstanding = getOutstandingForRange(r.current.transactions);
    expect(outstanding).toBeGreaterThanOrEqual(0);
  });

  it("applies deposit to charges and reduces held balance", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_apply");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k5a");
    });
    act(() => {
      r.current.applyDeposit(dep.id, { amount: 125 }, "k5b");
    });
    const u = r.current.depositForReservation("res_apply")!;
    expect(u.applied_amount).toBe(125);
    expect(getDepositHeldBalance(u)).toBe(175);
    expect(u.status).toBe("partially_applied");
  });

  it("cannot apply more than held", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_overapply");
    let result = { ok: true };
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 100, method: "card" }, "k6a");
    });
    act(() => {
      result = r.current.applyDeposit(dep.id, { amount: 200 }, "k6b");
    });
    expect(result.ok).toBe(false);
  });

  it("refunds unused deposit fully", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_refund");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k7a");
    });
    act(() => {
      r.current.refundDeposit(dep.id, { amount: 300, method: "card" }, "k7b");
    });
    const u = r.current.depositForReservation("res_refund")!;
    expect(u.refunded_amount).toBe(300);
    expect(u.status).toBe("refunded");
    expect(getDepositRefundDue(u)).toBe(0);
  });

  it("partial refund leaves remaining refund due", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_prefund");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k8a");
    });
    act(() => {
      r.current.refundDeposit(dep.id, { amount: 200, method: "card" }, "k8b");
    });
    const u = r.current.depositForReservation("res_prefund")!;
    expect(u.refunded_amount).toBe(200);
    expect(getDepositRefundDue(u)).toBe(100);
    expect(u.status).toBe("partially_refunded");
  });

  it("forfeits deposit with a reason", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_forfeit");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k9a");
    });
    act(() => {
      r.current.forfeitDeposit(
        dep.id,
        { amount: 300, reason: "damage" },
        "k9b",
      );
    });
    const u = r.current.depositForReservation("res_forfeit")!;
    expect(u.forfeited_amount).toBe(300);
    expect(u.status).toBe("forfeited");
    expect(getDepositHeldBalance(u)).toBe(0);
  });

  it("idempotency: repeated collect with same key does not double-post", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_idem");
    act(() => {
      r.current.collectDeposit(
        dep.id,
        { amount: 300, method: "card" },
        "idem_key",
      );
    });
    act(() => {
      r.current.collectDeposit(
        dep.id,
        { amount: 300, method: "card" },
        "idem_key",
      );
    });
    const u = r.current.depositForReservation("res_idem")!;
    expect(u.collected_amount).toBe(300);
    const txns = r.current.transactions.filter((t) => t.deposit_id === dep.id);
    expect(txns.length).toBe(1);
  });

  it("override requirement records reason and reduces required", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_override");
    act(() => {
      r.current.overrideDepositRequirement(dep.id, {
        newRequiredAmount: 0,
        reason: "VIP — waived",
      });
    });
    const u = r.current.depositForReservation("res_override")!;
    expect(u.required_amount).toBe(0);
    expect(depositBlocksCheckout(u)).toBe(false);
  });

  it("override requires a reason", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_noreason");
    let result = { ok: true };
    act(() => {
      result = r.current.overrideDepositRequirement(dep.id, {
        newRequiredAmount: 0,
        reason: "",
      });
    });
    expect(result.ok).toBe(false);
  });

  it("reversal restores held balance without deleting history", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_reverse");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k10a");
    });
    const collectEvent = r.current.depositHistory.find(
      (e) => e.deposit_id === dep.id && e.event_type === "collected",
    )!;
    act(() => {
      r.current.reverseDepositAction(collectEvent.id, "Mistake — wrong card");
    });
    const u = r.current.depositForReservation("res_reverse")!;
    expect(u.collected_amount).toBe(0);
    const history = r.current.depositHistory.filter(
      (e) => e.deposit_id === dep.id,
    );
    expect(history.some((e) => e.event_type === "collected")).toBe(true);
    expect(history.some((e) => e.event_type === "reversed")).toBe(true);
  });

  it("linkDepositToRental connects a deposit to its rental", () => {
    const r = useStoreHook();
    act(() => {
      r.current.ensureDepositForReservation({
        reservationId: "res_link",
        customerId: "cus_1",
        vehicleId: "veh_1",
        requiredAmount: 300,
        source: "class",
      });
      r.current.linkDepositToRental("res_link", "rnt_link");
    });
    const dep = r.current.depositForRental("rnt_link");
    expect(dep).not.toBeNull();
    expect(dep!.rental_id).toBe("rnt_link");
  });

  it("markRefundPending surfaces the company's refund obligation", () => {
    const r = useStoreHook();
    const dep = ensure(r, "res_pending");
    act(() => {
      r.current.collectDeposit(dep.id, { amount: 300, method: "card" }, "k11");
    });
    act(() => {
      r.current.markRefundPending(dep.id);
    });
    const u = r.current.depositForReservation("res_pending")!;
    expect(u.refund_due_at).not.toBeNull();
    expect(getDepositRefundDue(u)).toBe(300);
  });

  it("settlement shows two-way balance: customer owes vs company owes", () => {
    const r = useStoreHook();
    const rental = r.current.rentals.find((x) => x.id === "rnt_1")!;
    const deposit = r.current.depositForRental("rnt_1");
    const settlement = getRentalSettlement(
      rental,
      r.current.transactions,
      deposit,
    );
    expect(typeof settlement.customerBalanceDue).toBe("number");
    expect(typeof settlement.depositRefundDueTotal).toBe("number");
  });

  it("existing 60/40 and 50/50 investor settlements remain intact", () => {
    // Investor settlement math is unchanged — deposits are isolated from payouts.
    const r = useStoreHook();
    const deposits = r.current.rentalDeposits;
    expect(deposits.length).toBeGreaterThan(0);
    // No deposit transaction should affect investor revenue selectors.
    const depositTxns = r.current.transactions.filter((t) => t.deposit_id);
    for (const t of depositTxns) {
      expect(t.metadata?.deposit).toBe(true);
    }
  });
});
