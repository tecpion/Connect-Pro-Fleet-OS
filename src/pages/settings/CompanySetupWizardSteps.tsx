// Connect Pro Fleet — Company setup wizard step bodies (Build #23).

import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui-bits";
import { Field, selectClass } from "./shared";
import type { CompanyPolicies } from "@/lib/companyPolicyTypes";
import { RENTAL_CADENCE_LABELS } from "@/lib/companyPolicy";

type P = CompanyPolicies;
const ALL_CADENCES = [
  "daily",
  "multi_day",
  "weekly",
  "biweekly",
  "monthly",
  "long_term",
  "custom",
] as const;

const PRESET_META: { key: string; label: string; desc: string }[] = [
  {
    key: "weekly_private",
    label: "Weekly Private Rental",
    desc: "Weekly billing, 2 PM cutoff, $300 deposit.",
  },
  {
    key: "daily_rental",
    label: "Daily Rental",
    desc: "Daily/multi-day billing, standard deposit.",
  },
  {
    key: "long_term",
    label: "Long-Term Rental",
    desc: "Weekly/monthly, open-ended, recurring periods.",
  },
];

export function WizardCompanyStep({
  form,
  set,
  info,
  setInfo,
  preset,
  onPreset,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
  info: import("@/lib/types").CompanyInfo;
  setInfo: (patch: Partial<typeof info>) => void;
  preset: string | null;
  onPreset: (key: string) => void;
}) {
  return (
    <SectionCard title="Company profile">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Legal business name">
          <Input
            value={info.legal_name}
            onChange={(e) => setInfo({ legal_name: e.target.value })}
          />
        </Field>
        <Field label="Display name">
          <Input
            value={info.dba}
            onChange={(e) => setInfo({ dba: e.target.value })}
          />
        </Field>
        <Field label="Timezone">
          <Input
            value={info.timezone}
            onChange={(e) => setInfo({ timezone: e.target.value })}
          />
        </Field>
        <Field label="Currency">
          <Input
            value={info.currency}
            onChange={(e) => setInfo({ currency: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Start from a preset (optional)
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PRESET_META.map((p) => (
            <button
              key={p.key}
              onClick={() => onPreset(p.key)}
              className={
                preset === p.key
                  ? "rounded-md border-2 border-primary bg-primary/5 p-3 text-left"
                  : "rounded-md border border-border p-3 text-left hover:border-primary"
              }
            >
              <p className="text-sm font-semibold text-foreground">{p.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

export function WizardRentalModelStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Rental model">
      <p className="text-sm text-muted-foreground">
        Choose the cadences your company supports. You are not locked into
        weekly rentals.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ALL_CADENCES.map((c) => {
          const on = form.rental_model.enabled_cadences.includes(c);
          return (
            <button
              key={c}
              onClick={() =>
                set({
                  rental_model: {
                    ...form.rental_model,
                    enabled_cadences: on
                      ? form.rental_model.enabled_cadences.filter(
                          (x) => x !== c,
                        )
                      : [...form.rental_model.enabled_cadences, c],
                    default_cadence: on ? form.rental_model.default_cadence : c,
                  },
                })
              }
              className={
                on
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
              }
            >
              {RENTAL_CADENCE_LABELS[c]}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Minimum rental (days)">
          <Input
            type="number"
            min={0}
            value={form.rental_model.minimum_duration_days ?? ""}
            onChange={(e) =>
              set({
                rental_model: {
                  ...form.rental_model,
                  minimum_duration_days: e.target.value
                    ? Number(e.target.value)
                    : null,
                },
              })
            }
          />
        </Field>
        <Field label="Allow open-ended rentals">
          <select
            value={form.rental_model.allow_open_ended ? "yes" : "no"}
            onChange={(e) =>
              set({
                rental_model: {
                  ...form.rental_model,
                  allow_open_ended: e.target.value === "yes",
                },
              })
            }
            className={selectClass}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardPaymentsStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Payments">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Payment due cutoff" hint="2:00 = payable through 2:00.">
          <Input
            type="time"
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
        <Field label="Grace (minutes)">
          <Input
            type="number"
            min={0}
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
        <Field label="Late fee ($)">
          <Input
            type="number"
            min={0}
            value={form.late_fee.fixed_amount}
            onChange={(e) =>
              set({
                late_fee: {
                  ...form.late_fee,
                  fixed_amount: Number(e.target.value),
                },
              })
            }
            className="font-mono tabular"
          />
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardDepositsStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Deposits">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Default deposit ($)">
          <Input
            type="number"
            min={0}
            value={form.deposit.default_amount}
            onChange={(e) =>
              set({
                deposit: {
                  ...form.deposit,
                  default_amount: Number(e.target.value),
                },
              })
            }
            className="font-mono tabular"
          />
        </Field>
        <Field label="Refund timing">
          <select
            value={form.deposit.refund_timing}
            onChange={(e) =>
              set({
                deposit: {
                  ...form.deposit,
                  refund_timing: e.target
                    .value as typeof form.deposit.refund_timing,
                },
              })
            }
            className={selectClass}
          >
            <option value="immediate">Immediately after return</option>
            <option value="business_days">Within X business days</option>
            <option value="manual_review">Manual review</option>
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardReturnsStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Returns">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Return cutoff time" hint="Separate from payment cutoff.">
          <Input
            type="time"
            value={form.returns.return_cutoff_time ?? ""}
            onChange={(e) =>
              set({
                returns: {
                  ...form.returns,
                  return_cutoff_time: e.target.value || null,
                },
              })
            }
            className="font-mono tabular"
          />
        </Field>
        <Field label="Return grace (minutes)">
          <Input
            type="number"
            min={0}
            value={form.returns.grace_period_minutes}
            onChange={(e) =>
              set({
                returns: {
                  ...form.returns,
                  grace_period_minutes: Number(e.target.value),
                },
              })
            }
          />
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardMileageFuelStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Mileage & fuel">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mileage policy">
          <select
            value={form.mileage.type}
            onChange={(e) =>
              set({
                mileage: {
                  ...form.mileage,
                  type: e.target.value as typeof form.mileage.type,
                },
              })
            }
            className={selectClass}
          >
            <option value="unlimited">Unlimited</option>
            <option value="daily_allowance">Daily allowance</option>
            <option value="weekly_allowance">Weekly allowance</option>
            <option value="total_allowance">Total allowance</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Fuel policy">
          <select
            value={form.fuel.type}
            onChange={(e) =>
              set({
                fuel: {
                  ...form.fuel,
                  type: e.target.value as typeof form.fuel.type,
                },
              })
            }
            className={selectClass}
          >
            <option value="same_level">Return at same level</option>
            <option value="full_to_full">Full to full</option>
            <option value="prepaid">Prepaid</option>
            <option value="included">Included</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardDriverInsuranceStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Driver & insurance">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Minimum renter age">
          <Input
            type="number"
            min={16}
            value={form.driver_requirements.minimum_age}
            onChange={(e) =>
              set({
                driver_requirements: {
                  ...form.driver_requirements,
                  minimum_age: Number(e.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="Insurance policy">
          <select
            value={form.insurance.type}
            onChange={(e) =>
              set({
                insurance: {
                  ...form.insurance,
                  type: e.target.value as typeof form.insurance.type,
                },
              })
            }
            className={selectClass}
          >
            <option value="company_included">Company insurance included</option>
            <option value="customer_must_provide">Customer must provide</option>
            <option value="customer_may_provide">
              Customer may provide own
            </option>
            <option value="third_party">Third-party coverage</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardReservationsStep({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  return (
    <SectionCard title="Reservations & cancellations">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Booking mode">
          <select
            value={form.reservations.mode}
            onChange={(e) =>
              set({
                reservations: {
                  ...form.reservations,
                  mode: e.target.value as typeof form.reservations.mode,
                },
              })
            }
            className={selectClass}
          >
            <option value="instant">Instant booking</option>
            <option value="request_approval">Request / approval</option>
            <option value="staff_created_only">Staff-created only</option>
          </select>
        </Field>
        <Field label="Cancellation policy">
          <select
            value={form.cancellations.type}
            onChange={(e) =>
              set({
                cancellations: {
                  ...form.cancellations,
                  type: e.target.value as typeof form.cancellations.type,
                },
              })
            }
            className={selectClass}
          >
            <option value="free">Free cancellation</option>
            <option value="fee">Cancellation fee</option>
            <option value="deposit_forfeiture">Deposit forfeiture</option>
            <option value="no_refund_after_cutoff">
              No refund after cutoff
            </option>
            <option value="custom">Custom / manual</option>
          </select>
        </Field>
      </div>
    </SectionCard>
  );
}

export function WizardFeesStep() {
  return (
    <SectionCard title="Standard fees">
      <p className="text-sm text-muted-foreground">
        Standard fees (cleaning, smoking, lost key, etc.) are managed in the
        existing Taxes &amp; Fees section. Late-return fee configuration lives
        in Rental Policies → Returns. You can finish here and refine later.
      </p>
    </SectionCard>
  );
}

export function WizardReviewStep({
  form,
  preset,
}: {
  form: P;
  preset: string | null;
}) {
  return (
    <SectionCard title="Review">
      <p className="text-sm text-muted-foreground">
        You can refine every policy later in Settings → Rental Policies.
        Existing rentals will always keep their frozen snapshot.
      </p>
      <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-sm text-foreground">
        <p>
          <strong>Preset:</strong> {preset ?? "custom"}
        </p>
        <p>
          <strong>Default cadence:</strong>{" "}
          {RENTAL_CADENCE_LABELS[form.rental_model.default_cadence]}
        </p>
        <p>
          <strong>Cutoff:</strong>{" "}
          {form.payment.payment_cutoff_time ?? "end of day"}
        </p>
        <p>
          <strong>Late fee:</strong> ${form.late_fee.fixed_amount}
        </p>
        <p>
          <strong>Deposit:</strong> ${form.deposit.default_amount}
        </p>
      </div>
    </SectionCard>
  );
}
