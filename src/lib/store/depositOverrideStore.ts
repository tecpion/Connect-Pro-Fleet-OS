// Connect Pro Fleet — deposit requirement override (Build #8).
// Extracted from depositStore.ts to keep that module under the line limit.
// Overrides the snapshotted required amount with an audited reason + staff.

import { fmtMoney } from "../format";
import type { ForfeitureReason } from "../depositTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export function buildDepositOverrideMethods(
  s: StoreState,
  syncDeposit: (
    depositId: string,
    patch: (
      prev: import("../depositTypes").RentalDeposit,
    ) => Partial<import("../depositTypes").RentalDeposit>,
  ) => void,
  logEvent: (
    e: Omit<import("../depositTypes").DepositHistoryEvent, "id" | "tenant_id">,
  ) => void,
  logAct: (
    label: string,
    tone?: "neutral" | "available" | "maintenance" | "out",
  ) => void,
) {
  return {
    overrideDepositRequirement: (
      depositId: string,
      input: { newRequiredAmount: number; reason: string },
    ): { ok: boolean; error?: string } => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return { ok: false, error: "Deposit not found." };
      if (!input.reason.trim())
        return {
          ok: false,
          error: "A reason is required to override the deposit.",
        };
      const now = new Date().toISOString();
      const oldRequired = deposit.required_amount;
      syncDeposit(depositId, () => ({
        required_amount: input.newRequiredAmount,
      }));
      logEvent({
        deposit_id: depositId,
        event_type: "overridden",
        amount: oldRequired - input.newRequiredAmount,
        staff_id: s.currentStaffId,
        at: now,
        reason: input.reason,
      });
      logAct(
        `Deposit requirement overridden — ${fmtMoney(oldRequired)} → ${fmtMoney(input.newRequiredAmount)}`,
        "neutral",
      );
      return { ok: true };
    },
  };
}

// Re-export so the type is available to consumers without a second import.
export type { ForfeitureReason };
