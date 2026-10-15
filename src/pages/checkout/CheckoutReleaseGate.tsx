// Connect Pro Fleet — Checkout Start-step release-gate panel (Final V1 Pass 1).
//
// Renders the AUTHORITATIVE release-gate reasons (from evaluateRentalReleaseGate)
// and the manager override flow. Hard blocks can NEVER be overridden; override-
// eligible blockers can be cleared by a manager with `rentals.override_release_gate`
// (the parent records the audited gate_override event when the rental is started).
//
// This is presentational only — no gate logic is duplicated here. The parent owns
// the gate result and override state and passes them down.

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Lock, ShieldAlert } from "lucide-react";
import type {
  ReleaseBlockReason,
  ReleaseBlockSeverity,
} from "@/lib/defenseTypes";

const SEVERITY_STYLE: Record<
  ReleaseBlockSeverity,
  { tone: string; label: string }
> = {
  hard_block: {
    tone: "text-status-out",
    label: "Hard block — cannot be overridden",
  },
  override_eligible: {
    tone: "text-status-maintenance",
    label: "Override eligible (manager)",
  },
  warning: { tone: "text-muted-foreground", label: "Warning" },
};

export interface CheckoutReleaseGateProps {
  reasons: ReleaseBlockReason[];
  hardBlocked: boolean;
  overrideEligible: boolean;
  overrideApplied: boolean;
  overrideOpen: boolean;
  overrideReason: string;
  canOverride: boolean;
  onOpenOverride: () => void;
  onCancelOverride: () => void;
  onReasonChange: (v: string) => void;
  onApplyOverride: () => void;
}

export function CheckoutReleaseGate({
  reasons,
  hardBlocked,
  overrideEligible,
  overrideApplied,
  overrideOpen,
  overrideReason,
  canOverride,
  onOpenOverride,
  onCancelOverride,
  onReasonChange,
  onApplyOverride,
}: CheckoutReleaseGateProps) {
  if (reasons.length === 0 && !overrideOpen) return null;
  return (
    <>
      {reasons.length > 0 && (
        <div
          data-testid="checkout-release-gate"
          className="space-y-2 rounded-md border border-border bg-surface-2 px-3 py-3"
        >
          <div className="flex items-center gap-2">
            {hardBlocked ? (
              <Lock size={16} className="text-status-out" />
            ) : (
              <ShieldAlert size={16} className="text-status-maintenance" />
            )}
            <p className="text-sm font-semibold text-foreground">
              Release gate
              {hardBlocked
                ? " — hard blocks prevent release"
                : overrideEligible
                  ? " — override-eligible blockers"
                  : ""}
            </p>
          </div>
          <ul className="space-y-1.5">
            {reasons.map((r) => {
              const style = SEVERITY_STYLE[r.severity];
              return (
                <li
                  key={r.key}
                  data-testid={`gate-reason-${r.severity}`}
                  className="flex items-start gap-2"
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 text-xs font-medium",
                      style.tone,
                    )}
                  >
                    {style.label}
                  </span>
                  <span className="text-sm text-foreground">{r.label}</span>
                </li>
              );
            })}
          </ul>
          {overrideApplied && !hardBlocked && (
            <p className="flex items-center gap-1.5 text-xs text-status-available">
              <CheckCircle2 size={14} /> Manager override applied — eligible
              blockers cleared.
            </p>
          )}
          {canOverride && overrideEligible && !overrideApplied && (
            <Button size="sm" variant="outline" onClick={onOpenOverride}>
              <ShieldAlert size={14} className="mr-1.5" /> Override eligible
              blockers
            </Button>
          )}
          {!canOverride && overrideEligible && !overrideApplied && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              An eligible blocker exists. A manager with release-gate override
              permission is required to proceed.
            </p>
          )}
        </div>
      )}
      {overrideOpen && (
        <div
          data-testid="checkout-override-dialog"
          className="space-y-3 rounded-md border border-border bg-surface p-4"
        >
          <p className="text-sm font-medium text-foreground">
            Override release gate
          </p>
          <p className="text-xs text-muted-foreground">
            This records an audited override (you, timestamp, and your reason).
            It does NOT alter inspection or provider results. Hard blocks cannot
            be overridden.
          </p>
          <Textarea
            value={overrideReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Reason for override (required)"
            className="min-h-[72px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancelOverride}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!overrideReason.trim()}
              onClick={onApplyOverride}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Apply override
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
