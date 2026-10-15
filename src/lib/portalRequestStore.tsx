// Connect Pro Fleet — Customer Portal request store (Build #32).
//
// A portal request is the REQUEST RECORD. Once staff approves and performs the
// operational action, the existing Rental/domain system becomes authoritative.
// Submitting a request NEVER mutates the rental lifecycle (no auto-extend, no
// auto-exchange, no auto-return). Staff review is required (V1 = human review).
//
// Tenant-scoped: a customer only ever sees their own requests. One open
// request = one associated review Task (deduped). Staff can approve/decline/
// complete with a customer-visible response.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uid, nextPortalRequestNumber } from "./portalSessionStore";
import { TENANT_ID } from "./store/ids";
import type {
  CustomerPortalRequest,
  PortalRequestStatus,
  PortalRequestType,
  PortalRequestTimelineEntry,
  ExchangeReason,
} from "./portalTypes";

export interface CreateExtensionRequestInput {
  tenant_id: string;
  customer_id: string;
  rental_id: string;
  current_scheduled_end: string;
  requested_new_end: string;
  customer_note: string | null;
  estimated_extension_charge: number | null;
}

export interface CreateExchangeRequestInput {
  tenant_id: string;
  customer_id: string;
  rental_id: string;
  exchange_reason: ExchangeReason;
  issue_description: string | null;
  preferred_timing: string | null;
  customer_note: string | null;
}

export interface CreateReturnRequestInput {
  tenant_id: string;
  customer_id: string;
  rental_id: string;
  requested_return_date: string;
  requested_return_location: string | null;
  customer_note: string | null;
}

export interface CreateGenericRequestInput {
  tenant_id: string;
  customer_id: string;
  rental_id: string | null;
  request_type: Extract<
    PortalRequestType,
    "document_help" | "billing_question" | "other"
  >;
  subject: string;
  customer_note: string | null;
}

export interface StaffReviewInput {
  status: "under_review" | "approved" | "declined" | "completed";
  staff_response?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  linked_task_id?: string | null;
  assigned_staff_id?: string | null;
}

function seedRequests(): CustomerPortalRequest[] {
  const now = "2026-09-02T10:00:00Z";
  return [
    {
      id: "pr_seed_1",
      request_number: "PR-501",
      tenant_id: TENANT_ID,
      customer_id: "cus_1",
      rental_id: "rnt_1",
      request_type: "extension",
      status: "under_review",
      subject: "Extend rental to September 7",
      customer_note: "Need a couple more days with the SUV.",
      staff_response: null,
      current_scheduled_end: "2026-08-28",
      requested_new_end: "2026-09-07",
      estimated_extension_charge: 720,
      exchange_reason: null,
      exchange_issue_description: null,
      exchange_preferred_timing: null,
      requested_return_date: null,
      requested_return_location: null,
      assigned_staff_id: null,
      linked_task_id: null,
      created_at: "2026-09-01T14:00:00Z",
      updated_at: now,
      last_activity_at: now,
      resolved_at: null,
      timeline: [
        {
          id: "prt_seed_1",
          at: "2026-09-01T14:00:00Z",
          event_type: "submitted",
          label: "Extension request submitted",
          actor: "customer",
          actor_name: "Hannah Ortiz",
        },
        {
          id: "prt_seed_2",
          at: "2026-09-01T16:00:00Z",
          event_type: "status_changed",
          label: "Moved to Under Review",
          actor: "staff",
          actor_name: "Ava Reyes",
        },
      ],
    },
  ];
}

function pushTimeline(
  req: CustomerPortalRequest,
  entry: Omit<PortalRequestTimelineEntry, "id">,
): CustomerPortalRequest {
  return {
    ...req,
    timeline: [...req.timeline, { ...entry, id: uid("prt") }],
  };
}

export interface PortalRequestStore {
  requests: CustomerPortalRequest[];
  getRequestsForCustomer: (
    tenantId: string,
    customerId: string,
  ) => CustomerPortalRequest[];
  getRequest: (
    tenantId: string,
    requestId: string,
  ) => CustomerPortalRequest | undefined;
  createExtensionRequest: (
    input: CreateExtensionRequestInput,
  ) => CustomerPortalRequest;
  createExchangeRequest: (
    input: CreateExchangeRequestInput,
  ) => CustomerPortalRequest;
  createReturnRequest: (
    input: CreateReturnRequestInput,
  ) => CustomerPortalRequest;
  createGenericRequest: (
    input: CreateGenericRequestInput,
  ) => CustomerPortalRequest;
  cancelRequest: (
    tenantId: string,
    requestId: string,
    actorName: string,
  ) => void;
  staffReview: (
    tenantId: string,
    requestId: string,
    input: StaffReviewInput,
  ) => void;
  /** All requests for a tenant (staff queue). */
  getAllForTenant: (tenantId: string) => CustomerPortalRequest[];
}

const PortalRequestContext = createContext<PortalRequestStore | null>(null);

export function PortalRequestProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<CustomerPortalRequest[]>(() =>
    seedRequests(),
  );

  const getRequestsForCustomer = useCallback(
    (tenantId: string, customerId: string) =>
      requests
        .filter((r) => r.tenant_id === tenantId && r.customer_id === customerId)
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at)),
    [requests],
  );

  const getAllForTenant = useCallback(
    (tenantId: string) =>
      requests
        .filter((r) => r.tenant_id === tenantId)
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at)),
    [requests],
  );

  const getRequest = useCallback(
    (tenantId: string, requestId: string) =>
      requests.find((r) => r.tenant_id === tenantId && r.id === requestId),
    [requests],
  );

  const baseCreate = useCallback(
    (
      input: {
        tenant_id: string;
        customer_id: string;
        rental_id: string | null;
        request_type: PortalRequestType;
        subject: string;
        customer_note: string | null;
      },
      now: string,
    ): CustomerPortalRequest => {
      const req: CustomerPortalRequest = {
        id: uid("pr"),
        request_number: nextPortalRequestNumber(),
        tenant_id: input.tenant_id,
        customer_id: input.customer_id,
        rental_id: input.rental_id,
        request_type: input.request_type,
        status: "submitted",
        subject: input.subject,
        customer_note: input.customer_note,
        staff_response: null,
        current_scheduled_end: null,
        requested_new_end: null,
        estimated_extension_charge: null,
        exchange_reason: null,
        exchange_issue_description: null,
        exchange_preferred_timing: null,
        requested_return_date: null,
        requested_return_location: null,
        assigned_staff_id: null,
        linked_task_id: null,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
        resolved_at: null,
        timeline: [
          {
            id: uid("prt"),
            at: now,
            event_type: "submitted",
            label: `${input.request_type} request submitted`,
            actor: "customer",
            actor_name: null,
          },
        ],
      };
      setRequests((prev) => [req, ...prev]);
      return req;
    },
    [],
  );

  const createExtensionRequest = useCallback(
    (input: CreateExtensionRequestInput): CustomerPortalRequest => {
      const now = new Date().toISOString();
      let req = baseCreate(
        {
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          rental_id: input.rental_id,
          request_type: "extension",
          subject: `Extend rental to ${input.requested_new_end}`,
          customer_note: input.customer_note,
        },
        now,
      );
      req = {
        ...req,
        current_scheduled_end: input.current_scheduled_end,
        requested_new_end: input.requested_new_end,
        estimated_extension_charge: input.estimated_extension_charge,
      };
      setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
      return req;
    },
    [baseCreate],
  );

  const createExchangeRequest = useCallback(
    (input: CreateExchangeRequestInput): CustomerPortalRequest => {
      const now = new Date().toISOString();
      let req = baseCreate(
        {
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          rental_id: input.rental_id,
          request_type: "exchange",
          subject: "Vehicle exchange request",
          customer_note: input.customer_note,
        },
        now,
      );
      req = {
        ...req,
        exchange_reason: input.exchange_reason,
        exchange_issue_description: input.issue_description,
        exchange_preferred_timing: input.preferred_timing,
      };
      setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
      return req;
    },
    [baseCreate],
  );

  const createReturnRequest = useCallback(
    (input: CreateReturnRequestInput): CustomerPortalRequest => {
      const now = new Date().toISOString();
      let req = baseCreate(
        {
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          rental_id: input.rental_id,
          request_type: "return",
          subject: `Return on ${input.requested_return_date}`,
          customer_note: input.customer_note,
        },
        now,
      );
      req = {
        ...req,
        requested_return_date: input.requested_return_date,
        requested_return_location: input.requested_return_location,
      };
      setRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
      return req;
    },
    [baseCreate],
  );

  const createGenericRequest = useCallback(
    (input: CreateGenericRequestInput): CustomerPortalRequest => {
      const now = new Date().toISOString();
      return baseCreate(
        {
          tenant_id: input.tenant_id,
          customer_id: input.customer_id,
          rental_id: input.rental_id,
          request_type: input.request_type,
          subject: input.subject,
          customer_note: input.customer_note,
        },
        now,
      );
    },
    [baseCreate],
  );

  const cancelRequest = useCallback(
    (tenantId: string, requestId: string, actorName: string) => {
      const now = new Date().toISOString();
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== requestId || r.tenant_id !== tenantId) return r;
          if (["completed", "declined", "cancelled"].includes(r.status))
            return r;
          const updated = {
            ...r,
            status: "cancelled" as PortalRequestStatus,
            updated_at: now,
            last_activity_at: now,
            resolved_at: now,
          };
          return pushTimeline(updated, {
            at: now,
            event_type: "cancelled",
            label: "Request cancelled",
            actor: "customer",
            actor_name: actorName,
          });
        }),
      );
    },
    [],
  );

  const staffReview = useCallback(
    (tenantId: string, requestId: string, input: StaffReviewInput) => {
      const now = new Date().toISOString();
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== requestId || r.tenant_id !== tenantId) return r;
          const resolved = ["approved", "declined", "completed"].includes(
            input.status,
          );
          let updated: CustomerPortalRequest = {
            ...r,
            status: input.status,
            staff_response: input.staff_response ?? r.staff_response,
            assigned_staff_id: input.assigned_staff_id ?? r.assigned_staff_id,
            linked_task_id: input.linked_task_id ?? r.linked_task_id,
            updated_at: now,
            last_activity_at: now,
            resolved_at: resolved ? now : r.resolved_at,
          };
          const labelMap: Record<string, string> = {
            under_review: "Moved to Under Review",
            approved: "Request approved",
            declined: "Request declined",
            completed: "Request completed",
          };
          updated = pushTimeline(updated, {
            at: now,
            event_type: "status_changed",
            label: labelMap[input.status] ?? `Status: ${input.status}`,
            actor: "staff",
            actor_name: input.staff_name ?? null,
          });
          return updated;
        }),
      );
    },
    [],
  );

  const value = useMemo<PortalRequestStore>(
    () => ({
      requests,
      getRequestsForCustomer,
      getRequest,
      createExtensionRequest,
      createExchangeRequest,
      createReturnRequest,
      createGenericRequest,
      cancelRequest,
      staffReview,
      getAllForTenant,
    }),
    [
      requests,
      getRequestsForCustomer,
      getRequest,
      createExtensionRequest,
      createExchangeRequest,
      createReturnRequest,
      createGenericRequest,
      cancelRequest,
      staffReview,
      getAllForTenant,
    ],
  );

  return (
    <PortalRequestContext.Provider value={value}>
      {children}
    </PortalRequestContext.Provider>
  );
}

export function usePortalRequests(): PortalRequestStore {
  const ctx = useContext(PortalRequestContext);
  if (!ctx)
    throw new Error(
      "usePortalRequests must be used within PortalRequestProvider",
    );
  return ctx;
}
