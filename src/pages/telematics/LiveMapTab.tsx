// Connect Pro Fleet — Telematics Live Map tab (V1).
//
// Mock map: a stylized plot panel (no production map provider required yet).
// Shows GPS-equipped vehicles only (others have no coordinate). Selecting a
// marker opens a compact panel with vehicle, plate, renter, rental, location,
// ignition, speed, device status + deep-link actions. Org-scoped only.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import {
  selectLiveMapMarkers,
  type LiveMapMarker,
} from "@/lib/telematicsSelectors";
import { useLiveClock } from "@/lib/useLiveClock";
import { fmtDateTime } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import {
  MarkerStatePill,
  IgnitionBadge,
  TelemetryValue,
  deviceStatusTone,
} from "./TelematicsPrimitives";
import { StatusPill } from "@/components/Status";
import { MapPin, Navigation, AlertTriangle, Car } from "lucide-react";

export function LiveMapTab() {
  const { vehicles, rentals, customers } = useStore();
  const t = useTelematics();
  const now = useLiveClock();
  const [selected, setSelected] = useState<LiveMapMarker | null>(null);

  const markers = useMemo(
    () =>
      selectLiveMapMarkers({
        vehicles,
        devices: t.devices,
        positions: t.positions,
        rentals,
        customers,
        asOf: now,
      }),
    [vehicles, t.devices, t.positions, rentals, customers, now],
  );

  // Mock coordinate bounds → normalized 0..100 plot positions.
  const bounds = useMemo(() => {
    if (markers.length === 0) return null;
    const lats = markers.map((m) => m.latitude);
    const lngs = markers.map((m) => m.longitude);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [markers]);

  function plot(m: LiveMapMarker) {
    if (!bounds) return { x: 50, y: 50 };
    const spanLat = bounds.maxLat - bounds.minLat || 0.01;
    const spanLng = bounds.maxLng - bounds.minLng || 0.01;
    // y inverts because latitude increases upward.
    const x = ((m.longitude - bounds.minLng) / spanLng) * 90 + 5;
    const y = 95 - ((m.latitude - bounds.minLat) / spanLat) * 90;
    return { x, y };
  }

  if (markers.length === 0) {
    return (
      <EmptyState
        title="No GPS-equipped vehicles"
        hint="Vehicles with a connected telematics device appear on the live map."
        icon={<MapPin size={28} />}
      />
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      data-testid="telematics-live-map"
    >
      <div className="lg:col-span-2">
        <SectionCard
          title="Live Map"
          icon={<MapPin size={16} className="text-primary" />}
        >
          <div className="relative h-[420px] w-full overflow-hidden rounded-lg border border-border bg-surface-2/60">
            {/* Stylized mock map grid */}
            <div
              className="absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            {markers.map((m) => {
              const { x, y } = plot(m);
              const active = selected?.vehicle_id === m.vehicle_id;
              return (
                <button
                  key={m.vehicle_id}
                  onClick={() => setSelected(m)}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={`${m.vehicle_label} · ${m.plate}`}
                  aria-label={`${m.vehicle_label} ${m.plate}`}
                >
                  <span
                    className={
                      "flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition " +
                      (active
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-background")
                    }
                    style={{ backgroundColor: markerColor(m.state) }}
                  >
                    <Car size={12} className="text-white" />
                  </span>
                </button>
              );
            })}
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 rounded bg-surface/90 px-2 py-1 text-[10px]">
              <LegendDot c="#16a34a" label="Available" />
              <LegendDot c="#2563eb" label="Active rental" />
              <LegendDot c="#f59e0b" label="Stale" />
              <LegendDot c="#dc2626" label="Offline" />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Selected vehicle panel */}
      <div className="space-y-4">
        {selected ? (
          <SectionCard
            title={selected.vehicle_label}
            icon={<Car size={16} className="text-primary" />}
          >
            <div
              className="space-y-3 text-sm"
              data-testid="telematics-selected-vehicle"
            >
              <div className="flex flex-wrap items-center gap-2">
                <MarkerStatePill state={selected.state} />
                {selected.rental_id && (
                  <span className="text-xs text-muted-foreground">
                    {selected.renter_name} · {selected.rental_number}
                  </span>
                )}
              </div>
              <Row label="Plate" value={selected.plate} mono />
              <Row
                label="Device status"
                value={
                  selected.device_status ? (
                    <StatusPill tone={deviceStatusTone(selected.device_status)}>
                      {selected.device_status}
                    </StatusPill>
                  ) : (
                    "—"
                  )
                }
              />
              <Row
                label="Coordinates"
                value={`${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`}
                mono
              />
              <Row
                label="Last GPS update"
                value={fmtDateTime(selected.last_seen ?? "")}
              />
              <Row
                label="Ignition"
                value={<IgnitionBadge status={selected.ignition_status} />}
              />
              <Row
                label="Speed"
                value={<TelemetryValue value={selected.speed} suffix="mph" />}
              />
              <Row label="Movement" value={movementLabel(selected)} />
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to={`/vehicles/${selected.vehicle_id}`}
                  className="text-xs font-medium text-primary hover:text-primary-press"
                >
                  View Vehicle
                </Link>
                {selected.rental_id && (
                  <Link
                    to={`/rentals/${selected.rental_id}`}
                    className="text-xs font-medium text-primary hover:text-primary-press"
                  >
                    View Active Rental
                  </Link>
                )}
                <Link
                  to={`/telematics?tab=trips&vehicle=${selected.vehicle_id}`}
                  className="text-xs font-medium text-primary hover:text-primary-press"
                >
                  View Trips
                </Link>
                <Link
                  to={`/telematics?tab=alerts&vehicle=${selected.vehicle_id}`}
                  className="text-xs font-medium text-primary hover:text-primary-press"
                >
                  View Alerts
                </Link>
              </div>
            </div>
          </SectionCard>
        ) : (
          <EmptyState
            title="Select a vehicle"
            hint="Tap a marker on the map to see its live telemetry."
            icon={<Navigation size={26} />}
          />
        )}
        <SectionCard title="Map legend">
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <LegendDot c="#16a34a" label="" /> Available vehicle
            </li>
            <li className="flex items-center gap-2">
              <LegendDot c="#2563eb" label="" /> Active rental
            </li>
            <li className="flex items-center gap-2">
              <LegendDot c="#f59e0b" label="" /> Stale location
            </li>
            <li className="flex items-center gap-2">
              <LegendDot c="#dc2626" label="" /> GPS offline / disconnected
            </li>
            <li className="flex items-center gap-2 text-foreground">
              <AlertTriangle size={14} className="text-status-out" />{" "}
              High-priority alerts surface in Action Center
            </li>
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={"text-right text-foreground " + (mono ? "font-mono" : "")}
      >
        {value}
      </span>
    </div>
  );
}

function movementLabel(m: LiveMapMarker): string {
  if (m.state === "offline_gps" || m.state === "stale_location")
    return "Unknown";
  if (m.speed == null) return "—";
  if (m.ignition_status === "off" || m.speed === 0) return "Parked";
  return "Moving";
}

function markerColor(state: LiveMapMarker["state"]): string {
  switch (state) {
    case "available":
      return "#16a34a";
    case "active_rental":
      return "#2563eb";
    case "stale_location":
      return "#f59e0b";
    case "offline_gps":
      return "#dc2626";
    case "maintenance":
      return "#f59e0b";
    case "out_of_service":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

function LegendDot({ c, label }: { c: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: c }}
      />
      {label && <span>{label}</span>}
    </span>
  );
}
