// Connect Pro Fleet — wizard step 2: contribution (Build #7).

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRIBUTION_TYPE_LABELS } from "@/lib/partnershipTypes";
import type { ContributionType } from "@/lib/partnershipTypes";
import { StepShell } from "./StepShell";

export interface ContributionState {
  type: ContributionType | "none";
  cashAmount: number;
  date: string;
  description: string;
  notes: string;
}

export function initialContribution(): ContributionState {
  return {
    type: "none",
    cashAmount: 0,
    date: new Date().toISOString().slice(0, 10),
    description: "",
    notes: "",
  };
}

export function ContributionStep({
  state,
  set,
}: {
  state: ContributionState;
  set: (patch: Partial<ContributionState>) => void;
}) {
  return (
    <StepShell
      heading="What did they bring into this deal?"
      supporting="Agreement information only — never becomes rental revenue, a customer payment, or the vehicle's acquisition cost."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          ["none", "vehicle", "cash", "vehicle_and_cash", "other"] as const
        ).map((t) => (
          <button
            key={t}
            onClick={() => set({ type: t })}
            className={
              state.type === t
                ? "rounded-md border-2 border-primary bg-primary/5 px-3 py-3 text-sm font-semibold text-primary"
                : "rounded-md border border-border px-3 py-3 text-sm font-medium text-foreground hover:bg-surface-2"
            }
          >
            {t === "none" ? "None" : CONTRIBUTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {(state.type === "cash" || state.type === "vehicle_and_cash") && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cash amount ($)</Label>
            <Input
              type="number"
              min={0}
              value={state.cashAmount}
              onChange={(e) => set({ cashAmount: Number(e.target.value) })}
              className="mt-1 font-mono tabular"
            />
          </div>
          <div>
            <Label>Contribution date</Label>
            <Input
              type="date"
              value={state.date}
              onChange={(e) => set({ date: e.target.value })}
              className="mt-1 font-mono"
            />
          </div>
        </div>
      )}

      {state.type === "other" && (
        <div>
          <Label>Describe the contribution</Label>
          <textarea
            value={state.description}
            onChange={(e) => set({ description: e.target.value })}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            rows={2}
            placeholder="e.g. Covered registration and initial detailing"
          />
        </div>
      )}

      {state.type !== "none" && (
        <div>
          <Label>Notes (optional)</Label>
          <Input
            value={state.notes}
            onChange={(e) => set({ notes: e.target.value })}
            className="mt-1"
          />
        </div>
      )}
    </StepShell>
  );
}

export function contributionValid(s: ContributionState): boolean {
  if (s.type === "cash" || s.type === "vehicle_and_cash")
    return s.cashAmount > 0;
  if (s.type === "other") return s.description.trim().length > 0;
  return true;
}
