// Connect Pro Fleet — Fleet Copilot Activity tab (Build #43 / #47 UX polish).
//
// One Fleet Copilot activity history. Action-level activity rows (not just
// runs) with status filters: Reviewed / Suggested / Prepared / Awaiting
// Approval / Executed / Rejected / Failed. Each row shows the automation,
// action, entity, time, status, human approver (if applicable), and result.
// Click opens the related record. A run-history section is shown below. No
// opaque AI score.

import { useMemo, useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import { AGENT_LIST, getAgentDefinition } from "@/lib/agentRegistry";
import {
  activityRows,
  type ActivityStatusFilter,
} from "@/lib/agentWorkspaceSelectors";
import { EmptyState, SectionCard } from "@/components/ui-bits";
import { fmtDateTime } from "@/lib/format";
import { Metric } from "./OverviewTab";
import { Activity, Clock, ExternalLink } from "lucide-react";
import type { AgentId } from "@/lib/agentTypes";

const STATUS_FILTERS: { id: ActivityStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reviewed", label: "Reviewed" },
  { id: "prepared", label: "Prepared" },
  { id: "awaiting_approval", label: "Awaiting Approval" },
  { id: "executed", label: "Executed" },
  { id: "rejected", label: "Rejected" },
  { id: "failed", label: "Failed" },
];

export function ActivityTab({
  agentStore,
  selectedAgent,
  onSelectAgent,
}: {
  agentStore: ReturnType<typeof useAgentStore>;
  selectedAgent: AgentId | null;
  onSelectAgent: (id: AgentId | null) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<ActivityStatusFilter>("all");

  const rows = useMemo(
    () => activityRows(agentStore.actions, selectedAgent, statusFilter),
    [agentStore.actions, selectedAgent, statusFilter],
  );

  if (agentStore.runs.length === 0 && rows.length === 0) {
    return (
      <EmptyState
        title="No Copilot activity yet"
        hint="Enable an automation and run it manually to see activity here."
        icon={<Activity size={22} />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={!selectedAgent}
          onClick={() => onSelectAgent(null)}
          label="All automations"
        />
        {AGENT_LIST.map((def) => (
          <FilterChip
            key={def.id}
            active={selectedAgent === def.id}
            onClick={() => onSelectAgent(def.id)}
            label={def.name}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            active={statusFilter === f.id}
            onClick={() => setStatusFilter(f.id)}
            label={f.label}
          />
        ))}
      </div>

      {rows.length > 0 && (
        <SectionCard title="Copilot actions" icon={<Activity size={16} />}>
          <div className="divide-y divide-border">
            {rows.map((row) => {
              const a = row.action;
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-6 py-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {row.agentName}
                      </span>
                      <ActionStatusBadge status={a.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {a.proposed_action} — {a.target_label}
                    </p>
                    {a.approved_by && (
                      <p className="text-xs text-muted-foreground">
                        Approved by: {a.approved_by}
                      </p>
                    )}
                    {a.result && (
                      <p className="text-xs text-muted-foreground">
                        Result: {a.result}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(a.created_at)}
                    </span>
                    {a.deep_link && (
                      <a
                        href={a.deep_link}
                        className="text-primary hover:underline"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Run history" icon={<Clock size={16} />}>
        <div className="divide-y divide-border">
          {(selectedAgent
            ? agentStore.runs.filter((r) => r.agent_id === selectedAgent)
            : agentStore.runs
          ).map((r) => {
            const def = getAgentDefinition(r.agent_id);
            return (
              <div
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 px-6 py-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-semibold text-foreground">
                      {def.name}
                    </span>
                    <RunStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">{r.summary}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <Metric label="Trigger" value={r.trigger} />
                    <Metric
                      label="Items Reviewed"
                      value={String(r.items_reviewed)}
                    />
                    <Metric
                      label="Actions Prepared"
                      value={String(r.prepared_actions)}
                    />
                    <Metric
                      label="Approvals"
                      value={String(r.approvals_requested)}
                      tone={r.approvals_requested > 0 ? "out" : "neutral"}
                    />
                  </div>
                  {r.error && (
                    <p className="mt-2 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
                      {r.error}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {fmtDateTime(r.completed_at ?? r.started_at)}
                </span>
              </div>
            );
          })}
          {agentStore.runs.length === 0 && (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No runs yet.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ActionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    executed: "bg-emerald-100 text-emerald-700",
    approved: "bg-emerald-100 text-emerald-700",
    awaiting_approval: "bg-amber-100 text-amber-700",
    rejected: "bg-red-100 text-red-700",
    failed: "bg-red-100 text-red-700",
    drafted: "bg-blue-100 text-blue-700",
    suggested: "bg-surface-2 text-muted-foreground",
    cancelled: "bg-surface-2 text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-surface-2 text-muted-foreground"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    needs_approval: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    partially_completed: "bg-amber-100 text-amber-700",
    cancelled: "bg-surface-2 text-muted-foreground",
    running: "bg-blue-100 text-blue-700",
    queued: "bg-surface-2 text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-surface-2 text-muted-foreground"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
