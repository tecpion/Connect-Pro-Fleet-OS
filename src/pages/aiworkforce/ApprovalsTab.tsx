// Connect Pro Fleet — Connect Pro AI Operator Approvals inbox (V1 simplification).
//
// One centralized approval inbox for Connect Pro AI Operator. Each card shows
// what the Operator wants to do, the affected record, why (source-backed
// reasons), impact, source records, and requested time. Actions: Approve &
// Execute, Edit (message drafts only), Reject. Batch approval is offered ONLY
// for low-risk actions — high-risk actions always require individual approval.

import { useState } from "react";
import { actionRequiresApproval } from "@/lib/agentTypes";
import { getAgentDefinition } from "@/lib/agentRegistry";
import { EmptyState } from "@/components/ui-bits";
import { fmtDateTime } from "@/lib/format";
import {
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Pencil,
  ExternalLink,
} from "lucide-react";
import type { AgentAction } from "@/lib/agentTypes";
import { GhostButton, PrimaryButton } from "./WorkspacePrimitives";

export function ApprovalsTab({
  pending,
  canApprove,
  onApprove,
  onReject,
  onEdit,
  onBatchApprove,
}: {
  pending: AgentAction[];
  canApprove: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, patch: Record<string, unknown>) => void;
  onBatchApprove: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  if (pending.length === 0) {
    return (
      <EmptyState
        title="No approvals waiting"
        hint="AI Operator actions requiring human approval will appear here."
        icon={<CheckCircle2 size={22} />}
        tone="teal"
      />
    );
  }

  const lowRisk = pending.filter((a) => !actionRequiresApproval(a.action_type));
  const selectedLowRisk = lowRisk.filter((a) => selected.has(a.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {lowRisk.length > 0 && canApprove && (
        <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {selectedLowRisk.length}
            </span>{" "}
            of {lowRisk.length} low-risk actions selected. High-risk actions
            cannot be batch-approved.
          </p>
          <PrimaryButton
            disabled={selectedLowRisk.length === 0}
            onClick={() => {
              onBatchApprove(selectedLowRisk.map((a) => a.id));
              setSelected(new Set());
            }}
          >
            <CheckCircle2 size={14} /> Batch approve ({selectedLowRisk.length})
          </PrimaryButton>
        </div>
      )}

      {pending.map((a) => {
        const def = getAgentDefinition(a.agent_id);
        const highRisk = actionRequiresApproval(a.action_type);
        const isEditing = editingId === a.id;
        return (
          <div key={a.id} className="card-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {!highRisk && canApprove && (
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="h-4 w-4 rounded border-border"
                      aria-label="Select for batch approval"
                    />
                  )}
                  <span className="font-display text-sm font-semibold text-foreground">
                    Connect Pro AI Operator
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {def.name}
                  </span>
                  {highRisk ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <ShieldAlert size={11} /> High-risk
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Low-risk
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">
                  {a.proposed_action}
                </p>
                <p className="text-sm text-muted-foreground">
                  Target: {a.target_label}
                  {a.impact && (
                    <span className="ml-2 font-medium text-foreground">
                      {a.impact}
                    </span>
                  )}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {fmtDateTime(a.created_at)}
              </span>
            </div>

            <div className="mt-3 rounded-md bg-surface-2 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why this action was suggested
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-foreground">
                {a.reasons.map((r, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-muted-foreground">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Source records:</span>
              <span className="rounded-md border border-border px-2 py-0.5 font-medium capitalize text-foreground">
                {a.target_type.replace(/_/g, " ")}
              </span>
              {a.deep_link && (
                <a
                  href={a.deep_link}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  View record <ExternalLink size={11} />
                </a>
              )}
            </div>

            {isEditing && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  rows={3}
                />
                <div className="flex gap-2">
                  <PrimaryButton
                    onClick={() => {
                      onEdit(a.id, { body: editBody });
                      setEditingId(null);
                    }}
                  >
                    <CheckCircle2 size={13} /> Save edit
                  </PrimaryButton>
                  <GhostButton onClick={() => setEditingId(null)}>
                    Cancel
                  </GhostButton>
                </div>
              </div>
            )}

            {canApprove && !isEditing && (
              <div className="mt-4 flex flex-wrap gap-2">
                <PrimaryButton onClick={() => onApprove(a.id)}>
                  <CheckCircle2 size={14} /> Approve & Execute
                </PrimaryButton>
                {a.action_type === "prepare_message" && (
                  <GhostButton
                    onClick={() => {
                      setEditingId(a.id);
                      setEditBody(
                        (a.payload.body as string) ??
                          (a.payload.subject as string) ??
                          "",
                      );
                    }}
                  >
                    <Pencil size={13} /> Edit message
                  </GhostButton>
                )}
                <GhostButton onClick={() => onReject(a.id)}>
                  <XCircle size={13} /> Reject
                </GhostButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}