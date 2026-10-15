// Connect Pro Fleet — Fleet Copilot workspace (Build #43).
//
// Fleet Copilot is the SINGLE AI brain for the software. It replaces the
// customer-facing multi-agent "AI Workforce" experience with one assistant
// that has Chat, Voice, Automations, Approvals, Activity, and Usage.
//
// The underlying agent registry / run engine / action execution / approvals /
// usage are UNCHANGED — they are the permissioned tools behind the Copilot.
// The user never needs to know which internal capability handled a request.
//
// Tabs: Overview · Chat · Automations · Approvals · Activity · Usage
// Branding: Connect Pro Fleet OS BLUE (never green).

import { useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Bot, Sparkles } from "lucide-react";
import { OverviewTab } from "./aiworkforce/OverviewTab";
import { AutomationsTab } from "./aiworkforce/AutomationsTab";
import { ApprovalsTab } from "./aiworkforce/ApprovalsTab";
import { ActivityTab } from "./aiworkforce/ActivityTab";
import { UsageTab } from "./aiworkforce/UsageTab";
import { SetupWizard } from "./aiworkforce/SetupWizard";
import { AgentSettingsSheet } from "./aiworkforce/AgentSettingsSheet";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import type { AgentId } from "@/lib/agentTypes";

type Tab =
  "overview" | "chat" | "automations" | "approvals" | "activity" | "usage";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "automations", label: "Automations" },
  { id: "approvals", label: "Approvals" },
  { id: "activity", label: "Activity" },
  { id: "usage", label: "Usage" },
];

export default function FleetCopilot() {
  const agentStore = useAgentStore();
  const fleetStore = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [settingsAgent, setSettingsAgent] = useState<AgentId | null>(null);

  const currentStaff = fleetStore.staff.find(
    (s) => s.id === fleetStore.currentStaffId,
  );
  const roleObj = fleetStore.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canView = can(roleObj, overrides, "ai_workforce.view");
  const canManage = can(roleObj, overrides, "ai_workforce.manage");
  const canApprove = can(roleObj, overrides, "ai_workforce.approve_actions");
  const canRun = can(roleObj, overrides, "ai_workforce.run");
  const canViewUsage = can(roleObj, overrides, "ai_workforce.view_usage");

  if (!canView) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Fleet Copilot"
          subtitle="Your AI operations manager for your rental business."
        />
        <EmptyState
          title="You don't have access to Fleet Copilot"
          hint="Ask an owner or admin to grant the Fleet Copilot view permission."
          icon={<Bot size={22} />}
        />
      </div>
    );
  }

  const pending = agentStore.pendingApprovals();
  const usage = canViewUsage ? agentStore.tenantUsageSummary() : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fleet Copilot"
        subtitle="Your AI operations manager for your rental business — ask questions, prepare work, and approve actions."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${agentStore.productionProviderConnected ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {agentStore.productionProviderConnected
              ? "Production AI connected"
              : "Deterministic (dev) — production AI not connected"}
          </span>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.id;
          const badge =
            t.id === "approvals" && pending.length > 0 ? pending.length : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {badge != null && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab
          agentStore={agentStore}
          canManage={canManage}
          canRun={canRun}
          canViewUsage={canViewUsage}
          onSelectAgent={(id) => {
            setSelectedAgent(id);
            setTab("activity");
          }}
          onOpenSettings={(id) => setSettingsAgent(id)}
          onOpenSetup={() => setShowSetup(true)}
        />
      )}

      {tab === "chat" && (
        <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border">
          <CopilotPanel embedded />
        </div>
      )}

      {tab === "automations" && (
        <AutomationsTab
          agentStore={agentStore}
          canManage={canManage}
          canRun={canRun}
          onOpenSettings={(id) => setSettingsAgent(id)}
        />
      )}

      {tab === "approvals" && (
        <ApprovalsTab
          pending={pending}
          canApprove={canApprove}
          onApprove={(id) =>
            agentStore.approveAction(id, fleetStore.currentStaffId)
          }
          onReject={(id) =>
            agentStore.rejectAction(
              id,
              fleetStore.currentStaffId,
              "Rejected by reviewer",
            )
          }
          onEdit={(id, patch) =>
            agentStore.editActionPayload(id, fleetStore.currentStaffId, patch)
          }
          onBatchApprove={(ids) =>
            agentStore.batchApprove(ids, fleetStore.currentStaffId)
          }
        />
      )}

      {tab === "activity" && (
        <ActivityTab
          agentStore={agentStore}
          selectedAgent={selectedAgent}
          onSelectAgent={setSelectedAgent}
        />
      )}

      {tab === "usage" && (
        <UsageTab
          usage={usage}
          entitlement={agentStore.entitlement}
          billablePaused={agentStore.billablePaused()}
          canViewUsage={canViewUsage}
          usageRecords={agentStore.usageRecords}
          onSetCap={(cap) => agentStore.setMonthlySpendingCap(cap)}
          onSetOverage={(enabled) => agentStore.setOverageEnabled(enabled)}
        />
      )}

      {showSetup && <SetupWizard onClose={() => setShowSetup(false)} />}
      {settingsAgent && (
        <AgentSettingsSheet
          agentId={settingsAgent}
          onClose={() => setSettingsAgent(null)}
        />
      )}
    </div>
  );
}

// Keep Sparkles referenced for the header accent symmetry.
export { Sparkles };
