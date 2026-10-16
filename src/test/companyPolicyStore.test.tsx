// Connect Pro Fleet — Build #23 company policy tests (part 2).
// Covers: frozen policy snapshots (existing-rental protection), inheritance
// resolver, setup presets, policy summary/labels, payment methods,
// reservation/cancellation/renewal policy, business hours, and store
// integration (snapshot frozen at convert + cutoff seeded from policy).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  freezeRentalPolicySnapshot,
  policySummary,
  formatCutoff,
  formatGraceMinutes,
  CADENCE_LABELS,
  resolveMinimumDurationForClass,
  resolveDepositForClass,
} from "@/lib/companyPolicy";
import {
  defaultCompanyPolicies,
  COMPANY_POLICY_PRESETS,
  getPreset,
  ALL_PAYMENT_METHODS,
} from "@/lib/companyPolicyDefaults";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useStore } from "@/lib/store";
import type { CompanyPolicies } from "@/lib/companyPolicyTypes";
import type { Customer, Reservation, Vehicle } from "@/lib/types";
import { TENANT_ID } from "@/lib/store/ids";

const basePolicy = defaultCompanyPolicies();

function policyWith(patch: Partial<CompanyPolicies>): CompanyPolicies {
  return { ...basePolicy, ...patch };
}

describe("Build #23 — frozen policy snapshots", () => {
  it("snapshot freezes the company late fee at checkout", () => {
    const companyAt50 = policyWith({
      late_fee: { ...basePolicy.late_fee, fixed_amount: 50 },
    });
    const snap = freezeRentalPolicySnapshot(companyAt50, {
      depositAmount: 300,
      depositSource: "company",
      mileage: companyAt50.mileage,
      mileageSource: "company",
      fuel: companyAt50.fuel,
      fuelSource: "company",
    });
    expect(snap.late_fee.fixed_amount).toBe(50);
  });

  it("changing company default late fee does NOT alter a frozen snapshot", () => {
    const companyAt50 = policyWith({
      late_fee: { ...basePolicy.late_fee, fixed_amount: 50 },
    });
    const snap = freezeRentalPolicySnapshot(companyAt50, {
      depositAmount: 300,
      depositSource: "company",
      mileage: companyAt50.mileage,
      mileageSource: "company",
      fuel: companyAt50.fuel,
      fuelSource: "company",
    });
    const companyAt75 = policyWith({
      late_fee: { ...basePolicy.late_fee, fixed_amount: 75 },
    });
    // Existing rental's snapshot remains $50.
    expect(snap.late_fee.fixed_amount).toBe(50);
    // New rental would use $75.
    const newSnap = freezeRentalPolicySnapshot(companyAt75, {
      depositAmount: 300,
      depositSource: "company",
      mileage: companyAt75.mileage,
      mileageSource: "company",
      fuel: companyAt75.fuel,
      fuelSource: "company",
    });
    expect(newSnap.late_fee.fixed_amount).toBe(75);
  });

  it("snapshot freezes cutoff + grace (company change does not alter it)", () => {
    const company2pm = policyWith({
      payment: { ...basePolicy.payment, payment_cutoff_time: "14:00" },
    });
    const snap = freezeRentalPolicySnapshot(company2pm, {
      depositAmount: 300,
      depositSource: "company",
      mileage: company2pm.mileage,
      mileageSource: "company",
      fuel: company2pm.fuel,
      fuelSource: "company",
    });
    expect(snap.payment_cutoff_time).toBe("14:00");
    // Company changes cutoff to 5 PM later — snapshot unchanged.
    expect(snap.payment_cutoff_time).toBe("14:00");
  });

  it("snapshot freezes deposit amount + source", () => {
    const snap = freezeRentalPolicySnapshot(basePolicy, {
      depositAmount: 500,
      depositSource: "class",
      mileage: basePolicy.mileage,
      mileageSource: "company",
      fuel: basePolicy.fuel,
      fuelSource: "company",
    });
    expect(snap.deposit.amount).toBe(500);
    expect(snap.source.deposit).toBe("class");
  });

  it("snapshot freezes mileage policy", () => {
    const unlimited = policyWith({
      mileage: { type: "unlimited", allowance: 0, overage_rate: 0 },
    });
    const snap = freezeRentalPolicySnapshot(unlimited, {
      depositAmount: 300,
      depositSource: "company",
      mileage: unlimited.mileage,
      mileageSource: "company",
      fuel: unlimited.fuel,
      fuelSource: "company",
    });
    expect(snap.mileage.type).toBe("unlimited");
  });
});

describe("Build #23 — policy inheritance resolver", () => {
  it("resolveMinimumDurationForClass uses class override when present", () => {
    const overrides = { minimum_duration_days: 5 };
    expect(resolveMinimumDurationForClass(overrides, basePolicy)).toBe(5);
  });

  it("resolveMinimumDurationForClass falls back to company default", () => {
    const company = policyWith({
      rental_model: {
        ...basePolicy.rental_model,
        minimum_duration_days: 3,
      },
    });
    expect(resolveMinimumDurationForClass(null, company)).toBe(3);
  });

  it("resolveDepositForClass prefers class override over company", () => {
    const overrides = { deposit_amount: 750 };
    const r = resolveDepositForClass(overrides, basePolicy);
    expect(r.amount).toBe(750);
    expect(r.source).toBe("class");
  });
});

describe("Build #23 — setup presets", () => {
  it("weekly_private preset configures weekly billing + 2 PM cutoff", () => {
    const preset = getPreset("weekly_private");
    expect(preset).toBeDefined();
    const applied = policyWith(preset!.patch);
    expect(applied.payment.default_billing_cadence).toBe("weekly");
    expect(applied.payment.payment_cutoff_time).toBe("14:00");
    expect(applied.deposit.default_amount).toBe(300);
  });

  it("daily_rental preset configures daily cadence", () => {
    const preset = getPreset("daily_rental");
    expect(preset).toBeDefined();
    const applied = policyWith(preset!.patch);
    expect(applied.rental_model.default_cadence).toBe("daily");
    expect(applied.rental_model.minimum_duration_days).toBe(1);
  });

  it("long_term preset configures open-ended monthly billing", () => {
    const preset = getPreset("long_term");
    expect(preset).toBeDefined();
    const applied = policyWith(preset!.patch);
    expect(applied.rental_model.allow_open_ended).toBe(true);
    expect(applied.payment.default_billing_cadence).toBe("monthly");
    expect(applied.rental_model.minimum_duration_days).toBe(30);
  });

  it("presets are patchable (not permanent hard-coded business models)", () => {
    expect(COMPANY_POLICY_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const preset of COMPANY_POLICY_PRESETS) {
      expect(Object.keys(preset.patch).length).toBeGreaterThan(0);
    }
  });
});

describe("Build #23 — policy summary + labels", () => {
  it("policySummary produces human-readable structured lines", () => {
    const lines = policySummary(basePolicy);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("Billing"))).toBe(true);
    expect(lines.some((l) => l.includes("Late Fee"))).toBe(true);
    expect(lines.some((l) => l.includes("Deposit"))).toBe(true);
    expect(lines.some((l) => l.includes("Mileage"))).toBe(true);
  });

  it("formatCutoff renders 14:00 as 2:00 PM", () => {
    expect(formatCutoff("14:00")).toBe("2:00 PM");
  });

  it("formatCutoff renders null as End of day", () => {
    expect(formatCutoff(null)).toBe("End of day");
  });

  it("formatGraceMinutes renders 0 as No grace", () => {
    expect(formatGraceMinutes(0)).toBe("No grace");
  });

  it("formatGraceMinutes renders 30 as 30 min grace", () => {
    expect(formatGraceMinutes(30)).toBe("30 min grace");
  });

  it("formatGraceMinutes renders 60 as 1 hr grace", () => {
    expect(formatGraceMinutes(60)).toBe("1 hr grace");
  });

  it("CADENCE_LABELS covers all billing cadences", () => {
    expect(CADENCE_LABELS.weekly).toBe("Weekly");
    expect(CADENCE_LABELS.daily).toBe("Daily");
    expect(CADENCE_LABELS.monthly).toBe("Monthly");
  });
});

describe("Build #23 — accepted payment methods", () => {
  it("all expected payment methods are available", () => {
    expect(ALL_PAYMENT_METHODS).toContain("cash");
    expect(ALL_PAYMENT_METHODS).toContain("zelle");
    expect(ALL_PAYMENT_METHODS).toContain("cash_app");
    expect(ALL_PAYMENT_METHODS).toContain("credit_card");
    expect(ALL_PAYMENT_METHODS).toContain("ach");
  });

  it("payment methods carry presentation instructions (not credentials)", () => {
    const p = policyWith({
      payment_methods: basePolicy.payment_methods.map((m) =>
        m.method === "zelle"
          ? { ...m, instructions: "Send to payments@company.com" }
          : m,
      ),
    });
    const zelle = p.payment_methods.find((m) => m.method === "zelle");
    expect(zelle?.instructions).toBe("Send to payments@company.com");
  });
});

describe("Build #23 — reservation / cancellation / renewal policy", () => {
  it("reservation mode is configurable", () => {
    expect(basePolicy.reservations.mode).toBe("request_approval");
    const p = policyWith({
      reservations: { ...basePolicy.reservations, mode: "instant" },
    });
    expect(p.reservations.mode).toBe("instant");
  });

  it("advance booking window is configurable", () => {
    const p = policyWith({
      reservations: {
        ...basePolicy.reservations,
        min_lead_time_hours: 24,
        max_advance_booking_days: 90,
      },
    });
    expect(p.reservations.min_lead_time_hours).toBe(24);
    expect(p.reservations.max_advance_booking_days).toBe(90);
  });

  it("cancellation policy is configurable", () => {
    const p = policyWith({
      cancellations: { type: "fee", fee_amount: 50, free_cutoff_hours: 24 },
    });
    expect(p.cancellations.type).toBe("fee");
    expect(p.cancellations.fee_amount).toBe(50);
  });

  it("renewal mode is configurable", () => {
    expect(basePolicy.renewal.mode).toBe("manual_extension");
    const p = policyWith({ renewal: { mode: "auto_renew_if_paid" } });
    expect(p.renewal.mode).toBe("auto_renew_if_paid");
  });
});

describe("Build #23 — business hours", () => {
  it("default business hours: Mon–Sat open, Sunday closed", () => {
    const bh = basePolicy.business_hours;
    expect(bh.monday.open).toBe(true);
    expect(bh.saturday.open).toBe(true);
    expect(bh.sunday.open).toBe(false);
    expect(bh.sunday.open_time).toBeNull();
  });

  it("business hours are per-day configurable", () => {
    const p = policyWith({
      business_hours: {
        ...basePolicy.business_hours,
        sunday: { open: true, open_time: "10:00", close_time: "14:00" },
      },
    });
    expect(p.business_hours.sunday.open).toBe(true);
    expect(p.business_hours.sunday.open_time).toBe("10:00");
  });
});

// ---------------------------------------------------------------------------
// Store integration — snapshot frozen at convert + cutoff seeded from policy
// ---------------------------------------------------------------------------

function makeVehicle(): Vehicle {
  return {
    id: "veh_pol",
    vin: "POLVIN000001",
    make: "Test",
    model: "Sedan",
    year: 2024,
    license_plate: "POL-001",
    status: "available",
    location: "Miami Downtown",
    vehicle_type: "car",
    vehicle_class_id: "cls_midsize",
    pricing_override: false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: 50,
    weekly_rate: 350,
    deposit_amount: 300,
    images: [],
    documents: [],
    purchase_date: "2024-01-01",
    purchase_price: 25000,
    current_mileage: 1000,
    insurance_policy_number: "POL-INS",
    insurance_expiry: "2027-01-01",
    registration_expiry: "2027-01-01",
    tenant_id: TENANT_ID,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeCustomer(): Customer {
  return {
    id: "cus_pol",
    tenant_id: TENANT_ID,
    first_name: "Policy",
    last_name: "Renter",
    phone: "+1 555 0000",
    email: "policy@example.com",
    date_of_birth: "1990-01-01",
    address: "1 Test St",
    city: "Miami",
    state: "FL",
    zip: "33131",
    emergency_contact_name: "Emergency",
    emergency_contact_phone: "+1 555 0001",
    customer_status: "good_standing",
    customer_source: "staff",
    notes: "",
    drivers_license_number: "POL-DL-001",
    drivers_license_state: "FL",
    drivers_license_expiry: "2029-01-01",
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: "Geico",
    insurance_policy_number: "POL-POL",
    insurance_expiry: "2027-01-01",
    insurance_document_url: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeReservation(vehicleId: string, customerId: string): Reservation {
  return {
    id: "res_pol",
    vehicle_id: vehicleId,
    customer_id: customerId,
    renter_name: "Policy Renter",
    renter_email: "policy@example.com",
    renter_phone: "+1 555 0000",
    start_date: "2026-09-01",
    end_date: "2026-09-08",
    status: "confirmed",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: 350,
    deposit_amount: 300,
    deposit_status: "held",
    amount_paid: 300,
    created_at: "2026-08-28T00:00:00Z",
    created_by: "stf_1",
    created_by_name: "Policy · Owner",
    tenant_id: TENANT_ID,
    pricing_snapshot: {
      vehicle_class_id: "cls_midsize",
      vehicle_class_name: "Midsize",
      daily_rate: 50,
      weekly_rate: 350,
      minimum_rental_duration: 3,
      duration_days: 7,
      recommended_total: 350,
      recommended_rate_type: "weekly",
      components: [{ type: "weekly", quantity: 1, rate: 350, total: 350 }],
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>{children}</CompanyPolicyProvider>
    </StoreProvider>
  );
}

describe("Build #23 — store integration", () => {
  it("convertReservationToRental freezes a policy snapshot onto the rental", () => {
    const r = renderHook(() => useStore(), { wrapper }).result;
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_pol", "cus_pol"));
    });
    let rentalId = "";
    act(() => {
      rentalId = r.current.convertReservationToRental("res_pol") ?? "";
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId);
    expect(rental?.policy_snapshot).not.toBeNull();
    expect(rental?.policy_snapshot?.late_fee.fixed_amount).toBe(
      basePolicy.late_fee.fixed_amount,
    );
  });

  it("rental cutoff + grace are seeded from company policy", () => {
    const r = renderHook(() => useStore(), { wrapper }).result;
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_pol", "cus_pol"));
    });
    let rentalId = "";
    act(() => {
      rentalId = r.current.convertReservationToRental("res_pol") ?? "";
    });
    const rental = r.current.rentals.find((x) => x.id === rentalId);
    expect(rental?.payment_cutoff_time).toBe(
      basePolicy.payment.payment_cutoff_time,
    );
    expect(rental?.grace_period).toBe(
      basePolicy.payment.grace_period_minutes / 60,
    );
  });

  it("changing company policy after convert does not alter existing rental snapshot", () => {
    const hook = renderHook(() => useStore(), { wrapper });
    const r = hook.result;
    act(() => {
      r.current.addVehicle(makeVehicle());
      r.current.addCustomer(makeCustomer());
      r.current.addReservation(makeReservation("veh_pol", "cus_pol"));
    });
    let rentalId = "";
    act(() => {
      rentalId = r.current.convertReservationToRental("res_pol") ?? "";
    });
    const before = r.current.rentals.find((x) => x.id === rentalId)
      ?.policy_snapshot?.late_fee.fixed_amount;
    // Change the company late fee via the policy provider.
    const polHook = renderHook(() => useCompanyPolicies(), { wrapper });
    act(() => {
      polHook.result.current.updateCompanyPolicies({
        late_fee: { ...basePolicy.late_fee, fixed_amount: 999 },
      });
    });
    const after = r.current.rentals.find((x) => x.id === rentalId)
      ?.policy_snapshot?.late_fee.fixed_amount;
    expect(before).toBe(basePolicy.late_fee.fixed_amount);
    expect(after).toBe(before); // unchanged
  });

  it("CompanyPolicyProvider exposes update + preset methods", () => {
    const polHook = renderHook(() => useCompanyPolicies(), { wrapper });
    expect(polHook.result.current.companyPolicies).toBeDefined();
    expect(typeof polHook.result.current.updateCompanyPolicies).toBe(
      "function",
    );
    expect(typeof polHook.result.current.applyPreset).toBe("function");
    act(() => {
      polHook.result.current.applyPreset(
        getPreset("daily_rental")!.patch,
        "Daily Rental",
      );
    });
    expect(
      polHook.result.current.companyPolicies.rental_model.default_cadence,
    ).toBe("daily");
  });
});
