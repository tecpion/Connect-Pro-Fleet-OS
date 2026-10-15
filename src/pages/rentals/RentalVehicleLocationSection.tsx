// Connect Pro Fleet — Rental Detail VEHICLE LOCATION card (V1 Telematics).
//
// Compact, rental-relevant telemetry only — NOT the full Telematics workspace.
// Shows last known location, last updated, ignition, movement state, device
// status, and active alerts relevant to this rental. Deep-links into the full
// Telematics workspace (Live Map, Trip History). Rental/customer context is
// resolved through the authoritative rental record; telematics data is never
// copied into the rental. Missing data is "—" — never 0/false.

import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import { selectRentalTelemetry } from "@/lib/telematicsSelectors";
import { useLiveClock } from "@/lib/useLiveClock";
import { fmtDateTime } from "@/lib/format";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { Button } from "@/components/ui/button";
import {
  IgnitionBadge,
  TelemetryValue,
  deviceStatusTone,
} from "@/pages/telematics/TelematicsPrimitives";
import {
  MapPin,
  AlertTriangle,
  Route as RouteIcon,
  Satellite,
} from "lucide-react";

export interface RentalVehicleLocationProps {
  rentalId: string;
  vehicleId: string;
}

const MOVEMENT_LABEL: Record<string, string> = {
  moving: "Moving",
  parked: "Parked",
  unknown: "—",
};

export function RentalVehicleLocationSection({
  rentalId,
  vehicleId,
}: RentalVehicleLocationProps) {
  const store = useStore();
  const t = useTelematics();
  const now = useLiveClock();

  const summary = useMemo(
    () => selectRentalTelemetry(t, vehicleId, rentalId, now),
    [t, vehicleId, rentalId, now],
  );

  // No device — compact informational state, no placeholder zeros.
  if (!summary.device) {
    return (
      <SectionCard
        title="Vehicle Location"
        right={<span className="text-xs text-muted-foreground">No GPS</span>}
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <Satellite size={18} className="text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              No telematics device connected
            </p>
            <p className="text-xs text-muted-foreground">
              This vehicle has no GPS device assigned.
            </p>
          </div>
        </div>
      </SectionCard>
    );
  }

  const position = summary.position;

  return (
    <SectionCard
      title="Vehicle Location"
      right={
        <Link
          to={`/telematics?tab=map`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-press"
        >
          <MapPin size={12} /> Open Telematics
        </Link>
      }
      data-testid="rental-vehicle-location"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <DataLabel>Last updated</DataLabel>
            <DataValue>
              {summary.last_seen ? fmtDateTime(summary.last_seen) : "—"}
            </DataValue>
          </div>
          <div>
            <DataLabel>Movement</DataLabel>
            <DataValue>
              {MOVEMENT_LABEL[summary.movement_state] ?? "—"}
            </DataValue>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <DataLabel>Device status</DataLabel>
              <div className="mt-0.5">
                <StatusPill
                  tone={deviceStatusTone(summary.device_status ?? "unknown")}
                >
                  {summary.device_status ?? "—"}
                </StatusPill>
              </div>
            </div>
          </div>
          <div>
            <DataLabel>Ignition</DataLabel>
            <div className="mt-0.5">
              <IgnitionBadge status={summary.ignition_status} />
            </div>
          </div>
          <div>
            <DataLabel>Speed</DataLabel>
            <DataValue mono>
              <TelemetryValue value={summary.speed} suffix="mph" />
            </DataValue>
          </div>
        </div>
      </div>

      {summary.stale && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-status-maintenance/40 bg-surface-2 px-2.5 py-1 text-xs font-medium text-status-maintenance">
          <AlertTriangle size={12} /> Location stale — last seen{" "}
          {summary.last_seen ? fmtDateTime(summary.last_seen) : "—"}
        </div>
      )}

      {/* Active alerts relevant to this rental */}
      {summary.active_alerts.length > 0 && (
        <div className="mt-4">
          <DataLabel>Active GPS alerts</DataLabel>
          <div className="mt-2 space-y-1.5">
            {summary.active_alerts.map((a) => (
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
                  {a.severity} · {fmtDateTime(a.occurred_at)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/telematics?tab=map">
          <Button variant="outline" size="sm">
            <MapPin size={13} className="mr-1" /> View Live Location
          </Button>
        </Link>
        <Link to={`/telematics?tab=trips&vehicle=${vehicleId}`}>
          <Button variant="outline" size="sm">
            <RouteIcon size={13} className="mr-1" /> View Trip History
          </Button>
        </Link>
      </div>
    </SectionCard>
  );
}
