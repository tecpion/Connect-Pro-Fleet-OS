// Connect Pro Fleet — Investor & Partner Management V1 workspace primitives.
// Shared small UI helpers for the workspace (status pills, share bars, etc.).

import { cn } from "@/lib/utils";
import { StatusPill, type Tone } from "@/components/Status";
import {
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_TONES,
  AGREEMENT_STATUS_LABELS,
  type PartnerStatus,
  type SettlementStatus,
  type AgreementStatus,
} from "@/lib/investorWorkspaceTypes";

export function PartnerStatusPill({ status }: { status: PartnerStatus }) {
  return (
    <StatusPill tone={PARTNER_STATUS_TONES[status]}>
      {PARTNER_STATUS_LABELS[status]}
    </StatusPill>
  );
}

export function SettlementStatusPill({ status }: { status: SettlementStatus }) {
  return (
    <StatusPill tone={SETTLEMENT_STATUS_TONES[status]}>
      {SETTLEMENT_STATUS_LABELS[status]}
    </StatusPill>
  );
}

const AGREEMENT_TONES: Record<AgreementStatus, Tone> = {
  active: "available",
  superseded: "neutral",
  ended: "out",
};

export function AgreementStatusPill({ status }: { status: AgreementStatus }) {
  return (
    <StatusPill tone={AGREEMENT_TONES[status]}>
      {AGREEMENT_STATUS_LABELS[status]}
    </StatusPill>
  );
}

/** A horizontal share bar showing company vs partner split. */
export function ShareBar({
  companyPct,
  partnerPct,
}: {
  companyPct: number;
  partnerPct: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className="bg-primary"
          style={{ width: `${companyPct}%` }}
          aria-label={`Company ${companyPct}%`}
        />
        <div
          className="bg-primary/40"
          style={{ width: `${partnerPct}%` }}
          aria-label={`Partner ${partnerPct}%`}
        />
      </div>
      <span className="font-mono text-xs tabular text-muted-foreground">
        {companyPct}% / {partnerPct}%
      </span>
    </div>
  );
}

/** KPI card for the overview. */
export function WorkspaceKpi({
  label,
  value,
  hint,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-4",
        onClick && "cursor-pointer transition-colors hover:bg-surface-2",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Tab button for the workspace. */
export function WorkspaceTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
