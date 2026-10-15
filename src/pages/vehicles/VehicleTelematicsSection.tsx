// Connect Pro Fleet — Vehicle Detail Telematics / GPS section (V1).
//
// Compact, contextual telematics card for a single vehicle. Shows device,
// last position, ignition, speed, odometer/battery (only when the provider
// supports them — never rendered as 0 when missing), current rental, recent
// alerts, most recent trip, and deep-links into the Telematics workspace.
//
// "No telematics device connected" when no device is assigned. Missing data is
// shown as "—" — never as 0, 0 mph, or false. Org-scoped via the store join.

import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import {
  selectVehicleTelemetry,
  selectAdapterForProvider,
} from "@/lib/telematicsSelectors";
import { useLiveClock } from "@/lib/useLiveClock";
import { TELEMATICS_PROVIDER_LABELS } from "@/lib/telematicsTypes";
import { fmtDateTime, fmtDate, fmtNumber } from "@/lib/format";
import {
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { Button } from "@/components/ui/button";
import {
  IgnitionBadge,
  TelemetryValue,
  deviceStatusTone,
} from "@/pages/telematics/TelematicsPrimitives";
import {
  Satellite,
  MapPin,
  Gauge,
  Battery,
  Route as RouteIcon,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";

export function VehicleTelematicsSection({ vehicleId }: { vehicleId: string }) {
  const store = useStore();
  const t = useTelematics();
  const now = useLiveClock();

  const summary = useMemo(
    () => selectVehicleTelemetry(store, t, vehicleId, now),
    [store, t, vehicleId, now],
  );

  if (!summary.device) {
    return (
      <SectionCard
        title="Telematics / GPS"
        right={
          <span className="text-xs text-muted-foreground">
            No telematics device connected
          </span>
        }
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <Satellite size={18} className="text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              No telematics device connected
            </p>
            <p className="text-xs text-muted-foreground">
              Assign a GPS device from{" "}
              <Link
                to="/telematics?tab=devices"
                className="text-primary hover:underline"
              >
                Telematics → Devices
              </Link>{" "}
              to start tracking this vehicle.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const adapter = selectAdapterForProvider(t.adapters, summary.device.provider);
  const position = summary.position;
  const rental = summary.rental;
  const recentTrip = summary.recentTrip;

  return (
    <SectionCard
      title="Telematics / GPS"
      right={
        <Link
          to={`/telematics?tab=map`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-press"
        >
          <MapPin size={12} /> View in Telematics
        </Link>
      }
      data-testid="vehicle-telematics-section"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Device + status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <DataLabel>Provider</DataLabel>
              <DataValue>
                {TELEMATICS_PROVIDER_LABELS[summary.device.provider]}
              </DataValue>
            </div>
            <StatusPill tone={deviceStatusTone(summary.device.status)}>
              {summary.device.status}
            </StatusPill>
          </div>
          <div>
            <DataLabel>Device</DataLabel>
            <DataValue mono>{summary.device.external_device_id}</DataValue>
          </div>
          {summary.device.imei_or_serial && (
            <div>
              <DataLabel>Serial / IMEI</DataLabel>
              <DataValue mono>{summary.device.imei_or_serial}</DataValue>
            </div>
          )}
          <div>
            <DataLabel>Last connection</DataLabel>
            <DataValue>
              {summary.device.last_connected_at
                ? fmtDateTime(summary.device.last_connected_at)
                : "—"}
            </DataValue>
          </div>
          {summary.stale && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-status-maintenance/40 bg-surface-2 px-2 py-1 text-xs font-medium text-status-maintenance">
              <AlertTriangle size={12} /> Location stale (last seen{" "}
              {position ? fmtDateTime(position.recorded_at) : "—"})
            </div>
          )}
        </div>

        {/* Live position */}
        <div className="space-y-3">
          <div>
            <DataLabel>Last known location</DataLabel>
            <DataValue mono>
              {position
                ? `${position.latitude.toFixed(4)}, ${position.longitude.toFixed(4)}`
                : "—"}
            </DataValue>
          </div>
          <div>
            <DataLabel>Last GPS update</DataLabel>
            <DataValue>
              {position ? fmtDateTime(position.recorded_at) : "—"}
            </DataValue>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <DataLabel>Ignition</DataLabel>
              <div className="mt-0.5">
                <IgnitionBadge
                  status={summary.position?.ignition_status ?? null}
                />
              </div>
            </div>
            <div>
              <DataLabel>Speed</DataLabel>
              <DataValue mono>
                <TelemetryValue
                  value={summary.position?.speed ?? null}
                  suffix="mph"
                />
              </DataValue>
            </div>
          </div>
          {/* Capability-gated fields */}
          {adapter?.supportsOdometer && (
            <div>
              <DataLabel>
                <Gauge size={11} className="mr-1 inline" /> Odometer
              </DataLabel>
              <DataValue mono>
                <TelemetryValue
                  value={summary.position?.odometer ?? null}
                  suffix="mi"
                />
              </DataValue>
            </div>
          )}
          {adapter?.supportsBattery && (
            <div>
              <DataLabel>
                <Battery size={11} className="mr-1 inline" /> Battery
              </DataLabel>
              <DataValue mono>
                <TelemetryValue
                  value={summary.position?.battery_voltage ?? null}
                  suffix="V"
                />
              </DataValue>
            </div>
          )}
        </div>
      </div>

      {/* Current rental context */}
      {rental && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <CalendarClock size={14} className="text-primary" />
          <span className="text-muted-foreground">
            Currently on active rental
          </span>
          <Link
            to={`/rentals/${rental.id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {rental.agreement_number}
          </Link>
          {summary.renter_name && (
            <span className="text-muted-foreground">
              · {summary.renter_name}
            </span>
          )}
        </div>
      )}

      {/* Recent alerts */}
      {summary.recentAlerts.length > 0 && (
        <div className="mt-4">
          <DataLabel>Recent alerts</DataLabel>
          <div className="mt-2 space-y-1.5">
            {summary.recentAlerts.map((a) => (
              <Link
                key={a.id}
                to={`/telematics?tab=alerts`}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary/40 hover:bg-surface-2"
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  <AlertTriangle
                    size={12}
                    className={
                      a.severity === "high"
                        ? "text-status-out"
                        : "text-status-maintenance"
                    }
                  />
                  {a.type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(a.occurred_at)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Most recent trip */}
      {recentTrip && (
        <div className="mt-4">
          <DataLabel>Most recent trip</DataLabel>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1 text-foreground">
              <RouteIcon size={12} /> {recentTrip.start_location} →{" "}
              {recentTrip.end_location}
            </span>
            <span>{fmtDateTime(recentTrip.started_at)}</span>
            <span>
              {recentTrip.distance != null
                ? `${fmtNumber(recentTrip.distance)} mi`
                : "—"}
            </span>
            <span>
              {recentTrip.duration_minutes != null
                ? `${recentTrip.duration_minutes} min`
                : "—"}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/telematics?tab=map">
          <Button variant="outline" size="sm">
            <MapPin size={13} className="mr-1" /> Live Map
          </Button>
        </Link>
        <Link to={`/telematics?tab=trips&vehicle=${vehicleId}`}>
          <Button variant="outline" size="sm">
            <RouteIcon size={13} className="mr-1" /> Trip History
          </Button>
        </Link>
        <Link to="/telematics?tab=alerts">
          <Button variant="outline" size="sm">
            <AlertTriangle size={13} className="mr-1" /> View Alerts
          </Button>
        </Link>
      </div>
    </SectionCard>
  );
}
