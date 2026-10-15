// Connect Pro Fleet — System Status page (Build #31).
//
// Shows overall state, component statuses, active incidents, scheduled
// maintenance, and recent resolved incidents. In development mode, Unknown
// status stays Unknown — it is never coerced to Operational. The banner only
// appears for actual Major/Critical incident records.

import { Link } from "@/lib/router-compat";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import {
  buildSystemHealthSnapshot,
  statusLabel,
  shouldShowIncidentBanner,
} from "@/lib/supportSystemHealth";
import { fmtDateTime } from "@/lib/format";
import { AlertTriangle, Wrench, CheckCircle2 } from "lucide-react";

const STATUS_DOT: Record<string, string> = {
  operational: "bg-status-available",
  degraded: "bg-status-maintenance",
  partial_outage: "bg-status-maintenance",
  major_outage: "bg-status-out",
  maintenance: "bg-status-maintenance",
  unknown: "bg-muted-foreground",
};

export default function SupportStatus() {
  const health = buildSystemHealthSnapshot();
  const showBanner = shouldShowIncidentBanner([...health.active_incidents]);

  return (
    <div className="space-y-6">
      {showBanner && (
        <div className="flex items-center gap-2 rounded-lg border border-status-out/40 bg-status-out/10 px-4 py-3">
          <AlertTriangle size={18} className="text-status-out" />
          <p className="text-sm font-medium text-foreground">
            There is an active service incident. See below for details.
          </p>
        </div>
      )}

      <PageHeader
        title="System status"
        subtitle="Connect Pro Fleet service conditions and incidents."
      />

      {/* Overall */}
      <SectionCard>
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${STATUS_DOT[health.overall] ?? "bg-muted-foreground"}`}
          />
          <div>
            <p className="font-display text-lg font-semibold text-foreground">
              {statusLabel(health.overall)}
            </p>
            <p className="text-xs text-muted-foreground">
              {health.monitoring_configured
                ? "Live monitoring is active."
                : "Live system monitoring is not configured in this environment. Unknown statuses are not assumed operational."}
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Components */}
      <SectionCard title="Components">
        <ul className="divide-y divide-border">
          {health.components.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[c.status] ?? "bg-muted-foreground"}`}
                />
                <span className="text-sm text-foreground">{c.label}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-foreground">
                  {statusLabel(c.status)}
                </span>
                {c.status === "unknown" && (
                  <p className="text-xs text-muted-foreground">
                    Not measurable in development mode
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Active incidents */}
      <SectionCard title="Active incidents">
        {health.active_incidents.length === 0 ? (
          <EmptyState
            title="No active incidents"
            icon={<CheckCircle2 size={20} className="text-status-available" />}
          />
        ) : (
          <ul className="space-y-3">
            {health.active_incidents.map((inc) => (
              <li
                key={inc.id}
                className="rounded-md border border-border bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {inc.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {inc.summary}
                    </p>
                  </div>
                  <Badge
                    variant={
                      inc.severity === "critical" ? "destructive" : "secondary"
                    }
                  >
                    {inc.severity}
                  </Badge>
                </div>
                {inc.updates.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-l-2 border-border pl-3">
                    {inc.updates.map((u) => (
                      <li key={u.id}>
                        <p className="text-xs text-foreground">{u.message}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {fmtDateTime(u.at)} · {u.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Scheduled maintenance */}
      <SectionCard title="Scheduled maintenance">
        {health.scheduled_maintenance.length === 0 ? (
          <EmptyState
            title="No scheduled maintenance"
            icon={<Wrench size={20} className="text-muted-foreground" />}
          />
        ) : (
          <ul className="space-y-2">
            {health.scheduled_maintenance.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-border bg-surface p-3"
              >
                <p className="text-sm font-medium text-foreground">{m.title}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {fmtDateTime(m.starts_at)} → {fmtDateTime(m.expected_end_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Recent resolved */}
      {health.recent_resolved.length > 0 && (
        <SectionCard title="Recently resolved">
          <ul className="space-y-2">
            {health.recent_resolved.map((inc) => (
              <li
                key={inc.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-2.5"
              >
                <span className="text-sm text-foreground">{inc.title}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {inc.resolved_at ? fmtDateTime(inc.resolved_at) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <Link
        to="/support"
        className="inline-block text-sm text-primary hover:text-primary-press"
      >
        ← Back to Support
      </Link>
    </div>
  );
}
