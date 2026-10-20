// Phase 10B — Lead/Prospect domain + repository + conversion foundation tests.
//
// Pure-TypeScript (no live DB) so the Lead contract is locked in regardless of
// transient Cloud connectivity. Covers: row/domain mapping, org ownership,
// create/update repository behavior, reporting isolation (Leads are NOT
// Customers), external identity separation, custom/intake JSON round trip,
// phone/email fallback matching, ambiguous-match no-merge, Lead→BookingRequest
// conversion (contact preserved, no fabricated rental fields, idempotent
// replay, status becomes "converted"), and no automatic Customer creation from
// Lead creation.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  LeadProvider,
  useLeads,
} from "@/lib/store/leadStore";
import type { BookingRequestStore } from "@/lib/store/bookingRequestStore";
import type { Lead } from "@/lib/leadTypes";
import {
  rowToLead,
  leadToRow,
  leadPatchToRow,
} from "@/lib/supabase/phase10Mappers";
import type { LeadRow } from "@/lib/supabase/dbTypesPhase10";
import {
  canConvertLead,
  getMissingConversionFields,
  leadToBookingRequestInput,
} from "@/lib/leadConversion";
import {
  resolveLeadMatchByPhoneOrEmail,
} from "@/lib/leadMatch";
import { PHASE_10B_LEAD_TABLE } from "@/lib/supabase/dbTypesPhase10";

// A mock booking store that records createBookingRequest calls and returns a
// deterministic id. Lets us assert conversion idempotency + no dup without the
// full booking provider stack.
function mockBookingStore(): BookingRequestStore & {
  createCalls: number;
  lastActorId: string | null;
} {
  const store: BookingRequestStore & {
    createCalls: number;
    lastActorId: string | null;
  } = {
    bookingRequests: [],
    outboundEvents: [],
    bookingById: () => null,
    nextRequestNumber: () => "BRQ-0001",
    ingestCrmEvent: () => ({
      booking_request_id: "brq",
      created: true,
      duplicate: false,
    }),
    createBookingRequest: (input) => {
      store.createCalls += 1;
      store.lastActorId = input.actor_id;
      return `brq_${store.createCalls}`;
    },
    setStatus: () => {},
    assignStaff: () => {},
    putOnWaitlist: () => {},
    decline: () => {},
    cancel: () => {},
    convertToReservation: () => "resv",
    resolveMatch: () => {},
    createCalls: 0,
    lastActorId: null,
  };
  return store;
}

function makeLead(over: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    organization_id: "tnt_connectpro",
    first_name: "Jane",
    last_name: "Doe",
    phone: "+15551234567",
    email: "jane@example.com",
    source: "connect_pro_crm",
    status: "new",
    tags: ["rideshare"],
    crm_opportunity_id: "opp_1",
    crm_pipeline_stage: "New",
    lead_source: "Facebook Lead Form",
    intake_data: {
      desired_pickup_date: "2026-11-01",
      rental_type: "weekly",
      vehicle_preference: "SUV",
      rideshare_platform: "Uber",
      employer: "Acme",
      notes: "Needs child seat",
    },
    notes: "CRM lead",
    converted_booking_request_id: null,
    converted_at: null,
    created_by: null,
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
    ...over,
  };
}

function makeLeadRow(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "lead_1",
    organization_id: "tnt_connectpro",
    first_name: "Jane",
    last_name: "Doe",
    phone: "+15551234567",
    email: "jane@example.com",
    source: "connect_pro_crm",
    status: "new",
    tags: ["rideshare"],
    crm_opportunity_id: "opp_1",
    crm_pipeline_stage: "New",
    lead_source: "Facebook Lead Form",
    intake_data: {
      desired_pickup_date: "2026-11-01",
      rental_type: "weekly",
      vehicle_preference: "SUV",
    },
    notes: "CRM lead",
    converted_booking_request_id: null,
    converted_at: null,
    created_by: null,
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
    ...over,
  };
}

describe("Phase 10B Lead row/domain mapping", () => {
  it("PHASE_10B_LEAD_TABLE is 'leads'", () => {
    expect(PHASE_10B_LEAD_TABLE).toBe("leads");
  });

  it("rowToLead round-trips all fields including custom/intake JSON", () => {
    const row = makeLeadRow({
      intake_data: { rental_type: "weekly", employer: "Acme" },
      tags: ["a", "b"],
    });
    const lead = rowToLead(row);
    expect(lead.id).toBe("lead_1");
    expect(lead.organization_id).toBe("tnt_connectpro");
    expect(lead.source).toBe("connect_pro_crm");
    expect(lead.intake_data).toEqual({ rental_type: "weekly", employer: "Acme" });
    expect(lead.tags).toEqual(["a", "b"]);
  });

  it("leadToRow preserves the Lead back to a row", () => {
    const lead = makeLead();
    const row = leadToRow(lead);
    expect(row.first_name).toBe("Jane");
    expect(row.organization_id).toBe("tnt_connectpro");
    expect(row.intake_data).toEqual(lead.intake_data);
  });

  it("leadPatchToRow only includes provided fields", () => {
    const patch = leadPatchToRow({ status: "qualified", notes: "x" });
    expect(patch.status).toBe("qualified");
    expect(patch.notes).toBe("x");
    expect(patch.first_name).toBeUndefined();
  });

  it("rowToLead tolerates missing/odd tags + intake_data shapes", () => {
    const lead = rowToLead(
      makeLeadRow({ tags: undefined as unknown as string[], intake_data: "nope" }),
    );
    expect(lead.tags).toEqual([]);
    expect(lead.intake_data).toEqual({});
  });
});

describe("Phase 10B Lead — no rental-operational fields", () => {
  it("a Lead has no balance/deposit/rental/vehicle-assignment fields", () => {
    const lead = makeLead();
    expect(lead).not.toHaveProperty("balance");
    expect(lead).not.toHaveProperty("deposit");
    expect(lead).not.toHaveProperty("active_rental");
    expect(lead).not.toHaveProperty("vehicle_id");
    expect(lead).not.toHaveProperty("maintenance");
    expect(lead).not.toHaveProperty("inspection");
  });
});

describe("Phase 10B Lead conversion eligibility", () => {
  it("a complete Lead is convertible", () => {
    expect(canConvertLead(makeLead()).ok).toBe(true);
  });
  it("a Lead with no phone AND no email is not convertible", () => {
    const m = getMissingConversionFields(
      makeLead({ phone: "", email: "" }),
    );
    expect(m).toContain("phone_or_email");
    expect(canConvertLead(makeLead({ phone: "", email: "" })).ok).toBe(false);
  });
  it("a Lead missing first_name is not convertible", () => {
    expect(canConvertLead(makeLead({ first_name: "" })).ok).toBe(false);
  });
});

describe("Phase 10B leadToBookingRequestInput", () => {
  it("carries contact data + intake fields without fabricating rental dates", () => {
    const lead = makeLead({
      intake_data: {
        requested_start_date: "2026-11-01",
        requested_vehicle_class_id: "class_suv",
      },
    });
    const input = leadToBookingRequestInput(lead, {
      customers: [],
      actor_id: "staff_1",
    });
    expect(input.first_name).toBe("Jane");
    expect(input.phone).toBe("+15551234567");
    expect(input.requested_start_date).toBe("2026-11-01");
    expect(input.requested_vehicle_class_id).toBe("class_suv");
    expect(input.requested_end_date).toBeNull(); // not present in intake -> null, not fabricated
    expect(input.requested_vehicle_id).toBeNull();
    expect(input.source).toBe("connect_pro_crm");
  });
});

describe("Phase 10B Lead phone/email fallback matching", () => {
  it("clear phone match resolves to one Lead", () => {
    const leads = [makeLead(), makeLead({ id: "lead_2", phone: "+15559990000", email: "x@y.com" })];
    const r = resolveLeadMatchByPhoneOrEmail({ leads, phone: "+1555-123-4567", email: "" });
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") expect(r.lead_id).toBe("lead_1");
  });
  it("ambiguous phone/email match does not auto-merge", () => {
    const leads = [
      makeLead(),
      makeLead({ id: "lead_2", phone: "+15551234567", email: "other@example.com" }),
    ];
    const r = resolveLeadMatchByPhoneOrEmail({ leads, phone: "+15551234567", email: "jane@example.com" });
    expect(r.kind).toBe("ambiguous");
  });
  it("no match returns none", () => {
    expect(
      resolveLeadMatchByPhoneOrEmail({ leads: [makeLead()], phone: "+1999", email: "nope@nope.com" }),
    ).toEqual({ kind: "none" });
  });
});

describe("Phase 10B Lead store", () => {
  it("createLead creates a new Lead with org ownership + status new", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    act(() => {
      result.current.createLead({
        first_name: "Jane",
        last_name: "Doe",
        phone: "+15551234567",
        email: "jane@example.com",
        intake_data: { rental_type: "weekly" },
      });
    });
    expect(result.current.leads).toHaveLength(1);
    expect(result.current.leads[0].status).toBe("new");
    expect(result.current.leads[0].organization_id).toBe("tnt_connectpro");
  });

  it("createLead upserts on unambiguous phone/email match (no dup)", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    act(() => {
      result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "+15551234567", email: "jane@example.com" });
    });
    act(() => {
      result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "+15551234567", email: "jane@example.com", intake_data: { employer: "Acme" } });
    });
    expect(result.current.leads).toHaveLength(1);
    expect(result.current.leads[0].intake_data.employer).toBe("Acme");
  });

  it("ambiguous phone/email create does not merge (creates a new Lead)", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    // Seed two leads with disjoint identity (clean creates).
    act(() => {
      result.current.createLead({ first_name: "A", last_name: "Z", phone: "111", email: "a@x.com" });
    });
    act(() => {
      result.current.createLead({ first_name: "B", last_name: "Y", phone: "222", email: "b@x.com" });
    });
    // A third contact whose phone matches lead1 and email matches lead2 is
    // ambiguous across two distinct people => must NOT merge => new Lead.
    act(() => {
      result.current.createLead({ first_name: "C", last_name: "W", phone: "111", email: "b@x.com" });
    });
    expect(result.current.leads).toHaveLength(3);
  });

  it("updateLead changes status", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    let id = "";
    act(() => {
      id = result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "+1", email: "j@x.com" }).id;
    });
    act(() => {
      result.current.updateLead(id, { status: "qualified" });
    });
    expect(result.current.leadById(id)?.status).toBe("qualified");
  });

  it("convertToBookingRequest creates ONE booking, sets status converted, passes actor", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    let id = "";
    act(() => {
      id = result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "+15551234567", email: "jane@example.com" }).id;
    });
    let conv: { ok: boolean; booking_request_id: string | null } = { ok: false, booking_request_id: null };
    act(() => {
      conv = result.current.convertToBookingRequest({ lead_id: id, customers: [], actor_id: "staff_9" });
    });
    expect(conv.ok).toBe(true);
    expect(conv.booking_request_id).toBeTruthy();
    expect(result.current.leadById(id)?.status).toBe("converted");
    expect(result.current.leadById(id)?.converted_booking_request_id).toBe(conv.booking_request_id);
    expect(booking.createCalls).toBe(1); // booking store called exactly once (no dup)
    expect(booking.lastActorId).toBe("staff_9");
  });

  it("repeated conversion is idempotent (no duplicate booking, returns existing id)", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    let id = "";
    act(() => {
      id = result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "+15551234567", email: "jane@example.com" }).id;
    });
    let first = { ok: false, booking_request_id: null as string | null };
    act(() => {
      first = result.current.convertToBookingRequest({ lead_id: id, customers: [], actor_id: "s1" });
    });
    let second = { ok: false, booking_request_id: null as string | null };
    act(() => {
      second = result.current.convertToBookingRequest({ lead_id: id, customers: [], actor_id: "s2" });
    });
    expect(second.ok).toBe(true);
    expect(second.booking_request_id).toBe(first.booking_request_id);
  });

  it("a Lead missing contact identity does not convert (no fabricated booking)", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    let id = "";
    act(() => {
      id = result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "", email: "" }).id;
    });
    let conv: { ok: boolean; booking_request_id: string | null; reason?: string } = { ok: false, booking_request_id: null };
    act(() => {
      conv = result.current.convertToBookingRequest({ lead_id: id, customers: [], actor_id: "s1" });
    });
    expect(conv.ok).toBe(false);
    expect(conv.booking_request_id).toBeNull();
    expect(result.current.leadById(id)?.status).not.toBe("converted");
  });

  it("creating a Lead does NOT create a Customer (reporting isolation)", () => {
    const booking = mockBookingStore();
    const { result } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <LeadProvider bookingStoreOverride={booking as BookingRequestStore}>
          {children}
        </LeadProvider>
      ),
    });
    act(() => {
      result.current.createLead({ first_name: "Jane", last_name: "Doe", phone: "+15551234567", email: "jane@example.com" });
    });
    // The Lead store exposes no Customer list and never surfaces Leads as Customers.
    expect((result.current as unknown as { customers?: unknown }).customers).toBeUndefined();
    expect(result.current.leads).toHaveLength(1);
  });
});