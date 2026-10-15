// Connect Pro Fleet — Rental Detail Verification Readiness card (Final V1 Pass 1).
//
// A compact operational card on Rental Detail showing the RESOLVED verification
// requirements for this rental (company policy + per-rental staff requirements).
// It reads from the SAME authoritative selectors as the release gate — NO
// duplicate verification logic. Optional unrun checks never show as blockers.
// It does NOT duplicate the full Customer Verification history; it deep-links to
// the customer record for detail.

import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import type { RentalAgreement } from "@/lib/types";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useVerificationOptional } from "@/lib/store/verificationStore";
import { resolveGateVerificationRequirements } from "@/lib/rentalReleaseGateSources";
import {
  verificationReadiness,
  verificationBlockReasons,
} from "@/lib/verificationSelectors";
import type { VerificationReadiness } from "@/lib/verificationTypes";

const READINESS_META: Record<
  VerificationReadiness,
  { label: string; tone: string; icon: React.ReactNode }
> = {
  ready: {
    label: "Ready",
    tone: "text-status-available",
    icon: <CheckCircle2 size={16} />,
  },
  optional_available: {
    label: "Optional checks available",
    tone: "text-muted-foreground",
    icon: <ShieldAlert size={16} />,
  },
  required_pending: {
    label: "Required checks pending",
    tone: "text-status-maintenance",
    icon: <AlertTriangle size={16} />,
  },
  needs_review: {
    label: "Needs review",
    tone: "text-status-maintenance",
    icon: <AlertTriangle size={16} />,
  },
  failed: {
    label: "Required verification failed",
    tone: "text-status-out",
    icon: <AlertTriangle size={16} />,
  },
  expired: {
    label: "Expired requirement",
    tone: "text-status-out",
    icon: <AlertTriangle size={16} />,
  },
};

export function RentalVerificationReadinessCard({
  rental,
}: {
  rental: RentalAgreement;
}) {
  const { companyPolicies } = useCompanyPolicies();
  const verificationOpt = useVerificationOptional();

  const { readiness, blockers } = useMemo(() => {
    if (!verificationOpt) {
      return {
        readiness: "ready" as VerificationReadiness,
        blockers: [] as string[],
      };
    }
    const now = new Date();
    const resolved = resolveGateVerificationRequirements(
      rental,
      {
        policies: companyPolicies.verification_services.services,
        requirements: verificationOpt.requirements,
        requests: verificationOpt.requests,
        overrides: verificationOpt.overrides,
      },
      now,
    );
    return {
      readiness: verificationReadiness(resolved, now),
      blockers: verificationBlockReasons(resolved, now),
    };
  }, [rental, companyPolicies, verificationOpt]);

  const meta = READINESS_META[readiness];

  return (
    <div data-testid="rd-verification-readiness">
      <SectionCard title="Verification Readiness">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={meta.tone}>{meta.icon}</span>
            <span
              data-testid="verification-readiness-state"
              className={cn("text-sm font-medium", meta.tone)}
            >
              {meta.label}
            </span>
          </div>
          {blockers.length > 0 && (
            <ul className="space-y-1">
              {blockers.map((b, i) => (
                <li
                  key={i}
                  data-testid="verification-readiness-blocker"
                  className="text-xs text-foreground"
                >
                  {b}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Resolved from company policy + per-rental requirements. Optional
            unrun checks never block checkout.
          </p>
          <Link
            to={`/customers/${rental.customer_id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View customer verification <ExternalLink size={12} />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}
