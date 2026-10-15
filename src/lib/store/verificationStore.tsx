// Connect Pro Fleet — Verification store (V1, frontend mock).
//
// In-memory store seeded from mockVerificationState. No persistence, no network,
// no real provider calls, no credentials. Mutations (require/remove a check,
// run a paid check, override a result) are local UI state so the workflow is
// fully interactive in mock mode. Org-scoped by construction (all seed records
// share TENANT_ID; selectors join only to same-org customers/rentals).
//
// The store is the operational layer for paid/third-party verification. It does
// NOT duplicate Customer/Driver document data — document collection lives in the
// compliance/customer domain. Verification records reference customer_id /
// rental_id / reservation_id / booking_request_id and resolve context through
// authoritative records.
//
// Developer-later: replace this with Supabase-backed reads/writes + RLS, real
// provider APIs, Stripe usage billing, secure sensitive-data handling.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  VerificationRequest,
  VerificationResult,
  VerificationUsageCharge,
  VerificationRequirement,
  VerificationOverride,
  VerificationAuditEvent,
  VerificationType,
  VerificationProviderId,
  VerificationRequestStatus,
} from "../verificationTypes";
import { TENANT_ID } from "./ids";
import { mockVerificationState } from "./seedVerification";
import {
  verificationAdapters,
  pickProviderForType,
  providerSupports,
} from "../verificationAdapters";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
const NOW = () => new Date("2026-09-27T12:00:00Z").toISOString();

export interface RunCheckInput {
  customer_id: string | null;
  booking_request_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  verification_type: VerificationType;
  provider?: VerificationProviderId | null;
  requested_by: string | null;
}

export interface RunCheckResult {
  request: VerificationRequest;
  usage_charge: VerificationUsageCharge | null;
}

export interface VerificationStoreState {
  requests: VerificationRequest[];
  usageCharges: VerificationUsageCharge[];
  requirements: VerificationRequirement[];
  overrides: VerificationOverride[];
  audit: VerificationAuditEvent[];
  adapters: typeof verificationAdapters;

  // ── Mutations (mock, local state) ──

  /** Staff requires an additional verification check for a specific customer /
   *  rental / reservation / booking request. Does NOT modify company policy. */
  requireCheck: (input: {
    verification_type: VerificationType;
    customer_id?: string | null;
    booking_request_id?: string | null;
    reservation_id?: string | null;
    rental_id?: string | null;
    required_by_staff_id: string;
    reason?: string | null;
  }) => void;

  /** Remove a staff-added requirement (permission-controlled at the call site).
   *  Company-policy "Required" cannot be removed here — only staff requirements. */
  removeRequirement: (requirement_id: string, staff_id: string) => void;

  /** Run a paid verification check. Creates a VerificationRequest (pending) +
   *  a mock UsageCharge (authorized). Staff confirm before calling (UI dialog).
   *  Does NOT auto-run — V1 default is manual. Returns the new request + charge. */
  runCheck: (input: RunCheckInput) => RunCheckResult;

  /** Complete a pending request with a mock provider result (simulates the
   *  provider callback). Records an audit event + provider result. */
  completeCheck: (
    request_id: string,
    result: Omit<VerificationResult, "verification_request_id">,
  ) => void;

  /** Permission-controlled operational override. The provider result is
   *  PRESERVED (unchanged); the override is recorded on top (audited). */
  overrideResult: (input: {
    verification_request_id: string;
    decision: "approved" | "denied";
    reason: string;
    staff_id: string;
  }) => void;
}

const VerificationContext = createContext<VerificationStoreState | null>(null);

function pushAudit(
  setAudit: React.Dispatch<React.SetStateAction<VerificationAuditEvent[]>>,
  ev: Omit<VerificationAuditEvent, "id" | "organization_id" | "created_at">,
) {
  setAudit((prev) => [
    {
      ...ev,
      id: uid("vaud"),
      organization_id: TENANT_ID,
      created_at: NOW(),
    },
    ...prev,
  ]);
}

export function VerificationProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<VerificationRequest[]>(
    mockVerificationState.requests,
  );
  const [usageCharges, setUsageCharges] = useState<VerificationUsageCharge[]>(
    mockVerificationState.usageCharges,
  );
  const [requirements, setRequirements] = useState<VerificationRequirement[]>(
    mockVerificationState.requirements,
  );
  const [overrides, setOverrides] = useState<VerificationOverride[]>(
    mockVerificationState.overrides,
  );
  const [audit, setAudit] = useState<VerificationAuditEvent[]>(
    mockVerificationState.audit,
  );

  const value = useMemo<VerificationStoreState>(
    () => ({
      requests,
      usageCharges,
      requirements,
      overrides,
      audit,
      adapters: verificationAdapters,

      requireCheck: (input) => {
        const id = uid("vreq_req");
        const req: VerificationRequirement = {
          id,
          organization_id: TENANT_ID,
          verification_type: input.verification_type,
          customer_id: input.customer_id ?? null,
          booking_request_id: input.booking_request_id ?? null,
          reservation_id: input.reservation_id ?? null,
          rental_id: input.rental_id ?? null,
          required_by_staff_id: input.required_by_staff_id,
          required_at: NOW(),
          reason: input.reason ?? null,
          removed: false,
          removed_by_staff_id: null,
          removed_at: null,
        };
        setRequirements((prev) => [req, ...prev]);
        pushAudit(setAudit, {
          verification_type: input.verification_type,
          customer_id: input.customer_id ?? null,
          rental_id: input.rental_id ?? null,
          reservation_id: input.reservation_id ?? null,
          booking_request_id: input.booking_request_id ?? null,
          event_type: "requirement_added",
          detail: input.reason ?? "Verification requirement added by staff.",
          actor_id: input.required_by_staff_id,
        });
      },

      removeRequirement: (requirement_id, staff_id) => {
        setRequirements((prev) => {
          const target = prev.find((r) => r.id === requirement_id);
          if (!target) return prev;
          pushAudit(setAudit, {
            verification_type: target.verification_type,
            customer_id: target.customer_id,
            rental_id: target.rental_id,
            reservation_id: target.reservation_id,
            booking_request_id: target.booking_request_id,
            event_type: "requirement_removed",
            detail: "Staff requirement removed.",
            actor_id: staff_id,
          });
          return prev.map((r) =>
            r.id === requirement_id
              ? {
                  ...r,
                  removed: true,
                  removed_by_staff_id: staff_id,
                  removed_at: NOW(),
                }
              : r,
          );
        });
      },

      runCheck: (input) => {
        // Pick a connected provider that supports the type (mock). Caller may
        // override with a specific provider.
        const adapter =
          (input.provider
            ? verificationAdapters.find((a) => a.provider === input.provider)
            : null) ?? pickProviderForType(input.verification_type);
        const provider = adapter?.provider ?? "custom";
        const at = NOW();
        const requestId = uid("vreq");
        const chargeId = uid("vuc");
        const platformPrice = adapter
          ? adapter.estimatePrice(input.verification_type)
          : 0;
        const request: VerificationRequest = {
          id: requestId,
          organization_id: TENANT_ID,
          customer_id: input.customer_id,
          booking_request_id: input.booking_request_id,
          reservation_id: input.reservation_id,
          rental_id: input.rental_id,
          verification_type: input.verification_type,
          provider,
          status: "pending",
          requested_at: at,
          completed_at: null,
          requested_by: input.requested_by,
          external_reference: "EXT-" + requestId.toUpperCase(),
          expires_at: null,
          usage_charge_id: chargeId,
          result: null,
          created_at: at,
          updated_at: at,
        };
        const charge: VerificationUsageCharge = {
          id: chargeId,
          organization_id: TENANT_ID,
          verification_request_id: requestId,
          service_type: input.verification_type,
          provider,
          provider_cost_mock: Math.round(platformPrice * 0.6),
          platform_price_mock: platformPrice,
          currency: "USD",
          status: "authorized",
          created_at: at,
        };
        setRequests((prev) => [request, ...prev]);
        setUsageCharges((prev) => [charge, ...prev]);
        pushAudit(setAudit, {
          verification_type: input.verification_type,
          customer_id: input.customer_id,
          rental_id: input.rental_id,
          reservation_id: input.reservation_id,
          booking_request_id: input.booking_request_id,
          event_type: "check_requested",
          detail: `${input.verification_type} check requested (provider: ${provider}).`,
          actor_id: input.requested_by,
        });
        pushAudit(setAudit, {
          verification_type: input.verification_type,
          customer_id: input.customer_id,
          rental_id: input.rental_id,
          reservation_id: input.reservation_id,
          booking_request_id: input.booking_request_id,
          event_type: "usage_charge_generated",
          detail: `Usage charge $${platformPrice.toFixed(2)} generated for ${input.verification_type} check.`,
          actor_id: input.requested_by,
        });
        return { request, usage_charge: charge };
      },

      completeCheck: (request_id, result) => {
        setRequests((prev) =>
          prev.map((r) => {
            if (r.id !== request_id) return r;
            const status: VerificationRequestStatus =
              result.result_status === "verified" ||
              result.result_status === "clear"
                ? "completed"
                : result.result_status === "needs_review"
                  ? "needs_review"
                  : result.result_status === "failed"
                    ? "failed"
                    : result.result_status === "expired"
                      ? "expired"
                      : "completed";
            const completed: VerificationRequest = {
              ...r,
              status,
              completed_at: NOW(),
              result: { ...result, verification_request_id: request_id },
              updated_at: NOW(),
            };
            pushAudit(setAudit, {
              verification_type: r.verification_type,
              customer_id: r.customer_id,
              rental_id: r.rental_id,
              reservation_id: r.reservation_id,
              booking_request_id: r.booking_request_id,
              event_type: "check_completed",
              detail: `${r.verification_type} check completed — ${result.result_status}.`,
              actor_id: r.requested_by,
            });
            pushAudit(setAudit, {
              verification_type: r.verification_type,
              customer_id: r.customer_id,
              rental_id: r.rental_id,
              reservation_id: r.reservation_id,
              booking_request_id: r.booking_request_id,
              event_type: "provider_result",
              detail:
                result.summary ?? `Provider result: ${result.result_status}.`,
              actor_id: null,
            });
            // Mark the usage charge as charged on completion.
            setUsageCharges((ucs) =>
              ucs.map((u) =>
                u.verification_request_id === request_id
                  ? { ...u, status: "charged" }
                  : u,
              ),
            );
            return completed;
          }),
        );
      },

      overrideResult: (input) => {
        const ov: VerificationOverride = {
          id: uid("vov"),
          organization_id: TENANT_ID,
          verification_request_id: input.verification_request_id,
          decision: input.decision,
          reason: input.reason,
          staff_id: input.staff_id,
          created_at: NOW(),
        };
        setOverrides((prev) => [ov, ...prev]);
        const target = requests.find(
          (r) => r.id === input.verification_request_id,
        );
        pushAudit(setAudit, {
          verification_type: target?.verification_type ?? "identity",
          customer_id: target?.customer_id ?? null,
          rental_id: target?.rental_id ?? null,
          reservation_id: target?.reservation_id ?? null,
          booking_request_id: target?.booking_request_id ?? null,
          event_type: "override",
          detail: `Override ${input.decision} — ${input.reason} (provider result preserved).`,
          actor_id: input.staff_id,
        });
      },
    }),
    [requests, usageCharges, requirements, overrides, audit],
  );

  return (
    <VerificationContext.Provider value={value}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification(): VerificationStoreState {
  const ctx = useContext(VerificationContext);
  if (!ctx)
    throw new Error("useVerification must be used within VerificationProvider");
  return ctx;
}

/** Optional variant — returns null when the VerificationProvider is not mounted
 *  (e.g. in older test harnesses that predate V1 Verification). Callers (Action
 *  Center, Copilot) degrade gracefully: no verification attention when null. */
export function useVerificationOptional(): VerificationStoreState | null {
  const ctx = useContext(VerificationContext);
  return ctx ?? null;
}

/** Re-export for callers that need capability checks without the store. */
export { providerSupports };
