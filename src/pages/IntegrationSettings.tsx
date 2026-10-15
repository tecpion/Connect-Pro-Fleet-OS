// Connect Pro Fleet — Integrations workspace (Settings Consolidation pass).
//
// Single authoritative workspace for all developer/integration tooling:
//   Connected Apps · Webhooks · API Keys · Event Log · Review Queue
//
// Settings no longer maintains separate webhook/api-key editors — they live
// here. Legacy Settings webhook/api-key routes redirect to this page's tabs.
//
// Production dependencies (honestly reported):
//   - Connected Apps: mock connection status only — no live credentials.
//   - Webhooks: endpoint configuration is stored; live delivery/retry/
//     idempotency require a production backend (reported, not faked).
//   - API Keys: secret shown ONCE at creation; masked thereafter. Revocation
//     stops authenticating once a production backend enforces it.

import { useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useIntegration } from "@/lib/integrationStore";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import {
  CONNECTION_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  SYNC_ORIGIN_LABELS,
  type IntegrationEvent,
} from "@/lib/integrationTypes";
import {
  Plug,
  PlugZap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { WebhooksTab } from "./integration/WebhooksTab";
import { TelematicsProvidersSection } from "./integration/TelematicsProvidersSection";
import { ApiKeysTab } from "./integration/ApiKeysTab";

type Tab = "overview" | "webhooks" | "apikeys" | "events" | "reviews";

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Connected Apps" },
  { id: "webhooks", label: "Webhooks" },
  { id: "apikeys", label: "API Keys" },
  { id: "events", label: "Event Log" },
  { id: "reviews", label: "Review Queue" },
];

export default function IntegrationSettings() {
  const { staff, roles, currentStaffId, customers, rentals } = useStore();
  const integ = useIntegration();
  const [searchParams] = useSearchParams();
  const initial =
    (searchParams.get("tab") as Tab | null) ||
    (searchParams.get("subsection") as Tab | null) ||
    "overview";
  const [tab, setTab] = useState<Tab>(
    TAB_LABELS.some((t) => t.id === initial) ? initial : "overview",
  );

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const role = currentStaff
    ? (roles.find((r) => r.id === currentStaff.role_id) ??
      roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const overrides = (currentStaff?.permission_overrides ?? null) as Record<
    string,
    unknown
  > | null;
  const canManage = can(role, overrides, "integrations.manage");
  const canViewEvents = can(role, overrides, "integrations.view_events");
  const canViewPayloads = can(role, overrides, "integrations.view_payloads");
  const canRetry = can(role, overrides, "integrations.retry");
  const canResolve = can(role, overrides, "integrations.resolve_reviews");

  const health = integ.syncHealth();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Connected apps, webhooks, and API keys — the single place for system connections."
      />

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <SectionCard title="Connect Pro">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  {integ.config.enabled ? (
                    <PlugZap size={20} className="text-primary" />
                  ) : (
                    <Plug size={20} className="text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {integ.config.enabled ? "Connected" : "Not connected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Status:{" "}
                    {CONNECTION_STATUS_LABELS[integ.config.connection_status]}
                    {integ.config.last_successful_sync_at && (
                      <>
                        {" · Last sync "}
                        {fmtDateTime(integ.config.last_successful_sync_at)}
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mock mode — no live credentials. Domain contract is active.
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  {integ.config.enabled ? (
                    <Button
                      variant="outline"
                      onClick={integ.disableIntegration}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      onClick={integ.enableIntegration}
                      className="bg-primary text-primary-foreground hover:bg-primary-press"
                    >
                      Enable
                    </Button>
                  )}
                  <Button variant="outline" onClick={integ.testConnection}>
                    Test connection
                  </Button>
                </div>
              )}
            </div>
          </SectionCard>

          {/* V1 Telematics Hub — mock GPS/telematics provider cards. No real
              credentials; capability surface + device counts only. */}
          <TelematicsProvidersSection />

          <SectionCard title="Sync health">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiTile label="Pending" value={health.pending} tone="neutral" />
              <KpiTile
                label="Failed"
                value={health.failed}
                tone="maintenance"
              />
              <KpiTile
                label="Dead letter"
                value={health.deadLetter}
                tone="out"
              />
              <KpiTile
                label="Open reviews"
                value={health.openReviews}
                tone="maintenance"
              />
            </div>
          </SectionCard>

          {integ.config.last_error_message && (
            <SectionCard title="Last error">
              <p className="text-sm text-status-out">
                {integ.config.last_error_message}
              </p>
            </SectionCard>
          )}
        </div>
      )}

      {tab === "webhooks" && <WebhooksTab canManage={canManage} />}
      {tab === "apikeys" && <ApiKeysTab canManage={canManage} />}

      {tab === "events" && (
        <div className="space-y-3">
          {!canViewEvents ? (
            <EmptyState
              title="No access"
              hint="You don't have permission to view the event log."
              icon={<AlertTriangle size={28} />}
            />
          ) : integ.events.length === 0 ? (
            <EmptyState
              title="No sync events"
              hint="Events appear here when Fleet emits or receives sync data."
              icon={<Inbox size={28} />}
            />
          ) : (
            integ.events
              .slice(0, 100)
              .map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  canViewPayloads={canViewPayloads}
                  canRetry={canRetry}
                  onRetry={() => integ.retryEvent(e.id)}
                />
              ))
          )}
        </div>
      )}

      {tab === "reviews" && (
        <div className="space-y-3">
          {integ.openReviews().length === 0 ? (
            <EmptyState
              title="No items need review"
              hint="Unmatched or conflicting inbound payments appear here."
              icon={<CheckCircle2 size={28} />}
            />
          ) : (
            integ.openReviews().map((r) => {
              const event = integ.events.find((e) => e.id === r.event_id);
              const amount =
                event?.payload.kind === "inbound_payment"
                  ? event.payload.amount
                  : null;
              const candidates = r.candidate_entity_ids?.rental ?? [];
              return (
                <SectionCard key={r.id} title={r.reason}>
                  <div className="space-y-2 text-sm">
                    {amount != null && (
                      <p className="font-mono text-base text-foreground">
                        ${amount.toFixed(2)}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      Type: {r.review_type} · Severity: {r.severity}
                    </p>
                    {candidates.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-foreground">
                          Candidate rentals:
                        </p>
                        {candidates.map((rid) => {
                          const rental = rentals.find((x) => x.id === rid);
                          const cust = rental
                            ? customers.find((c) => c.id === rental.customer_id)
                            : null;
                          return (
                            <div
                              key={rid}
                              className="flex items-center justify-between rounded bg-surface-2 px-2 py-1"
                            >
                              <span className="text-xs text-foreground">
                                {rental?.agreement_number ?? rid}
                                {cust
                                  ? ` · ${cust.first_name} ${cust.last_name}`
                                  : ""}
                              </span>
                              {canResolve && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    integ.resolveReview(r.id, "matched", {
                                      rentalId: rid,
                                    })
                                  }
                                >
                                  Match
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {canResolve && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            integ.ignoreReview(r.id, "Ignored by reviewer")
                          }
                        >
                          Ignore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            integ.resolveReview(r.id, "duplicate", {})
                          }
                        >
                          Mark duplicate
                        </Button>
                      </div>
                    )}
                  </div>
                </SectionCard>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "maintenance" | "out" | "available";
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl font-semibold tabular text-foreground">
        {value}
      </p>
      <div className="mt-1">
        <StatusPill tone={tone}>
          {tone === "available"
            ? "ok"
            : tone === "maintenance"
              ? "attention"
              : tone === "out"
                ? "error"
                : "—"}
        </StatusPill>
      </div>
    </div>
  );
}

function EventRow({
  event,
  canViewPayloads,
  canRetry,
  onRetry,
}: {
  event: IntegrationEvent;
  canViewPayloads: boolean;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {event.direction === "outbound" ? "↑" : "↓"}
            </span>
            <span className="text-sm font-medium text-foreground">
              {event.event_type}
            </span>
          </div>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {fmtDateTime(event.created_at)} ·{" "}
            {SYNC_ORIGIN_LABELS[event.origin_system]}
            {event.entity_id ? ` · ${event.entity_id}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill
            tone={
              event.status === "succeeded"
                ? "available"
                : event.status === "failed" || event.status === "dead_letter"
                  ? "out"
                  : event.status === "ignored"
                    ? "neutral"
                    : "maintenance"
            }
          >
            {EVENT_STATUS_LABELS[event.status]}
          </StatusPill>
          {event.status === "failed" && canRetry && (
            <Button size="sm" variant="ghost" onClick={onRetry}>
              <RefreshCw size={13} />
            </Button>
          )}
        </div>
      </div>
      {event.error_message && (
        <p className="mt-1 text-xs text-status-out">{event.error_message}</p>
      )}
      {canViewPayloads && (
        <button
          className="mt-1 text-xs text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide" : "Show"} payload
        </button>
      )}
      {expanded && canViewPayloads && (
        <pre className="mt-1 overflow-x-auto rounded bg-surface-2 px-2 py-2 text-xs text-muted-foreground">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
