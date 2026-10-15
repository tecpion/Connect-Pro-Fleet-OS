// Connect Pro Fleet — Settings > Rental model, mileage, fuel (Build #23).

import { useState } from "react";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Field, selectClass } from "./shared";
import { useCan } from "./useCan";
import type {
  RentalCadence,
  MileagePolicyType,
  FuelPolicyType,
  FuelPolicyConfig,
} from "@/lib/companyPolicyTypes";
import { RENTAL_CADENCE_LABELS } from "@/lib/companyPolicy";

const ALL_CADENCES: RentalCadence[] = [
  "daily",
  "multi_day",
  "weekly",
  "biweekly",
  "monthly",
  "long_term",
  "custom",
];

export function RentalModelSection({
  form,
  set,
}: {
  form: ReturnType<typeof useCompanyPolicies>["companyPolicies"];
  set: (patch: Partial<typeof form>) => void;
}) {
  const canManage = useCan("rental_policies.manage");

  const toggleCadence = (c: RentalCadence) => {
    const has = form.rental_model.enabled_cadences.includes(c);
    const next = has
      ? form.rental_model.enabled_cadences.filter((x) => x !== c)
      : [...form.rental_model.enabled_cadences, c];
    if (next.length === 0) {
      toast.error("At least one rental cadence must be enabled.");
      return;
    }
    set({
      rental_model: {
        ...form.rental_model,
        enabled_cadences: next,
        default_cadence: next.includes(form.rental_model.default_cadence)
          ? form.rental_model.default_cadence
          : next[0],
      },
    });
  };

  return (
    <SectionCard title="Rental model">
      <p className="text-sm text-muted-foreground">
        Choose the rental/billing cadences your company supports. Multiple may
        be enabled — you are not locked into weekly rentals.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {ALL_CADENCES.map((c) => {
          const on = form.rental_model.enabled_cadences.includes(c);
          return (
            <button
              key={c}
              disabled={!canManage}
              onClick={() => toggleCadence(c)}
              className={
                on
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {RENTAL_CADENCE_LABELS[c]}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Default cadence">
          <select
            disabled={!canManage}
            value={form.rental_model.default_cadence}
            onChange={(e) =>
              set({
                rental_model: {
                  ...form.rental_model,
                  default_cadence: e.target.value as RentalCadence,
                },
              })
            }
            className={selectClass}
          >
            {form.rental_model.enabled_cadences.map((c) => (
              <option key={c} value={c}>
                {RENTAL_CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Minimum rental (days)"
          hint="Independent of billing cadence."
        >
          <Input
            type="number"
            min={0}
            disabled={!canManage}
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
        <Field label="Maximum rental (days)" hint="Blank = no maximum.">
          <Input
            type="number"
            min={0}
            disabled={!canManage}
            value={form.rental_model.maximum_duration_days ?? ""}
            onChange={(e) =>
              set({
                rental_model: {
                  ...form.rental_model,
                  maximum_duration_days: e.target.value
                    ? Number(e.target.value)
                    : null,
                },
              })
            }
          />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          disabled={!canManage}
          checked={form.rental_model.allow_open_ended}
          onChange={(e) =>
            set({
              rental_model: {
                ...form.rental_model,
                allow_open_ended: e.target.checked,
              },
            })
          }
          className="h-4 w-4"
        />
        Allow open-ended / long-term rentals (no fixed end date)
      </label>
    </SectionCard>
  );
}

export function MileageFuelSection({
  form,
  set,
}: {
  form: ReturnType<typeof useCompanyPolicies>["companyPolicies"];
  set: (patch: Partial<typeof form>) => void;
}) {
  const canManage = useCan("rental_policies.manage");
  return (
    <>
      <SectionCard title="Mileage policy">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Mileage type">
            <select
              disabled={!canManage}
              value={form.mileage.type}
              onChange={(e) =>
                set({
                  mileage: {
                    ...form.mileage,
                    type: e.target.value as MileagePolicyType,
                  },
                })
              }
              className={selectClass}
            >
              <option value="unlimited">Unlimited</option>
              <option value="daily_allowance">Daily allowance</option>
              <option value="weekly_allowance">Weekly allowance</option>
              <option value="total_allowance">Total rental allowance</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Allowance (miles)" hint="When not unlimited.">
            <Input
              type="number"
              min={0}
              disabled={!canManage || form.mileage.type === "unlimited"}
              value={form.mileage.allowance}
              onChange={(e) =>
                set({
                  mileage: {
                    ...form.mileage,
                    allowance: Number(e.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Overage rate ($/mile)">
            <Input
              type="number"
              min={0}
              step="0.05"
              disabled={!canManage || form.mileage.type === "unlimited"}
              value={form.mileage.overage_rate}
              onChange={(e) =>
                set({
                  mileage: {
                    ...form.mileage,
                    overage_rate: Number(e.target.value),
                  },
                })
              }
              className="font-mono tabular"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Fuel policy">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Fuel policy">
            <select
              disabled={!canManage}
              value={form.fuel.type}
              onChange={(e) =>
                set({
                  fuel: {
                    ...form.fuel,
                    type: e.target.value as FuelPolicyType,
                  },
                })
              }
              className={selectClass}
            >
              <option value="same_level">Return at same level</option>
              <option value="full_to_full">Full to full</option>
              <option value="prepaid">Prepaid fuel</option>
              <option value="included">Included</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Charge type">
            <select
              disabled={!canManage}
              value={form.fuel.charge_type}
              onChange={(e) =>
                set({
                  fuel: {
                    ...form.fuel,
                    charge_type: e.target
                      .value as FuelPolicyConfig["charge_type"],
                  },
                })
              }
              className={selectClass}
            >
              <option value="flat">Flat fee</option>
              <option value="per_gallon">Per gallon</option>
              <option value="manual">Manual calculation</option>
            </select>
          </Field>
          <Field label="Charge amount">
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={!canManage || form.fuel.charge_type === "manual"}
              value={form.fuel.charge_amount}
              onChange={(e) =>
                set({
                  fuel: {
                    ...form.fuel,
                    charge_amount: Number(e.target.value),
                  },
                })
              }
              className="font-mono tabular"
            />
          </Field>
        </div>
      </SectionCard>
    </>
  );
}
