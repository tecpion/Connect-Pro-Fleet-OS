// Connect Pro Fleet — violation mutation helpers + deps (Build #25).
//
// Shared mutation infrastructure extracted from violationMutations.ts to keep
// files focused under the per-file line limit. Money-moving methods read the
// authoritative in-progress state via the violations ref + synchronous
// idempotency registries so rapid synchronous calls (double-click, batched
// act()) are safe and idempotent.

import { uid, TENANT_ID } from "./store/ids";
import type { FleetStore } from "./store/storeContext";
import type {
  Violation,
  ViolationEvidence,
  ViolationEvent,
} from "./violationTypes";
import type { ViolationPolicy } from "./violationPolicyTypes";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";

export interface ViolationMutationDeps {
  store: FleetStore;
  violationsRef: { current: Violation[] };
  /** Accepts either an updater fn (prev => next) OR a concrete next array. The
   *  mutation helpers call commitViolations(next) with a precomputed array so
   *  the violationsRef can be updated synchronously before React re-renders. */
  setViolations: (
    u: Violation[] | ((prev: Violation[]) => Violation[]),
  ) => void;
  setEvidence: (u: (prev: ViolationEvidence[]) => ViolationEvidence[]) => void;
  setEvents: (u: (prev: ViolationEvent[]) => ViolationEvent[]) => void;
  chargeKeys: React.MutableRefObject<Set<string>>;
  paymentKeys: React.MutableRefObject<Set<string>>;
  policyRef: { current: ViolationPolicy };
  /** All vehicle exchanges across rentals — used by the possession resolver
   *  so createViolation is exchange-aware (NOT store.vehicleExchanges("") which
   *  returns nothing). */
  exchanges: RentalVehicleExchange[];
  logAct: (
    label: string,
    tone?: "neutral" | "available" | "maintenance" | "out",
  ) => void;
}

export interface ViolationHelpers {
  logEvent: (
    violationId: string,
    type: ViolationEvent["type"],
    label: string,
    meta?: Record<string, unknown> | null,
  ) => void;
  patchViolation: (id: string, patch: Partial<Violation>) => void;
  vehicleLabel: (vehicleId: string) => string;
  commitViolations: (next: Violation[]) => void;
}

export function makeViolationHelpers(
  deps: ViolationMutationDeps,
): ViolationHelpers {
  const { store, setEvents } = deps;

  function logEvent(
    violationId: string,
    type: ViolationEvent["type"],
    label: string,
    meta: Record<string, unknown> | null = null,
  ) {
    const ev: ViolationEvent = {
      id: uid("vevt"),
      tenant_id: TENANT_ID,
      violation_id: violationId,
      type,
      label,
      at: new Date().toISOString(),
      actor_id: store.currentStaffId,
      meta,
    };
    setEvents((es) => [ev, ...es]);
  }

  /** Synchronous source of truth: update the violations ref immediately so
   *  rapid synchronous calls (double-click, batched act()) read authoritative
   *  state, then push the precomputed array into React state. */
  function commitViolations(next: Violation[]) {
    deps.violationsRef.current = next;
    deps.setViolations(next);
  }

  function patchViolation(id: string, patch: Partial<Violation>) {
    const next = deps.violationsRef.current.map((v) =>
      v.id === id
        ? { ...v, ...patch, updated_at: new Date().toISOString() }
        : v,
    );
    commitViolations(next);
  }

  function vehicleLabel(vehicleId: string): string {
    const v = store.vehicles.find((x) => x.id === vehicleId);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown vehicle";
  }

  return { logEvent, patchViolation, vehicleLabel, commitViolations };
}

export function nextViolationNumber(existing: Violation[]): string {
  const year = new Date().getFullYear();
  const prefix = `VIO-${year}-`;
  const max = existing
    .map((v) => {
      const m = v.violation_number.match(/VIO-\d{4}-(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function deriveTotal(
  base: number,
  penalties: number,
  admin: number,
): number {
  return Math.round((base + penalties + admin) * 100) / 100;
}
