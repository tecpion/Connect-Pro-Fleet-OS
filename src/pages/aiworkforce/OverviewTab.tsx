// Connect Pro Fleet — Fleet Copilot Overview tab (Build #43 / #47 UX polish).
//
// Fleet Copilot is the single AI brain. This overview shows Copilot status,
// pending approvals, actions prepared today, automations enabled, AI usage
// this billing period, and recent Copilot activity. The underlying agent
// registry powers the "Automations" — here we present a premium status board
// for the ONE assistant, not seven separate bots.

import { useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import { AGENT_LIST, getAgentDefinition } from "@/lib/agentRegistry";
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
  HelpCircle,
  Zap,
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

export function OverviewTab({
  agentStore,
  canManage,
  canRun,
  canViewUsage,
  onSelectAgent,
  onOpenSettings,
  onOpenSetup,
}: {
  agentStore: ReturnType<typeof useAgentStore>;
  canManage: boolean;
  canRun: boolean;
  canViewUsage: boolean;
  onSelectAgent: (id: AgentId) => void;
  onOpenSettings: (id: AgentId) => void;
  onOpenSetup: () => void;
}) {
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const cards = allAgentCardVms(
    agentStore.configs,
    agentStore.entitlement,
    agentStore.runs,
    agentStore.actions,
    agentStore.usageRecords,
    canManage,
  );
  const kpis = workforceSummaryKpis(
    agentStore.configs,
    agentStore.actions,
    agentStore.entitlement,
    agentStore.usageRecords,
  );
  const plan = planSummary(agentStore.entitlement, agentStore.usageRecords);
  const setupDone = isSetupComplete(agentStore.configs);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryKpi
          label="Automations Enabled"
          value={String(kpis.activeAgents)}
          icon={<Bot size={16} />}
          tone="primary"
        />
        <SummaryKpi
          label="Approvals Waiting"
          value={String(kpis.approvalsWaiting)}
          icon={<ShieldAlert size={16} />}
          tone={kpis.approvalsWaiting > 0 ? "out" : "neutral"}
        />
        <SummaryKpi
          label="Actions Prepared Today"
          value={String(kpis.actionsPreparedToday)}
          icon={<Activity size={16} />}
        />
        <SummaryKpi
          label="Successful Actions Today"
          value={String(kpis.successfulActionsToday)}
          icon={<CheckCircle2 size={16} />}
        />
        {canViewUsage && (
          <SummaryKpi
            label="AI Usage This Period"
            value={fmtMoney(kpis.aiUsageThisPeriod)}
            icon={<Sparkles size={16} />}
            hint={plan.planLabel}
          />
        )}
      </div>

      {/* Plan / entitlement summary */}
      {canViewUsage && (
        <SectionCard
          title="Fleet Copilot Plan"
          icon={<Sparkles size={16} />}
          right={
            <button
              onClick={() => setShowHowItWorks(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <HelpCircle size={13} /> How Fleet Copilot Works
            </button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniMetric label="Plan" value={plan.planLabel} />
            <MiniMetric
              label="Included Allowance"
              value={fmtMoney(plan.includedAllowance)}
            />
            <MiniMetric
              label="Used This Period"
              value={fmtMoney(plan.usedThisPeriod)}
            />
            <MiniMetric
              label="Remaining"
              value={fmtMoney(plan.remainingAllowance)}
              tone="primary"
            />
            <MiniMetric
              label="Overage"
              value={plan.overageEnabled ? "Enabled" : "Disabled"}
            />
            <MiniMetric
              label="Spending Cap"
              value={plan.spendingCap > 0 ? fmtMoney(plan.spendingCap) : "None"}
            />
            <MiniMetric
              label="Billing Period"
              value={new Date().toISOString().slice(0, 7)}
            />
            <MiniMetric
              label="Live SaaS Billing"
              value={plan.saasBillingConnected ? "Connected" : "Not connected"}
            />
          </div>
          {plan.isDev && (
            <div className="mt-4">
              <InfoBanner>
                <ShieldAlert size={14} className="mr-1.5 inline" />
                Development/demo entitlement — usage values are configuration
                only, not live billing. Production AI provider is not connected.
              </InfoBanner>
            </div>
          )}
        </SectionCard>
      )}

      {/* First-time setup prompt */}
      {canManage && !setupDone && (
        <InfoBanner tone="blue">
          <Sparkles size={14} className="mr-1.5 inline" />
          Fleet Copilot is ready to set up. Enable your first automations to
          start monitoring operations.{" "}
          <button
            onClick={onOpenSetup}
            className="ml-1 font-semibold underline"
          >
            Set up Fleet Copilot
          </button>
        </InfoBanner>
      )}

      {/* Automations — capabilities of Fleet Copilot */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <AgentCard
            key={card.id}
            card={card}
            canRun={canRun}
            canManage={canManage}
            onRun={() =>
              agentStore.runAgent({
                agentId: card.id,
                trigger: "manual",
                staffId: null,
              })
            }
            onViewActivity={() => onSelectAgent(card.id)}
            onTogglePause={() =>
              agentStore.setAgentEnableState(
                card.id,
                card.status === "Active" ? "paused" : "enabled",
              )
            }
            onOpenSettings={() => onOpenSettings(card.id)}
          />
        ))}
      </div>

      {showHowItWorks && (
        <HowAgentsWorkDrawer onClose={() => setShowHowItWorks(false)} />
      )}
    </div>
  );
}

function AgentCard({
  card,
  canRun,
  canManage,
  onRun,
  onViewActivity,
  onTogglePause,
  onOpenSettings,
}: {
  card: AgentCardVm;
  canRun: boolean;
  canManage: boolean;
  onRun: () => void;
  onViewActivity: () => void;
  onTogglePause: () => void;
  onOpenSettings: () => void;
}) {
  const def = getAgentDefinition(card.id);
  const upgradeRequired = card.status === "Upgrade Required";
  return (
    <div className="card-surface card-surface-hover flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">
              {card.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {def.default_trigger}
            </p>
          </div>
        </div>
        <CustomerStatusBadge status={card.status} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {card.valueStatement}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <MiniMetric label="Mode" value={card.modeLabel} />
        <MiniMetric label="Last run" value={card.lastRunLabel} />
        <MiniMetric label="Items reviewed" value={String(card.itemsReviewed)} />
        <MiniMetric
          label="Actions prepared"
          value={String(card.actionsPrepared)}
        />
        <MiniMetric
          label="Approvals waiting"
          value={String(card.approvalsWaiting)}
          tone={card.approvalsWaiting > 0 ? "out" : "neutral"}
        />
        <MiniMetric label="Next run" value={card.nextRunLabel} />
      </div>

      {upgradeRequired ? (
        <div className="mt-4 rounded-md bg-violet-50 px-3 py-2.5 text-xs text-violet-700">
          <Sparkles size={13} className="mr-1 inline" />
          Available with Fleet Copilot.{" "}
          {canManage && (
            <button
              onClick={onOpenSettings}
              className="font-semibold underline"
            >
              Upgrade to enable
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {canRun && card.canRunNow && (
            <PrimaryButton onClick={onRun}>
              <Play size={13} /> Run now
            </PrimaryButton>
          )}
          <GhostButton onClick={onViewActivity}>
            <Activity size={13} /> View activity
          </GhostButton>
          {canManage && card.isWorking && (
            <GhostButton onClick={onTogglePause}>
              {card.status === "Active" ? (
                <>
                  <Pause size={13} /> Pause
                </>
              ) : (
                <>
                  <Play size={13} /> Enable
                </>
              )}
            </GhostButton>
          )}
          {canManage && (
            <GhostButton onClick={onOpenSettings}>
              <SettingsIcon size={13} /> Settings
            </GhostButton>
          )}
        </div>
      )}
    </div>
  );
}

function HowAgentsWorkDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-xl bg-surface shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <h2 className="font-display text-base font-semibold text-foreground">
              How Fleet Copilot Works
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </header>
        <div className="space-y-4 px-6 py-5 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Fleet Copilot</strong> is your
            single AI operations manager. It answers questions, prepares work,
            and performs permitted actions through existing authoritative
            domains. Automations are capabilities of the same assistant — not
            separate bots.
          </p>
          <div className="space-y-3">
            <ModeRow
              label="Ask"
              desc="Answer questions and explain what is happening across your fleet."
            />
            <ModeRow
              label="Prepare"
              desc="Prepares low-risk internal work (draft tasks, message drafts, classification suggestions). Nothing externally consequential occurs automatically."
            />
            <ModeRow
              label="Execute With Approval"
              desc="Prepares an actual system action, but a human must approve before execution."
            />
          </div>
          <InfoBanner>
            <ShieldAlert size={14} className="mr-1.5 inline" />
            High-risk actions (charges, refunds, waivers, deposit applications,
            partner payouts, settlement approval, compliance overrides) always
            require approval. No unrestricted autonomous execution — Copilot
            operates through an allowlist of approved internal actions.
          </InfoBanner>
        </div>
      </div>
    </div>
  );
}

function ModeRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2.5">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 text-xs">{desc}</p>
    </div>
  );
}

// Re-export Metric for backward compat with WorkspaceTabs import.
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

// Keep AGENT_LIST import used (re-exported helper for tabs).
export { AGENT_LIST, Clock };
