// Connect Pro Fleet — Telematics provider adapters (V1, mock).
//
// Provider-neutral adapter contract implemented as pure mock adapters. No
// network calls, no credentials. Provider-specific translation belongs HERE
// only — the rest of the app speaks the normalized Fleet OS telematics types.
//
// Capability differences are real: e.g. Advantage supports battery + tamper
// but not odometer; SVR supports trips + geofences but not battery. The UI
// hides unsupported fields via these flags.

import type {
  TelematicsProviderAdapter,
  TelematicsProviderId,
} from "@/lib/telematicsTypes";
import { TELEMATICS_PROVIDER_LABELS } from "@/lib/telematicsTypes";
import { mockTelematicsState } from "@/lib/store/seedTelematics";

/**
 * Mock Advantage GPS adapter. Capabilities reflect a typical full-featured
 * provider: location, ignition, trips, geofences, battery, tamper — but NOT
 * odometer (illustrating graceful capability degradation).
 */
const advantageAdapter: TelematicsProviderAdapter = {
  provider: "advantage",
  label: TELEMATICS_PROVIDER_LABELS.advantage,
  connected: true,
  supportsGeofences: true,
  supportsTrips: true,
  supportsIgnition: true,
  supportsOdometer: false,
  supportsBattery: true,
  supportsTamperAlerts: true,
  fetchDevices: () =>
    mockTelematicsState.devices.filter((d) => d.provider === "advantage"),
  fetchVehiclePositions: () => mockTelematicsState.positions,
  fetchTrips: (vehicleId) =>
    mockTelematicsState.trips.filter((t) => t.vehicle_id === vehicleId),
  fetchEvents: (vehicleId) =>
    mockTelematicsState.events.filter((e) => e.vehicle_id === vehicleId),
};

/**
 * Mock SVR Tracking adapter. A leaner capability set: location + trips +
 * geofences, but no battery, no tamper alerts, no ignition. Shows the UI
 * gracefully omitting unsupported telemetry.
 */
const svrAdapter: TelematicsProviderAdapter = {
  provider: "svr",
  label: TELEMATICS_PROVIDER_LABELS.svr,
  connected: true,
  supportsGeofences: true,
  supportsTrips: true,
  supportsIgnition: false,
  supportsOdometer: false,
  supportsBattery: false,
  supportsTamperAlerts: false,
  fetchDevices: () =>
    mockTelematicsState.devices.filter((d) => d.provider === "svr"),
  fetchVehiclePositions: () => mockTelematicsState.positions,
  fetchTrips: (vehicleId) =>
    mockTelematicsState.trips.filter((t) => t.vehicle_id === vehicleId),
  fetchEvents: (vehicleId) =>
    mockTelematicsState.events.filter((e) => e.vehicle_id === vehicleId),
};

/**
 * Custom / Other provider adapter — not connected by default, full capability
 * surface assumed (the production dev configures the real capability set).
 */
const customAdapter: TelematicsProviderAdapter = {
  provider: "custom",
  label: TELEMATICS_PROVIDER_LABELS.custom,
  connected: false,
  supportsGeofences: true,
  supportsTrips: true,
  supportsIgnition: true,
  supportsOdometer: true,
  supportsBattery: true,
  supportsTamperAlerts: true,
};

export const telematicsAdapters: TelematicsProviderAdapter[] = [
  advantageAdapter,
  svrAdapter,
  customAdapter,
];

export function getAdapter(
  provider: TelematicsProviderId,
): TelematicsProviderAdapter | null {
  return telematicsAdapters.find((a) => a.provider === provider) ?? null;
}
