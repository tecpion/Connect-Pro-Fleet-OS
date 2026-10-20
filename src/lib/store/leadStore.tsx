// Connect Pro Fleet — Lead store (Phase 10B).
//
// Standalone React context (mirrors the bookingRequestStore pattern) holding
// Lead[]. A Lead is a pre-rental CRM contact. The store exposes create /
// update-status / staff-driven convert-to-booking-request. It does NOT wire
// CRM webhook ingestion yet (Phase 10C). It does NOT create a Customer; that
// stays tied to the existing Reservation lifecycle.
//
// Idempotency: a Lead already converted (status "converted" with a
// converted_booking_request_id) returns the existing booking request id on a
// repeated conversion — never a duplicate.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FleetStore } from "./storeContext";
import type {
  BookingRequestStore,
} from "./bookingRequestStore";
import type { Lead, LeadStatus } from "../leadTypes";
import { CONVERTIBLE_LEAD_STATUSES } from "../leadTypes";
import type { BookingCrmInboundEvent } from "../bookingRequestTypes";
import { TENANT_ID } from "./ids";
import { useAuth } from "../supabase/authContext";
import {
  hydrateLeads,
  persistLeadInsert,
  persistLeadUpdate,
} from "../supabase/phase10StoreSync";
import {
  resolveLeadMatchByPhoneOrEmail,
  type LeadMatchResolution,
} from "../leadMatch";
import {
  leadToBookingRequestInput,
  canConvertLead,
  getMissingConversionFields,
} from "../leadConversion";
import {
  useBookingRequestsOptional,
} from "./bookingRequestStore";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

function nowISO() {
  return new Date().toISOString();
}

export interface LeadCreateInput {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  source?: Lead["source"];
  status?: LeadStatus;
  tags?: string[];
  crm_opportunity_id?: string | null;
  crm_pipeline_stage?: string | null;
  lead_source?: string | null;
  intake_data?: Record<string, unknown>;
  notes?: string;
  created_by?: string | null;
}

export interface LeadStore {
  leads: Lead[];
  leadById: (id: string) => Lead | null;
  /** Create a Lead. Optionally resolves a secondary phone/email match and
   *  upserts instead of duplicating when the match is unambiguous. */
  createLead: (input: LeadCreateInput) => { id: string; created: boolean };
  /** Update a Lead's status/details. */
  updateLead: (id: string, patch: Partial<Lead>) => void;
  /** Staff-driven conversion to a BookingRequest. Idempotent: a repeated
   *  attempt returns the existing booking request id, never a duplicate. */
  convertToBookingRequest: (input: {
    lead_id: string;
    customers: FleetStore["customers"];
    actor_id: string;
  }) => { ok: boolean; booking_request_id: string | null; reason?: string };
  /** Secondary phone/email match (exposed for UI/probes). Never the primary
   *  CRM identity. */
  matchByPhoneOrEmail: (phone: string, email: string) => LeadMatchResolution;
}

const LeadContext = createContext<LeadStore | null>(null);

export function LeadProvider({
  children,
  bookingStoreOverride,
}: {
  children: ReactNode;
  /** Optional booking store for tests; production resolves it from context. */
  bookingStoreOverride?: BookingRequestStore;
}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;

  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateLeads(activeOrgId, {
      setLeads,
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

  // The override (tests) wins; production resolves the booking store from
  // context via the optional hook (null-safe so the Lead provider can render
  // without a booking provider ancestor).
  const ctxBooking = useBookingRequestsOptional();
  const bookingStore = bookingStoreOverride ?? ctxBooking;
  if (!bookingStore) {
    throw new Error("LeadProvider requires a BookingRequestProvider ancestor");
  }

  const store = useMemo<LeadStore>(
    () => ({
      leads,

      leadById: (id) => leads.find((l) => l.id === id) ?? null,

      createLead: (input) => {
        // Secondary fallback: if phone/email unambiguously matches an existing
        // Lead, upsert it instead of duplicating. Primary identity remains the
        // external CRM contact id in external_entity_references (Phase 10A).
        const match = resolveLeadMatchByPhoneOrEmail({
          leads,
          phone: input.phone,
          email: input.email,
        });
        if (match.kind === "matched") {
          const existing = leads.find((l) => l.id === match.lead_id);
          if (existing) {
            const at = nowISO();
            const updated: Lead = {
              ...existing,
              first_name: input.first_name || existing.first_name,
              last_name: input.last_name || existing.last_name,
              phone: input.phone || existing.phone,
              email: input.email || existing.email,
              tags: input.tags ?? existing.tags,
              crm_opportunity_id:
                input.crm_opportunity_id ?? existing.crm_opportunity_id,
              crm_pipeline_stage:
                input.crm_pipeline_stage ?? existing.crm_pipeline_stage,
              lead_source: input.lead_source ?? existing.lead_source,
              intake_data: { ...existing.intake_data, ...(input.intake_data ?? {}) },
              notes: input.notes ?? existing.notes,
              updated_at: at,
            };
            setLeads((ls) => ls.map((l) => (l.id === existing.id ? updated : l)));
            persistLeadUpdate(updated.organization_id, existing.id, updated);
            return { id: existing.id, created: false };
          }
        }
        const at = nowISO();
        const id = uid("lead");
        const created: Lead = {
          id,
          organization_id: TENANT_ID,
          first_name: input.first_name,
          last_name: input.last_name,
          phone: input.phone,
          email: input.email,
          source: input.source ?? "connect_pro_crm",
          status: input.status ?? "new",
          tags: input.tags ?? [],
          crm_opportunity_id: input.crm_opportunity_id ?? null,
          crm_pipeline_stage: input.crm_pipeline_stage ?? null,
          lead_source: input.lead_source ?? null,
          intake_data: input.intake_data ?? {},
          notes: input.notes ?? "",
          converted_booking_request_id: null,
          converted_at: null,
          created_by: input.created_by ?? null,
          created_at: at,
          updated_at: at,
        };
        setLeads((ls) => [created, ...ls]);
        persistLeadInsert(created);
        return { id, created: true };
      },

      updateLead: (id, patch) => {
        const at = nowISO();
        let updated: Lead | null = null;
        setLeads((ls) =>
          ls.map((l) => {
            if (l.id !== id) return l;
            const next: Lead = { ...l, ...patch, updated_at: at };
            updated = next;
            return next;
          }),
        );
        if (updated) {
          persistLeadUpdate(updated.organization_id, id, patch);
        }
      },

      convertToBookingRequest: ({ lead_id, customers, actor_id }) => {
        const target = leads.find((l) => l.id === lead_id) ?? null;
        if (!target) {
          return { ok: false, booking_request_id: null, reason: "Lead not found" };
        }
        // Idempotent replay: already converted -> return existing id, no dup.
        if (
          target.status === "converted" &&
          target.converted_booking_request_id
        ) {
          return {
            ok: true,
            booking_request_id: target.converted_booking_request_id,
          };
        }
        if (!CONVERTIBLE_LEAD_STATUSES.includes(target.status)) {
          return {
            ok: false,
            booking_request_id: null,
            reason: `Lead status '${target.status}' is not convertible`,
          };
        }
        const { ok, missing_fields } = canConvertLead(target);
        if (!ok) {
          return {
            ok: false,
            booking_request_id: null,
            reason: "Missing required contact fields",
            missing_fields: missing_fields as string[],
          };
        }
        // Delegates to the authoritative booking store's createBookingRequest.
        // Never fabricates rental dates/vehicle; those stay null until staff
        // complete them during review. Creates ONE BookingRequest.
        const bookingId = bookingStore.createBookingRequest(
          leadToBookingRequestInput(target, { customers, actor_id }),
        );
        const at = nowISO();
        const updated: Lead = {
          ...target,
          status: "converted",
          converted_booking_request_id: bookingId,
          converted_at: at,
          updated_at: at,
        };
        setLeads((ls) => ls.map((l) => (l.id === lead_id ? updated : l)));
        persistLeadUpdate(updated.organization_id, lead_id, {
          status: "converted",
          converted_booking_request_id: bookingId,
          converted_at: at,
          updated_at: at,
        });
        return { ok: true, booking_request_id: bookingId };
      },

      matchByPhoneOrEmail: (phone, email) =>
        resolveLeadMatchByPhoneOrEmail({ leads, phone, email }),
    }),
    // bookingStore is stable context value; leads is the reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, bookingStore],
  );

  return (
    <LeadContext.Provider value={store}>{children}</LeadContext.Provider>
  );
}

export function useLeads(): LeadStore {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error("useLeads must be used within a LeadProvider");
  return ctx;
}

export function useLeadsOptional(): LeadStore | null {
  return useContext(LeadContext);
}

// Re-export for test/adapter ergonomics.
export {
  canConvertLead,
  getMissingConversionFields,
  leadToBookingRequestInput,
};
export type { LeadConversionInput };
import type { LeadConversionInput } from "../leadConversion";
export function isLeadConvertible(lead: Lead): boolean {
  return canConvertLead(lead).ok;
}

// Silence unused-import warnings for re-exports used only by type paths.
export type { BookingCrmInboundEvent };