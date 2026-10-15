// Connect Pro Fleet — Fleet Copilot first-time setup wizard (Build #47 UX).
//
// Steps: Choose Agents → Choose Operating Modes → Choose Schedules →
// Approval Preferences → AI Usage / Spending Cap → Review. Recommends the
// three working agents (Collections, Fleet Readiness, Finance Review).
// High-risk actions remain approval-required regardless of preference.
// Stores configuration through the authoritative AgentConfig/entitlement
// hooks; creates no shadow records.

import { useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import {
  AGENT_LIST,
  WORKING_AGENTS,
  getAgentDefinition,
} from "@/lib/agentRegistry";
import {
  recommendedSetupAgents,
  validModesForAgent,
  SPENDING_CAP_PRESETS,
  type ApprovalPreference,
} from "@/lib/agentWorkspaceSelectors";
import { fmtMoney } from "@/lib/format";
import {
  Sparkles,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import type { AgentId, AgentMode } from "@/lib/agentTypes";
import {
  GhostButton,
  InfoBanner,
  MiniMetric,
  PrimaryButton,
} from "./WorkspacePrimitives";

type Step = "agents" | "modes" | "schedules" | "approvals" | "cap" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "agents", label: "Choose Agents" },
  { id: "modes", label: "Operating Modes" },
  { id: "schedules", label: "Schedules" },
  { id: "approvals", label: "Approval Preferences" },
  { id: "cap", label: "Spending Cap" },
  { id: "review", label: "Review" },
];

const MODE_LABELS: Record<AgentMode, string> = {
  observe: "Observe",
  prepare: "Prepare",
  execute_with_approval: "Prepare + Approval",
};

const APPROVAL_OPTIONS: {
  id: ApprovalPreference;
  label: string;
  desc: string;
}[] = [
  {
    id: "always_require",
    label: "Always Require Approval",
    desc: "Every prepared action waits for human approval before execution.",
  },
  {
    id: "external_only",
    label: "Require Approval for External Actions",
    desc: "Internal tasks may auto-create; external actions need approval.",
  },
  {
    id: "allow_internal_tasks",
    label: "Allow Approved Internal Task Creation",
    desc: "Low-risk internal tasks can be created automatically.",
  },
];

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const agentStore = useAgentStore();
  const [step, setStep] = useState<Step>("agents");
  const [chosen, setChosen] = useState<Set<AgentId>>(
    new Set(recommendedSetupAgents()),
  );
  const [modes, setModes] = useState<Record<string, AgentMode>>({});
  const [approval, setApproval] = useState<ApprovalPreference>("external_only");
  const [cap, setCap] = useState<number>(50);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const recommended = new Set(WORKING_AGENTS);

  const toggleAgent = (id: AgentId) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const finish = () => {
    for (const id of chosen) {
      const mode = modes[id] ?? getAgentDefinition(id).default_mode;
      agentStore.setAgentMaxMode(id, mode);
      agentStore.setAgentEnableState(id, "enabled");
      agentStore.setAutoCreateInternalTasks(
        id,
        approval === "allow_internal_tasks" || approval === "external_only",
      );
    }
    agentStore.setMonthlySpendingCap(cap);
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
            <Sparkles size={16} className="text-primary" />
            <h2 className="font-display text-base font-semibold text-foreground">
              Set Up Fleet Copilot
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </header>

        {/* Stepper */}
        <div className="flex flex-wrap gap-1 border-b border-border px-6 py-3">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                i === stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-surface-2 text-muted-foreground"
              }`}
            >
              {i + 1}. {s.label}
            </span>
          ))}
        </div>

        <div className="px-6 py-5">
          {step === "agents" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose which agents to enable. We recommend starting with the
                three working agents.
              </p>
              {AGENT_LIST.map((def) => {
                const isChosen = chosen.has(def.id);
                const isRec = recommended.has(def.id);
                return (
                  <label
                    key={def.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                      isChosen ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChosen}
                      onChange={() => toggleAgent(def.id)}
                      className="mt-0.5 h-4 w-4 rounded border-border"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {def.name}
                        </span>
                        {isRec && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Recommended
                          </span>
                        )}
                        {!def.v1_working && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Beta
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {def.goal}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {step === "modes" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose the operating mode for each enabled agent. High-risk
                actions always require approval regardless of mode.
              </p>
              {[...chosen].map((id) => {
                const def = getAgentDefinition(id);
                const valid = validModesForAgent(id);
                const current = modes[id] ?? def.default_mode;
                return (
                  <div key={id} className="rounded-md border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">
                      {def.name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {valid.map((m) => (
                        <button
                          key={m}
                          onClick={() =>
                            setModes((prev) => ({ ...prev, [id]: m }))
                          }
                          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                            current === m
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {MODE_LABELS[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {chosen.size === 0 && (
                <p className="text-sm text-muted-foreground">
                  No agents selected.
                </p>
              )}
            </div>
          )}

          {step === "schedules" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Suggested scan schedules. V1 has no production background
                scheduler — schedules are stored as configuration and runs can
                be triggered manually.
              </p>
              {[...chosen].map((id) => {
                const def = getAgentDefinition(id);
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {def.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {def.default_trigger}
                    </span>
                  </div>
                );
              })}
              <InfoBanner tone="blue">
                Production background scheduling is not connected. Stored
                configuration will drive future scheduled runs.
              </InfoBanner>
            </div>
          )}

          {step === "approvals" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Choose how prepared actions are handled. High-risk actions
                (charges, refunds, waivers, deposit applications, partner
                payouts, settlement approvals, compliance overrides) always
                require approval.
              </p>
              {APPROVAL_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                    approval === opt.id
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="approval"
                    checked={approval === opt.id}
                    onChange={() => setApproval(opt.id)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === "cap" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set a monthly AI spending cap. When the cap is reached and
                overage is disabled, billable AI pauses.
              </p>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Included Allowance
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-foreground">
                  {fmtMoney(agentStore.entitlement.included_allowance)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SPENDING_CAP_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setCap(preset)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      cap === preset
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {fmtMoney(preset)}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agentStore.entitlement.overage_enabled}
                  onChange={(e) =>
                    agentStore.setOverageEnabled(e.target.checked)
                  }
                  className="h-4 w-4 rounded border-border"
                />
                Allow usage beyond included allowance (overage)
              </label>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Review your Fleet Copilot configuration before enabling.
              </p>
              <div className="rounded-md border border-border p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Enabled Agents
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                  {[...chosen].map((id) => {
                    const def = getAgentDefinition(id);
                    const mode = modes[id] ?? def.default_mode;
                    return (
                      <li key={id} className="flex justify-between">
                        <span>{def.name}</span>
                        <span className="text-muted-foreground">
                          {MODE_LABELS[mode]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MiniMetric
                  label="Approval Preference"
                  value={
                    APPROVAL_OPTIONS.find((o) => o.id === approval)?.label ?? ""
                  }
                />
                <MiniMetric
                  label="Spending Cap"
                  value={cap > 0 ? fmtMoney(cap) : "None"}
                />
                <MiniMetric
                  label="Included Allowance"
                  value={fmtMoney(agentStore.entitlement.included_allowance)}
                />
                <MiniMetric
                  label="Overage"
                  value={
                    agentStore.entitlement.overage_enabled
                      ? "Enabled"
                      : "Disabled"
                  }
                />
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-6 py-4">
          <GhostButton
            onClick={() =>
              stepIndex === 0 ? onClose() : setStep(STEPS[stepIndex - 1].id)
            }
          >
            <ChevronLeft size={14} /> {stepIndex === 0 ? "Cancel" : "Back"}
          </GhostButton>
          {step === "review" ? (
            <PrimaryButton onClick={finish}>
              <CheckCircle2 size={14} /> Enable Fleet Copilot
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() => setStep(STEPS[stepIndex + 1].id)}
              disabled={step === "agents" && chosen.size === 0}
            >
              Next <ChevronRight size={14} />
            </PrimaryButton>
          )}
        </footer>
      </div>
    </div>
  );
}
