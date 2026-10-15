// Connect Pro Fleet — Support Ticket detail page (Build #31).
//
// Shows a tenant-scoped ticket's subject, status, type, category, description,
// diagnostics indicator, history, comments, and related entity. Tenant users
// can add replies and reopen resolved tickets. Internal-only comments and
// internal platform-support fields are never exposed.

import { useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useSupport } from "@/lib/supportStore";
import { can } from "@/lib/permissions";
import { TENANT_ID } from "@/lib/store/ids";
import {
  PageHeader as PH,
  SectionCard as SC,
  EmptyState as ES,
} from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { ArrowLeft, Send, RotateCcw } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  open: "bg-status-maintenance/10 text-status-maintenance",
  in_review: "bg-status-maintenance/10 text-status-maintenance",
  waiting_on_customer: "bg-status-maintenance/10 text-status-maintenance",
  in_progress: "bg-primary/10 text-primary",
  resolved: "bg-status-available/10 text-status-available",
  closed: "bg-muted text-muted-foreground",
};

export default function SupportTicketDetail() {
  const { id = "" } = useParams();
  const store = useStore();
  const support = useSupport();
  const [reply, setReply] = useState("");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canComment = can(roleObj, overrides, "support.comment");

  const ticket = support.getTicket(TENANT_ID, id);
  const comments = support.getComments(TENANT_ID, id);
  const history = support.getHistory(TENANT_ID, id);

  if (!ticket) {
    return (
      <div className="space-y-6">
        <Link
          to="/support"
          className="inline-flex items-center text-sm text-primary hover:text-primary-press"
        >
          <ArrowLeft size={15} className="mr-1.5" /> Back to Support
        </Link>
        <ES
          title="Request not found"
          hint="This support request may belong to another company or may have been removed."
        />
      </div>
    );
  }

  function handleReply() {
    if (!reply.trim()) return;
    support.addComment(
      TENANT_ID,
      ticket!.id,
      store.currentStaffId,
      currentStaff?.full_name ?? "Unknown",
      reply.trim(),
    );
    setReply("");
  }

  function handleReopen() {
    support.reopenTicket(
      TENANT_ID,
      ticket!.id,
      store.currentStaffId,
      currentStaff?.full_name ?? "Unknown",
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/support"
        className="inline-flex items-center text-sm text-primary hover:text-primary-press"
      >
        <ArrowLeft size={15} className="mr-1.5" /> Back to Support
      </Link>

      <PH
        title={ticket.subject}
        subtitle={`${ticket.ticket_number} · ${ticket.ticket_type.replace(/_/g, " ")}`}
        actions={
          <Badge
            className={
              STATUS_TONE[ticket.status] ?? "bg-muted text-muted-foreground"
            }
          >
            {ticket.status.replace(/_/g, " ")}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <SC title="Description">
            <p className="whitespace-pre-line text-sm text-foreground">
              {ticket.description}
            </p>
            {ticket.entity_context && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Related
                </p>
                <Link
                  to={ticket.entity_context.deep_link}
                  className="mt-1 inline-block text-sm text-primary hover:text-primary-press"
                >
                  {ticket.entity_context.human_label}
                </Link>
              </div>
            )}
            {ticket.diagnostics_snapshot_id && (
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                Diagnostics included
              </p>
            )}
          </SC>

          {/* Comments */}
          <SC title="Comments">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-md border border-border bg-surface-2 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {c.author_name}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {fmtDateTime(c.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                      {c.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {canComment && ticket.status !== "closed" && (
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Add a follow-up comment..."
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  {ticket.status === "resolved" && (
                    <Button variant="outline" onClick={handleReopen}>
                      <RotateCcw size={14} className="mr-1.5" /> Reopen
                    </Button>
                  )}
                  <Button onClick={handleReply} disabled={!reply.trim()}>
                    <Send size={14} className="mr-1.5" /> Reply
                  </Button>
                </div>
              </div>
            )}
          </SC>
        </div>

        {/* History + details */}
        <div className="space-y-6">
          <SC title="Details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-foreground">
                  {ticket.ticket_type.replace(/_/g, " ")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="text-foreground">
                  {ticket.category.replace(/_/g, " ")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Priority</dt>
                <dd className="text-foreground">{ticket.priority}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-mono text-xs text-foreground">
                  {fmtDateTime(ticket.created_at)}
                </dd>
              </div>
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Resolved</dt>
                  <dd className="font-mono text-xs text-foreground">
                    {fmtDateTime(ticket.resolved_at)}
                  </dd>
                </div>
              )}
            </dl>
          </SC>

          <SC title="History">
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-3">
                  <p className="text-sm text-foreground">{h.detail}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fmtDateTime(h.at)} · {h.actor_name}
                  </p>
                </li>
              ))}
            </ul>
          </SC>
        </div>
      </div>
    </div>
  );
}
