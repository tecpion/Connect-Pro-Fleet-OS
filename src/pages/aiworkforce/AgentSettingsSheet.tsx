// Connect Pro Fleet — Fleet Copilot automation settings sheet (Build #47 UX).
//
// Per-agent settings: Status, Operating Mode, Schedule/Trigger, Location
// Scope, Responsibilities (monitors / prepares / approval / never-do),
// Approval Requirements, Usage, Notifications. Collections/Fleet/Finance
// have agent-specific preference fields. High-risk actions remain
// approval-required regardless of settings.

import { useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import { getAgentDefinition } from "@/lib/agentRegistry";
import {
  validModesForAgent,
  agentOutcomeMetrics,
} from "@/lib/agentWorkspaceSelectors";
import { SectionCard } from "@/components/ui-bits";
import { fmtMoney } from "@/lib/format";
import { Settings as SettingsIcon, X, ShieldAlert } from "lucide-react";
import type { AgentId, AgentMode } from "@/lib/agentTypes";
import {
  GhostButton,
  InfoBanner,
  MiniMetric,
  PrimaryButton,
} from "./WorkspacePrimitives";

const MODE_LABELS: Record<AgentMode, string> = {
  observe: "Observe",
  prepare: "Prepare",
  execute_with_approval: "Prepare + Approval",
};

export function AgentSettingsSheet({
  agentId,
  onClose,
}: {
  agentId: AgentId;
  onClose: () => void;
}) {
  const agentStore = useAgentStore();
  const def = getAgentDefinition(agentId);
  const cfg = agentStore.getConfig(agentId);
  const [mode, setMode] = useState<AgentMode>(cfg.max_mode);
  const [autoTasks, setAutoTasks] = useState(cfg.auto_create_internal_tasks);
  const [locations, setLocations] = useState<string[]>(cfg.location_ids);

  const outcomes = agentOutcomeMetrics(
    agentId,
    agentStore.runs,
    agentStore.actions,
  );
  const fleetLocations = useFleetLocations();

  const save = () => {
    agentStore.setAgentMaxMode(agentId, mode);
    agentStore.setAutoCreateInternalTasks(agentId, autoTasks);
    agentStore.setAgentLocations(agentId, locations);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-surface shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-2">
            <SettingsIcon size={16} className="text-primary" />
            <h2 className="font-display text-base font-semibold text-foreground">
              {def.name} — Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 px-6 py-5">
          {/* Status + enable controls */}
          <SectionCard title="Status">
            <div className="flex flex-wrap items-center gap-2">
              {(["enabled", "paused", "disabled"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => agentStore.setAgentEnableState(agentId, s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                    cfg.enable_state === s
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "enabled" ? "Active" : s}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Operating mode */}
          <SectionCard title="Operating Mode">
            <div className="flex flex-wrap gap-1.5">
              {validModesForAgent(agentId).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={autoTasks}
                onChange={(e) => setAutoTasks(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Auto-create internal tasks (low-risk only)
            </label>
          </SectionCard>

          {/* Schedule / trigger */}
          <SectionCard title="Schedule / Trigger">
            <p className="text-sm text-muted-foreground">
              {def.default_trigger}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              V1 has no production background scheduler — runs can be triggered
              manually via Run Now.
            </p>
          </SectionCard>

          {/* Location scope */}
          <SectionCard title="Location Scope">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={locations.length === 0}
                onChange={(e) => setLocations(e.target.checked ? [] : [])}
                className="h-4 w-4 rounded border-border"
              />
              All Locations
            </label>
            {locations.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Agent monitors all locations.
              </p>
            )}
            {fleetLocations.length > 0 && (
              <div className="mt-2 space-y-1">
                {fleetLocations.map((loc) => (
                  <label
                    key={loc.id}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={locations.includes(loc.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setLocations((prev) => [...prev, loc.id]);
                        } else {
                          setLocations((prev) =>
                            prev.filter((id) => id !== loc.id),
                          );
                        }
                      }}
                      className="h-4 w-4 rounded border-border"
                    />
                    {loc.name}
                  </label>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Responsibilities transparency */}
          <SectionCard title="Responsibilities">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  This agent monitors
                </p>
                <p className="mt-0.5 text-foreground">
                  {def.data_access.join(", ")}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  This agent can prepare
                </p>
                <p className="mt-0.5 text-foreground">
                  {def.can_prepare.map((a) => a.replace(/_/g, " ")).join(", ")}
                </p>
              </div>
              {def.approval_actions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Can execute with approval
                  </p>
                  <p className="mt-0.5 text-foreground">
                    {def.approval_actions
                      .map((a) => a.replace(/_/g, " "))
                      .join(", ")}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  This agent can never do
                </p>
                <ul className="mt-0.5 space-y-0.5 text-foreground">
                  {def.cannot_perform.map((c) => (
                    <li key={c} className="flex gap-1.5">
                      <span className="text-muted-foreground">•</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SectionCard>

          {/* Outcome metrics */}
          <SectionCard title="Outcome Metrics">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MiniMetric
                label="Items Reviewed"
                value={String(outcomes.itemsReviewed)}
              />
              <MiniMetric
                label="Actions Prepared"
                value={String(outcomes.actionsPrepared)}
              />
              <MiniMetric
                label="Actions Executed"
                value={String(outcomes.actionsExecuted)}
              />
              <MiniMetric
                label="Actions Rejected"
                value={String(outcomes.actionsRejected)}
              />
              <MiniMetric
                label="Actions Failed"
                value={String(outcomes.actionsFailed)}
              />
              <MiniMetric
                label="Runs Completed"
                value={String(outcomes.runsCompleted)}
              />
            </div>
          </SectionCard>

          <InfoBanner>
            <ShieldAlert size={14} className="mr-1.5 inline" />
            High-risk actions always require human approval regardless of these
            settings. No unrestricted autonomous execution.
          </InfoBanner>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save}>
            <SettingsIcon size={14} /> Save settings
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}

/** Hook helper to read fleet locations for the location-scope picker. */
import { useStore } from "@/lib/store";
function useFleetLocations() {
  const store = useStore();
  return store.locations ?? [];
}
