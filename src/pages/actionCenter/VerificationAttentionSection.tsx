// Connect Pro Fleet — Action Center verification attention section (V1).
//
// Extracted into a focused component so ActionCenter.tsx (at its size budget)
// can render it with a single line. Surfaces ONLY actionable REQUIRED
// verification issues. Optional unrun checks never appear. Not a second task
// queue — feeds the same prioritized Action Center surface.

import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useVerificationOptional } from "@/lib/store/verificationStore";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { selectVerificationAttention } from "@/lib/verificationAttention";
import { SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

export function VerificationAttentionSection() {
  const store = useStore();
  const verOpt = useVerificationOptional();
  const { companyPolicies } = useCompanyPolicies();

  const items = useMemo(
    () =>
      verOpt
        ? selectVerificationAttention({
            store,
            policies: companyPolicies.verification_services?.services,
            requirements: verOpt.requirements,
            requests: verOpt.requests,
            overrides: verOpt.overrides,
          })
        : [],
    [verOpt, store, companyPolicies.verification_services],
  );

  if (items.length === 0) return null;

  return (
    <SectionCard
      title={`Verification · ${items.length}`}
      icon={<ShieldAlert size={15} className="text-primary" />}
      right={
        <Link
          to="/rental-management?tab=ready"
          className="text-xs font-medium text-primary hover:text-primary-press"
        >
          Review ready-for-checkout →
        </Link>
      }
    >
      <div className="space-y-2">
        {items.slice(0, 6).map((item) => (
          <Link
            key={item.id}
            to={item.deep_link}
            className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-primary/40 hover:bg-surface-2"
          >
            <span className="flex items-center gap-2 text-foreground">
              <ShieldAlert
                size={13}
                className={
                  item.priority === "high"
                    ? "text-status-out"
                    : "text-status-maintenance"
                }
              />
              <span>{item.reason}</span>
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                item.priority === "high"
                  ? "text-status-out"
                  : "text-status-maintenance",
              )}
            >
              {item.priority === "high" ? "High" : "Medium"}
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
