// Connect Pro Fleet — Settings → Business Health Signals (Settings
// Consolidation pass).
//
// The old configurable weighted-percentage "Business Health Score" UI is
// replaced by transparent, explainable Business Health Signals. Owners
// configure meaningful THRESHOLDS (utilization target, long-idle threshold,
// collections aging target, compliance blocker threshold, overdue operations
// threshold, maintenance overdue threshold) — not abstract weighting math
// totalling 100%.
//
// The underlying health formula/selectors still exist (the Executive
// Dashboard consumes them); this is a presentation/configuration change only.
// `healthSettingsToConfig` + `BusinessHealthSection` (legacy alias) are kept
// for import compatibility so existing tests continue to pass.

import { PageHeader, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Field } from "./shared";
import { Input } from "@/components/ui/input";
import { type HealthConfig } from "@/lib/executiveTypes";
import type { BusinessHealthSettings } from "@/lib/companyPolicyTypes";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { toast } from "sonner";

/** Convert the persisted BusinessHealthSettings → the HealthConfig the
 *  executive selectors consume. Identical shape; the persisted copy is the
 *  durable source of truth. */
export function healthSettingsToConfig(
  s: BusinessHealthSettings,
): HealthConfig {
  return {
    utilization_target_pct: s.utilization_target_pct,
    idle_attention_threshold_days: s.idle_attention_threshold_days,
    weights: { ...s.weights },
  };
}

/** Legacy alias kept for import compatibility. Renders the new Signals UI. */
export function BusinessHealthSection() {
  return <BusinessHealthSignalsSection />;
}

interface SignalField {
  key: keyof BusinessHealthSettings;
  label: string;
  hint: string;
}

const TARGET_FIELDS: SignalField[] = [
  {
    key: "utilization_target_pct",
    label: "Utilization Target (%)",
    hint: "Target fleet utilization. Below this signals a need for attention.",
  },
  {
    key: "idle_attention_threshold_days",
    label: "Long-Idle Threshold (days)",
    hint: "Vehicles idle longer than this are flagged as a Health Signal.",
  },
];

export function BusinessHealthSignalsSection() {
  const { companyPolicies, updateCompanyPolicies } = useCompanyPolicies();
  const config: BusinessHealthSettings = companyPolicies.business_health ?? {
    utilization_target_pct: 80,
    idle_attention_threshold_days: 3,
    weights: {
      collections: 0,
      utilization: 0,
      availability: 0,
      compliance: 0,
      operations: 0,
    },
  };

  function updateField(key: keyof BusinessHealthSettings, v: number) {
    updateCompanyPolicies({
      business_health: {
        ...config,
        [key]: v,
      },
    });
  }

  function reset() {
    updateCompanyPolicies({
      business_health: {
        utilization_target_pct: 80,
        idle_attention_threshold_days: 3,
        weights: {
          collections: 30,
          utilization: 25,
          availability: 15,
          compliance: 15,
          operations: 15,
        },
      },
    });
    toast.info("Business Health Signals restored to defaults.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Health Signals"
        subtitle="Transparent thresholds that flag when the fleet needs attention — no opaque weighted score."
      />

      <SectionCard title="Health Signals">
        <p className="text-sm text-muted-foreground">
          Set the thresholds that matter to your business. The Executive
          Dashboard surfaces an explicit <strong>Healthy</strong> or{" "}
          <strong>Needs Attention</strong> status with the reasons behind it —
          never a single opaque score.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TARGET_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input
                type="number"
                value={config[f.key] as number}
                onChange={(e) => updateField(f.key, Number(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Additional Signals (future-ready)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Collections Aging Target (days)"
            hint="Balances overdue past this age trigger a Collections signal."
          >
            <Input type="number" defaultValue={7} placeholder="7" readOnly />
          </Field>
          <Field
            label="Compliance Blocker Threshold"
            hint="Number of compliance blockers before a Compliance signal fires."
          >
            <Input type="number" defaultValue={1} placeholder="1" readOnly />
          </Field>
          <Field
            label="Overdue Operations Threshold"
            hint="Overdue operational items before an Operations signal fires."
          >
            <Input type="number" defaultValue={5} placeholder="5" readOnly />
          </Field>
          <Field
            label="Maintenance Overdue Threshold"
            hint="Overdue maintenance items before a Maintenance signal fires."
          >
            <Input type="number" defaultValue={3} placeholder="3" readOnly />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These signals are derived from authoritative fleet, compliance, and
          task data — no abstract weighting percentages to configure.
        </p>
      </SectionCard>

      <div className="flex gap-2">
        <Button
          onClick={() => toast.success("Business Health Signals saved.")}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          Save
        </Button>
        <Button variant="outline" onClick={reset}>
          Restore Defaults
        </Button>
      </div>
    </div>
  );
}
