// Connect Pro Fleet — Violations standalone store provider (Build #25).
// Composes the mutation + lifecycle helpers into the ViolationStore
// interface. Tenant-scoped state in a standalone context (the main fleet
// store module is at its size ceiling). Coordinates with the main store for
// financial actions (customer charge via rental ledger, company payment via
// expense ledger), vehicle/rental lookups, and activity logging. The Violation
// record is descriptive/derived — authoritative financial truth stays in the
// rental ledger (customer charge) and expense ledger (company payment).
//
// Idempotency: chargeCustomer / recordCompanyPayment use synchronous ref-backed
// registries so rapid synchronous calls (double-click, batched act()) are
// safe. The violations ref is always-current so reads inside one batched
// action see authoritative state, not a stale closure.
//
// Phase 4: Cloud-backed when Cloud is configured. Hydrates violations +
// evidence + events from Cloud on auth/org change and persists inserts/updates
// through the ViolationRepository. Inbound provider ingestion uses
// findByExternalEventId so duplicate external events are idempotent (no
// duplicate violation rows, no duplicate customer charges on recovery retry).
// In memory mode (no Cloud config) every persist call is a no-op so the seeded
// demo experience is unchanged.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type {
  Violation,
  ViolationEvidence,
  ViolationEvent,
  ViolationStatus,
  ViolationResponsibility,
  ResponsibilityReason,
  DisputeStatus,
  ViolationEvidenceType,
} from "./violationTypes";
import { useStore } from "./store";
import { useViolationPolicy } from "./violationPolicyStore";
import type { ViolationStore } from "./violationStoreInterface";
import type {
  CreateViolationInput,
  ChargeCustomerInput,
  RecordCompanyPaymentInput,
  DisputeInput,
} from "./violationStoreInterface";
import { seedViolations } from "./store/seedViolations";
import { makeViolationMutations } from "./violationMutations";
import type { ViolationMutationDeps } from "./violationMutationHelpers";
import { makeViolationLifecycle } from "./violationLifecycle";
import { resolveVehiclePossessionAt } from "./violationPossession";
import { uid, TENANT_ID } from "./store/ids";
import { useAuth } from "./supabase/authContext";
import {
  hydrateViolations,
  persistViolationInsert,
  persistViolationUpdate,
  persistViolationEvidenceInsert,
  persistViolationEventInsert,
} from "./supabase/storeSync";

const ViolationContext = createContext<ViolationStore | null>(null);

export function ViolationProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { violationPolicy } = useViolationPolicy();
  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;
  const [violations, setViolations] = useState<Violation[]>(
    seedViolations.violations,
  );
  const [evidence, setEvidence] = useState<ViolationEvidence[]>(
    seedViolations.evidence,
  );
  const [events, setEvents] = useState<ViolationEvent[]>(seedViolations.events);

  // Always-current snapshots so rapid synchronous actions read authoritative
  // state, not the stale closure captured by useMemo.
  const violationsRef = useRef(violations);
  violationsRef.current = violations;
  const policyRef = useRef(violationPolicy);
  policyRef.current = violationPolicy;
  const chargeKeys = useRef<Set<string>>(new Set());
  const paymentKeys = useRef<Set<string>>(new Set());

  // Phase 4: hydrate violations from Cloud on auth/org change. In memory
  // mode (no Cloud config) this is a no-op and the seeded demo data stays.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateViolations(activeOrgId, {
      setViolations,
      setEvidence,
      setEvents,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Cloud persist wrappers around the setters. Diff the resolved array against
  // the true `prev` (not the ref) so insert vs update is detected correctly
  // even inside a batched act(). Fire-and-forget; local state is authoritative.
  // Memoized on activeOrgId so the mutation deps stay stable.
  const setViolationsPersist = useCallback(
    (next: Violation[] | ((prev: Violation[]) => Violation[])) => {
      setViolations((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (activeOrgId) {
          for (const v of resolved) {
            const existed = prev.find((x) => x.id === v.id);
            if (!existed) persistViolationInsert(v);
            else if (existed.updated_at !== v.updated_at)
              persistViolationUpdate(activeOrgId, v.id, v);
          }
        }
        return resolved;
      });
    },
    [activeOrgId],
  );
  const setEvidencePersist = useCallback(
    (u: (prev: ViolationEvidence[]) => ViolationEvidence[]) => {
      setEvidence((prev) => {
        const resolved = u(prev);
        if (activeOrgId) {
          for (const e of resolved) {
            if (!prev.find((x) => x.id === e.id)) persistViolationEvidenceInsert(e);
          }
        }
        return resolved;
      });
    },
    [activeOrgId],
  );
  const setEventsPersist = useCallback(
    (u: (prev: ViolationEvent[]) => ViolationEvent[]) => {
      setEvents((prev) => {
        const resolved = u(prev);
        if (activeOrgId) {
          for (const e of resolved) {
            if (!prev.find((x) => x.id === e.id)) persistViolationEventInsert(e);
          }
        }
        return resolved;
      });
    },
    [activeOrgId],
  );

  // Collect ALL vehicle exchanges (the store method is per-rental; the
  // possession resolver needs the full array).
  const allExchanges = useMemo(
    () => store.rentals.flatMap((r) => store.vehicleExchanges(r.id)),
    [store.rentals, store.vehicleExchanges],
  );

  const deps: ViolationMutationDeps = {
    store,
    violationsRef,
    setViolations: setViolationsPersist,
    setEvidence: setEvidencePersist,
    setEvents: setEventsPersist,
    chargeKeys,
    paymentKeys,
    policyRef,
    exchanges: allExchanges,
    logAct: (label, tone) =>
      store.logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label,
        tone: tone ?? "neutral",
      }),
  };

  const mut = useMemo(() => makeViolationMutations(deps), [store, setViolationsPersist, setEvidencePersist, setEventsPersist]);
  const life = useMemo(() => makeViolationLifecycle(deps), [store, setViolationsPersist, setEvidencePersist, setEventsPersist]);

  const value = useMemo<ViolationStore>(
    () => ({
      violations,
      violationEvidence: evidence,
      violationEvents: events,

      // Queries read from the always-current violationsRef so reads inside a
      // batched act() (e.g. immediately after ingestProviderEvent) see the
      // authoritative in-progress state, not the stale `violations` closure.
      violationById: (id) => violationsRef.current.find((v) => v.id === id),
      violationsForVehicle: (vehicleId) =>
        violationsRef.current
          .filter((v) => v.vehicle_id === vehicleId)
          .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
      violationsForCustomer: (customerId) =>
        violationsRef.current
          .filter((v) => v.customer_id === customerId)
          .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
      violationsForRental: (rentalId) =>
        violationsRef.current
          .filter((v) => v.rental_id === rentalId)
          .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
      evidenceFor: (violationId) =>
        evidence
          .filter((e) => e.violation_id === violationId)
          .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)),
      eventsFor: (violationId) =>
        events
          .filter((e) => e.violation_id === violationId)
          .sort((a, b) => (a.at < b.at ? 1 : -1)),

      resolvePossession: (vehicleId, occurredAt) =>
        resolveVehiclePossessionAt(
          vehicleId,
          occurredAt,
          store.rentals,
          allExchanges,
        ),

      createViolation: mut.createViolation,
      updateViolation: life.updateViolation,
      assignResponsibility: life.assignResponsibility,
      assignStaff: life.assignStaff,
      setStatus: life.setStatus,

      chargeCustomer: mut.chargeCustomer,
      reverseCustomerCharge: life.reverseCustomerCharge,
      recordCompanyPayment: mut.recordCompanyPayment,
      linkExistingExpense: life.linkExistingExpense,

      // V1 Tolls & Violations Automation — idempotent inbound provider ingestion.
      ingestProviderEvent: mut.ingestProviderEvent,

      openDispute: life.openDispute,
      resolveDispute: life.resolveDispute,

      resolveViolation: life.resolveViolation,
      cancelViolation: life.cancelViolation,

      addEvidence: (id, input) => {
        const ev: ViolationEvidence = {
          id: uid("vev"),
          tenant_id: TENANT_ID,
          violation_id: id,
          type: input.type as ViolationEvidenceType,
          file_ref: input.file_ref ?? null,
          source: input.source ?? null,
          description: input.description ?? null,
          uploaded_by: store.currentStaffId,
          uploaded_at: new Date().toISOString(),
        };
        setEvidencePersist((es) => [ev, ...es]);
        // event
        setEventsPersist((es) => [
          {
            id: uid("vevt"),
            tenant_id: TENANT_ID,
            violation_id: id,
            type: "note_added",
            label: `Evidence added — ${input.type}`,
            at: new Date().toISOString(),
            actor_id: store.currentStaffId,
            meta: null,
          },
          ...es,
        ]);
      },

      addNote: (id, text) => {
        setViolationsPersist((vs) =>
          vs.map((v) =>
            v.id === id
              ? {
                  ...v,
                  notes: v.notes ? `${v.notes}\n${text}` : text,
                  updated_at: new Date().toISOString(),
                }
              : v,
          ),
        );
        setEventsPersist((es) => [
          {
            id: uid("vevt"),
            tenant_id: TENANT_ID,
            violation_id: id,
            type: "note_added",
            label: `Note added — ${text.slice(0, 60)}`,
            at: new Date().toISOString(),
            actor_id: store.currentStaffId,
            meta: null,
          },
          ...es,
        ]);
      },

      findDuplicate: (authority, citationNumber) =>
        violations.find(
          (v) =>
            v.issuing_authority &&
            v.issuing_authority === authority &&
            v.citation_number &&
            v.citation_number === citationNumber,
        ),
    }),
    [violations, evidence, events, store, mut, life, allExchanges],
  );

  return (
    <ViolationContext.Provider value={value}>
      {children}
    </ViolationContext.Provider>
  );
}

export function useViolations(): ViolationStore {
  const ctx = useContext(ViolationContext);
  if (!ctx)
    throw new Error("useViolations must be used within ViolationProvider");
  return ctx;
}
