// Connect Pro Fleet — Company policy inheritance resolver + snapshot + summary
// (Build #23). Pure helpers over store data — no duplicate state.
//
// Inheritance chain:
//   COMPANY DEFAULT  →  VEHICLE CLASS OVERRIDE  →  RENTAL OVERRIDE (where supported)
// The source of each resolved value is surfaced for staff visibility.

import type {
  BillingCadence,
  CompanyPolicies,
  LateFeePolicy,
  MileagePolicyConfig,
  FuelPolicyConfig,
  RentalPolicySnapshot,
  VehicleClassPolicyOverrides,
} from "./companyPolicyTypes";
import type { VehicleClass } from "./types";

export type PolicySource = "company" | "class" | "override";

export interface ResolvedDepositPolicy {
  amount: number;
  source: PolicySource;
  className?: string;
}

export function resolveDepositForClass(
  overrides: VehicleClassPolicyOverrides | null | undefined,
  company: CompanyPolicies,
  cls?: VehicleClass,
): ResolvedDepositPolicy {
  if (overrides?.deposit_amount != null) {
    return {
      amount: overrides.deposit_amount,
      source: "class",
      className: cls?.name,
    };
  }
  return { amount: company.deposit.default_amount, source: "company" };
}

export interface ResolvedMileagePolicy {
  policy: MileagePolicyConfig;
  source: PolicySource;
  className?: string;
}

export function resolveMileageForClass(
  overrides: VehicleClassPolicyOverrides | null | undefined,
  company: CompanyPolicies,
  cls?: VehicleClass,
): ResolvedMileagePolicy {
  if (overrides?.mileage) {
    return {
      policy: { ...company.mileage, ...overrides.mileage },
      source: "class",
      className: cls?.name,
    };
  }
  return { policy: company.mileage, source: "company" };
}

export interface ResolvedFuelPolicy {
  policy: FuelPolicyConfig;
  source: PolicySource;
  className?: string;
}

export function resolveFuelForClass(
  overrides: VehicleClassPolicyOverrides | null | undefined,
  company: CompanyPolicies,
  cls?: VehicleClass,
): ResolvedFuelPolicy {
  if (overrides?.fuel) {
    return {
      policy: { ...company.fuel, ...overrides.fuel },
      source: "class",
      className: cls?.name,
    };
  }
  return { policy: company.fuel, source: "company" };
}

export function resolveMinimumDurationForClass(
  overrides: VehicleClassPolicyOverrides | null | undefined,
  company: CompanyPolicies,
): number | null {
  if (overrides?.minimum_duration_days != null)
    return overrides.minimum_duration_days;
  return company.rental_model.minimum_duration_days;
}

/** Resolve the dollar late-fee amount from a policy against an outstanding
 *  balance. Returns 0 when disabled or not applicable. */
export function resolveLateFeeAmount(
  policy: LateFeePolicy,
  outstandingBalance: number,
): number {
  if (!policy.enabled) return 0;
  if (policy.type === "fixed") return Math.max(0, policy.fixed_amount);
  if (policy.type === "percentage") {
    return Math.max(
      0,
      Math.round((outstandingBalance * policy.percentage) / 100),
    );
  }
  return 0;
}

/** Freeze the effective policy terms onto a rental at checkout so later
 *  company/class changes never retroactively alter an active or historical
 *  agreement. Mirrors the existing pricing_snapshot pattern (Build #5). */
export function freezeRentalPolicySnapshot(
  company: CompanyPolicies,
  opts: {
    depositAmount: number;
    depositSource: PolicySource;
    mileage: MileagePolicyConfig;
    mileageSource: PolicySource;
    fuel: FuelPolicyConfig;
    fuelSource: PolicySource;
  },
): RentalPolicySnapshot {
  return {
    payment_cutoff_time: company.payment.payment_cutoff_time,
    grace_period_minutes: company.payment.grace_period_minutes,
    late_fee: { ...company.late_fee },
    deposit: {
      requirement: company.deposit.requirement,
      amount: opts.depositAmount,
      refund_timing: company.deposit.refund_timing,
    },
    mileage: { ...opts.mileage },
    fuel: { ...opts.fuel },
    returns: {
      return_cutoff_time: company.returns.return_cutoff_time,
      grace_period_minutes: company.returns.grace_period_minutes,
      late_return_fee_type: company.returns.late_return_fee_type,
      late_return_fee_amount: company.returns.late_return_fee_amount,
    },
    billing_cadence: company.payment.default_billing_cadence,
    source: {
      deposit: opts.depositSource,
      // Mileage/fuel inherit company or class — never a rental override in V1.
      mileage: opts.mileageSource as "company" | "class",
      fuel: opts.fuelSource as "company" | "class",
    },
    frozen_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Human-readable summary + labels
// ---------------------------------------------------------------------------

export const CADENCE_LABELS: Record<BillingCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  custom: "Custom",
};

export const RENTAL_CADENCE_LABELS = {
  daily: "Daily",
  multi_day: "Multi-Day",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  long_term: "Long-Term",
  custom: "Custom",
} as const;

export function formatCutoff(time: string | null): string {
  if (!time) return "End of day";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatGraceMinutes(minutes: number): string {
  if (minutes <= 0) return "No grace";
  if (minutes < 60) return `${minutes} min grace`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours} hr grace`;
  return `${(minutes / 60).toFixed(1)} hr grace`;
}

export function policySummary(p: CompanyPolicies): string[] {
  const lines: string[] = [];
  lines.push(
    `Billing • ${CADENCE_LABELS[p.payment.default_billing_cadence]} • Due ${formatCutoff(p.payment.payment_cutoff_time)} • ${formatGraceMinutes(p.payment.grace_period_minutes)}`,
  );
  if (p.late_fee.enabled) {
    const fee =
      p.late_fee.type === "fixed"
        ? `$${p.late_fee.fixed_amount}`
        : p.late_fee.type === "percentage"
          ? `${p.late_fee.percentage}%`
          : "Custom";
    lines.push(
      `Late Fee • ${fee} ${p.late_fee.mode === "automatic" ? "automatic" : "manual"} • ${p.late_fee.frequency === "once_per_period" ? "once per period" : "once per event"}`,
    );
  } else {
    lines.push("Late Fee • Disabled");
  }
  lines.push(
    `Deposit • $${p.deposit.default_amount} default • ${p.deposit.requirement.replace(/_/g, " ")} • Refund ${p.deposit.refund_timing.replace(/_/g, " ")}`,
  );
  lines.push(
    `Mileage • ${p.mileage.type.replace(/_/g, " ")}${p.mileage.type === "unlimited" ? "" : ` (${p.mileage.allowance})`}`,
  );
  lines.push(`Fuel • ${p.fuel.type.replace(/_/g, " ")}`);
  lines.push(
    `Min Rental • ${p.rental_model.minimum_duration_days ?? "No minimum"} days`,
  );
  return lines;
}
