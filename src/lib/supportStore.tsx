// Connect Pro Fleet — Support Center store context (Build #31).
//
// Standalone React context for support tickets, comments, and history.
// Mirrors the CustomerNotesProvider pattern: context + provider + hook, with
// seed data loaded once. Tenant-scoped — a tenant user never sees another
// tenant's tickets or internal-only comments. Internal platform-support
// fields are modeled but never exposed to tenant UI.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TENANT_ID, uid } from "./store/ids";
import type {
  SupportTicket,
  SupportComment,
  TicketHistoryEvent,
  SupportTicketStatus,
  SupportTicketType,
  SupportCategory,
  SupportPriority,
  BugSeverity,
  TicketEntityContext,
  SupportCommentAuthorType,
  ReportProblemInput,
} from "./supportTypes";
import type { DiagnosticsSnapshot } from "./supportTypes";

let ticketSeq = 100;

function nextTicketNumber(): string {
  ticketSeq += 1;
  return `TCK-${ticketSeq}`;
}

function seedTickets(): SupportTicket[] {
  const now = "2026-08-25T10:00:00Z";
  return [
    {
      id: "tck_seed_1",
      tenant_id: TENANT_ID,
      ticket_number: "TCK-101",
      requester_user_id: "stf_1",
      requester_name: "Alex Morgan",
      requester_email: "alex@connectprofleet.example",
      ticket_type: "question",
      category: "billing",
      priority: "normal",
      status: "resolved",
      subject: "How do weekly billing periods calculate period days?",
      description:
        "I want to understand how the period days are counted for a weekly billing period that starts mid-week.",
      product_area: "billing",
      entity_context: null,
      route_context: "/payments-due",
      diagnostics_snapshot_id: null,
      bug_severity: null,
      reproducible: null,
      repro_steps: null,
      screenshot_ref: null,
      contact_preference: null,
      assigned_platform_agent_id: null,
      internal_priority: null,
      internal_notes: null,
      linked_incident_id: null,
      linked_bug_id: null,
      resolution_code: "answered",
      created_at: "2026-08-20T09:00:00Z",
      updated_at: now,
      resolved_at: now,
      closed_at: null,
      last_activity_at: now,
      source: "in_app",
      tags: ["billing", "periods"],
    },
  ];
}

function seedComments(): SupportComment[] {
  return [
    {
      id: "tckc_seed_1",
      ticket_id: "tck_seed_1",
      tenant_id: TENANT_ID,
      author_type: "tenant_user",
      author_id: "stf_1",
      author_name: "Alex Morgan",
      body: "Following up — the explanation in the help article cleared it up. Thanks!",
      created_at: "2026-08-25T10:00:00Z",
      internal_only: false,
      attachment_refs: [],
    },
  ];
}

function seedHistory(): TicketHistoryEvent[] {
  return [
    {
      id: "tckh_seed_1",
      ticket_id: "tck_seed_1",
      tenant_id: TENANT_ID,
      event_type: "created",
      detail: "Ticket created",
      actor_id: "stf_1",
      actor_name: "Alex Morgan",
      at: "2026-08-20T09:00:00Z",
    },
    {
      id: "tckh_seed_2",
      ticket_id: "tck_seed_1",
      tenant_id: TENANT_ID,
      event_type: "resolved",
      detail: "Marked resolved",
      actor_id: "stf_1",
      actor_name: "Alex Morgan",
      at: "2026-08-25T10:00:00Z",
    },
  ];
}

export interface CreateTicketInput {
  requester_user_id: string;
  requester_name: string;
  requester_email?: string | null;
  ticket_type: SupportTicketType;
  category: SupportCategory;
  priority: SupportPriority;
  subject: string;
  description: string;
  product_area: string;
  entity_context?: TicketEntityContext | null;
  route_context?: string | null;
  diagnostics_snapshot_id?: string | null;
  bug_severity?: BugSeverity | null;
  reproducible?: boolean | null;
  repro_steps?: string | null;
  screenshot_ref?: string | null;
  contact_preference?: string | null;
  tags?: string[];
}

export interface SupportStore {
  tickets: SupportTicket[];
  comments: SupportComment[];
  history: TicketHistoryEvent[];
  diagnostics: DiagnosticsSnapshot[];
  // Tenant-scoped ticket access.
  getTicketsForTenant: (tenantId: string) => SupportTicket[];
  getTicket: (tenantId: string, ticketId: string) => SupportTicket | undefined;
  getComments: (tenantId: string, ticketId: string) => SupportComment[];
  getHistory: (tenantId: string, ticketId: string) => TicketHistoryEvent[];
  // Mutations.
  createTicket: (tenantId: string, input: CreateTicketInput) => SupportTicket;
  createTicketFromReport: (
    tenantId: string,
    userId: string,
    userName: string,
    report: ReportProblemInput,
    diagnosticsId: string | null,
  ) => SupportTicket;
  addComment: (
    tenantId: string,
    ticketId: string,
    authorId: string,
    authorName: string,
    body: string,
    attachmentRefs?: string[],
  ) => SupportComment;
  changeStatus: (
    tenantId: string,
    ticketId: string,
    status: SupportTicketStatus,
    actorId: string,
    actorName: string,
  ) => void;
  reopenTicket: (
    tenantId: string,
    ticketId: string,
    actorId: string,
    actorName: string,
  ) => void;
  storeDiagnostics: (snapshot: DiagnosticsSnapshot) => void;
  getDiagnostics: (id: string) => DiagnosticsSnapshot | undefined;
}

const SupportContext = createContext<SupportStore | null>(null);

export function SupportProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<SupportTicket[]>(() => seedTickets());
  const [comments, setComments] = useState<SupportComment[]>(() =>
    seedComments(),
  );
  const [history, setHistory] = useState<TicketHistoryEvent[]>(() =>
    seedHistory(),
  );
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot[]>([]);

  const getTicketsForTenant = useCallback(
    (tenantId: string) =>
      tickets
        .filter((t) => t.tenant_id === tenantId)
        .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at)),
    [tickets],
  );

  const getTicket = useCallback(
    (tenantId: string, ticketId: string) =>
      tickets.find((t) => t.tenant_id === tenantId && t.id === ticketId),
    [tickets],
  );

  const getComments = useCallback(
    (tenantId: string, ticketId: string) =>
      comments
        .filter(
          (c) =>
            c.tenant_id === tenantId &&
            c.ticket_id === ticketId &&
            // Tenant users never see internal-only comments.
            !c.internal_only,
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [comments],
  );

  const getHistory = useCallback(
    (tenantId: string, ticketId: string) =>
      history
        .filter((h) => h.tenant_id === tenantId && h.ticket_id === ticketId)
        .sort((a, b) => a.at.localeCompare(b.at)),
    [history],
  );

  const pushHistory = useCallback(
    (
      tenantId: string,
      ticketId: string,
      eventType: TicketHistoryEvent["event_type"],
      detail: string,
      actorId: string,
      actorName: string,
      at: string,
    ) => {
      setHistory((prev) => [
        ...prev,
        {
          id: uid("tckh"),
          tenant_id: tenantId,
          ticket_id: ticketId,
          event_type: eventType,
          detail,
          actor_id: actorId,
          actor_name: actorName,
          at,
        },
      ]);
    },
    [],
  );

  const createTicket = useCallback(
    (tenantId: string, input: CreateTicketInput): SupportTicket => {
      const now = new Date().toISOString();
      const ticket: SupportTicket = {
        id: uid("tck"),
        tenant_id: tenantId,
        ticket_number: nextTicketNumber(),
        requester_user_id: input.requester_user_id,
        requester_name: input.requester_name,
        requester_email: input.requester_email ?? null,
        ticket_type: input.ticket_type,
        category: input.category,
        priority: input.priority,
        status: "open",
        subject: input.subject,
        description: input.description,
        product_area: input.product_area,
        entity_context: input.entity_context ?? null,
        route_context: input.route_context ?? null,
        diagnostics_snapshot_id: input.diagnostics_snapshot_id ?? null,
        bug_severity: input.bug_severity ?? null,
        reproducible: input.reproducible ?? null,
        repro_steps: input.repro_steps ?? null,
        screenshot_ref: input.screenshot_ref ?? null,
        contact_preference: input.contact_preference ?? null,
        assigned_platform_agent_id: null,
        internal_priority: null,
        internal_notes: null,
        linked_incident_id: null,
        linked_bug_id: null,
        resolution_code: null,
        created_at: now,
        updated_at: now,
        resolved_at: null,
        closed_at: null,
        last_activity_at: now,
        source: "in_app",
        tags: input.tags ?? [],
      };
      setTickets((prev) => [ticket, ...prev]);
      pushHistory(
        tenantId,
        ticket.id,
        "created",
        "Ticket created",
        input.requester_user_id,
        input.requester_name,
        now,
      );
      return ticket;
    },
    [pushHistory],
  );

  const createTicketFromReport = useCallback(
    (
      tenantId: string,
      userId: string,
      userName: string,
      report: ReportProblemInput,
      diagnosticsId: string | null,
    ): SupportTicket => {
      const description = [
        report.what_happened && `What happened: ${report.what_happened}`,
        report.what_trying_to_do &&
          `What I was trying to do: ${report.what_trying_to_do}`,
        report.description && report.description,
        report.repro_steps && `Steps to reproduce: ${report.repro_steps}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return createTicket(tenantId, {
        requester_user_id: userId,
        requester_name: userName,
        ticket_type: report.ticket_type,
        category: report.category,
        priority: report.priority,
        subject: report.subject,
        description: description || report.description,
        product_area: report.product_area,
        entity_context: report.entity_context,
        route_context: report.route_context,
        diagnostics_snapshot_id: diagnosticsId,
        bug_severity: report.bug_severity,
        reproducible: report.reproducible,
        repro_steps: report.repro_steps,
        screenshot_ref: report.screenshot_ref,
        contact_preference: report.contact_preference,
      });
    },
    [createTicket],
  );

  const addComment = useCallback(
    (
      tenantId: string,
      ticketId: string,
      authorId: string,
      authorName: string,
      body: string,
      attachmentRefs: string[] = [],
    ): SupportComment => {
      const now = new Date().toISOString();
      const comment: SupportComment = {
        id: uid("tckc"),
        ticket_id: ticketId,
        tenant_id: tenantId,
        author_type: "tenant_user" as SupportCommentAuthorType,
        author_id: authorId,
        author_name: authorName,
        body,
        created_at: now,
        internal_only: false,
        attachment_refs: attachmentRefs,
      };
      setComments((prev) => [...prev, comment]);
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? { ...t, updated_at: now, last_activity_at: now }
            : t,
        ),
      );
      pushHistory(
        tenantId,
        ticketId,
        attachmentRefs.length > 0 ? "attachment_added" : "comment_added",
        attachmentRefs.length > 0
          ? "Comment with attachment added"
          : "Comment added",
        authorId,
        authorName,
        now,
      );
      return comment;
    },
    [pushHistory],
  );

  const changeStatus = useCallback(
    (
      tenantId: string,
      ticketId: string,
      status: SupportTicketStatus,
      actorId: string,
      actorName: string,
    ) => {
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          const resolved =
            status === "resolved"
              ? now
              : status === "closed"
                ? t.resolved_at
                : t.resolved_at;
          const closed = status === "closed" ? now : t.closed_at;
          return {
            ...t,
            status,
            updated_at: now,
            resolved_at: resolved,
            closed_at: closed,
            last_activity_at: now,
          };
        }),
      );
      pushHistory(
        tenantId,
        ticketId,
        "status_changed",
        `Status changed to ${status}`,
        actorId,
        actorName,
        now,
      );
      if (status === "resolved") {
        pushHistory(
          tenantId,
          ticketId,
          "resolved",
          "Marked resolved",
          actorId,
          actorName,
          now,
        );
      }
    },
    [pushHistory],
  );

  const reopenTicket = useCallback(
    (
      tenantId: string,
      ticketId: string,
      actorId: string,
      actorName: string,
    ) => {
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId
            ? {
                ...t,
                status: "open",
                updated_at: now,
                resolved_at: null,
                closed_at: null,
                last_activity_at: now,
              }
            : t,
        ),
      );
      pushHistory(
        tenantId,
        ticketId,
        "reopened",
        "Ticket reopened",
        actorId,
        actorName,
        now,
      );
    },
    [pushHistory],
  );

  const storeDiagnostics = useCallback((snapshot: DiagnosticsSnapshot) => {
    setDiagnostics((prev) => [...prev, snapshot]);
  }, []);

  const getDiagnostics = useCallback(
    (id: string) => diagnostics.find((d) => d.id === id),
    [diagnostics],
  );

  const value = useMemo<SupportStore>(
    () => ({
      tickets,
      comments,
      history,
      diagnostics,
      getTicketsForTenant,
      getTicket,
      getComments,
      getHistory,
      createTicket,
      createTicketFromReport,
      addComment,
      changeStatus,
      reopenTicket,
      storeDiagnostics,
      getDiagnostics,
    }),
    [
      tickets,
      comments,
      history,
      diagnostics,
      getTicketsForTenant,
      getTicket,
      getComments,
      getHistory,
      createTicket,
      createTicketFromReport,
      addComment,
      changeStatus,
      reopenTicket,
      storeDiagnostics,
      getDiagnostics,
    ],
  );

  return (
    <SupportContext.Provider value={value}>{children}</SupportContext.Provider>
  );
}

export function useSupport(): SupportStore {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error("useSupport must be used within SupportProvider");
  return ctx;
}
