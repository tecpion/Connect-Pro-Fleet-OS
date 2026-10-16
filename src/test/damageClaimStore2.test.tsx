// Connect Pro Fleet — Build #17 cleanup: damage claim store tests (part 2).
// Expense linking, vehicle blocking, closure/cancellation/reopen, task
// resolution, notification, work-order linking, financial non-interference,
// over-recovery, settlement integration.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  DamageClaimProvider,
  useDamageClaims,
} from "@/lib/damageClaimStoreProvider";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import { getRentalSettlement } from "@/lib/rentalSettlement";
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

describe("Build #17 cleanup — expense linking + actual cost", () => {
  it("linked expense contributes actual cost once", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        damage_source: "staff_discovery",
        description: "Body damage",
        severity: "major",
      });
    });
    let expId = "";
    act(() => {
      expId = r.current.store.createExpense({
        description: "Body shop repair",
        amount: 1200,
        transaction_date: today(),
        payment_method: "credit_card",
        vehicle_id: "veh_2",
      });
    });
    act(() => {
      r.current.dc.linkExpense(claimId, expId);
    });
    const eco = getDamageClaimEconomics(r.current.dc.claimById(claimId)!, {
      transactions: r.current.store.transactions,
      expenses: r.current.store.expenses,
      recoveries: r.current.dc.damageRecoveries,
    });
    expect(eco.actual_cost).toBe(1200);
  });

  it("reversed expense nets out of actual cost", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        damage_source: "staff_discovery",
        description: "Body damage",
        severity: "major",
      });
    });
    let expId = "";
    act(() => {
      expId = r.current.store.createExpense({
        description: "Repair",
        amount: 800,
        transaction_date: today(),
        payment_method: "cash",
        vehicle_id: "veh_2",
      });
      r.current.dc.linkExpense(claimId, expId);
    });
    act(() => {
      r.current.store.reverseExpense(expId, "Wrong amount");
    });
    const eco = getDamageClaimEconomics(r.current.dc.claimById(claimId)!, {
      transactions: r.current.store.transactions,
      expenses: r.current.store.expenses,
      recoveries: r.current.dc.damageRecoveries,
    });
    expect(eco.actual_cost).toBe(0);
  });
});

describe("Build #17 cleanup — vehicle blocking", () => {
  it("blocking claim takes vehicle out of service", () => {
    const r = useHooks();
    expect(r.current.store.vehicles.find((v) => v.id === "veh_6")!.status).toBe(
      "available",
    );
    act(() => {
      r.current.dc.createClaim({
        vehicle_id: "veh_6",
        damage_source: "staff_discovery",
        description: "Major damage",
        severity: "critical",
        blocks_vehicle_use: true,
      });
    });
    expect(r.current.store.vehicles.find((v) => v.id === "veh_6")!.status).toBe(
      "out_of_service",
    );
  });

  it("non-blocking claim does not change vehicle status", () => {
    const r = useHooks();
    const before = r.current.store.vehicles.find(
      (v) => v.id === "veh_6",
    )!.status;
    act(() => {
      r.current.dc.createClaim({
        vehicle_id: "veh_6",
        damage_source: "staff_discovery",
        description: "Minor scratch",
        severity: "minor",
        blocks_vehicle_use: false,
      });
    });
    expect(r.current.store.vehicles.find((v) => v.id === "veh_6")!.status).toBe(
      before,
    );
  });

  it("closing a blocking claim restores the vehicle when no blocking WO remains", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_6",
        damage_source: "staff_discovery",
        description: "Major damage",
        severity: "critical",
        blocks_vehicle_use: true,
      });
    });
    expect(r.current.store.vehicles.find((v) => v.id === "veh_6")!.status).toBe(
      "out_of_service",
    );
    act(() => {
      r.current.dc.closeClaim(claimId, "Repaired");
    });
    expect(r.current.store.vehicles.find((v) => v.id === "veh_6")!.status).toBe(
      "available",
    );
  });
});

describe("Build #17 cleanup — closure / cancellation / reopen", () => {
  it("cancellation is blocked when a customer charge exists", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 100 }, "k-cancel-1");
    });
    act(() => {
      r.current.dc.cancelClaim(claimId, "Duplicate");
    });
    expect(r.current.dc.claimById(claimId)!.claim_status).not.toBe("cancelled");
  });

  it("reopen preserves financial history", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 100 }, "k-reopen-1");
      r.current.dc.closeClaim(claimId, "Done");
    });
    const eventsBefore = r.current.dc.claimEvents(claimId).length;
    act(() => {
      r.current.dc.reopenClaim(claimId);
    });
    expect(r.current.dc.claimById(claimId)!.claim_status).toBe("open");
    expect(
      r.current.dc.claimById(claimId)!.customer_charge_transaction_id,
    ).not.toBeNull();
    expect(r.current.dc.claimEvents(claimId).length).toBeGreaterThan(
      eventsBefore,
    );
  });
});

describe("Build #17 cleanup — flagged inspection task resolution", () => {
  it("creating a claim from a flagged inspection resolves the system task", () => {
    const r = useHooks();
    let taskId = "";
    act(() => {
      const t = r.current.store.ensureSystemTask({
        sourceEvent: "inspection.damage_review",
        entityType: "inspection",
        entityId: "ins_2",
        entityLabel: "Inspection ins_2",
        title: "Review possible damage",
        category: "damage",
        priority: "high",
      });
      taskId = t.taskId;
    });
    expect(r.current.store.taskById(taskId)!.status).toBe("open");
    act(() => {
      r.current.dc.createClaim({
        vehicle_id: "veh_1",
        rental_id: "rnt_1",
        customer_id: "cus_1",
        inspection_id: "ins_2",
        damage_source: "checkin_inspection",
        description: "Flagged damage",
        severity: "moderate",
      });
    });
    expect(r.current.store.taskById(taskId)!.status).toBe("completed");
  });
});

describe("Build #17 cleanup — assignment notification", () => {
  it("notifies the assignee (not self) once", () => {
    const r = useHooks();
    const before = r.current.store.notifications.length;
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.assignClaim(claimId, "stf_2");
    });
    expect(r.current.store.notifications.length - before).toBe(1);
  });

  it("self-assignment produces no notification", () => {
    const r = useHooks();
    const before = r.current.store.notifications.length;
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.assignClaim(claimId, r.current.store.currentStaffId);
    });
    expect(r.current.store.notifications.length).toBe(before);
  });
});

describe("Build #17 cleanup — work order linking", () => {
  it("links a work order and updates claim status to repair_in_progress", () => {
    const r = useHooks();
    let claimId = "";
    let woId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        damage_source: "accident",
        description: "Collision repair",
        severity: "major",
      });
      woId = r.current.store.createWorkOrder({
        vehicle_id: "veh_2",
        title: "Body repair",
        maintenance_type: "body",
      });
    });
    act(() => {
      r.current.dc.linkWorkOrder(claimId, woId);
    });
    const claim = r.current.dc.claimById(claimId)!;
    expect(claim.maintenance_work_order_id).toBe(woId);
    expect(claim.claim_status).toBe("repair_in_progress");
  });
});

describe("Build #17 cleanup — financial non-interference", () => {
  it("creating a claim changes zero ledger balance", () => {
    const r = useHooks();
    const before = r.current.store.rentalFinancials("rnt_2").balance;
    act(() => {
      r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    expect(r.current.store.rentalFinancials("rnt_2").balance).toBe(before);
  });

  it("recording insurance recovery changes zero rental obligation", () => {
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
    const before = r.current.store.rentalFinancials("rnt_2").balance;
    act(() => {
      r.current.dc.recordRecovery(
        claimId,
        { recovery_type: "insurance", amount: 5000, date: today() },
        "k-ni-1",
      );
    });
    expect(r.current.store.rentalFinancials("rnt_2").balance).toBe(before);
  });
});

describe("Build #17 cleanup — over-recovery net loss", () => {
  it("company net loss is negative when recovery exceeds actual cost", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        damage_source: "accident",
        description: "Collision",
        severity: "moderate",
      });
    });
    let expId = "";
    act(() => {
      expId = r.current.store.createExpense({
        description: "Repair",
        amount: 1500,
        transaction_date: today(),
        payment_method: "credit_card",
        vehicle_id: "veh_2",
      });
      r.current.dc.linkExpense(claimId, expId);
    });
    act(() => {
      r.current.dc.recordRecovery(
        claimId,
        { recovery_type: "insurance", amount: 1700, date: today() },
        "k-over-rec-1",
      );
    });
    const eco = getDamageClaimEconomics(r.current.dc.claimById(claimId)!, {
      transactions: r.current.store.transactions,
      expenses: r.current.store.expenses,
      recoveries: r.current.dc.damageRecoveries,
    });
    expect(eco.actual_cost).toBe(1500);
    expect(eco.total_recovered).toBe(1700);
    expect(eco.company_net_loss).toBe(-200);
  });
});

describe("Build #17 cleanup — settlement integration", () => {
  it("rental settlement reflects the damage charge in the ledger", () => {
    const r = useHooks();
    let claimId = "";
    act(() => {
      claimId = r.current.dc.createClaim({
        vehicle_id: "veh_2",
        rental_id: "rnt_2",
        customer_id: "cus_8",
        damage_source: "staff_discovery",
        description: "Damage",
        severity: "minor",
      });
    });
    act(() => {
      r.current.dc.chargeCustomer(claimId, { amount: 300 }, "k-settle-1");
    });
    const rental = r.current.store.rentals.find((x) => x.id === "rnt_2")!;
    const settlement = getRentalSettlement(
      rental,
      r.current.store.transactions,
      r.current.store.depositForRental("rnt_2"),
    );
    expect(settlement.totalCharges).toBeGreaterThan(300);
  });
});
