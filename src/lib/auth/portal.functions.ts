// Customer Portal Lite — server functions (thin wrappers).
//
// resolvePortalIdentityFn: given the authenticated user, return their linked
//   (organization_id, customer_id, email) or null. The browser never supplies
//   customer_id.
// createPortalRequestFn: insert one portal request for the resolved identity.
// listPortalRequestsFn: list the resolved renter's own requests.
// provisionPortalAccessFn: staff action — mint a renter's portal auth link.
//
// Keep this file free of runtime helpers so the server-fn splitter does not
// drop siblings; logic lives in ./portal.server.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  resolvePortalIdentity,
  createPortalRequestRow,
  listPortalRequests,
  provisionPortalAccess,
  type PortalIdentity,
  type PortalRequestRow,
} from "./portal.server";

export type { PortalIdentity, PortalRequestRow };

export interface ResolvedPortal {
  identity: PortalIdentity | null;
  requests: PortalRequestRow[];
}

export const resolvePortalIdentityFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResolvedPortal> => {
    const identity = await resolvePortalIdentity(
      context.supabase,
      context.userId,
    );
    if (!identity) return { identity: null, requests: [] };
    const requests = await listPortalRequests(context.supabase, identity);
    return { identity, requests };
  });

const requestTypeSchema = z.enum([
  "extension",
  "return",
  "exchange",
  "document_help",
  "billing_question",
  "other",
]);

export const createPortalRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        rental_id: z.string().nullable().optional(),
        request_type: requestTypeSchema,
        subject: z.string().min(1).max(200),
        customer_note: z.string().max(2000).nullable().optional(),
        current_scheduled_end: z.string().nullable().optional(),
        requested_new_end: z.string().nullable().optional(),
        estimated_extension_charge: z.number().nullable().optional(),
        exchange_reason: z.string().nullable().optional(),
        exchange_issue_description: z.string().nullable().optional(),
        exchange_preferred_timing: z.string().nullable().optional(),
        requested_return_date: z.string().nullable().optional(),
        requested_return_location: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PortalRequestRow | null> => {
    const identity = await resolvePortalIdentity(
      context.supabase,
      context.userId,
    );
    if (!identity) return null; // no portal access
    // The Zod schema marks rental_id / customer_note as .nullable().optional(),
    // so they may be undefined; normalize to null to match the insert contract.
    return createPortalRequestRow(context.supabase, identity, {
      ...data,
      rental_id: data.rental_id ?? null,
      customer_note: data.customer_note ?? null,
    });
  });

export const provisionPortalAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        customer_id: z.string().min(1),
        organization_id: z.string().min(1),
        email: z.string().email(),
        user_id: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<PortalIdentity | null> => {
    // Staff-only: the caller must be an active member of the customer's org.
    // RLS enforces is_org_member(organization_id) on the upsert.
    return provisionPortalAccess(context.supabase, {
      customerId: data.customer_id,
      organizationId: data.organization_id,
      email: data.email,
      userId: data.user_id,
    });
  });
