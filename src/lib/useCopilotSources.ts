// Connect Pro Fleet — Copilot sources hook (Build #29).
//
// Assembles the CopilotSources bundle (briefing + customer360 + vehicleTwin +
// timeline) plus viewer permissions from the existing store/providers. The
// Copilot never duplicates source-of-truth — it composes the same selectors the
// pages use. Permission flags are resolved once and threaded into every handler
// so financial/sensitive data is filtered BEFORE any answer is formed.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useViolations } from "@/lib/violationStoreProvider";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useIncidents } from "@/lib/incidentsStore";
import { useDefense } from "@/lib/store/defenseStore";
import { useCaseCenterOptional } from "@/lib/store/caseCenterStore";
import { useBookingRequestsOptional } from "@/lib/store/bookingRequestStore";
import { useTelematicsOptional } from "@/lib/store/telematicsStore";
import { useVerificationOptional } from "@/lib/store/verificationStore";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import { can } from "@/lib/permissions";
import type {
  CopilotSources,
  CopilotViewerPermissions,
} from "@/lib/copilotTypes";
import type { TelematicsCopilotSources } from "@/lib/copilotTelematicsHandlers";
import type { VerificationCopilotSources } from "@/lib/copilotVerificationHandlers";
import type { TollsCopilotSources } from "@/lib/copilotTollHandlers";

export function useCopilotSources(): {
  sources: CopilotSources;
  perms: CopilotViewerPermissions;
  staffId: string;
  tenantId: string;
  /** Location ids the viewer may see (empty = all locations). */
  allowedLocationIds: string[];
  /** The organization's configured IANA timezone (CompanyInfo.timezone). */
  tz: string;
} {
  const store = useStore();
  const { billingPeriods } = useBilling();
  const dc = useDamageClaims();
  const vio = useViolations();
  const comp = useCompliance();
  const staffAssignments = useStaffAssignments();
  const incidents = useIncidents();
  const defenseStore = useDefense();
  const caseCenter = useCaseCenterOptional();
  const bookingRequests = useBookingRequestsOptional();
  const telematicsOpt = useTelematicsOptional();
  const verificationOpt = useVerificationOptional();
  const companyPolicies = useCompanyPolicies();

  const range = useMemo(() => resolveProfitabilityRange("this_year"), []);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;

  const perms: CopilotViewerPermissions = {
    canViewFinancials: can(roleObj, overrides, "payments.view"),
    canViewProfitability: can(
      roleObj,
      overrides,
      "reports.view_vehicle_profitability",
    ),
    canViewSensitiveDocs: can(roleObj, overrides, "documents.view_sensitive"),
    canViewBanking: can(roleObj, overrides, "banking.view"),
  };

  const workOrderEvents = useMemo(
    () =>
      store.workOrders.flatMap((w) =>
        store.workOrderEvents(w.id).map((event) => ({
          event,
          vehicleId: w.vehicle_id,
        })),
      ),
    [store],
  );

  const sources = useMemo<CopilotSources>(
    () => ({
      briefing: {
        store,
        billingPeriods,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        assignments: staffAssignments.assignments,
        range,
      },
      customer360: {
        store,
        billingPeriods,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        tasks: store.tasks,
        assignments: staffAssignments.assignments,
      },
      vehicleTwin: {
        store,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        range,
      },
      timeline: {
        store,
        billingPeriods,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        complianceEvents: comp.complianceEvents,
        expenses: store.expenses,
        tasks: store.tasks,
        taskEvents: store.taskEvents,
        assignments: staffAssignments.assignments,
        workOrderEvents,
      },
      // Build #52 — defense sources bundle for the defense-record handlers.
      defense: {
        rentals: store.rentals,
        rentalEvents: store.rentalEvents,
        customers: store.customers,
        vehicles: store.vehicles,
        inspections: store.inspections,
        drivers: store.drivers,
        workOrders: store.workOrders,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        incidents: incidents.incidents,
        rentalDrivers: defenseStore.rentalDrivers,
        releaseSnapshots: defenseStore.releaseSnapshots,
        vehicleExchanges: store.rentals.flatMap((r) =>
          store.vehicleExchanges(r.id),
        ),
        ownershipChanges: store.ownershipChanges,
        damageClaims: dc.damageClaims,
        tasks: store.tasks,
        staff: store.staff,
      },
      // Build #54 — Case Center sources bundle for the case Copilot handlers.
      // Optional: when the CaseCenterProvider is not mounted (e.g. Copilot UI
      // tests that predate Build #54) the bundle is omitted and case handlers
      // return a graceful fallback. Production (App.tsx) always mounts it.
      ...(caseCenter
        ? {
            caseCenter: {
              cases: caseCenter.cases,
              caseEvents: caseCenter.caseEvents,
              rentals: store.rentals,
              customers: store.customers,
              vehicles: store.vehicles,
              violations: vio.violations,
              incidents: incidents.incidents,
              damageClaims: dc.damageClaims,
              deposits: store.rentalDeposits,
              expenses: store.expenses,
              customerCharges: store.transactions,
              payments: store.transactions,
              tasks: store.tasks,
              staff: store.staff,
              releaseSnapshots: defenseStore.releaseSnapshots,
            },
          }
        : {}),
      // Build #62 — Booking Request (CRM handoff). Derived from the
      // authoritative BookingRequest store; optional so Copilot tests that
      // predate the booking provider omit it (handlers fall back gracefully).
      ...(bookingRequests
        ? {
            booking: {
              bookingRequests: bookingRequests.bookingRequests,
              outboundEvents: bookingRequests.outboundEvents,
              customers: store.customers,
              vehicles: store.vehicles,
              vehicleClasses: store.vehicleClasses,
              staff: store.staff,
            },
          }
        : {}),
      // V1 Telematics Hub — derived from the authoritative telematics store;
      // optional so Copilot tests that predate the telematics provider omit it
      // (handlers fall back gracefully). Answers come from normalized Fleet
      // telematics data — never raw provider secrets/credentials.
      ...(telematicsOpt
        ? {
            telematics: {
              devices: telematicsOpt.devices,
              positions: telematicsOpt.positions,
              alerts: telematicsOpt.alerts,
              trips: telematicsOpt.trips,
              vehicles: store.vehicles,
              // Active rentals (status === "active") resolve rental context for
              // a vehicle's current location / alerts / trips. Derived, never
              // duplicated. Org-scoped by construction (store is org-scoped).
              activeRentalVehicleIds: new Set(
                store.rentals
                  .filter((r) => r.status === "active")
                  .map((r) => r.vehicle_id),
              ),
            } satisfies TelematicsCopilotSources,
          }
        : {}),
      // V1 Customer Verification — derived from the authoritative verification
      // store + company policy; optional so Copilot tests that predate the
      // verification provider omit it (handlers fall back gracefully). Copilot
      // distinguishes optional vs required; never reports optional unrun as
      // missing. No provider secrets/credentials.
      ...(verificationOpt
        ? {
            verification: {
              requests: verificationOpt.requests,
              requirements: verificationOpt.requirements,
              overrides: verificationOpt.overrides,
              usageCharges: verificationOpt.usageCharges,
              policies:
                companyPolicies.companyPolicies.verification_services?.services,
              customers: store.customers,
              rentals: store.rentals,
            } satisfies VerificationCopilotSources,
          }
        : {}),
      // V1 Tolls & Violations Automation — derived from the authoritative
      // violation store + canonical vehicle/rental/exchange records. Copilot
      // uses possession matching (event time + exchange history); never infers
      // responsibility without possession evidence. Org-scoped by construction.
      // Always present (the ViolationProvider is always mounted in production).
      tolls: {
        violations: vio.violations,
        customers: store.customers,
        rentals: store.rentals,
        vehicles: store.vehicles,
        exchanges: store.rentals.flatMap((r) => store.vehicleExchanges(r.id)),
      } satisfies TollsCopilotSources,
    }),
    [
      store,
      billingPeriods,
      dc.damageClaims,
      vio.violations,
      comp.documents,
      comp.requirements,
      comp.overrides,
      comp.complianceEvents,
      staffAssignments.assignments,
      workOrderEvents,
      range,
      incidents.incidents,
      defenseStore.rentalDrivers,
      defenseStore.releaseSnapshots,
      caseCenter?.cases,
      caseCenter?.caseEvents,
      bookingRequests?.bookingRequests,
      bookingRequests?.outboundEvents,
      telematicsOpt?.devices,
      telematicsOpt?.positions,
      telematicsOpt?.alerts,
      telematicsOpt?.trips,
      verificationOpt?.requests,
      verificationOpt?.requirements,
      verificationOpt?.overrides,
      verificationOpt?.usageCharges,
      companyPolicies.companyPolicies.verification_services,
      vio.violations,
      store.vehicles,
    ],
  );

  // Location scope: a staff member with a non-empty location_ids list may only
  // see those locations; empty = all locations (company-wide).
  const allowedLocationIds = currentStaff?.location_ids ?? [];

  return {
    sources,
    perms,
    staffId: store.currentStaffId,
    tenantId: store.tenant.id,
    allowedLocationIds,
    tz: store.companyInfo.timezone,
  };
}
