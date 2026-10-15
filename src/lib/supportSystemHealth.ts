// Connect Pro Fleet — System Health domain (Build #31).
//
// Models Connect Pro Fleet service conditions. CRITICAL: in development mode,
// live monitoring is NOT configured. Unknown status stays Unknown — it is
// never coerced to "Operational" to fake an "all systems operational" banner.
// The app-level incident banner only appears for actual Major/Critical
// incident records.

import type {
  SystemComponentKey,
  SystemComponentStatus,
  SystemHealthSnapshot,
  SystemIncident,
  SystemStatusLevel,
  IncidentUpdate,
  MaintenanceNotice,
  KnownIssue,
} from "./supportTypes";

// ---------------------------------------------------------------------------
// Component defaults — development mode (Unknown where not measurable)
// ---------------------------------------------------------------------------

export const SYSTEM_COMPONENT_LABELS: Record<SystemComponentKey, string> = {
  web_app: "Web Application",
  authentication: "Authentication",
  database: "Database",
  file_storage: "File Storage",
  billing_payments: "Billing / Payments",
  notifications: "Notifications",
  connect_pro_sync: "Connect Pro Sync",
  copilot: "Copilot",
  reporting: "Reporting",
};

/** Default component statuses for the current development environment.
 *  Live monitoring is not configured, so most components are Unknown. */
export const DEFAULT_COMPONENT_STATUSES: SystemComponentStatus[] = (
  Object.keys(SYSTEM_COMPONENT_LABELS) as SystemComponentKey[]
).map((key) => ({
  key,
  label: SYSTEM_COMPONENT_LABELS[key],
  status: "unknown" as SystemStatusLevel,
  source: "development",
  checked_at: new Date("2026-09-01T00:00:00Z").toISOString(),
  message: null,
}));

// ---------------------------------------------------------------------------
// Seed incidents / maintenance / known issues
// ---------------------------------------------------------------------------

export const SEED_INCIDENTS: SystemIncident[] = [];

export const SEED_MAINTENANCE: MaintenanceNotice[] = [];

export const SEED_KNOWN_ISSUES: KnownIssue[] = [];

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

/** Severity rank for deriving an overall status from components. */
const STATUS_RANK: Record<SystemStatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
  unknown: -1,
};

/** Derive an overall status from component statuses + active incidents.
 *  Unknown components are excluded from the derivation (they don't drag the
 *  overall down, and they don't fake it up to Operational). If ALL components
 *  are Unknown and there are no incidents, the overall is Unknown. */
export function deriveOverallStatus(
  components: SystemComponentStatus[],
  activeIncidents: SystemIncident[],
): SystemStatusLevel {
  // Active major/critical incidents force the overall.
  const criticalIncident = activeIncidents.find(
    (i) => i.severity === "critical",
  );
  if (criticalIncident) return "major_outage";
  const majorIncident = activeIncidents.find((i) => i.severity === "major");
  if (majorIncident) return "partial_outage";

  const known = components.filter((c) => c.status !== "unknown");
  if (known.length === 0) return "unknown";

  let worst: SystemStatusLevel = "operational";
  for (const c of known) {
    if (STATUS_RANK[c.status] > STATUS_RANK[worst]) worst = c.status;
  }
  return worst;
}

/** Active (non-resolved) public incidents. */
export function activeIncidents(incidents: SystemIncident[]): SystemIncident[] {
  return incidents.filter((i) => i.status !== "resolved" && i.public);
}

/** Recently resolved incidents (newest first). */
export function recentResolvedIncidents(
  incidents: SystemIncident[],
  limit = 5,
): SystemIncident[] {
  return incidents
    .filter((i) => i.status === "resolved" && i.public)
    .sort((a, b) =>
      (b.resolved_at ?? b.created_at).localeCompare(
        a.resolved_at ?? a.created_at,
      ),
    )
    .slice(0, limit);
}

/** True when an active Major/Critical incident should trigger the app banner. */
export function shouldShowIncidentBanner(incidents: SystemIncident[]): boolean {
  return activeIncidents(incidents).some(
    (i) => i.severity === "major" || i.severity === "critical",
  );
}

/** Build the full system health snapshot. */
export function buildSystemHealthSnapshot(
  input: {
    components?: SystemComponentStatus[];
    incidents?: SystemIncident[];
    maintenance?: MaintenanceNotice[];
    knownIssues?: KnownIssue[];
    monitoringConfigured?: boolean;
  } = {},
  now: Date = new Date(),
): SystemHealthSnapshot {
  const components = input.components ?? DEFAULT_COMPONENT_STATUSES;
  const incidents = input.incidents ?? SEED_INCIDENTS;
  const maintenance = input.maintenance ?? SEED_MAINTENANCE;
  const knownIssues = input.knownIssues ?? SEED_KNOWN_ISSUES;
  const monitoringConfigured = input.monitoringConfigured ?? false;

  const active = activeIncidents(incidents);
  const overall = deriveOverallStatus(components, active);

  return {
    overall,
    components,
    active_incidents: active,
    scheduled_maintenance: maintenance,
    recent_resolved: recentResolvedIncidents(incidents),
    known_issues: knownIssues,
    monitoring_configured: monitoringConfigured,
    generated_at: now.toISOString(),
  };
}

/** Add a chronological update to an incident (never overwrites prior updates). */
export function addIncidentUpdate(
  incident: SystemIncident,
  update: Omit<IncidentUpdate, "id" | "incident_id">,
): SystemIncident {
  return {
    ...incident,
    status: update.status,
    resolved_at:
      update.status === "resolved" ? update.at : incident.resolved_at,
    updates: [
      ...incident.updates,
      {
        ...update,
        id: `incupd_${Math.random().toString(36).slice(2, 8)}`,
        incident_id: incident.id,
      },
    ],
  };
}

/** Human-readable label for a status level. */
export function statusLabel(s: SystemStatusLevel): string {
  switch (s) {
    case "operational":
      return "Operational";
    case "degraded":
      return "Degraded";
    case "partial_outage":
      return "Partial Outage";
    case "major_outage":
      return "Major Outage";
    case "maintenance":
      return "Maintenance";
    case "unknown":
      return "Unknown";
  }
}
