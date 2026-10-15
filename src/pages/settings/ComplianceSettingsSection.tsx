// Connect Pro Fleet — Settings > Compliance & Documents policy (Build #26).
// Minimal structured compliance policy. This is the SINGLE SOURCE OF TRUTH for
// which documents are required + the default warning window — it lives inside
// CompanyPolicies.compliance (Build #23 architecture), not a second store.
// Structured DocumentRecord/ComplianceRequirement remain the authoritative
// detailed state; this config materializes into policy-derived requirements.

import { useStore } from "@/lib/store";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./shared";
import { ToggleRow } from "./policyBits";
import { useCan } from "./useCan";
import { ComplianceRulesSection } from "./ComplianceRulesSection";

export function ComplianceSettingsSection() {
  const store = useStore();
  const { companyPolicies, updateCompanyPolicies } = useCompanyPolicies();
  const canManage = useCan("company_settings.manage");
  const cfg = companyPolicies.compliance;

  const set = (patch: Partial<typeof cfg>) =>
    updateCompanyPolicies({ compliance: { ...cfg, ...patch } });

  return (
    <div className="space-y-6">
      <SectionCard title="Compliance & Documents policy">
        <p className="text-sm text-muted-foreground">
          Configure which documents are required and the default expiring-soon
          warning window. These rules are the single source of truth for
          compliance — structured document records remain the authoritative
          detailed state. Compliance requirements are configured by your company
          and do not constitute legal advice.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Default warning window (days)"
            hint="Warn before a document expires."
          >
            <Input
              type="number"
              min={1}
              disabled={!canManage}
              value={cfg.default_warning_days}
              onChange={(e) =>
                set({ default_warning_days: Number(e.target.value) })
              }
              className="font-mono tabular"
            />
          </Field>
          <Field
            label="Default compliance owner"
            hint="Auto-assign compliance issues."
          >
            <select
              disabled={!canManage}
              value={cfg.default_compliance_owner_id ?? ""}
              onChange={(e) =>
                set({ default_compliance_owner_id: e.target.value || null })
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
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Vehicle requirements
          </p>
          <ToggleRow
            label="Require vehicle registration"
            checked={cfg.require_vehicle_registration}
            disabled={!canManage}
            onChange={(v) => set({ require_vehicle_registration: v })}
          />
          <ToggleRow
            label="Require vehicle insurance"
            checked={cfg.require_vehicle_insurance}
            disabled={!canManage}
            onChange={(v) => set({ require_vehicle_insurance: v })}
          />
          <ToggleRow
            label="Require vehicle inspection"
            checked={cfg.require_vehicle_inspection}
            disabled={!canManage}
            onChange={(v) => set({ require_vehicle_inspection: v })}
          />
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Customer requirements
          </p>
          <ToggleRow
            label="Require valid driver license"
            checked={cfg.require_customer_dl}
            disabled={!canManage}
            onChange={(v) => set({ require_customer_dl: v })}
          />
          <ToggleRow
            label="Require customer proof of insurance"
            checked={cfg.require_customer_insurance}
            disabled={!canManage}
            onChange={(v) => set({ require_customer_insurance: v })}
          />
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Rental requirements
          </p>
          <ToggleRow
            label="Require signed rental agreement before checkout"
            checked={cfg.require_signed_agreement_before_checkout}
            disabled={!canManage}
            onChange={(v) =>
              set({ require_signed_agreement_before_checkout: v })
            }
          />
          <ToggleRow
            label="Auto-create a review task when a compliance issue is detected"
            checked={cfg.auto_create_review_task}
            disabled={!canManage}
            onChange={(v) => set({ auto_create_review_task: v })}
          />
        </div>
      </SectionCard>

      <ComplianceRulesSection />
    </div>
  );
}
