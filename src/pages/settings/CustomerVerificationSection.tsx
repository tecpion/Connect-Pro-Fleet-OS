// Connect Pro Fleet — Settings > Customer Verification (Verification Optionalization).
//
// Tenant-level configuration for whether identity/driver verification participates
// in the product. Three modes:
//   Off      — hide verification workflows; verification never blocks.
//   Basic    — track verification + documents without blocking rentals (default).
//   Required  — use configured verification requirements in readiness + checkout.
//
// Changing the mode is a behaviour/presentation switch only — it NEVER deletes
// verification records, uploaded documents, or audit history. Re-enabling
// restores visibility of existing records. Compliance remains the single
// authoritative blocker engine; this config only toggles what surfaces and
// whether configured verification requirements gate operations.

import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useCan } from "./useCan";
import { SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import {
  VERIFICATION_MODE_LABELS,
  VERIFICATION_MODE_DESCRIPTIONS,
} from "@/lib/verificationConfig";
import type { CustomerVerificationMode } from "@/lib/companyPolicyTypes";
import { ShieldOff, ShieldCheck, ShieldAlert } from "lucide-react";
import { VerificationUsagePanel } from "./VerificationUsagePanel";

const MODE_ORDER: {
  value: CustomerVerificationMode;
  label: string;
  description: string;
  icon: typeof ShieldOff;
}[] = [
  {
    value: "off",
    label: VERIFICATION_MODE_LABELS.off,
    description: VERIFICATION_MODE_DESCRIPTIONS.off,
    icon: ShieldOff,
  },
  {
    value: "basic",
    label: VERIFICATION_MODE_LABELS.basic,
    description: VERIFICATION_MODE_DESCRIPTIONS.basic,
    icon: ShieldCheck,
  },
  {
    value: "required",
    label: VERIFICATION_MODE_LABELS.required,
    description: VERIFICATION_MODE_DESCRIPTIONS.required,
    icon: ShieldAlert,
  },
];

export function CustomerVerificationSection() {
  const { companyPolicies, updateCompanyPolicies } = useCompanyPolicies();
  const canManage = useCan("company_settings.manage");
  const mode = companyPolicies.customer_verification?.mode ?? "basic";

  const setMode = (next: CustomerVerificationMode) =>
    updateCompanyPolicies({
      customer_verification: { mode: next },
    });

  return (
    <div className="space-y-6">
      <SectionCard title="Customer Verification">
        <p className="text-sm text-muted-foreground">
          Choose how your business handles identity and driver verification.
          Configure verification based on your business requirements — not every
          rental company must verify identity. Changing this setting only
          changes what surfaces and what blocks; it does not delete existing
          verification records or uploaded documents.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MODE_ORDER.map((m) => {
            const active = mode === m.value;
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                type="button"
                disabled={!canManage}
                onClick={() => setMode(m.value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors disabled:opacity-50",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border bg-surface hover:border-primary/40",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon size={16} className="text-primary" />
                  {m.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.description}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Off:</span> the
            standalone Verification navigation and verification KPIs/filters are
            hidden; verification never blocks checkout or marks a customer
            Blocked. Existing verification records and documents are preserved.
          </p>
          <p className="mt-1.5">
            <span className="font-semibold text-foreground">Basic:</span>{" "}
            verification and documents are tracked but missing verification does
            not automatically block rentals. Verification is informational.
          </p>
          <p className="mt-1.5">
            <span className="font-semibold text-foreground">Required:</span>{" "}
            configured compliance requirements (driver license, government ID,
            insurance, other customer documents) gate customer readiness and
            rental checkout.
          </p>
        </div>
      </SectionCard>

      {/* Verification usage — contextual link so company owners can reach usage
          insight from Customer Verification settings. Mock estimates only; no
          new sidebar destination. Hidden gracefully when no paid checks exist. */}
      <VerificationUsagePanel />
    </div>
  );
}
