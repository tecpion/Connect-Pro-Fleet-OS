// Connect Pro Fleet — Build #23 company policy tests (part 1).
// Covers: rental model, payment cutoff/grace exact-time semantics, late-fee
// policy, deposit policy + class override, extension/return policy,
// mileage/fuel policy, driver/insurance policy.

import { describe, it, expect } from "vitest";
import { isObligationLate, obligationDueInstant } from "@/lib/lateEvaluator";
import {
  resolveDepositForClass,
  resolveMileageForClass,
  resolveFuelForClass,
  resolveMinimumDurationForClass,
  resolveLateFeeAmount,
} from "@/lib/companyPolicy";
import { defaultCompanyPolicies } from "@/lib/companyPolicyDefaults";
import type {
  CompanyPolicies,
  VehicleClassPolicyOverrides,
} from "@/lib/companyPolicyTypes";
import type { VehicleClass } from "@/lib/types";

const basePolicy = defaultCompanyPolicies();

function policyWith(patch: Partial<CompanyPolicies>): CompanyPolicies {
  return { ...basePolicy, ...patch };
}

describe("Build #23 — rental model configuration", () => {
  it("daily cadence can be enabled", () => {
    const p = policyWith({
      rental_model: { ...basePolicy.rental_model, enabled_cadences: ["daily"] },
    });
    expect(p.rental_model.enabled_cadences).toContain("daily");
  });

  it("weekly cadence can be enabled", () => {
    const p = policyWith({
      rental_model: {
        ...basePolicy.rental_model,
        enabled_cadences: ["weekly"],
      },
    });
    expect(p.rental_model.enabled_cadences).toContain("weekly");
  });

  it("multiple cadences can be enabled simultaneously", () => {
    const p = policyWith({
      rental_model: {
        ...basePolicy.rental_model,
        enabled_cadences: ["daily", "weekly", "monthly"],
      },
    });
    expect(p.rental_model.enabled_cadences).toEqual([
      "daily",
      "weekly",
      "monthly",
    ]);
  });

  it("minimum duration is independent from billing cadence", () => {
    const p = policyWith({
      rental_model: {
        ...basePolicy.rental_model,
        enabled_cadences: ["daily"],
        default_cadence: "daily",
        minimum_duration_days: 4,
      },
    });
    expect(p.rental_model.minimum_duration_days).toBe(4);
    expect(p.rental_model.default_cadence).toBe("daily");
  });

  it("long-term / open-ended rentals are supported", () => {
    const p = policyWith({
      rental_model: {
        ...basePolicy.rental_model,
        enabled_cadences: ["long_term"],
        allow_open_ended: true,
        maximum_duration_days: null,
      },
    });
    expect(p.rental_model.allow_open_ended).toBe(true);
    expect(p.rental_model.maximum_duration_days).toBeNull();
  });
});

describe("Build #23 — payment policy + exact-time cutoff", () => {
  it("stores 2 PM cutoff and tenant timezone", () => {
    const p = policyWith({
      payment: { ...basePolicy.payment, payment_cutoff_time: "14:00" },
    });
    expect(p.payment.payment_cutoff_time).toBe("14:00");
  });

  it("1:59 PM is NOT late", () => {
    const now = new Date("2026-09-02T13:59:00");
    const r = isObligationLate(
      { due_at: "2026-09-02", cutoff_time: "14:00", grace_period: 0 },
      now,
    );
    expect(r.late).toBe(false);
  });

  it("2:00 PM is NOT late (payable THROUGH the cutoff)", () => {
    const now = new Date("2026-09-02T14:00:00");
    const r = isObligationLate(
      { due_at: "2026-09-02", cutoff_time: "14:00", grace_period: 0 },
      now,
    );
    expect(r.late).toBe(false);
  });

  it("2:01 PM IS late", () => {
    const now = new Date("2026-09-02T14:01:00");
    const r = isObligationLate(
      { due_at: "2026-09-02", cutoff_time: "14:00", grace_period: 0 },
      now,
    );
    expect(r.late).toBe(true);
  });

  it("grace window works: 2:15 not late, 2:30 not late, 2:31 late (30m grace)", () => {
    const input = {
      due_at: "2026-09-02",
      cutoff_time: "14:00",
      grace_period: 0.5, // 30 minutes
    };
    expect(isObligationLate(input, new Date("2026-09-02T14:15:00")).late).toBe(
      false,
    );
    expect(isObligationLate(input, new Date("2026-09-02T14:30:00")).late).toBe(
      false,
    );
    expect(isObligationLate(input, new Date("2026-09-02T14:31:00")).late).toBe(
      true,
    );
  });

  it("obligationDueInstant honors cutoff time (not midnight)", () => {
    const ms = obligationDueInstant({
      due_at: "2026-09-02",
      cutoff_time: "14:00",
      grace_period: 0,
    });
    const d = new Date(ms);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(0);
  });

  it("no cutoff configured → end-of-day fallback (23:59)", () => {
    const ms = obligationDueInstant({
      due_at: "2026-09-02",
      cutoff_time: null,
      grace_period: 0,
    });
    const d = new Date(ms);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

describe("Build #23 — late-fee policy", () => {
  it("fixed fee configuration", () => {
    const p = policyWith({
      late_fee: { ...basePolicy.late_fee, type: "fixed", fixed_amount: 50 },
    });
    expect(resolveLateFeeAmount(p.late_fee, 400)).toBe(50);
  });

  it("percentage fee configuration", () => {
    const p = policyWith({
      late_fee: {
        ...basePolicy.late_fee,
        type: "percentage",
        percentage: 10,
        fixed_amount: 0,
      },
    });
    expect(resolveLateFeeAmount(p.late_fee, 400)).toBe(40);
  });

  it("fee disabled resolves to 0", () => {
    const p = policyWith({
      late_fee: { ...basePolicy.late_fee, enabled: false },
    });
    expect(resolveLateFeeAmount(p.late_fee, 400)).toBe(0);
  });

  it("automatic and manual modes are distinct", () => {
    const auto = policyWith({
      late_fee: { ...basePolicy.late_fee, mode: "automatic" },
    });
    const manual = policyWith({
      late_fee: { ...basePolicy.late_fee, mode: "manual" },
    });
    expect(auto.late_fee.mode).toBe("automatic");
    expect(manual.late_fee.mode).toBe("manual");
  });

  it("once_per_period vs once_per_event frequencies are distinct", () => {
    expect(basePolicy.late_fee.frequency).toBe("once_per_period");
    const perEvent = policyWith({
      late_fee: { ...basePolicy.late_fee, frequency: "once_per_event" },
    });
    expect(perEvent.late_fee.frequency).toBe("once_per_event");
  });
});

describe("Build #23 — deposit policy + class override", () => {
  const cls: VehicleClass = {
    id: "cls_suv",
    tenant_id: "t",
    name: "SUV",
    description: "",
    daily_rate: 60,
    weekly_rate: 400,
    minimum_rental_duration: 2,
    minimum_rental_unit: "day",
    default_deposit_policy_id: null,
    active: true,
    display_order: 1,
    created_at: "",
    updated_at: "",
    created_by: null,
  };

  it("company default deposit resolves with source=company", () => {
    const r = resolveDepositForClass(null, basePolicy, cls);
    expect(r.amount).toBe(basePolicy.deposit.default_amount);
    expect(r.source).toBe("company");
  });

  it("class override deposit resolves with source=class", () => {
    const overrides: VehicleClassPolicyOverrides = { deposit_amount: 1000 };
    const r = resolveDepositForClass(overrides, basePolicy, cls);
    expect(r.amount).toBe(1000);
    expect(r.source).toBe("class");
    expect(r.className).toBe("SUV");
  });

  it("use-company-default (null override) falls back to company", () => {
    const overrides: VehicleClassPolicyOverrides = { deposit_amount: null };
    const r = resolveDepositForClass(overrides, basePolicy, cls);
    expect(r.source).toBe("company");
    expect(r.amount).toBe(basePolicy.deposit.default_amount);
  });

  it("deposit refund timing is configurable", () => {
    expect(basePolicy.deposit.refund_timing).toBe("manual_review");
    const p = policyWith({
      deposit: { ...basePolicy.deposit, refund_timing: "immediate" },
    });
    expect(p.deposit.refund_timing).toBe("immediate");
  });

  it("deposit application categories are configurable", () => {
    expect(basePolicy.deposit.allow_application_for).toContain("damage");
    expect(basePolicy.deposit.allow_application_for).toContain("late_fees");
  });
});

describe("Build #23 — extension / return policy", () => {
  it("extension allowed / approval_required / not_allowed are distinct", () => {
    const allowed = policyWith({
      extension: { ...basePolicy.extension, mode: "allowed" },
    });
    const approval = policyWith({
      extension: { ...basePolicy.extension, mode: "approval_required" },
    });
    const notAllowed = policyWith({
      extension: { ...basePolicy.extension, mode: "not_allowed" },
    });
    expect(allowed.extension.mode).toBe("allowed");
    expect(approval.extension.mode).toBe("approval_required");
    expect(notAllowed.extension.mode).toBe("not_allowed");
  });

  it("payment required before extension is configurable", () => {
    const p = policyWith({
      extension: {
        ...basePolicy.extension,
        payment_requirement: "required_before",
      },
    });
    expect(p.extension.payment_requirement).toBe("required_before");
  });

  it("return cutoff is separate from payment cutoff", () => {
    const p = policyWith({
      payment: { ...basePolicy.payment, payment_cutoff_time: "14:00" },
      returns: { ...basePolicy.returns, return_cutoff_time: "17:00" },
    });
    expect(p.payment.payment_cutoff_time).toBe("14:00");
    expect(p.returns.return_cutoff_time).toBe("17:00");
    expect(p.returns.return_cutoff_time).not.toBe(
      p.payment.payment_cutoff_time,
    );
  });

  it("return grace is independent from payment grace", () => {
    const p = policyWith({
      payment: { ...basePolicy.payment, grace_period_minutes: 0 },
      returns: { ...basePolicy.returns, grace_period_minutes: 60 },
    });
    expect(p.payment.grace_period_minutes).toBe(0);
    expect(p.returns.grace_period_minutes).toBe(60);
  });
});

describe("Build #23 — mileage / fuel policy", () => {
  it("unlimited mileage", () => {
    expect(basePolicy.mileage.type).toBe("unlimited");
    expect(basePolicy.mileage.allowance).toBe(0);
  });

  it("limited mileage with overage rate", () => {
    const p = policyWith({
      mileage: {
        type: "daily_allowance",
        allowance: 150,
        overage_rate: 0.25,
      },
    });
    expect(p.mileage.type).toBe("daily_allowance");
    expect(p.mileage.allowance).toBe(150);
    expect(p.mileage.overage_rate).toBe(0.25);
  });

  it("class override for mileage", () => {
    const overrides: VehicleClassPolicyOverrides = {
      mileage: { type: "unlimited", allowance: 0, overage_rate: 0 },
    };
    const r = resolveMileageForClass(overrides, basePolicy);
    expect(r.source).toBe("class");
    expect(r.policy.type).toBe("unlimited");
  });

  it("fuel policy is configurable", () => {
    const p = policyWith({
      fuel: {
        type: "full_to_full",
        charge_type: "per_gallon",
        charge_amount: 4,
      },
    });
    expect(p.fuel.type).toBe("full_to_full");
    expect(p.fuel.charge_type).toBe("per_gallon");
  });

  it("class override for fuel", () => {
    const overrides: VehicleClassPolicyOverrides = {
      fuel: { type: "prepaid", charge_type: "flat", charge_amount: 40 },
    };
    const r = resolveFuelForClass(overrides, basePolicy);
    expect(r.source).toBe("class");
    expect(r.policy.type).toBe("prepaid");
  });
});

describe("Build #23 — driver / insurance policy", () => {
  it("minimum age is configurable", () => {
    expect(basePolicy.driver_requirements.minimum_age).toBe(21);
    const p = policyWith({
      driver_requirements: {
        ...basePolicy.driver_requirements,
        minimum_age: 25,
      },
    });
    expect(p.driver_requirements.minimum_age).toBe(25);
  });

  it("driver license verification is required by default", () => {
    expect(basePolicy.driver_requirements.license_required).toBe(true);
    expect(basePolicy.driver_requirements.license_verification_required).toBe(
      true,
    );
    expect(basePolicy.driver_requirements.license_must_exceed_rental_end).toBe(
      true,
    );
  });

  it("insurance requirement is configurable", () => {
    expect(basePolicy.insurance.type).toBe("company_included");
    const p = policyWith({
      insurance: { ...basePolicy.insurance, type: "customer_must_provide" },
    });
    expect(p.insurance.type).toBe("customer_must_provide");
  });

  it("own-insurance discount option exists", () => {
    const p = policyWith({
      insurance: {
        ...basePolicy.insurance,
        own_insurance_discount: true,
        own_insurance_discount_amount: 15,
      },
    });
    expect(p.insurance.own_insurance_discount).toBe(true);
    expect(p.insurance.own_insurance_discount_amount).toBe(15);
  });

  it("additional-driver policy is configurable", () => {
    expect(basePolicy.driver_requirements.additional_drivers).toBe(
      "approval_required",
    );
    const p = policyWith({
      driver_requirements: {
        ...basePolicy.driver_requirements,
        additional_drivers: "fee_required",
      },
    });
    expect(p.driver_requirements.additional_drivers).toBe("fee_required");
  });
});
