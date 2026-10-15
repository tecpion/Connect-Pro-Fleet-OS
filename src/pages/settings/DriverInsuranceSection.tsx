// Connect Pro Fleet — Settings > Drivers & Insurance (Build #23).

import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./shared";
import { useCan } from "./useCan";
import { ToggleRow } from "./policyBits";
import type {
  AdditionalDriverPolicy,
  InsurancePolicyType,
} from "@/lib/companyPolicyTypes";

type P = ReturnType<
  typeof import("@/lib/store/companyPolicyStore").useCompanyPolicies
>["companyPolicies"];

export function DriverInsuranceSection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("rental_policies.manage");
  return (
    <>
      <SectionCard title="Driver requirements">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Minimum renter age">
            <Input
              type="number"
              min={16}
              disabled={!canManage}
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
          <Field label="Additional drivers">
            <select
              disabled={!canManage}
              value={form.driver_requirements.additional_drivers}
              onChange={(e) =>
                set({
                  driver_requirements: {
                    ...form.driver_requirements,
                    additional_drivers: e.target
                      .value as AdditionalDriverPolicy,
                  },
                })
              }
              className={selectClass}
            >
              <option value="allowed">Allowed</option>
              <option value="not_allowed">Not allowed</option>
              <option value="fee_required">Fee required</option>
              <option value="approval_required">Approval required</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          <ToggleRow
            disabled={!canManage}
            label="Valid driver's license required"
            checked={form.driver_requirements.license_required}
            onChange={(v) =>
              set({
                driver_requirements: {
                  ...form.driver_requirements,
                  license_required: v,
                },
              })
            }
          />
          <ToggleRow
            disabled={!canManage}
            label="License verification required"
            checked={form.driver_requirements.license_verification_required}
            onChange={(v) =>
              set({
                driver_requirements: {
                  ...form.driver_requirements,
                  license_verification_required: v,
                },
              })
            }
          />
          <ToggleRow
            disabled={!canManage}
            label="License must exceed rental end date"
            checked={form.driver_requirements.license_must_exceed_rental_end}
            onChange={(v) =>
              set({
                driver_requirements: {
                  ...form.driver_requirements,
                  license_must_exceed_rental_end: v,
                },
              })
            }
          />
          <ToggleRow
            disabled={!canManage}
            label="Allow manual override of driver requirements"
            checked={form.driver_requirements.allow_manual_override}
            onChange={(v) =>
              set({
                driver_requirements: {
                  ...form.driver_requirements,
                  allow_manual_override: v,
                },
              })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Insurance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Insurance policy">
            <select
              disabled={!canManage}
              value={form.insurance.type}
              onChange={(e) =>
                set({
                  insurance: {
                    ...form.insurance,
                    type: e.target.value as InsurancePolicyType,
                  },
                })
              }
              className={selectClass}
            >
              <option value="company_included">
                Company insurance included
              </option>
              <option value="customer_must_provide">
                Customer must provide
              </option>
              <option value="customer_may_provide">
                Customer may provide own
              </option>
              <option value="third_party">Third-party coverage</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field
            label="Own-insurance discount ($)"
            hint="When customer supplies qualifying insurance."
          >
            <Input
              type="number"
              min={0}
              disabled={!canManage || !form.insurance.own_insurance_discount}
              value={form.insurance.own_insurance_discount_amount}
              onChange={(e) =>
                set({
                  insurance: {
                    ...form.insurance,
                    own_insurance_discount_amount: Number(e.target.value),
                  },
                })
              }
              className="font-mono tabular"
            />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          <ToggleRow
            disabled={!canManage}
            label="Offer own-insurance discount"
            checked={form.insurance.own_insurance_discount}
            onChange={(v) =>
              set({
                insurance: { ...form.insurance, own_insurance_discount: v },
              })
            }
          />
          <ToggleRow
            disabled={!canManage}
            label="Require insurance verification (proof, policy #, carrier, expiration)"
            checked={form.insurance.verification_required}
            onChange={(v) =>
              set({
                insurance: { ...form.insurance, verification_required: v },
              })
            }
          />
        </div>
      </SectionCard>
    </>
  );
}
