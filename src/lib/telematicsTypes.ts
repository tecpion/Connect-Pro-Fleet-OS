// Connect Pro Fleet — Telematics domain types (V1).
//
// Provider-agnostic telematics domain model. No provider-specific structures
// live here; provider translation belongs in the adapter layer. All records
// are organization-scoped (enforced now in selectors, later by backend RLS).
//
// Principle: missing data must remain missing. Optional numeric/boolean
// fields are nullable so the UI never renders a missing value as 0/false.

// ───────────────────────── Provider ─────────────────────────

/** Supported mock providers. Production devs add real provider ids here. */
export type TelematicsProviderId = "advantage" | "svr" | "custom";

export const TELEMATICS_PROVIDER_LABELS: Record<TelematicsProviderId, string> =
  {
    advantage: "Advantage GPS",
    svr: "SVR Tracking",
    custom: "Custom / Other Provider",
  };

// ───────────────────────── Device ─────────────────────────

export type TelematicsDeviceStatus =
  "online" | "offline" | "disconnected" | "unknown";

export interface TelematicsDevice {
  id: string;
  organization_id: string;
  provider: TelematicsProviderId;
  external_device_id: string;
  imei_or_serial: string | null;
  vehicle_id: string | null;
  status: TelematicsDeviceStatus;
  installed_at: string;
  last_connected_at: string | null;
  battery_voltage: number | null;
  metadata: Record<string, unknown> | null;
}

export interface TelematicsDeviceAssignment {
  id: string;
  device_id: string;
  vehicle_id: string;
  started_at: string;
  ended_at: string | null;
  reason: string | null; // "install" | "replace" | "remove"
}

// ───────────────────────── Position ─────────────────────────

export type IgnitionStatus = "on" | "off" | null;

export interface TelematicsPosition {
  device_id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  provider_timestamp: string | null;
  heading: number | null;
  speed: number | null; // mph
  ignition_status: IgnitionStatus;
  odometer: number | null;
  battery_voltage: number | null;
  gps_signal_status: "good" | "fair" | "poor" | null;
}

// ───────────────────────── Events ─────────────────────────

export type TelematicsEventType =
  | "ignition_on"
  | "ignition_off"
  | "movement_started"
  | "movement_stopped"
  | "speeding"
  | "geofence_enter"
  | "geofence_exit"
  | "device_offline"
  | "device_reconnected"
  | "possible_tow"
  | "battery_low"
  | "device_tamper"
  | "location_update";

export interface TelematicsEvent {
  id: string;
  organization_id: string;
  device_id: string;
  vehicle_id: string;
  type: TelematicsEventType;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown> | null;
}

// ───────────────────────── Trips ─────────────────────────

export interface TelematicsTrip {
  id: string;
  organization_id: string;
  vehicle_id: string;
  device_id: string;
  started_at: string;
  ended_at: string;
  start_location: string;
  end_location: string;
  distance: number | null; // miles
  duration_minutes: number | null;
  max_speed: number | null; // mph
  average_speed: number | null; // mph
  rental_id: string | null; // optional explicit seed override; otherwise derived
}

// ───────────────────────── Alerts ─────────────────────────

export type TelematicsAlertType =
  | "device_offline"
  | "gps_disconnected"
  | "location_stale"
  | "device_tamper"
  | "battery_low"
  | "speeding"
  | "geofence_violation"
  | "unusual_movement"
  | "possible_tow";

export type TelematicsAlertStatus =
  "new" | "acknowledged" | "resolved" | "dismissed";
export type TelematicsAlertSeverity = "high" | "medium" | "low";

export interface TelematicsAlert {
  id: string;
  organization_id: string;
  vehicle_id: string;
  rental_id: string | null;
  event_id: string | null;
  severity: TelematicsAlertSeverity;
  type: TelematicsAlertType;
  occurred_at: string;
  location: string | null;
  status: TelematicsAlertStatus;
  assigned_to: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolution_notes: string | null;
}

// ───────────────────────── Geofences ─────────────────────────

/** Alias used across the Telematics UI for the canonical geofence record. */
export type Geofence = TelematicsGeofence;

export type GeofenceType =
  "allowed" | "restricted" | "lot" | "airport" | "service" | "custom";

export interface TelematicsGeofence {
  id: string;
  organization_id: string;
  name: string;
  type: GeofenceType;
  active: boolean;
  // Mock abstraction: a center + radius (or polygon later). Provider-neutral.
  center_latitude: number;
  center_longitude: number;
  radius_meters: number | null;
  applies_to_all: boolean;
  applies_to_class_id: string | null;
  applies_to_vehicle_ids: string[] | null;
  alert_on_enter: boolean;
  alert_on_exit: boolean;
  created_at: string;
}

// ───────────────────────── Provider adapter contract ─────────────────────────

/**
 * Provider-neutral adapter contract. Production developers implement one
 * adapter per real provider; provider-specific translation lives ONLY here.
 * Mock adapters are used in V1 and never make network calls.
 */
export interface TelematicsProviderAdapter {
  provider: TelematicsProviderId;
  label: string;
  connected: boolean; // mock connection state for Integrations settings
  // Capabilities — the UI hides unsupported fields.
  supportsGeofences: boolean;
  supportsTrips: boolean;
  supportsIgnition: boolean;
  supportsOdometer: boolean;
  supportsBattery: boolean;
  supportsTamperAlerts: boolean;
  // Conceptual fetch methods (mock implementations return seeded data; real
  // adapters translate provider payloads into the Fleet OS types above).
  fetchDevices?: () => TelematicsDevice[];
  fetchLatestPosition?: (deviceId: string) => TelematicsPosition | null;
  fetchVehiclePositions?: () => TelematicsPosition[];
  fetchTrips?: (vehicleId: string) => TelematicsTrip[];
  fetchEvents?: (vehicleId: string) => TelematicsEvent[];
  fetchDeviceHealth?: (
    deviceId: string,
  ) => { status: TelematicsDeviceStatus; battery: number | null } | null;
}
