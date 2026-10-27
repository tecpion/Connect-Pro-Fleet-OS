// Connect Pro Fleet — Connect Pro AI Operator Automations tab (V1 simplification).
//
// Automations are organized into three management areas:
//   Operations · Payments & Finance · Partners & Investors
// Each area has a mode selector: Off · Monitor · Prepare · Auto
//
// The underlying agent registry / run engine / action execution are UNCHANGED —
// they are the permissioned tools behind the Operator.

import { useAgentStore } from "@/lib/agentStoreProvider";
import { getAgentDefinition } from "@/lib/agentRegistry";
import {
  allAgentCardVms,
  type AgentCardVm,
} from "@/lib/agentWorkspaceSelectors";
import { EmptyState } from "@/components/ui-bits";
import type { AgentId, AgentMode } from "@/lib/agentTypes";
import {
  Bot,
  Play,
  Pause,
  Activity,
  Settings as SettingsIcon,
  Sparkles,
  ShieldAlert,
  Clock,
  Eye,
  Wallet,
  Users,
} from "lucide-react";
import {
  CustomerStatusBadge,
  GhostButton,
  PrimaryButton,
  InfoBanner,
  MiniMetric,
} from "./WorkspacePrimitives";

// ---------------------------------------------------------------------------
// Management areas
// ---------------------------------------------------------------------------

type AreaMode = "off" | "monitor" | "prepare" | "auto";

interface AreaDef {
  id: string;
  label: string;
  description: string;
  agentIds: AgentId[];
  icon: typeof Eye;
  optional?: boolean;
}

const AREAS: AreaDef[] = [
  {
    id: "operations",
    label: "Operations",
    description:
      "Monitors rentals, fleet readiness, maintenance, compliance, and day-to-day operational issues.",
    agentIds: [
      "fleet_readiness",
      "rental_operations",
      "maintenance",
      "compliance",
    ],
    icon: Eye,
  },
  {
    id: "payments_finance",
    label: "Payments & Finance",
    description:
      "Monitors payments, balances, deposits, collections, and financial exceptions.",
    agentIds: ["collections", "finance_review"],
    icon: Wallet,
  },
  {
    id: "partners_investors",
    label: "Partners & Investors",
    description:
      "Prepares partner and investor reporting, settlement reviews, and payout recommendations.",
    agentIds: ["partner_settlement"],
    icon: Users,
    optional: true,
  },
];

const MODE_LABELS: Record<AreaMode, string> = {
  off: "Off",
  monitor: "Monitor",
  prepare: "Prepare",
  auto: "Auto",
};

const MODE_DESCRIPTIONS: Record<AreaMode, string> = {
  off: "AI does nothing for this area.",
  monitor: "AI watches activity and identifies issues.",
  prepare: "AI watches and prepares recommended actions for your approval.",
  auto: "AI may perform specifically authorized low-risk actions automatically.",
};

/** Derive the current area mode from agent configs. */
function deriveAreaMode(
  agentIds: AgentId[],
  configs: { agent_id: AgentId; enable_state: string; max_mode: string }[],
): AreaMode {
  const areaConfigs = configs.filter((c) => agentIds.includes(c.agent_id));
  if (areaConfigs.length === 0) return "off";
  if (areaConfigs.every((c) => c.enable_state === "disabled")) return "off";
  const modes = areaConfigs.map((c) => c.max_mode);
  if (modes.includes("execute_with_approval")) return "auto";
  if (modes.includes("prepare")) return "prepare";
  if (modes.includes("observe")) return "monitor";
  return "monitor";
}

/** Map an area mode to agent config updates. */
function modeToAgentConfigs(
  mode: AreaMode,
): { enable_state: "enabled" | "disabled"; max_mode: AgentMode } {
  switch (mode) {
    case "off":
      return { enable_state: "disabled", max_mode: "observe" };
    case "monitor":
      return { enable_state: "enabled", max_mode: "observe" };
    case "prepare":
      return { enable_state: "enabled", max_mode: "prepare" };
    case "auto":
      return { enable_state: "enabled", max_mode: "execute_with_approval" };
  }
}

/** Customer-facing copy for each internal automation. */
const AUTOMATION_COPY: Record<
  AgentId,
  { label: string; description: string }
> = {
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
        hint="Connect Pro AI Operator automations will appear here once enabled."
        icon={<Bot size={22} />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <InfoBanner tone="blue">
        <Sparkles size={14} className="mr-1.5 inline" />
        Automations are capabilities of Connect Pro AI Operator — one assistant,
        many skills. They monitor your operations and prepare work for your
        approval; high-risk actions always require you to approve before they
        run.
      </InfoBanner>

      {AREAS.map((area) => {
        const areaCards = cards.filter((c) =>
          area.agentIds.includes(c.id),
        );
        if (areaCards.length === 0) return null;

        const currentMode = deriveAreaMode(area.agentIds, agentStore.configs);
        const Icon = area.icon;

        return (
          <div key={area.id} className="space-y-4">
            <div className="card-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      {area.label}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {area.description}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <ModeSelector
                    current={currentMode}
                    onChange={(mode) => {
                      const { enable_state, max_mode } =
                        modeToAgentConfigs(mode);
                      area.agentIds.forEach((agentId) => {
                        agentStore.setAgentEnableState(agentId, enable_state);
                        agentStore.setAgentMaxMode(agentId, max_mode);
                      });
                    }}
                  />
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {MODE_DESCRIPTIONS[currentMode]}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {areaCards.map((card) => (
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
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode selector — Off · Monitor · Prepare · Auto
// ---------------------------------------------------------------------------

function ModeSelector({
  current,
  onChange,
}: {
  current: AreaMode;
  onChange: (mode: AreaMode) => void;
}) {
  const modes: AreaMode[] = ["off", "monitor", "prepare", "auto"];
  return (
    <div className="flex rounded-lg border border-border bg-surface-2/40 p-0.5">
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            current === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual automation card
// ---------------------------------------------------------------------------

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
          Available with Connect Pro AI Operator.{" "}
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