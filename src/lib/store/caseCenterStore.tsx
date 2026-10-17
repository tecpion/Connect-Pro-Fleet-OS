// Connect Pro Fleet — Case Center store (Build #54).
//
// Standalone React context (mirrors the defenseStore / incidentsStore pattern)
// holding CaseRecord[] + CaseEvent[]. Case Center COORDINATES authoritative
// records — it does NOT duplicate financial/document/inspection/maintenance/
// compliance systems. Financial totals are DERIVED via caseCenterSelectors from
// the linked ledger transactions. Seed data lives in seedCaseCenter.ts.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { CaseRecord, CaseEvent, CaseOutcome } from "../caseCenterTypes";
import { TENANT_ID } from "./ids";
import { seedCases, seedCaseEvents } from "./seedCaseCenter";
import { useAuth } from "../supabase/authContext";
import {
  hydrateCases,
  persistCaseInsert,
  persistCaseUpdate,
  persistCaseEventInsert,
} from "../supabase/storeSync";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export interface CaseCenterStore {
  cases: CaseRecord[];
  caseEvents: CaseEvent[];

  addCase: (c: CaseRecord) => void;
  updateCase: (id: string, patch: Partial<CaseRecord>) => void;
  setCaseStatus: (
    id: string,
    status: CaseRecord["status"],
    actorId: string,
  ) => void;
  assignCase: (id: string, staffId: string | null, actorId: string) => void;
  determineResponsibility: (
    id: string,
    determination: CaseRecord["responsibility"]["determination"],
    reason: string,
    actorId: string,
  ) => void;
  resolveCase: (id: string, outcome: CaseOutcome, actorId: string) => void;
  closeCase: (id: string, actorId: string) => void;
  addCaseEvent: (e: CaseEvent) => void;
  addNote: (id: string, note: string, actorId: string) => void;
  linkEvidence: (
    id: string,
    patch: Partial<CaseRecord["evidence_links"]>,
  ) => void;
  caseById: (id: string) => CaseRecord | null;
  nextCaseNumber: () => string;
}

const CaseCenterContext = createContext<CaseCenterStore | null>(null);

function event(
  type: CaseEvent["type"],
  caseId: string,
  actorId: string | null,
  meta: Record<string, unknown> | null,
): CaseEvent {
  const at = new Date().toISOString();
  return {
    id: uid("ce"),
    tenant_id: TENANT_ID,
    case_id: caseId,
    type,
    label: type.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
    at,
    actor_id: actorId,
    meta,
  };
}

export function CaseCenterProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;
  const [caseState, setCasesRaw] = useState(seedCases);
  const [eventState, setEventsRaw] = useState(seedCaseEvents);

  // Phase 4: hydrate cases + events from Cloud on auth/org change. In memory
  // mode (no Cloud config) this is a no-op and the seeded demo data stays.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateCases(activeOrgId, {
      setCases: setCasesRaw,
      setCaseEvents: setEventsRaw,
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

  // Cloud persist wrappers: diff the resolved array against true `prev` and
  // fire insert/update through the CaseRepository. Fire-and-forget.
  const setCases = useCallback(
    (next: CaseRecord[] | ((prev: CaseRecord[]) => CaseRecord[])) => {
      setCasesRaw((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (activeOrgId) {
          for (const c of resolved) {
            const existed = prev.find((x) => x.id === c.id);
            if (!existed) persistCaseInsert(c);
            else if (existed.updated_at !== c.updated_at)
              persistCaseUpdate(activeOrgId, c.id, c);
          }
        }
        return resolved;
      });
    },
    [activeOrgId],
  );
  const setEvents = useCallback(
    (next: CaseEvent[] | ((prev: CaseEvent[]) => CaseEvent[])) => {
      setEventsRaw((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (activeOrgId) {
          for (const e of resolved) {
            if (!prev.find((x) => x.id === e.id)) persistCaseEventInsert(e);
          }
        }
        return resolved;
      });
    },
    [activeOrgId],
  );

  const store = useMemo<CaseCenterStore>(
    () => ({
      cases: caseState,
      caseEvents: eventState,

      addCase: (c) => {
        setCases((cs) => [c, ...cs]);
        setEvents((es) => [event("created", c.id, c.created_by, null), ...es]);
      },
      updateCase: (id, patch) =>
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  ...patch,
                  updated_at: new Date().toISOString(),
                  last_activity_at: new Date().toISOString(),
                }
              : x,
          ),
        ),
      setCaseStatus: (id, status, actorId) => {
        const at = new Date().toISOString();
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status,
                  updated_at: at,
                  last_activity_at: at,
                  resolved_at: status === "resolved" ? at : x.resolved_at,
                  closed_at: status === "closed" ? at : x.closed_at,
                }
              : x,
          ),
        );
        setEvents((es) => [
          event("status_changed", id, actorId, { status }),
          ...es,
        ]);
      },
      assignCase: (id, staffId, actorId) => {
        const at = new Date().toISOString();
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  assigned_staff_id: staffId,
                  updated_at: at,
                  last_activity_at: at,
                }
              : x,
          ),
        );
        setEvents((es) => [
          event("assigned", id, actorId, { staff_id: staffId }),
          ...es,
        ]);
      },
      determineResponsibility: (id, determination, reason, actorId) => {
        const at = new Date().toISOString();
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  responsibility: {
                    determination,
                    reason,
                    determined_by: actorId,
                    determined_at: at,
                  },
                  updated_at: at,
                  last_activity_at: at,
                }
              : x,
          ),
        );
        setEvents((es) => [
          event("responsibility_determined", id, actorId, { determination }),
          ...es,
        ]);
      },
      resolveCase: (id, outcome, actorId) => {
        const at = new Date().toISOString();
        // Closing/resolving does NOT erase linked balances or financial records.
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "resolved",
                  outcome,
                  resolved_at: at,
                  updated_at: at,
                  last_activity_at: at,
                }
              : x,
          ),
        );
        setEvents((es) => [event("resolved", id, actorId, null), ...es]);
      },
      closeCase: (id, actorId) => {
        const at = new Date().toISOString();
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "closed",
                  closed_at: at,
                  updated_at: at,
                  last_activity_at: at,
                }
              : x,
          ),
        );
        setEvents((es) => [event("closed", id, actorId, null), ...es]);
      },
      addCaseEvent: (e) => setEvents((es) => [e, ...es]),
      addNote: (id, note, actorId) => {
        const at = new Date().toISOString();
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  notes: x.notes ? `${x.notes}\n${note}` : note,
                  updated_at: at,
                  last_activity_at: at,
                }
              : x,
          ),
        );
        setEvents((es) => [event("note_added", id, actorId, { note }), ...es]);
      },
      linkEvidence: (id, patch) =>
        setCases((cs) =>
          cs.map((x) =>
            x.id === id
              ? {
                  ...x,
                  evidence_links: { ...x.evidence_links, ...patch },
                  updated_at: new Date().toISOString(),
                  last_activity_at: new Date().toISOString(),
                }
              : x,
          ),
        ),
      caseById: (id) => caseState.find((c) => c.id === id) ?? null,
      nextCaseNumber: () => {
        const max = caseState.reduce((m, c) => {
          const n = parseInt(c.case_number.split("-").pop() ?? "0", 10);
          return n > m ? n : m;
        }, 0);
        return `CASE-2026-${String(max + 1).padStart(4, "0")}`;
      },
    }),
    [caseState, eventState, setCases, setEvents],
  );

  return (
    <CaseCenterContext.Provider value={store}>
      {children}
    </CaseCenterContext.Provider>
  );
}

export function useCaseCenter() {
  const ctx = useContext(CaseCenterContext);
  if (!ctx)
    throw new Error("useCaseCenter must be used within CaseCenterProvider");
  return ctx;
}

/** Optional variant — returns null when the CaseCenterProvider is not mounted
 *  (e.g. in Copilot UI tests that predate Build #54). Copilot sources treat the
 *  case bundle as optional; case handlers return a graceful fallback when it is
 *  absent. Production code (App.tsx) always wraps with CaseCenterProvider. */
export function useCaseCenterOptional(): CaseCenterStore | null {
  return useContext(CaseCenterContext);
}

export { uid, TENANT_ID };
