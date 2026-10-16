// Connect Pro Fleet — Build #29 Copilot test harness (NON-test module).
//
// This module holds ONLY reusable harness helpers, fixtures, and source
// builders shared across the Copilot test files. It is NOT a `.test.tsx`
// file, so importing it never re-registers test cases (Build #29 closure:
// eliminate the 72 duplicate executions caused by importing helpers from a
// test module). No `describe`/`it`/`expect` live here.
//
// The harness assembles the CopilotSources bundle from the real StoreProvider
// + cross-module providers (same pattern as briefingDomain/customer360Domain
// tests) so the deterministic engine runs against genuine seeded data.

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider, useBilling } from "@/lib/billingStore";
import { InvestorProvider } from "@/lib/investorStore";
import { DefenseProvider } from "@/lib/store/defenseStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { useIncidents } from "@/lib/incidentsStore";
import { useDefense } from "@/lib/store/defenseStore";
import { CaseCenterProvider, useCaseCenter } from "@/lib/store/caseCenterStore";
import {
  BookingRequestProvider,
  useBookingRequests,
} from "@/lib/store/bookingRequestStore";
import { TelematicsProvider, useTelematics } from "@/lib/store/telematicsStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import {
  DamageClaimProvider,
  useDamageClaims,
} from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider, useViolations } from "@/lib/violationStoreProvider";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import {
  StaffAssignmentProvider,
  useStaffAssignments,
} from "@/lib/staffAssignmentStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import type {
  CopilotSources,
  CopilotViewerPermissions,
} from "@/lib/copilotTypes";
import type { CopilotEngineContext } from "@/lib/copilotEngine";

/** Deterministic "now" pinned to the 2026 seed timeline. */
export const NOW = new Date("2026-09-02T12:00:00Z");

/** Full financial/profitability/sensitive/banking permissions. */
export const FULL_PERMS: CopilotViewerPermissions = {
  canViewFinancials: true,
  canViewProfitability: true,
  canViewSensitiveDocs: true,
  canViewBanking: true,
};

/** No financial permission (counts only, amounts hidden). */
export const NO_FINANCE_PERMS: CopilotViewerPermissions = {
  canViewFinancials: false,
  canViewProfitability: false,
  canViewSensitiveDocs: false,
  canViewBanking: false,
};

/** Provider wrapper used by both the source hook and the UI tests. */
export function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <IncidentsProvider>
            <DefenseProvider>
              <CaseCenterProvider>
                <InvestorProvider>
                  <PartnershipProvider>
                    <DamageClaimProvider>
                      <StaffAssignmentProvider>
                        <ViolationPolicyProvider>
                          <ViolationProvider>
                            <ComplianceProvider>
                              <CustomerNotesProvider>
                                <BookingRequestProvider>
                                  <TelematicsProvider>
                                    {children}
                                  </TelematicsProvider>
                                </BookingRequestProvider>
                              </CustomerNotesProvider>
                            </ComplianceProvider>
                          </ViolationProvider>
                        </ViolationPolicyProvider>
                      </StaffAssignmentProvider>
                    </DamageClaimProvider>
                  </PartnershipProvider>
                </InvestorProvider>
              </CaseCenterProvider>
            </DefenseProvider>
          </IncidentsProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Assemble the CopilotSources bundle from the real providers. */
export function useCopilotTestSources() {
  return renderHook(
    () => {
      const store = useStore();
      const billing = useBilling();
      const dc = useDamageClaims();
      const vio = useViolations();
      const comp = useCompliance();
      const assignments = useStaffAssignments();
      const incidents = useIncidents();
      const defenseStore = useDefense();
      const caseCenter = useCaseCenter();
      const range = resolveProfitabilityRange("this_year");
      const bookingRequests = useBookingRequests();
      const telematics = useTelematics();
      const workOrderEvents = store.workOrders.flatMap((w) =>
        store.workOrderEvents(w.id).map((event) => ({
          event,
          vehicleId: w.vehicle_id,
        })),
      );
      const sources: CopilotSources = {
        briefing: {
          store,
          billingPeriods: billing.billingPeriods,
          damageClaims: dc.damageClaims,
          violations: vio.violations,
          documents: comp.documents,
          requirements: comp.requirements,
          overrides: comp.overrides,
          assignments: assignments.assignments,
          range,
        },
        customer360: {
          store,
          billingPeriods: billing.billingPeriods,
          damageClaims: dc.damageClaims,
          violations: vio.violations,
          documents: comp.documents,
          requirements: comp.requirements,
          overrides: comp.overrides,
          tasks: store.tasks,
          assignments: assignments.assignments,
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
          billingPeriods: billing.billingPeriods,
          damageClaims: dc.damageClaims,
          violations: vio.violations,
          documents: comp.documents,
          complianceEvents: comp.complianceEvents,
          expenses: store.expenses,
          tasks: store.tasks,
          taskEvents: store.taskEvents,
          assignments: assignments.assignments,
          workOrderEvents,
        },
      };
      // Build #52 — defense sources bundle for the defense-record handlers.
      const defense = {
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
      };
      sources.defense = defense;
      // Build #54 — Case Center sources bundle for the case Copilot handlers.
      sources.caseCenter = {
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
      };
      // Build #62 — Booking Request (CRM handoff) sources bundle.
      sources.booking = {
        bookingRequests: bookingRequests.bookingRequests,
        outboundEvents: bookingRequests.outboundEvents,
        customers: store.customers,
        vehicles: store.vehicles,
        vehicleClasses: store.vehicleClasses,
        staff: store.staff,
      };
      // V1 Telematics Hub — normalized telematics sources bundle. Answers come
      // from normalized Fleet data (no provider secrets). Active rentals derive
      // rental context for a vehicle's current location/alerts/trips.
      sources.telematics = {
        devices: telematics.devices,
        positions: telematics.positions,
        alerts: telematics.alerts,
        trips: telematics.trips,
        vehicles: store.vehicles,
        activeRentalVehicleIds: new Set(
          store.rentals
            .filter((r) => r.status === "active")
            .map((r) => r.vehicle_id),
        ),
      };
      return { sources };
    },
    { wrapper },
  ).result;
}

/** Build a CopilotEngineContext from live sources + permissions. */
export function engineCtx(
  sources: CopilotSources,
  perms: CopilotViewerPermissions = FULL_PERMS,
  staffId = "stf_1",
  rawQuery?: string,
): CopilotEngineContext {
  return {
    src: sources,
    asOf: NOW,
    perms,
    staffId,
    tenantId: "tnt_demo",
    // V1 Telematics — thread the raw query so vehicle-scoped telematics
    // handlers can resolve a vehicle by plate/unit number. Optional; the
    // company dispatch reads it via a structural cast.
    ...(rawQuery ? { rawQuery } : {}),
  } as CopilotEngineContext;
}

/** A fresh empty conversation (no entity context). */
export function emptyConversation() {
  return {
    id: "conv_test",
    messages: [],
    context_customer_id: null as string | null,
    context_vehicle_id: null as string | null,
    context_rental_id: null as string | null,
    context_label: null as string | null,
    created_at: NOW.toISOString(),
  };
}

/** The full display name of the first seeded customer. */
export function firstCustomerName(sources: CopilotSources): string {
  const s = sources.briefing.store;
  return s.customerName(s.customers[0].id);
}

/** The first seeded vehicle. */
export function firstVehicle(sources: CopilotSources) {
  return sources.briefing.store.vehicles[0];
}
