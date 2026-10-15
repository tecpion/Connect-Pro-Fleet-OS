// Connect Pro Fleet — Telematics primitives (V1).
// Shared small UI bits for the Telematics workspace. Uses semantic tokens only.

import type { ReactNode } from "react";
import type {
  TelematicsDeviceStatus,
  IgnitionStatus,
  TelematicsProviderAdapter,
} from "@/lib/telematicsTypes";
import { StatusPill } from "@/components/Status";
import {
  Check,
  X,
  Gauge,
  Fuel,
  Battery,
  Navigation,
  ShieldAlert,
} from "lucide-react";

export function deviceStatusTone(s: TelematicsDeviceStatus) {
  return s === "online"
    ? "available"
    : s === "offline"
      ? "out"
      : s === "disconnected"
        ? "maintenance"
        : "neutral";
}

export function IgnitionBadge({ status }: { status: IgnitionStatus }) {
  if (status === null) return <span className="text-muted-foreground">—</span>;
  return (
    <StatusPill tone={status === "on" ? "available" : "neutral"}>
      {status === "on" ? "Ignition on" : "Ignition off"}
    </StatusPill>
  );
}

/** Renders a telemetry value, or an em-dash when missing (never 0/false). */
export function TelemetryValue({
  value,
  suffix,
}: {
  value: number | null | undefined;
  suffix?: string;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="font-mono">
      {value}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

export function MarkerStatePill({
  state,
}: {
  state:
    | "available"
    | "active_rental"
    | "maintenance"
    | "out_of_service"
    | "offline_gps"
    | "stale_location";
}) {
  const map: Record<string, { tone: string; label: string }> = {
    available: { tone: "available", label: "Available" },
    active_rental: { tone: "maintenance", label: "Active rental" },
    maintenance: { tone: "maintenance", label: "Maintenance" },
    out_of_service: { tone: "out", label: "Out of service" },
    offline_gps: { tone: "out", label: "GPS offline" },
    stale_location: { tone: "maintenance", label: "Stale location" },
  };
  const m = map[state] ?? { tone: "neutral", label: state };
  return <StatusPill tone={m.tone as never}>{m.label}</StatusPill>;
}

/** Provider capability list — hides/mark unsupported features gracefully. */
export function CapList({
  adapter,
  compact,
}: {
  adapter: TelematicsProviderAdapter | null;
  compact?: boolean;
}) {
  if (!adapter) {
    return <span className="text-xs text-muted-foreground">No adapter</span>;
  }
  const caps: { on: boolean; label: string; icon: ReactNode }[] = [
    { on: true, label: "Location", icon: <Navigation size={12} /> },
    {
      on: adapter.supportsIgnition,
      label: "Ignition",
      icon: <Gauge size={12} />,
    },
    {
      on: adapter.supportsTrips,
      label: "Trips",
      icon: <Navigation size={12} />,
    },
    {
      on: adapter.supportsGeofences,
      label: "Geofences",
      icon: <ShieldAlert size={12} />,
    },
    {
      on: adapter.supportsOdometer,
      label: "Odometer",
      icon: <Gauge size={12} />,
    },
    {
      on: adapter.supportsBattery,
      label: "Battery",
      icon: <Battery size={12} />,
    },
    {
      on: adapter.supportsTamperAlerts,
      label: "Tamper alerts",
      icon: <ShieldAlert size={12} />,
    },
    { on: true, label: "Fuel", icon: <Fuel size={12} /> },
  ];
  return (
    <ul className={"flex flex-wrap gap-1.5 " + (compact ? "" : "text-sm")}>
      {caps.map((c) => (
        <li
          key={c.label}
          className={
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] " +
            (c.on
              ? "bg-surface-2 text-foreground"
              : "bg-surface-2/50 text-muted-foreground line-through opacity-70")
          }
        >
          {c.on ? (
            <Check size={11} className="text-primary" />
          ) : (
            <X size={11} />
          )}
          {c.label}
        </li>
      ))}
    </ul>
  );
}
