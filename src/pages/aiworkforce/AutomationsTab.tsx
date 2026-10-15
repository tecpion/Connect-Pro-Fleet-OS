// Connect Pro Fleet — Fleet Copilot Automations tab (Build #43).
//
// Replaces the old "AI Workforce agent cards" with Fleet Copilot Automations.
// The underlying agent registry / run engine / action execution are UNCHANGED —
// they are the permissioned tools behind the Copilot. Here we present them as
// Automations owned by ONE Fleet Copilot, not seven separate AI personalities.
//
// Each Automation is a named, schedulable capability of Fleet Copilot:
//   - Follow up on overdue balances (collections)
//   - Review blocked vehicles every morning (fleet_readiness)
//   - Watch for expiring compliance (compliance)
//   - Prepare maintenance reminders (maintenance)
//   - Prepare weekly owner summary (finance_review)
//   - Prepare partner settlement review (partner_settlement)
//   - Review overdue returns (rental_operations)
//   - Flag long-idle vehicles (fleet_readiness)
//
// The user never needs to know which internal capability handled the request.

import { useAgentStore } from "@/lib/agentStoreProvider";
import { getAgentDefinition } from "@/lib/agentRegistry";
import {
  allAgentCardVms,
  type AgentCardVm,
} from "@/lib/agentWorkspaceSelectors";
import { EmptyState } from "@/components/ui-bits";
import {
  Bot,
  Play,
  Pause,
  Activity,
  Settings as SettingsIcon,
  Sparkles,
  ShieldAlert,
  Clock,
} from "lucide-react";
import type { AgentId } from "@/lib/agentTypes";
import {
  CustomerStatusBadge,
  GhostButton,
  PrimaryButton,
  InfoBanner,
  MiniMetric,
} from "./WorkspacePrimitives";

/** Customer-facing Automation label + one-line description for each internal
 *  capability. The internal agent id is never shown to the user. */
const AUTOMATION_COPY: Record<AgentId, { label: string; description: string }> =
  {
    collections: {
      label: "Follow up on overdue balances",
      description:
        "Watches overdue balances and broken payment arrangements, and prepares reminder drafts and follow-up tasks for your approval.",
    },
    fleet_readiness: {
      label: "Review blocked vehicles every morning",
      description:
        "Flags blocked and long-idle vehicles each morning so nothing slips through before pickups.",
    },
    rental_operations: {
      label: "Review overdue returns",
      description:
        "Watches overdue returns, upcoming pickups, and incomplete inspections, and prepares operational tasks.",
    },
    maintenance: {
      label: "Prepare maintenance reminders",
      description:
        "Tracks overdue and upcoming maintenance and prepares service follow-ups for blocked vehicles.",
    },
    finance_review: {
      label: "Prepare weekly owner summary",
      description:
        "Keeps operational finances review-ready: unallocated expenses, unmatched bank items, and month-end checklist.",
    },
    compliance: {
      label: "Watch for expiring compliance",
      description:
        "Monitors registration, insurance, and document expirations and prepares renewal tasks before they block rentals.",
    },
    partner_settlement: {
      label: "Prepare partner settlement review",
      description:
        "Prepares projected partner/JV settlements and statement drafts for your review and approval.",
    },
  };

export function AutomationsTab({
  agentStore,
  canManage,
  canRun,
  onOpenSettings,
}: {
  agentStore: ReturnType<typeof useAgentStore>;
  canManage: boolean;
  canRun: boolean;
  onOpenSettings: (id: AgentId) => void;
}) {
  const cards = allAgentCardVms(
    agentStore.configs,
    agentStore.entitlement,
    agentStore.runs,
    agentStore.actions,
    agentStore.usageRecords,
    canManage,
  );

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No automations yet"
        hint="Fleet Copilot automations will appear here once enabled."
        icon={<Bot size={22} />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <InfoBanner tone="blue">
        <Sparkles size={14} className="mr-1.5 inline" />
        Automations are capabilities of Fleet Copilot — one assistant, many
        skills. They monitor your operations and prepare work for your approval;
        high-risk actions always require you to approve before they run.
      </InfoBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <AutomationCard
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
    </div>
  );
}

function AutomationCard({
  card,
  canRun,
  canManage,
  onRun,
  onTogglePause,
  onOpenSettings,
}: {
  card: AgentCardVm;
  canRun: boolean;
  canManage: boolean;
  onRun: () => void;
  onTogglePause: () => void;
  onOpenSettings: () => void;
}) {
  const def = getAgentDefinition(card.id);
  const copy = AUTOMATION_COPY[card.id];
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
              {copy?.label ?? card.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              <Clock size={11} className="mr-1 inline" />
              {def.default_trigger}
            </p>
          </div>
        </div>
        <CustomerStatusBadge status={card.status} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {copy?.description ?? card.valueStatement}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
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

// Keep the Activity icon import referenced for symmetry with other tabs.
export { Activity, ShieldAlert };
