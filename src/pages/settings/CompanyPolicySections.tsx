// Connect Pro Fleet — Settings > Billing & payments, late fees, payment
// methods, deposits, business hours (Build #23).

import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./shared";
import { useCan } from "./useCan";
import { ToggleRow } from "./policyBits";
import {
  PAYMENT_METHOD_LABELS,
  ALL_PAYMENT_METHODS,
} from "@/lib/companyPolicyDefaults";
import type {
  BillingCadence,
  LateFeeType,
  LateFeeMode,
  LateFeeFrequency,
  DepositRequirement,
  DepositRefundTiming,
  DepositApplicationCategory,
  BusinessHours,
  WeekdayKey,
} from "@/lib/companyPolicyTypes";
import { WEEKDAY_KEYS } from "@/lib/companyPolicyTypes";
import {
  CADENCE_LABELS,
  formatCutoff,
  formatGraceMinutes,
} from "@/lib/companyPolicy";

type P = ReturnType<
  typeof import("@/lib/store/companyPolicyStore").useCompanyPolicies
>["companyPolicies"];

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export function BusinessHoursSection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("company_settings.manage");
  const updateDay = (
    key: WeekdayKey,
    patch: Partial<BusinessHours[WeekdayKey]>,
  ) =>
    set({
      business_hours: {
        ...form.business_hours,
        [key]: { ...form.business_hours[key], ...patch },
      },
    });
  return (
    <SectionCard title="Business hours">
      <p className="text-sm text-muted-foreground">
        Operating hours by day. Used for pickup/return scheduling and support
        availability.
      </p>
      <div className="mt-4 space-y-2">
        {WEEKDAY_KEYS.map((day) => {
          const d = form.business_hours[day];
          return (
            <div
              key={day}
              className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center"
            >
              <label className="flex items-center gap-2 text-sm font-medium text-foreground sm:w-32">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={d.open}
                  onChange={(e) => updateDay(day, { open: e.target.checked })}
                  className="h-4 w-4"
                />
                {WEEKDAY_LABELS[day]}
              </label>
              {d.open ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    disabled={!canManage}
                    value={d.open_time ?? "09:00"}
                    onChange={(e) =>
                      updateDay(day, { open_time: e.target.value })
                    }
                    className="w-32 font-mono tabular"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    disabled={!canManage}
                    value={d.close_time ?? "18:00"}
                    onChange={(e) =>
                      updateDay(day, { close_time: e.target.value })
                    }
                    className="w-32 font-mono tabular"
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function BillingPaymentSection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("billing_policies.manage");
  return (
    <SectionCard title="Billing & payments">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Default billing cadence">
          <select
            disabled={!canManage}
            value={form.payment.default_billing_cadence}
            onChange={(e) =>
              set({
                payment: {
                  ...form.payment,
                  default_billing_cadence: e.target.value as BillingCadence,
                },
              })
            }
            className={selectClass}
          >
            {(
              ["daily", "weekly", "biweekly", "monthly", "custom"] as const
            ).map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Payment due cutoff"
          hint="Payable THROUGH this time (2:00 = not late at 2:00, late at 2:01)."
        >
          <Input
            type="time"
            disabled={!canManage}
            value={form.payment.payment_cutoff_time ?? ""}
            onChange={(e) =>
              set({
                payment: {
                  ...form.payment,
                  payment_cutoff_time: e.target.value || null,
                },
              })
            }
            className="font-mono tabular"
          />
        </Field>
        <Field label="Grace period (minutes)">
          <Input
            type="number"
            min={0}
            disabled={!canManage}
            value={form.payment.grace_period_minutes}
            onChange={(e) =>
              set({
                payment: {
                  ...form.payment,
                  grace_period_minutes: Number(e.target.value),
                },
              })
            }
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Current: due {formatCutoff(form.payment.payment_cutoff_time)} •{" "}
        {formatGraceMinutes(form.payment.grace_period_minutes)}. The
        authoritative exact-time late evaluator consumes this setting.
      </p>
    </SectionCard>
  );
}

export function LateFeeSection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("billing_policies.manage");
  const lf = form.late_fee;
  return (
    <SectionCard title="Late fee policy">
      <ToggleRow
        disabled={!canManage}
        label="Late fee enabled"
        checked={lf.enabled}
        onChange={(v) => set({ late_fee: { ...lf, enabled: v } })}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Fee type">
          <select
            disabled={!canManage || !lf.enabled}
            value={lf.type}
            onChange={(e) =>
              set({ late_fee: { ...lf, type: e.target.value as LateFeeType } })
            }
            className={selectClass}
          >
            <option value="fixed">Fixed amount</option>
            <option value="percentage">Percentage of balance</option>
            <option value="none">None / custom-manual</option>
          </select>
        </Field>
        <Field label="Application mode">
          <select
            disabled={!canManage || !lf.enabled}
            value={lf.mode}
            onChange={(e) =>
              set({ late_fee: { ...lf, mode: e.target.value as LateFeeMode } })
            }
            className={selectClass}
          >
            <option value="automatic">Automatic (Fleet applies)</option>
            <option value="manual">Manual (staff approval)</option>
          </select>
        </Field>
        <Field label="Fixed amount ($)" hint="When type = fixed.">
          <Input
            type="number"
            min={0}
            disabled={!canManage || !lf.enabled || lf.type !== "fixed"}
            value={lf.fixed_amount}
            onChange={(e) =>
              set({ late_fee: { ...lf, fixed_amount: Number(e.target.value) } })
            }
            className="font-mono tabular"
          />
        </Field>
        <Field label="Percentage (%)" hint="When type = percentage.">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.5"
            disabled={!canManage || !lf.enabled || lf.type !== "percentage"}
            value={lf.percentage}
            onChange={(e) =>
              set({ late_fee: { ...lf, percentage: Number(e.target.value) } })
            }
            className="font-mono tabular"
          />
        </Field>
        <Field label="Frequency">
          <select
            disabled={!canManage || !lf.enabled}
            value={lf.frequency}
            onChange={(e) =>
              set({
                late_fee: {
                  ...lf,
                  frequency: e.target.value as LateFeeFrequency,
                },
              })
            }
            className={selectClass}
          >
            <option value="once_per_period">Once per billing period</option>
            <option value="once_per_event">Once per late event</option>
          </select>
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Fleet remains authoritative — Connect Pro never applies a second fee.
        Eligibility follows the cutoff + grace period above. No daily
        compounding.
      </p>
    </SectionCard>
  );
}

export function PaymentMethodsSection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("billing_policies.manage");
  const toggle = (method: string, enabled: boolean) =>
    set({
      payment_methods: form.payment_methods.map((pm) =>
        pm.method === method ? { ...pm, enabled } : pm,
      ),
    });
  const setInstructions = (method: string, instructions: string) =>
    set({
      payment_methods: form.payment_methods.map((pm) =>
        pm.method === method
          ? { ...pm, instructions: instructions || null }
          : pm,
      ),
    });
  return (
    <SectionCard title="Accepted payment methods">
      <p className="text-sm text-muted-foreground">
        Enable the tenders your company accepts. Instructions are presentation
        values — never store banking credentials here.
      </p>
      <div className="mt-4 space-y-2">
        {ALL_PAYMENT_METHODS.map((m) => {
          const pm = form.payment_methods.find((x) => x.method === m);
          if (!pm) return null;
          return (
            <div
              key={m}
              className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center"
            >
              <label className="flex items-center gap-2 text-sm font-medium text-foreground sm:w-40">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={pm.enabled}
                  onChange={(e) => toggle(m, e.target.checked)}
                  className="h-4 w-4"
                />
                {PAYMENT_METHOD_LABELS[m]}
              </label>
              <Input
                disabled={!canManage || !pm.enabled}
                value={pm.instructions ?? ""}
                onChange={(e) => setInstructions(m, e.target.value)}
                placeholder="Instructions (e.g. Send to payments@company.com)"
                className="flex-1"
              />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function DepositPolicySection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("rental_policies.manage");
  const dep = form.deposit;
  const ALL_CATS: DepositApplicationCategory[] = [
    "unpaid_balance",
    "late_fees",
    "damage",
    "fuel",
    "cleaning",
    "tolls_tickets",
    "other",
  ];
  const toggleCat = (cat: DepositApplicationCategory, on: boolean) =>
    set({
      deposit: {
        ...dep,
        allow_application_for: on
          ? [...dep.allow_application_for, cat]
          : dep.allow_application_for.filter((c) => c !== cat),
      },
    });
  return (
    <SectionCard title="Security deposit policy">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Deposit requirement">
          <select
            disabled={!canManage}
            value={dep.requirement}
            onChange={(e) =>
              set({
                deposit: {
                  ...dep,
                  requirement: e.target.value as DepositRequirement,
                },
              })
            }
            className={selectClass}
          >
            <option value="required">Required</option>
            <option value="optional">Optional</option>
            <option value="not_required">Not required</option>
          </select>
        </Field>
        <Field label="Default amount ($)" hint="Vehicle Class may override.">
          <Input
            type="number"
            min={0}
            disabled={!canManage}
            value={dep.default_amount}
            onChange={(e) =>
              set({
                deposit: { ...dep, default_amount: Number(e.target.value) },
              })
            }
            className="font-mono tabular"
          />
        </Field>
        <Field label="Refund timing">
          <select
            disabled={!canManage}
            value={dep.refund_timing}
            onChange={(e) =>
              set({
                deposit: {
                  ...dep,
                  refund_timing: e.target.value as DepositRefundTiming,
                },
              })
            }
            className={selectClass}
          >
            <option value="immediate">Immediately after return</option>
            <option value="business_days">Within X business days</option>
            <option value="manual_review">Manual review required</option>
          </select>
        </Field>
        <Field
          label="Business days to refund"
          hint="When timing = business days."
        >
          <Input
            type="number"
            min={0}
            disabled={!canManage || dep.refund_timing !== "business_days"}
            value={dep.refund_business_days}
            onChange={(e) =>
              set({
                deposit: {
                  ...dep,
                  refund_business_days: Number(e.target.value),
                },
              })
            }
          />
        </Field>
      </div>
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deposit may be applied toward
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_CATS.map((cat) => {
            const on = dep.allow_application_for.includes(cat);
            return (
              <button
                key={cat}
                disabled={!canManage}
                onClick={() => toggleCat(cat, !on)}
                className={
                  on
                    ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    : "rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {cat.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
