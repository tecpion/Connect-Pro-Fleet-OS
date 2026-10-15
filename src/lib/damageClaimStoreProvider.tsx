// Connect Pro Fleet — Damage Claims standalone store provider (Build #17).
// Composes the helpers + lifecycle + financial methods into the
// DamageClaimStore interface. Tenant-scoped state in a standalone context (the
// main fleet store module is at its size ceiling). Coordinates with the main
// store for financial actions, vehicle status, notifications, and system-task
// resolution. The DamageClaim record is descriptive/derived — authoritative
// financial truth stays in the rental ledger, deposit ledger, expense ledger,
// and recovery records.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type {
  DamageClaim,
  DamageClaimEvent,
  DamageEvidence,
  DamageInsuranceClaim,
  DamageRecovery,
} from "./damageClaimTypes";
import { useStore } from "./store";
import type { DamageClaimStore } from "./damageClaimStoreInterface";
import { seedDamageClaims } from "./store/seedDamageClaims";
import { makeClaimHelpers } from "./damageClaimHelpers";
import { makeLifecycleMethods } from "./damageClaimLifecycleMethods";
import { makeFinancialMethods } from "./damageClaimFinancialMethods";

const DamageClaimContext = createContext<DamageClaimStore | null>(null);

export function DamageClaimProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [claims, setClaims] = useState<DamageClaim[]>(seedDamageClaims.claims);
  const [evidence, setEvidence] = useState<DamageEvidence[]>(
    seedDamageClaims.evidence,
  );
  const [insurance, setInsurance] = useState<DamageInsuranceClaim[]>(
    seedDamageClaims.insurance,
  );
  const [recoveries, setRecoveries] = useState<DamageRecovery[]>(
    seedDamageClaims.recoveries,
  );
  const [events, setEvents] = useState<DamageClaimEvent[]>(
    seedDamageClaims.events,
  );
  const claimKeys = useRef<Set<string>>(new Set());
  // Always-current claims snapshot so rapid synchronous actions (e.g. double
  // chargeCustomer within one act()) read authoritative state, not the stale
  // closure captured by useMemo.
  const claimsRef = useRef(claims);
  claimsRef.current = claims;

  const value = useMemo<DamageClaimStore>(() => {
    const h = makeClaimHelpers(store, claims, setClaims, setEvents, claimsRef);
    const life = makeLifecycleMethods(
      h,
      claims,
      setClaims,
      setEvidence,
      setInsurance,
    );
    const fin = makeFinancialMethods(
      h,
      claims,
      () => claimsRef.current,
      setRecoveries,
      claimKeys,
    );

    return {
      damageClaims: claims,
      damageEvidence: evidence,
      damageInsuranceClaims: insurance,
      damageRecoveries: recoveries,
      damageClaimEvents: events,

      claimById: (id) => claims.find((c) => c.id === id),
      claimEvents: (claimId) =>
        events
          .filter((e) => e.damage_claim_id === claimId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      claimEvidence: (claimId) =>
        evidence
          .filter((e) => e.damage_claim_id === claimId && !e.voided_at)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      allClaimEvidence: (claimId) =>
        evidence
          .filter((e) => e.damage_claim_id === claimId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      claimInsurance: (claimId) =>
        insurance.find((i) => i.damage_claim_id === claimId) ?? null,
      claimRecoveries: (claimId) =>
        recoveries
          .filter((r) => r.damage_claim_id === claimId && !r.reversed_at)
          .sort((a, b) => (a.date < b.date ? 1 : -1)),
      vehicleClaims: (vehicleId) =>
        claims
          .filter((c) => c.vehicle_id === vehicleId)
          .sort((a, b) => (a.discovered_at < b.discovered_at ? 1 : -1)),

      createClaim: life.createClaim,
      updateClaim: life.updateClaim,
      setClaimStatus: life.setClaimStatus,
      setResponsibility: life.setResponsibility,
      assignClaim: life.assignClaim,
      closeClaim: life.closeClaim,
      cancelClaim: life.cancelClaim,
      reopenClaim: life.reopenClaim,

      addEvidence: life.addEvidence,
      voidEvidence: (evidenceId) =>
        life.voidEvidence(evidenceId, evidence, setEvidence),

      chargeCustomer: fin.chargeCustomer,
      reverseCustomerCharge: fin.reverseCustomerCharge,
      applyDeposit: fin.applyDeposit,
      recordRecovery: fin.recordRecovery,
      reverseRecovery: (recoveryId, reason) =>
        fin.reverseRecovery(recoveryId, reason, recoveries, setRecoveries),

      fileInsurance: life.fileInsurance,
      updateInsurance: (insuranceId, patch) =>
        life.updateInsurance(insuranceId, patch, setInsurance),

      linkWorkOrder: life.linkWorkOrder,
      linkExpense: life.linkExpense,
      addClaimNote: life.addClaimNote,
    };
  }, [claims, evidence, insurance, recoveries, events, store]);

  return (
    <DamageClaimContext.Provider value={value}>
      {children}
    </DamageClaimContext.Provider>
  );
}

export function useDamageClaims() {
  const ctx = useContext(DamageClaimContext);
  if (!ctx)
    throw new Error("useDamageClaims must be used within DamageClaimProvider");
  return ctx;
}
