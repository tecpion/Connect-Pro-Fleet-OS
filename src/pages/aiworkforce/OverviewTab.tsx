// Connect Pro Fleet — Connect Pro AI Operator Overview tab (V1 simplification).
//
// One AI Operations Manager — not seven separate bots. This overview presents
// the WATCH → DRAFT → ACT model with three management areas: Operations,
// Payments & Finance, and Partners & Investors. Detailed usage/billing lives
// in Settings; only a compact usage line remains here.

import { useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import {
  allAgentCardVms,
  isSetupComplete,
  planSummary,
  workforceSummaryKpis,
  type AgentCardVm,
} from "@/lib/agentWorkspaceSelectors";
import { SectionCard } from "@/components/ui-bits";
import { fmtMoney } from "@/lib/format";
import {
  Bot,
  Play,
  Pause,
  Activity,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  Clock,
  Eye,
  FileEdit,
  Zap,
  Wrench,
  CreditCard,
  Users,
} from "lucide-react";
import type { AgentId } from "@/lib/agentTypes";
import {
  SummaryKpi,
  MiniMetric,
  CustomerStatusBadge,
  GhostButton,
  PrimaryButton,
  InfoBanner,
} from "./WorkspacePrimitives";

// ---------------------------------------------------------------------------
// Management areas — the three responsibilities of the AI Operator
// ---------------------------------------------------------------------------

interface ManagementArea {
  id: string;
  label: string;
  description: string;
  icon: typeof Wrench;
  categories: string[];
  monitoredItems: string[];
}

const OPERATIONS_AREA: ManagementArea = {
  id: "operations",
  label: "Operations",
  description:
    "Monitors rentals, fleet readiness, maintenance, compliance, and day-to-day operational issues.",
  icon: Wrench,
  categories: ["Rentals", "Fleet", "Maintenance", "Compliance"],
  monitoredItems: [
    "Pickups due today",
    "Returns due today",
    "Upcoming pickups and returns",
    "Vehicles not ready for rental",
    "Compliance blocks",
    "Expiring registration",
    "Expiring insurance",
    "Open maintenance issues",
    "Overdue work orders",
    "Missing inspections",
    "Missing agreements",
    "Customer verification issues",
    "Rental lifecycle exceptions",
  ],
};

const PAYMENTS_AREA: ManagementArea = {
  id: "payments",
  label: "Payments & Finance",
  description:
    "Monitors payments, balances, deposits, collections, and financial exceptions.",
  icon: CreditCard,
  categories: ["Payments", "Deposits", "Collections", "Reconciliation"],
  monitoredItems: [
    "Payments due today",
    "Overdue balances",
    "Failed or missing payments",
    "Deposit requirements",
    "Deposit refunds",
    "Payment arrangements",
    "Unmatched bank transactions",
    "Missing receipts",
    "Reconciliation issues",
    "Duplicate or questionable transactions",
  ],
};

const PARTNERS_AREA: ManagementArea = {
  id: "partners",
  label: "Partners & Investors",
  description:
    "Prepares partner and investor reporting, settlement reviews, and payout recommendations.",
  icon: Users,
  categories: ["JV Revenue", "Expenses", "Settlements", "Payouts"],
  monitoredItems: [
    "Partner/JV revenue",
    "Expenses",
    "Revenue split calculations",
    "Settlement periods",
    "Missing documentation",
    "Payouts ready for review",
  ],
};

// ---------------------------------------------------------------------------
// Autonomy mode selector (UI representation only)
// ---------------------------------------------------------------------------

type AutonomyMode = "off" | "monitor" | "prepare" | "auto";

const MODE_LABELS: Record<AutonomyMode, string> = {
  off: "Off",
  monitor: "Monitor",
  prepare: "Prepare",
  auto: "Auto",
};

const MODE_DESCRIPTIONS: Record<AutonomyMode, string> = {
  off: "AI does nothing for this area.",
  monitor: "AI watches activity and identifies issues.",
  prepare: "AI watches and prepares recommended actions for your approval.",
  auto: "AI may perform specifically authorized low-risk actions.",
};

function AutonomyModeSelector({
  mode,
  onChange,
  disabled,
}: {
  mode: AutonomyMode;
  onChange: (m: AutonomyMode) => void;
  disabled?: boolean;
}) {
  const modes: AutonomyMode[] = ["off", "monitor", "prepare", "auto"];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => !disabled && onChange(m)}
            disabled={disabled}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:bg-surface-2/80"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{MODE_DESCRIPTIONS[mode]}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Management area card
// ---------------------------------------------------------------------------

function ManagementAreaCard({
  area,
  mode,
  onModeChange,
  optional,
  disabled,
}: {
  area: ManagementArea;
  mode: AutonomyMode;
  onModeChange: (m: AutonomyMode) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const Icon = area.icon;
  return (
    <SectionCard
      title={area.label}
      icon={<Icon size={16} className="text-primary" />}
      right={optional ? <span className="text-xs text-muted-foreground">Optional</span> : undefined}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{area.description}</p>

        <div className="flex flex-wrap gap-1.5">
          {area.categories.map((cat) => (
            <span
              key={cat}
              className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {cat}
            </span>
          ))}
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Monitors
          </p>
          <ul className="space-y-1">
            {area.monitoredItems.slice(0, 6).map((item) => (
              <li
                key={item}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground/40" />
                {item}
              </li>
            ))}
            {area.monitoredItems.length > 6 && (
              <li className="text-xs text-muted-foreground/70">
                +{area.monitoredItems.length - 6} more
              </li>
            )}
          </ul>
        </div>

        <div className="border-t border-border/60 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Autonomy
          </p>
          <AutonomyModeSelector
            mode={mode}
            onChange={onModeChange}
            disabled={disabled}
          />
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Today's AI Briefing
// ---------------------------------------------------------------------------

function TodaysBriefing({
  hasData,
  onReview,
}: {
  hasData: boolean;
  onReview: () => void;
}) {
  if (!hasData) {
    return (
      <SectionCard
        title="Today's AI Briefing"
        icon={<Sparkles size={16} className="text-primary" />}
      >
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Your AI briefing will appear here once monitoring is enabled.
          </p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Today's AI Briefing"
      icon={<Sparkles size={16} className="text-primary" />}
      right={
        <PrimaryButton onClick={onReview}>
          <CheckCircle2 size={13} /> Review Prepared Actions
        </PrimaryButton>
      }
    >
      <div className="rounded-lg bg-surface-2/40 p-4">
        <p className="text-sm text-muted-foreground">
          Your AI operations manager is monitoring your rental business. When
          items need attention, a morning summary will appear here with the
          day's pickups, returns, overdue balances, and prepared actions
          waiting for your approval.
        </p>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Watch → Draft → Act explainer
// ---------------------------------------------------------------------------

function WatchDraftActExplainer() {
  return (
    <SectionCard
      title="How Connect Pro AI Operator Works"
      icon={<Zap size={16} className="text-primary" />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-surface-2/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye size={16} />
            </div>
            <h3 className="font-display text-sm font-semibold text-foreground">
              Watch
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Monitors your rental operation and identifies what needs attention.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileEdit size={16} />
            </div>
            <h3 className="font-display text-sm font-semibold text-foreground">
              Draft
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Prepares the message, task, work order, reminder, or next step for
            your review.
          </p>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap size={16} />
            </div>
            <h3 className="font-display text-sm font-semibold text-foreground">
              Act
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Executes approved actions through Connect Pro workflows based on
            your permissions.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <InfoBanner>
          <ShieldAlert size={14} className="mr-1.5 inline" />
          AI actions follow your staff permissions and approval rules. The AI
          does not directly edit your database — every action goes through the
          same validation as a human entering it manually.
        </InfoBanner>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main OverviewTab
// ---------------------------------------------------------------------------

export function OverviewTab({
  agentStore,
  canManage,
  canRun,
  canViewUsage,
  onSelectAgent,
  onOpenSettings,
  onOpenSetup,
  onOpenUsageBilling,
}: {
  agentStore: ReturnType<typeof useAgentStore>;
  canManage: boolean;
  canRun: boolean;
  canViewUsage: boolean;
  onSelectAgent: (id: AgentId) => void;
  onOpenSettings: (id: AgentId) => void;
  onOpenSetup: () => void;
  onOpenUsageBilling?: () => void;
}) {
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [opsMode, setOpsMode] = useState<AutonomyMode>("monitor");
  const [payMode, setPayMode] = useState<AutonomyMode>("monitor");
  const [partnerMode, setPartnerMode] = useState<AutonomyMode>("off");

  const kpis = workforceSummaryKpis(
    agentStore.configs,
    agentStore.actions,
    agentStore.entitlement,
    agentStore.usageRecords,
  );
  const plan = planSummary(agentStore.entitlement, agentStore.usageRecords);
  const setupDone = isSetupComplete(agentStore.configs);

  // Map the existing KPIs into the new V1 operational cards.
  const needsAttention = kpis.approvalsWaiting;
  const preparedForApproval = kpis.actionsPreparedToday;
  const completedToday = kpis.successfulActionsToday;
  const monitoring = kpis.activeAgents;

  const hasBriefingData = setupDone && (needsAttention > 0 || preparedForApproval > 0);

  return (
    <div className="space-y-6">
      {/* Development mode indicator (subtle, not alarming) */}
      {agentStore.entitlement.is_dev && (
        <InfoBanner tone="blue">
          <ShieldAlert size={14} className="mr-1.5 inline" />
          Development Mode — Live AI provider not connected. AI features run in
          a safe local mode for testing.
        </InfoBanner>
      )}

      {/* Primary operational metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryKpi
          label="Needs Attention"
          value={String(needsAttention)}
          icon={<ShieldAlert size={16} />}
          tone={needsAttention > 0 ? "out" : "neutral"}
        />
        <SummaryKpi
          label="Prepared for Approval"
          value={String(preparedForApproval)}
          icon={<FileEdit size={16} />}
        />
        <SummaryKpi
          label="Completed Today"
          value={String(completedToday)}
          icon={<CheckCircle2 size={16} />}
          tone="primary"
        />
        <SummaryKpi
          label="Monitoring"
          value={`${monitoring} ${monitoring === 1 ? "area" : "areas"}`}
          icon={<Eye size={16} />}
        />
      </div>

      {/* Compact usage line + link to detailed billing */}
      {canViewUsage && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-2/30 px-4 py-2.5">
          <p className="text-sm text-muted-foreground">
            AI usage this month:{" "}
            <span className="font-medium text-foreground">
              {fmtMoney(plan.usedThisPeriod)} of {fmtMoney(plan.includedAllowance)} included
            </span>
          </p>
          {onOpenUsageBilling && (
            <button
              onClick={onOpenUsageBilling}
              className="text-xs font-medium text-primary hover:underline"
            >
              View AI Usage & Billing →
            </button>
          )}
        </div>
      )}

      {/* Today's AI Briefing */}
      <TodaysBriefing
        hasData={hasBriefingData}
        onReview={() => onSelectAgent("collections")}
      />

      {/* First-time setup prompt */}
      {canManage && !setupDone && (
        <InfoBanner tone="blue">
          <Sparkles size={14} className="mr-1.5 inline" />
          Connect Pro AI Operator is ready to set up. Enable monitoring to start
          watching your rental operation.{" "}
          <button
            onClick={onOpenSetup}
            className="ml-1 font-semibold underline"
          >
            Set up AI Operator
          </button>
        </InfoBanner>
      )}

      {/* Management areas — the three responsibilities */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ManagementAreaCard
          area={OPERATIONS_AREA}
          mode={opsMode}
          onModeChange={setOpsMode}
        />
        <ManagementAreaCard
          area={PAYMENTS_AREA}
          mode={payMode}
          onModeChange={setPayMode}
        />
        <ManagementAreaCard
          area={PARTNERS_AREA}
          mode={partnerMode}
          onModeChange={setPartnerMode}
          optional
          disabled={!canManage}
        />
      </div>

      {/* Watch → Draft → Act explainer */}
      <WatchDraftActExplainer />

      {/* How it works drawer toggle (kept for accessibility) */}
      <div className="flex justify-center">
        <GhostButton onClick={() => setShowHowItWorks(!showHowItWorks)}>
          <Sparkles size={13} /> {showHowItWorks ? "Hide" : "Show"} details
        </GhostButton>
      </div>

      {showHowItWorks && (
        <SectionCard title="AI Operator Details" icon={<Bot size={16} className="text-primary" />}>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Connect Pro AI Operator</strong>{" "}
              is your single AI operations manager. It watches your rental
              business, prepares work, and takes approved actions — all through
              your existing Connect Pro workflows and permissions.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniMetric label="Active areas" value={String(monitoring)} />
              <MiniMetric label="Plan" value={plan.planLabel} />
              <MiniMetric
                label="Remaining allowance"
                value={fmtMoney(plan.remainingAllowance)}
              />
              <MiniMetric
                label="Spending cap"
                value={plan.spendingCap > 0 ? fmtMoney(plan.spendingCap) : "None"}
              />
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// Re-export for backward compat with WorkspaceTabs import.
export function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "out";
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-medium ${tone === "out" ? "text-amber-600" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

// Re-export EnableBadge for backward compat.
export function EnableBadge({ state }: { state: string }) {
  const ENABLE_LABEL: Record<string, string> = {
    enabled: "Active",
    paused: "Paused",
    disabled: "Disabled",
  };
  const color =
    state === "enabled"
      ? "bg-emerald-100 text-emerald-700"
      : state === "paused"
        ? "bg-amber-100 text-amber-700"
        : "bg-surface-2 text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {ENABLE_LABEL[state] ?? state}
    </span>
  );
}

export { Clock };