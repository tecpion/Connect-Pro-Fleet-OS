// Connect Pro Fleet — Settings > Tolls & Violations policy (Build #25).
// Minimal structured violation-processing policy. Reuses the existing
// violation policy store. NOT a massive settings build — just the fields
// needed to surface policy before a customer charge and set default
// responsibility. A rental's frozen policy snapshot takes precedence over
// today's company policy where relevant.

import { useStore } from "@/lib/store";
import { useViolationPolicy } from "@/lib/violationPolicyStore";
import { can } from "@/lib/permissions";
import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./shared";
import { ToggleRow } from "./policyBits";
import { useCan } from "./useCan";
import {
  DEFAULT_RESPONSIBILITY_LABELS,
  type DefaultResponsibility,
} from "@/lib/violationPolicyTypes";

export function ViolationsSettingsSection() {
  const store = useStore();
  const { violationPolicy, updateViolationPolicy } = useViolationPolicy();
  const canManage = useCan("company_settings.manage");

  const set = updateViolationPolicy;

  return (
    <div className="space-y-6">
      <SectionCard title="Tolls & Violations policy">
        <p className="text-sm text-muted-foreground">
          Default responsibility and processing rules. A rental's frozen
          agreement terms take precedence over today's policy where relevant.
          Financial truth stays in the Rental Ledger (customer charges) and
          Expense Ledger (company payments).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Default toll responsibility">
            <select
              disabled={!canManage}
              value={violationPolicy.default_toll_responsibility}
              onChange={(e) =>
                set({
                  default_toll_responsibility: e.target
                    .value as DefaultResponsibility,
                })
              }
              className={selectClass}
            >
              {Object.entries(DEFAULT_RESPONSIBILITY_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default parking-ticket responsibility">
            <select
              disabled={!canManage}
              value={violationPolicy.default_parking_responsibility}
              onChange={(e) =>
                set({
                  default_parking_responsibility: e.target
                    .value as DefaultResponsibility,
                })
              }
              className={selectClass}
            >
              {Object.entries(DEFAULT_RESPONSIBILITY_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default camera-ticket responsibility">
            <select
              disabled={!canManage}
              value={violationPolicy.default_camera_responsibility}
              onChange={(e) =>
                set({
                  default_camera_responsibility: e.target
                    .value as DefaultResponsibility,
                })
              }
              className={selectClass}
            >
              {Object.entries(DEFAULT_RESPONSIBILITY_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Default admin fee ($)"
            hint="Optional company processing fee charged to the customer."
          >
            <Input
              type="number"
              min={0}
              disabled={!canManage}
              value={violationPolicy.admin_fee_amount}
              onChange={(e) =>
                set({ admin_fee_amount: Number(e.target.value) })
              }
              className="font-mono tabular"
            />
          </Field>
          <Field
            label="Default violation owner"
            hint="Auto-assign new violations."
          >
            <select
              disabled={!canManage}
              value={violationPolicy.default_violation_owner_id ?? ""}
              onChange={(e) =>
                set({
                  default_violation_owner_id: e.target.value || null,
                })
              }
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {store.staff
                .filter((s) => s.status === "active")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <ToggleRow
            label="Charge authority penalties (late penalties) to customer"
            checked={violationPolicy.charge_penalties_to_customer}
            disabled={!canManage}
            onChange={(v) => set({ charge_penalties_to_customer: v })}
          />
          <ToggleRow
            label="Allow security deposit application toward violation charge"
            checked={violationPolicy.allow_deposit_application}
            disabled={!canManage}
            onChange={(v) => set({ allow_deposit_application: v })}
          />
          <ToggleRow
            label="Require evidence before charging customer"
            checked={violationPolicy.evidence_required_before_charge}
            disabled={!canManage}
            onChange={(v) => set({ evidence_required_before_charge: v })}
          />
          <ToggleRow
            label="Auto-create a review task on violation creation"
            checked={violationPolicy.auto_create_review_task}
            disabled={!canManage}
            onChange={(v) => set({ auto_create_review_task: v })}
          />
        </div>
      </SectionCard>
    </div>
  );
}
