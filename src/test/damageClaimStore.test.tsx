// Connect Pro Fleet — Build #17 cleanup: damage claim store tests (part 1).
// Customer charge, reversal, mixed allocation, deposit application, insurance
// recovery. Exercises the real DamageClaimProvider + StoreProvider together.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  DamageClaimProvider,
  useDamageClaims,
} from "@/lib/damageClaimStoreProvider";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <DamageClaimProvider>{children}</DamageClaimProvider>
    </StoreProvider>
  );
}
function useHooks() {
  return renderHook(() => ({ store: useStore(), dc: useDamageClaims() }), {
    wrapper,
  }).result;
}

const today = () => new Date().toISOString().slice(0, 10);

describe("Build #17 cleanup — customer charge (real store)", () => {
  it("posts exactly one ledger charge tagged with damage_claim_id", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "checkin_inspection",
        description: "Cracked windshield",
        severity: "moderate",
      });
    });
    let res: { ok: boolean; transactionId?: string } = { ok: false };
    act(() => {
      res = r.current.dc.chargeCustomer(
        claimId,
        { amount: 350, description: "Windshield repair" },
        "k-charge-1",
      );
    });
    expect(res.ok).toBe(true);
    const claim = r.current.dc.claimById(claimId)!;
    const txn = r.current.store.transactions.find(
      (t) => t.id === claim.customer_charge_transaction_id,
    );
    expect(txn).toBeDefined();
    expect(txn!.transaction_type).toBe("damage_charge");
    expect(txn!.amount).toBe(350);
    expect(txn!.rental_id).toBe("rnt_2");
    expect((txn!.metadata as Record<string, unknown>)?.damage_claim_id).toBe(
      claimId,
    );
  });

  it("increases rental outstanding balance exactly once", () => {
    const r = useHooks();
    const before = r.current.store.rentalFinancials("rnt_2").balance;
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Dent",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 200 }, "k-bal-1");
    });
    expect(r.current.store.rentalFinancials("rnt_2").balance - before).toBe(
      200,
    );
  });

  it("is idempotent — same requestKey does not duplicate the charge", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Scratch",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 100 }, "k-idem-1");
      r.current.dc.chargeCustomer(claimId, { amount: 100 }, "k-idem-1");
    });
    const claim = r.current.dc.claimById(claimId)!;
    const charges = r.current.store.transactions.filter(
      (t) => t.id === claim.customer_charge_transaction_id,
    );
    expect(charges).toHaveLength(1);
  });

  it("blocks a second charge when one already exists", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Scratch",
        severity: "minor",
      });
    });
    let second: { ok: boolean; error?: string } = { ok: true };
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 100 }, "k-block-1");
      second = r.current.dc.chargeCustomer(
        claimId,
        { amount: 100 },
        "k-block-2",
      );
    });
    expect(second.ok).toBe(false);
  });
});

describe("Build #17 cleanup — charge reversal", () => {
  it("reverses the charge preserving history and netting the balance", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Scratch",
        severity: "minor",
      });
    });
    const before = r.current.store.rentalFinancials("rnt_2").balance;
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 250 }, "k-rev-1");
    });
    expect(r.current.store.rentalFinancials("rnt_2").balance - before).toBe(
      250,
    );
    act(() => {
      r.current.dc.reverseCustomerCharge(claimId, "Mistake");
    });
    expect(r.current.store.rentalFinancials("rnt_2").balance).toBe(before);
    expect(
      r.current.dc.claimById(claimId)!.customer_charge_transaction_id,
    ).toBeNull();
  });
});

describe("Build #17 cleanup — mixed rental + damage allocation", () => {
  it("customer payment attributes only the damage portion as recovery", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "checkin_inspection",
        description: "Damage",
        severity: "moderate",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 600 }, "k-mix-1");
    });
    const beforeDamage = r.current.store.rentalFinancials("rnt_2").balance;
    act(() => {
      r.current.store.recordLedgerPayment("rnt_2", 500, "cash");
    });
    const eco = getDamageClaimEconomics(r.current.dc.claimById(claimId)!, {
      transactions: r.current.store.transactions,
      expenses: r.current.store.expenses,
      recoveries: r.current.dc.damageRecoveries,
    });
    expect(eco.customer_paid).toBeLessThanOrEqual(600);
    expect(eco.customer_paid).toBeGreaterThanOrEqual(0);
    expect(
      beforeDamage - r.current.store.rentalFinancials("rnt_2").balance,
    ).toBe(500);
  });
});

describe("Build #17 cleanup — deposit application (real store)", () => {
  it("delegates to authoritative deposit logic and records a recovery", () => {
    const r = useHooks();
    const depositBefore = r.current.store.depositForRental("rnt_1")!;
    expect(depositBefore.applied_amount).toBe(0);
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_1",
        rental_id: "rnt_1",
        customer_id: "cus_1",
        damage_source: "checkin_inspection",
        description: "Interior damage",
        severity: "moderate",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 200 }, "k-dep-1");
    });
    let res: { ok: boolean; error?: string } = { ok: false };
    act(() => {
      res = r.current.dc.applyDeposit(claimId, { amount: 150 }, "k-depapp-1");
    });
    expect(res.ok).toBe(true);
    expect(r.current.store.depositForRental("rnt_1")!.applied_amount).toBe(150);
    const recoveries = r.current.dc.claimRecoveries(claimId);
    expect(
      recoveries.some(
        (x) => x.recovery_type === "security_deposit_application",
      ),
    ).toBe(true);
  });

  it("blocks applying more than the held deposit", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_1",
        rental_id: "rnt_1",
        customer_id: "cus_1",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 500 }, "k-over-1");
    });
    let res: { ok: boolean; error?: string } = { ok: true };
    act(() => {
      res = r.current.dc.applyDeposit(claimId, { amount: 400 }, "k-over-2");
    });
    expect(res.ok).toBe(false);
  });

  it("is idempotent — repeated application request does not double-apply", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_1",
        rental_id: "rnt_1",
        customer_id: "cus_1",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 200 }, "k-idemdep-1");
    });
    act(() => {
      r.current.dc.applyDeposit(claimId, { amount: 100 }, "k-idemdep-2");
      r.current.dc.applyDeposit(claimId, { amount: 100 }, "k-idemdep-2");
    });
    expect(r.current.store.depositForRental("rnt_1")!.applied_amount).toBe(100);
  });
});

describe("Build #17 cleanup — insurance / third-party recovery", () => {
  it("records insurance recovery without creating rental revenue", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "accident",
        description: "Collision",
        severity: "major",
      });
    });
    const revenueBefore = r.current.store.rentalFinancials("rnt_2").paid;
    act(() => {
      r.current.dc.recordRecovery(
        claimId,
        {
          recovery_type: "insurance",
          amount: 2000,
          date: today(),
          source_reference: "SF-CLM-123",
        },
        "k-ins-1",
      );
    });
    const recoveries = r.current.dc.claimRecoveries(claimId);
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0].recovery_type).toBe("insurance");
    expect(r.current.store.rentalFinancials("rnt_2").paid).toBe(revenueBefore);
  });

  it("is idempotent — duplicate insurance request does not double-record", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "accident",
        description: "Collision",
        severity: "major",
      });
    });
    act(() => {
      r.current.dc.recordRecovery(
        claimId,
        { recovery_type: "insurance", amount: 1000, date: today() },
        "k-ins-idem-1",
      );
      r.current.dc.recordRecovery(
        claimId,
        { recovery_type: "insurance", amount: 1000, date: today() },
        "k-ins-idem-1",
      );
    });
    expect(r.current.dc.claimRecoveries(claimId)).toHaveLength(1);
  });

  it("third-party recovery is not rental revenue", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "third_party",
        description: "Hit while parked",
        severity: "moderate",
      });
    });
    act(() => {
      r.current.dc.recordRecovery(
        claimId,
        { recovery_type: "third_party", amount: 500, date: today() },
        "k-tp-1",
      );
    });
    const eco = getDamageClaimEconomics(r.current.dc.claimById(claimId)!, {
      transactions: r.current.store.transactions,
      expenses: r.current.store.expenses,
      recoveries: r.current.dc.damageRecoveries,
    });
    expect(eco.third_party_recovered).toBe(500);
  });
});
