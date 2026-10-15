// Connect Pro Fleet — wizard step 1: partner (Build #7).

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { useInvestors } from "@/lib/investorStore";
import { findPossibleMatches } from "@/lib/partnership";
import { StepShell, selectCls } from "./StepShell";

export interface PartnerState {
  mode: "new" | "existing";
  existingId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  relationship: "family" | "external";
  joined: string;
}

export function initialPartner(): PartnerState {
  return {
    mode: "new",
    existingId: "",
    name: "",
    contactName: "",
    email: "",
    phone: "",
    relationship: "external",
    joined: new Date().toISOString().slice(0, 10),
  };
}

export function PartnerStep({
  state,
  set,
}: {
  state: PartnerState;
  set: (patch: Partial<PartnerState>) => void;
}) {
  const { investors, investorVehicles } = useInvestors();

  const possibleMatches = useMemo(
    () =>
      state.mode === "new"
        ? findPossibleMatches(
            { name: state.name, email: state.email, phone: state.phone },
            investors,
            investorVehicles,
          )
        : [],
    [state, investors, investorVehicles],
  );

  return (
    <StepShell
      heading="Who are you partnering with?"
      supporting="Add the person or business connected to this vehicle partnership."
    >
      <div className="flex gap-2">
        {(["new", "existing"] as const).map((m) => (
          <button
            key={m}
            onClick={() => set({ mode: m })}
            className={
              state.mode === m
                ? "flex-1 rounded-md border-2 border-primary bg-primary/5 px-3 py-2 text-sm font-semibold text-primary"
                : "flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
            }
          >
            {m === "new" ? "New partner" : "Existing partner"}
          </button>
        ))}
      </div>

      {state.mode === "new" ? (
        <div className="space-y-3">
          {possibleMatches.length > 0 && (
            <div className="rounded-md border border-status-maintenance/40 bg-status-maintenance/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-status-maintenance">
                <AlertTriangle size={13} /> Possible existing partner
              </p>
              <ul className="mt-2 space-y-1">
                {possibleMatches.map((m) => (
                  <li
                    key={m.investor.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-foreground">
                      {m.investor.full_name} · {m.investor.email} ·{" "}
                      {m.vehicleCount} vehicle{m.vehicleCount === 1 ? "" : "s"}
                    </span>
                    <button
                      onClick={() =>
                        set({ existingId: m.investor.id, mode: "existing" })
                      }
                      className="font-semibold text-primary hover:underline"
                    >
                      Use existing
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                Or continue creating a new record below.
              </p>
            </div>
          )}
          <div>
            <Label>Partner type</Label>
            <select
              value={state.relationship}
              onChange={(e) =>
                set({ relationship: e.target.value as "family" | "external" })
              }
              className={selectCls}
            >
              <option value="external">Business</option>
              <option value="family">Individual</option>
            </select>
          </div>
          <div>
            <Label>Name / business name</Label>
            <Input
              value={state.name}
              onChange={(e) => set({ name: e.target.value })}
              className="mt-1"
              placeholder="Daniel Reyes"
              autoFocus
            />
          </div>
          {state.relationship === "external" && (
            <div>
              <Label>Contact name (optional)</Label>
              <Input
                value={state.contactName}
                onChange={(e) => set({ contactName: e.target.value })}
                className="mt-1"
                placeholder="Person to reach at the business"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={state.email}
                onChange={(e) => set({ email: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={state.phone}
                onChange={(e) => set({ phone: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>Joined</Label>
            <Input
              type="date"
              value={state.joined}
              onChange={(e) => set({ joined: e.target.value })}
              className="mt-1 font-mono"
            />
          </div>
        </div>
      ) : (
        <div>
          <Label>Select an existing partner</Label>
          <select
            value={state.existingId}
            onChange={(e) => set({ existingId: e.target.value })}
            className={selectCls}
          >
            <option value="">— Select —</option>
            {investors
              .filter((i) => i.status === "active")
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name} · {i.email}
                </option>
              ))}
          </select>
        </div>
      )}
    </StepShell>
  );
}

export function partnerValid(s: PartnerState): boolean {
  if (s.mode === "new") return s.name.trim().length > 0;
  return !!s.existingId;
}
