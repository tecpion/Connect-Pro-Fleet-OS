// Connect Pro Fleet — Telematics Alerts tab (V1).
//
// Dedicated alerts workspace. Statuses: new/acknowledged/resolved/dismissed.
// Filters: New, High Priority, Active Rental, Offline, Geofence, Speeding,
// Device Health, Resolved, All. Org-scoped. High-priority alerts deep-link
// into Action Center (via the shared attention feed, not a second queue).

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import {
  selectTelematicsAlerts,
  type TelematicsAlertRow,
} from "@/lib/telematicsSelectors";
import { fmtDateTime } from "@/lib/format";
import { useCan } from "@/pages/settings/useCan";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  AlertTriangle,
  ShieldAlert,
  Battery,
  Gauge,
  MapPinOff,
  Radio,
  HelpCircle,
} from "lucide-react";
import type { TelematicsAlertType } from "@/lib/telematicsTypes";

const FILTERS = [
  { key: "new", label: "New" },
  { key: "high", label: "High Priority" },
  { key: "active_rental", label: "Active Rental" },
  { key: "offline", label: "Offline" },
  { key: "geofence", label: "Geofence" },
  { key: "speeding", label: "Speeding" },
  { key: "device_health", label: "Device Health" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

type AlertFilterKey = (typeof FILTERS)[number]["key"];

const TYPE_META: Record<
  TelematicsAlertType,
  { label: string; icon: React.ReactNode }
> = {
  device_offline: { label: "GPS Offline", icon: <MapPinOff size={14} /> },
  gps_disconnected: { label: "GPS Disconnected", icon: <Radio size={14} /> },
  location_stale: { label: "Stale Location", icon: <MapPinOff size={14} /> },
  device_tamper: { label: "Possible Tamper", icon: <ShieldAlert size={14} /> },
  battery_low: { label: "Low Battery", icon: <Battery size={14} /> },
  speeding: { label: "Speeding", icon: <Gauge size={14} /> },
  geofence_violation: {
    label: "Geofence Violation",
    icon: <AlertTriangle size={14} />,
  },
  unusual_movement: {
    label: "Unusual Movement",
    icon: <AlertTriangle size={14} />,
  },
  possible_tow: { label: "Possible Tow", icon: <AlertTriangle size={14} /> },
};

function severityTone(sev: TelematicsAlertRow["severity"]) {
  return sev === "high" ? "out" : sev === "medium" ? "maintenance" : "neutral";
}
function statusTone(s: TelematicsAlertRow["status"]) {
  return s === "new" ? "out" : s === "acknowledged" ? "maintenance" : "neutral";
}

export function AlertsTab() {
  const { vehicles, rentals, customers } = useStore();
  const t = useTelematics();
  const canManageAlerts = useCan("telematics.manage_alerts");
  const [filter, setFilter] = useState<AlertFilterKey>("new");
  const [selected, setSelected] = useState<TelematicsAlertRow | null>(null);

  const alerts = useMemo(
    () => selectTelematicsAlerts({ vehicles, rentals, customers }, t),
    [vehicles, rentals, customers, t],
  );

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      switch (filter) {
        case "new":
          return a.status === "new";
        case "high":
          return a.severity === "high";
        case "active_rental":
          return !!a.rental_id;
        case "offline":
          return [
            "device_offline",
            "gps_disconnected",
            "location_stale",
          ].includes(a.type);
        case "geofence":
          return a.type === "geofence_violation";
        case "speeding":
          return a.type === "speeding";
        case "device_health":
          return ["battery_low", "device_tamper"].includes(a.type);
        case "resolved":
          return a.status === "resolved" || a.status === "dismissed";
        case "all":
          return true;
        default:
          return true;
      }
    });
  }, [alerts, filter]);

  const canAck = canManageAlerts;
  const canResolve = canManageAlerts;

  function ack(a: TelematicsAlertRow) {
    if (!canAck) return;
    t.acknowledgeAlert(a.id);
    setSelected((s) => (s ? { ...s, status: "acknowledged" } : s));
  }
  function dismiss(a: TelematicsAlertRow) {
    if (!canResolve) return;
    t.dismissAlert(a.id);
    setSelected((s) => (s ? { ...s, status: "dismissed" } : s));
  }
  async function resolve(a: TelematicsAlertRow) {
    if (!canResolve) return;
    t.resolveAlert(a.id, "Resolved from Telematics workspace");
    setSelected((s) => (s ? { ...s, status: "resolved" } : s));
  }

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      data-testid="telematics-alerts"
    >
      <div className="lg:col-span-2">
        <SectionCard
          title="Telematics Alerts"
          icon={<AlertTriangle size={16} className="text-status-out" />}
        >
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  "rounded px-2.5 py-1 text-xs font-medium transition " +
                  (filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-muted-foreground hover:text-foreground")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title="No alerts in this view"
              hint="Alerts resolve when devices reconnect or staff acknowledges them."
              icon={<HelpCircle size={24} />}
            />
          ) : (
            <ul className="space-y-2">
              {filtered.map((a) => {
                const meta = TYPE_META[a.type];
                const active = selected?.id === a.id;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelected(a)}
                      className={
                        "w-full rounded-lg border p-3 text-left transition " +
                        (active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40")
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 text-status-out">
                            {meta.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {meta.label}
                              <StatusPill tone={severityTone(a.severity)}>
                                {a.severity}
                              </StatusPill>
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {a.vehicle_label} · {a.plate} ·{" "}
                              {fmtDateTime(a.occurred_at)}
                            </div>
                          </div>
                        </div>
                        <StatusPill tone={statusTone(a.status)}>
                          {a.status}
                        </StatusPill>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Detail / actions */}
      <div>
        {selected ? (
          <SectionCard title={TYPE_META[selected.type].label}>
            <div
              className="space-y-3 text-sm"
              data-testid="telematics-alert-detail"
            >
              <div className="flex gap-2">
                <StatusPill tone={severityTone(selected.severity)}>
                  {selected.severity} severity
                </StatusPill>
                <StatusPill tone={statusTone(selected.status)}>
                  {selected.status}
                </StatusPill>
              </div>
              <Row
                label="Vehicle"
                value={
                  <Link
                    className="text-primary hover:text-primary-press"
                    to={`/vehicles/${selected.vehicle_id}`}
                  >
                    {selected.vehicle_label}
                  </Link>
                }
              />
              <Row
                label="Plate"
                value={<span className="font-mono">{selected.plate}</span>}
              />
              {selected.renter_name && (
                <Row label="Renter" value={selected.renter_name} />
              )}
              {selected.rental_id && (
                <Row
                  label="Rental"
                  value={
                    <Link
                      className="text-primary hover:text-primary-press"
                      to={`/rentals/${selected.rental_id}`}
                    >
                      {selected.rental_number}
                    </Link>
                  }
                />
              )}
              <Row label="Occurred" value={fmtDateTime(selected.occurred_at)} />
              {selected.location && (
                <Row label="Location" value={selected.location} />
              )}
              <Row
                label="Assigned"
                value={selected.assigned_to ?? "Unassigned"}
              />
              {selected.acknowledged_at && (
                <Row
                  label="Acknowledged"
                  value={fmtDateTime(selected.acknowledged_at)}
                />
              )}
              {selected.resolution_notes && (
                <Row label="Resolution" value={selected.resolution_notes} />
              )}

              {canManageAlerts && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {canAck && selected.status === "new" && (
                    <button
                      onClick={() => ack(selected)}
                      className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-press"
                    >
                      Acknowledge
                    </button>
                  )}
                  {canResolve && selected.status !== "resolved" && (
                    <button
                      onClick={() => resolve(selected)}
                      className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
                    >
                      Resolve
                    </button>
                  )}
                  {canResolve &&
                    selected.status !== "dismissed" &&
                    selected.status !== "resolved" && (
                      <button
                        onClick={() => dismiss(selected)}
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-2"
                      >
                        Dismiss
                      </button>
                    )}
                </div>
              )}
            </div>
          </SectionCard>
        ) : (
          <EmptyState
            title="No alert selected"
            hint="Select an alert to see details and take action."
            icon={<AlertTriangle size={24} />}
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}
