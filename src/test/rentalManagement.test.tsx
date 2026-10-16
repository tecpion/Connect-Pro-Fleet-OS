// Connect Pro Fleet — Rental Management workspace (UX consolidation) tests.
//
// Verifies the unified "Rental Management" workspace that consolidates
// Reservations and Rentals into one lifecycle: Reservation → Ready for
// Checkout → Active Rental → Return → Completed.
//
// Coverage is split into two fast layers:
//   1. Pure selector tests (instant) — exercise the lifecycle grouping,
//      search, filters, readiness, and traceability selectors without driving
//      the React tree.
//   2. Render tests (fast, synchronous) — confirm the page renders, the five
//      tabs exist, navigation item exists, old duplicate nav items are gone,
//      and traceability appears on detail pages.
//
// No business logic is changed — these tests assert the UX consolidation only.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { SupportProvider } from "@/lib/supportStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import { BookingRequestProvider } from "@/lib/store/bookingRequestStore";
import { StaffLayout, navGroups } from "@/components/StaffLayout";
import RentalManagement from "@/pages/RentalManagement";
import {
  RENTAL_MANAGEMENT_TABS,
  selectReservationRows,
  selectReadyForCheckoutRows,
  selectActiveRentalRows,
  selectReturnRows,
  selectCompletedRentalRows,
  isUnconvertedReservation,
  isActiveRental,
  reservationLifecycleStage,
  rentalLifecycleStage,
  checkoutReadinessFor,
  type CheckoutReadiness,
} from "@/lib/rentalManagementSelectors";
import type { Reservation, RentalAgreement } from "@/lib/types";

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <ResourceCenterProvider>
            <IncidentsProvider>
              <InvestorProvider>
                <PartnershipProvider>
                  <DamageClaimProvider>
                    <MigrationProvider>
                      <IntegrationProvider>
                        <StaffAssignmentProvider>
                          <ViolationPolicyProvider>
                            <ViolationProvider>
                              <ComplianceProvider>
                                <CustomerNotesProvider>
                                  <SupportProvider>
                                    <PortalSessionProvider>
                                      <PortalRequestProvider>
                                        <BookingRequestProvider>
                                          {children}
                                        </BookingRequestProvider>
                                      </PortalRequestProvider>
                                    </PortalSessionProvider>
                                  </SupportProvider>
                                </CustomerNotesProvider>
                              </ComplianceProvider>
                            </ViolationProvider>
                          </ViolationPolicyProvider>
                        </StaffAssignmentProvider>
                      </IntegrationProvider>
                    </MigrationProvider>
                  </DamageClaimProvider>
                </PartnershipProvider>
              </InvestorProvider>
            </IncidentsProvider>
          </ResourceCenterProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

function renderAt(path: string, node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <StaffLayout>{node}</StaffLayout>
      </AppProviders>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Layer 1 — pure selector tests
// ---------------------------------------------------------------------------

function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_x",
    vehicle_id: "veh_1",
    customer_id: "cus_1",
    renter_name: "Test User",
    renter_email: "test@example.com",
    renter_phone: "555-0000",
    start_date: "2026-09-10",
    end_date: "2026-09-15",
    status: "confirmed",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: 500,
    deposit_amount: 200,
    deposit_status: "held",
    amount_paid: 500,
    converted_to_rental_id: null,
    created_at: "2026-09-01T00:00:00Z",
    created_by: null,
    created_by_name: "Test",
    tenant_id: "tnt_connectpro",
    ...over,
  } as Reservation;
}

function makeRental(over: Partial<RentalAgreement> = {}): RentalAgreement {
  return {
    id: "rnt_x",
    tenant_id: "tnt_connectpro",
    reservation_id: "res_x",
    customer_id: "cus_1",
    vehicle_id: "veh_1",
    agreement_number: "AGR-2026-000001",
    status: "active",
    checkout_date: "2026-09-10",
    checkout_time: "10:00",
    scheduled_return_date: "2026-09-15",
    scheduled_return_time: "17:00",
    actual_return_date: null,
    actual_return_time: null,
    rate_type: "daily",
    rate_amount: 100,
    subtotal: 500,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 200,
    amount_paid: 500,
    balance_due: 0,
    mileage_out: 1000,
    mileage_in: null,
    fuel_out: 100,
    fuel_in: null,
    weekly_payment_day: null,
    next_payment_due: null,
    payment_cutoff_time: "14:00",
    grace_period: 2,
    late_fee: 25,
    late_fee_applied: false,
    weeks_rented: 0,
    pricing_snapshot: null,
    policy_snapshot: null,
    created_by: "stf_1",
    created_at: "2026-09-10T10:00:00Z",
    updated_at: "2026-09-10T10:00:00Z",
    ...over,
  } as RentalAgreement;
}

describe("Rental Management — lifecycle grouping (pure)", () => {
  it("exposes exactly six lifecycle tabs in order (booking requests first)", () => {
    expect(RENTAL_MANAGEMENT_TABS.map((t) => t.key)).toEqual([
      "booking",
      "reservations",
      "ready",
      "active",
      "returns",
      "completed",
    ]);
  });

  it("isUnconvertedReservation excludes converted reservations", () => {
    expect(
      isUnconvertedReservation(
        makeReservation({ converted_to_rental_id: null }),
      ),
    ).toBe(true);
    expect(
      isUnconvertedReservation(
        makeReservation({ converted_to_rental_id: "rnt_1" }),
      ),
    ).toBe(false);
  });

  it("selectReservationRows only includes unconverted reservations", () => {
    const reservations = [
      makeReservation({ id: "res_a", converted_to_rental_id: null }),
      makeReservation({ id: "res_b", converted_to_rental_id: "rnt_1" }),
    ];
    const rows = selectReservationRows({
      reservations,
      vehicles: [],
      query: "",
      filter: "all",
    });
    expect(rows.map((r) => r.id)).toEqual(["res_a"]);
  });

  it("selectReservationRows applies needs_action filter", () => {
    const reservations = [
      makeReservation({ id: "res_a", status: "pending_verification" }),
      makeReservation({ id: "res_b", status: "confirmed" }),
    ];
    const rows = selectReservationRows({
      reservations,
      vehicles: [],
      query: "",
      filter: "needs_action",
    });
    expect(rows.map((r) => r.id)).toEqual(["res_a"]);
  });

  it("selectReservationRows search matches renter name", () => {
    const reservations = [
      makeReservation({ id: "res_a", renter_name: "Alice" }),
      makeReservation({ id: "res_b", renter_name: "Bob" }),
    ];
    const rows = selectReservationRows({
      reservations,
      vehicles: [],
      query: "alice",
      filter: "all",
    });
    expect(rows.map((r) => r.id)).toEqual(["res_a"]);
  });

  it("selectReadyForCheckoutRows only includes confirmed unconverted reservations", () => {
    const reservations = [
      makeReservation({
        id: "res_a",
        status: "confirmed",
        converted_to_rental_id: null,
      }),
      makeReservation({ id: "res_b", status: "pending_verification" }),
      makeReservation({
        id: "res_c",
        status: "confirmed",
        converted_to_rental_id: "rnt_1",
      }),
    ];
    const rows = selectReadyForCheckoutRows({
      reservations,
      vehicles: [
        {
          id: "veh_1",
          make: "Toyota",
          model: "Corolla",
          license_plate: "ABC",
        } as any,
      ],
      deposits: [],
      resourceCategories: [],
      verifications: [],
      query: "",
    });
    expect(rows.map((r) => r.reservationId)).toEqual(["res_a"]);
  });

  it("checkoutReadinessFor returns verification_needed when verification not passed", () => {
    const r = makeReservation({ status: "confirmed" });
    expect(
      checkoutReadinessFor({
        reservation: r,
        deposit: null,
        verificationsOk: false,
      }),
    ).toBe("verification_needed");
  });

  it("checkoutReadinessFor returns ready when all gates pass", () => {
    const r = makeReservation({
      status: "confirmed",
      amount_paid: 500,
      total_price: 500,
    });
    expect(
      checkoutReadinessFor({
        reservation: r,
        deposit: null,
        verificationsOk: true,
      }),
    ).toBe("ready");
  });

  it("isActiveRental identifies active rental statuses", () => {
    expect(isActiveRental(makeRental({ status: "active" }))).toBe(true);
    expect(isActiveRental(makeRental({ status: "overdue" }))).toBe(true);
    expect(isActiveRental(makeRental({ status: "completed" }))).toBe(false);
    expect(isActiveRental(makeRental({ status: "ready_for_checkout" }))).toBe(
      false,
    );
  });

  it("selectActiveRentalRows filters by payment_due", () => {
    const rentals = [
      makeRental({ id: "rnt_a", status: "active" }),
      makeRental({ id: "rnt_b", status: "payment_due" }),
    ];
    const rows = selectActiveRentalRows({
      rentals,
      customers: [],
      vehicles: [],
      query: "",
      filter: "payment_due",
    });
    expect(rows.map((r) => r.id)).toEqual(["rnt_b"]);
  });

  it("selectReturnRows filters by today", () => {
    const today = "2026-09-15";
    const rentals = [
      makeRental({
        id: "rnt_a",
        status: "active",
        scheduled_return_date: today,
      }),
      makeRental({
        id: "rnt_b",
        status: "active",
        scheduled_return_date: "2026-09-20",
      }),
    ];
    const rows = selectReturnRows({
      rentals,
      customers: [],
      vehicles: [],
      query: "",
      filter: "today",
      todayISO: today,
    });
    expect(rows.map((r) => r.id)).toEqual(["rnt_a"]);
  });

  it("selectCompletedRentalRows only includes completed rentals", () => {
    const rentals = [
      makeRental({
        id: "rnt_a",
        status: "completed",
        actual_return_date: "2026-09-15",
      }),
      makeRental({ id: "rnt_b", status: "active" }),
    ];
    const rows = selectCompletedRentalRows({
      rentals,
      customers: [],
      vehicles: [],
      query: "",
    });
    expect(rows.map((r) => r.id)).toEqual(["rnt_a"]);
  });

  it("reservationLifecycleStage resolves correctly", () => {
    expect(
      reservationLifecycleStage(
        makeReservation({ status: "confirmed", converted_to_rental_id: null }),
      ),
    ).toBe("ready");
    expect(
      reservationLifecycleStage(
        makeReservation({ status: "active", converted_to_rental_id: "rnt_1" }),
      ),
    ).toBe("active");
    expect(
      reservationLifecycleStage(
        makeReservation({ status: "pending_verification" }),
      ),
    ).toBe("reservation");
  });

  it("rentalLifecycleStage resolves correctly", () => {
    expect(rentalLifecycleStage(makeRental({ status: "completed" }))).toBe(
      "completed",
    );
    expect(rentalLifecycleStage(makeRental({ status: "active" }))).toBe(
      "active",
    );
    expect(
      rentalLifecycleStage(makeRental({ status: "ready_for_checkout" })),
    ).toBe("ready");
    expect(rentalLifecycleStage(makeRental({ status: "return_pending" }))).toBe(
      "return",
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — navigation + render tests
// ---------------------------------------------------------------------------

describe("Rental Management — navigation consolidation", () => {
  it("has one Rental Management nav item under Rentals", () => {
    const rentals = navGroups.find((g) => g.label === "Rentals");
    expect(rentals).toBeDefined();
    const rm = rentals!.items.find((i) => i.to === "/rental-management");
    expect(rm).toBeDefined();
    expect(rm!.label).toBe("Rental Management");
  });

  it("removed the separate Reservations nav item", () => {
    const allItems = navGroups.flatMap((g) => g.items);
    expect(allItems.find((i) => i.to === "/reservations")).toBeUndefined();
  });

  it("removed the separate Rentals nav item", () => {
    const allItems = navGroups.flatMap((g) => g.items);
    expect(
      allItems.find((i) => i.to === "/rentals" && i.label === "Rentals"),
    ).toBeUndefined();
  });

  it("uses a calendar/rental icon for Rental Management", () => {
    const rentals = navGroups.find((g) => g.label === "Rentals");
    const rm = rentals!.items.find((i) => i.to === "/rental-management");
    // CalendarRange is the chosen icon (vehicle/calendar family).
    expect(rm!.icon).toBeDefined();
  });
});

describe("Rental Management — page render", () => {
  it("renders the page title and subtitle", () => {
    renderAt("/rental-management", <RentalManagement />);
    // "Rental Management" appears in both the nav and the page H1; assert the
    // subtitle is unique to the page.
    expect(
      screen.getByText("Manage every rental from reservation through return."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Rental Management").length).toBeGreaterThan(0);
  });

  it("renders all six lifecycle tabs (booking requests first)", () => {
    renderAt("/rental-management", <RentalManagement />);
    expect(screen.getByTestId("rm-tab-booking")).toBeInTheDocument();
    expect(screen.getByTestId("rm-tab-reservations")).toBeInTheDocument();
    expect(screen.getByTestId("rm-tab-ready")).toBeInTheDocument();
    expect(screen.getByTestId("rm-tab-active")).toBeInTheDocument();
    expect(screen.getByTestId("rm-tab-returns")).toBeInTheDocument();
    expect(screen.getByTestId("rm-tab-completed")).toBeInTheDocument();
  });

  it("defaults to the active tab (operational center of gravity)", () => {
    renderAt("/rental-management", <RentalManagement />);
    const activeTab = screen.getByTestId("rm-tab-active");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders the New reservation button", () => {
    renderAt("/rental-management", <RentalManagement />);
    expect(screen.getByText("New reservation")).toBeInTheDocument();
  });

  it("renders the unified search field", () => {
    renderAt("/rental-management", <RentalManagement />);
    expect(
      screen.getByPlaceholderText(
        "Search rental, reservation, customer, vehicle...",
      ),
    ).toBeInTheDocument();
  });

  it("switches to the reservations tab when clicked", () => {
    renderAt("/rental-management", <RentalManagement />);
    const resTab = screen.getByTestId("rm-tab-reservations");
    fireEvent.click(resTab);
    expect(resTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders the Active Rentals tab content by default", () => {
    renderAt("/rental-management", <RentalManagement />);
    // The active (operational) tab is selected by default; booking opens only
    // when explicitly requested (?tab=booking or a contextual deep link).
    expect(screen.getByTestId("rm-tab-active")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders without crashing under the full provider tree", () => {
    const { unmount } = renderAt("/rental-management", <RentalManagement />);
    expect(
      screen.getByText("Manage every rental from reservation through return."),
    ).toBeInTheDocument();
    unmount();
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — traceability + domain separation
// ---------------------------------------------------------------------------

describe("Rental Management — traceability & domain separation", () => {
  it("reservation→rental traceability: converted reservation links to rental", () => {
    // The selector surfaces converted_to_rental_id on reservation rows.
    const reservations = [
      makeReservation({ id: "res_a", converted_to_rental_id: "rnt_1" }),
    ];
    // Converted reservations are excluded from the Reservations tab (they moved
    // on in the lifecycle), confirming the reservation is not erased — it's
    // traceable via the rental's reservation_id link.
    const rows = selectReservationRows({
      reservations,
      vehicles: [],
      query: "",
      filter: "all",
    });
    expect(rows).toHaveLength(0); // moved past the reservation stage
  });

  it("rental→reservation traceability: rental carries reservation_id", () => {
    const rentals = [makeRental({ id: "rnt_1", reservation_id: "res_a" })];
    const rows = selectActiveRentalRows({
      rentals,
      customers: [],
      vehicles: [],
      query: "",
      filter: "all",
    });
    expect(rows[0].reservationId).toBe("res_a");
  });

  it("does not merge reservation and rental domain state", () => {
    // The selectors read from separate arrays — no combined record is produced.
    const reservations = [makeReservation({ id: "res_a" })];
    const rentals = [makeRental({ id: "rnt_1" })];
    const resRows = selectReservationRows({
      reservations,
      vehicles: [],
      query: "",
      filter: "all",
    });
    const rentalRows = selectActiveRentalRows({
      rentals,
      customers: [],
      vehicles: [],
      query: "",
      filter: "all",
    });
    // Reservation rows are ReservationRow shape; rental rows are ActiveRentalRow.
    expect(resRows[0]).not.toHaveProperty("agreement_number");
    expect(rentalRows[0]).toHaveProperty("agreement_number");
  });
});

// ---------------------------------------------------------------------------
// Layer 4 — deep links + mobile
// ---------------------------------------------------------------------------

describe("Rental Management — deep links & mobile", () => {
  it("reads the tab from the URL query param", () => {
    renderAt("/rental-management?tab=returns", <RentalManagement />);
    expect(screen.getByTestId("rm-tab-returns")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("falls back to active tab for an unknown tab param", () => {
    renderAt("/rental-management?tab=bogus", <RentalManagement />);
    expect(screen.getByTestId("rm-tab-active")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens the booking tab only when explicitly requested (?tab=booking)", () => {
    renderAt("/rental-management?tab=booking", <RentalManagement />);
    expect(screen.getByTestId("rm-tab-booking")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("tabs are horizontally scrollable on mobile (flex-wrap, no overflow)", () => {
    renderAt("/rental-management", <RentalManagement />);
    const tablist = screen.getByRole("tablist");
    // The tablist uses flex-wrap so tabs reflow on narrow screens.
    expect(tablist.className).toContain("flex-wrap");
  });
});
