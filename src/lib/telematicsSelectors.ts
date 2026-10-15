// Connect Pro Fleet — Telematics selectors (V1).
//
// Pure, org-scoped read functions over the telematics store + canonical
// vehicle/rental/customer records. These are the ONLY place telematics data
// is joined to operational entities, so tenant isolation and "missing ≠ zero"
// rules are enforced centrally.
//
// Principles:
// - Never render a missing numeric/boolean as 0/false/empty — return null and
//   let the UI show "—". Missing data is not zero.
// - Rental/customer context is RESOLVED through authoritative records, never
//   copied into telematics records.
// - Trip→rental matching derives from vehicle + time window + possession dates
//   (checkout..return), never by guessing.
// - All selectors filter by organization_id implicitly because the store only
//   holds org-scoped seed/mock data (backend RLS will enforce this later).

import type {
  TelematicsDevice,
  TelematicsPosition,
  TelematicsTrip,
  TelematicsAlert,
  TelematicsProviderAdapter,
  TelematicsGeofence,
  TelematicsDeviceAssignment,
} from "@/lib/telematicsTypes";

// Re-export lightweight row shapes used by the UI.
export interface LiveMapMarker {
  vehicle_id: string;
  vehicle_label: string;
  plate: string;
  state:
    | "available"
    | "active_rental"
    | "maintenance"
    | "out_of_service"
    | "offline_gps"
    | "stale_location";
  latitude: number;
  longitude: number;
  last_seen: string | null;
  ignition_status: TelematicsPosition["ignition_status"] | null;
  speed: number | null;
  device_status: TelematicsDevice["status"] | null;
  renter_name: string | null;
  rental_id: string | null;
  rental_number: string | null;
}

export interface TelematicsAlertRow {
  id: string;
  vehicle_id: string;
  vehicle_label: string;
  plate: string;
  rental_id: string | null;
  rental_number: string | null;
  renter_name: string | null;
  event_id: string | null;
  severity: "high" | "medium" | "low";
  type: TelematicsAlert["type"];
  occurred_at: string;
  location: string | null;
  status: TelematicsAlert["status"];
  assigned_to: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolution_notes: string | null;
}

export interface TelematicsTripRow {
  id: string;
  vehicle_id: string;
  vehicle_label: string;
  plate: string;
  device_id: string;
  started_at: string;
  ended_at: string;
  start_location: string;
  end_location: string;
  distance: number | null;
  duration_minutes: number | null;
  max_speed: number | null;
  average_speed: number | null;
  rental_id: string | null;
  rental_number: string | null;
  renter_name: string | null;
}

export interface DeviceRosterRow {
  id: string;
  provider: TelematicsDevice["provider"];
  providerLabel: string;
  external_device_id: string;
  imei_or_serial: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  status: TelematicsDevice["status"];
  installed_at: string;
  last_connected_at: string | null;
  battery_voltage: number | null;
}

// ───────────────────────── helpers ─────────────────────────

const STALE_THRESHOLD_MIN = 60; // >60min since last position = stale

function minutesSince(iso: string | null, asOf: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((asOf.getTime() - t) / 60000);
}

function deviceForVehicle(devices: TelematicsDevice[], vehicleId: string) {
  return devices.find((d) => d.vehicle_id === vehicleId) ?? null;
}

function latestPositionForDevice(
  positions: TelematicsPosition[],
  deviceId: string,
) {
  const devicePositions = positions.filter((p) => p.device_id === deviceId);
  if (devicePositions.length === 0) return null;
  return devicePositions.reduce((latest, p) =>
    (p.recorded_at ?? "").localeCompare(latest.recorded_at ?? "") > 0
      ? p
      : latest,
  );
}

function activeRentalForVehicle(
  rentals: RentalLike[],
  vehicleId: string,
  asOf: Date,
): RentalLike | null {
  // An "active" rental is checked out and not yet returned. Possession window
  // is checkout_date..(actual_return_date ?? scheduled_return_date). We also
  // treat status === "active" as authoritative even if dates are loose.
  const asOfIso = asOf.toISOString();
  return (
    rentals.find((r) => {
      if (r.vehicle_id !== vehicleId) return false;
      if (r.status === "active") return true;
      if (r.status !== "completed" && r.status !== "cancelled") {
        const start = r.checkout_date ?? r.start_date;
        const end =
          r.actual_return_date ?? r.scheduled_return_date ?? r.end_date;
        if (start && end)
          return start <= asOfIso.slice(0, 10) && asOfIso.slice(0, 10) <= end;
      }
      return false;
    }) ?? null
  );
}

function vehicleLabel(v: VehicleLike): string {
  return [v.year, v.make, v.model].filter(Boolean).join(" ");
}

interface RentalLike {
  id: string;
  vehicle_id: string;
  customer_id: string;
  agreement_number: string;
  status: string;
  checkout_date: string | null;
  scheduled_return_date: string | null;
  actual_return_date: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface VehicleLike {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  status: string;
}

interface CustomerLike {
  id: string;
  first_name: string;
  last_name: string;
}

interface StoreLike {
  vehicles: VehicleLike[];
  rentals: RentalLike[];
  customers: CustomerLike[];
}

// ───────────────────────── Live Map ─────────────────────────

export function selectLiveMapMarkers(input: {
  vehicles: VehicleLike[];
  devices: TelematicsDevice[];
  positions: TelematicsPosition[];
  rentals: RentalLike[];
  customers: CustomerLike[];
  asOf: Date;
}): LiveMapMarker[] {
  const { vehicles, devices, positions, rentals, customers, asOf } = input;
  const markers: LiveMapMarker[] = [];
  for (const v of vehicles) {
    const device = deviceForVehicle(devices, v.id);
    if (!device) continue; // no GPS → not on the map
    const pos = latestPositionForDevice(positions, device.id);
    if (!pos) continue; // device exists but no position yet → skip
    const rental = activeRentalForVehicle(rentals, v.id, asOf);
    const renter = rental
      ? (customers.find((c) => c.id === rental.customer_id) ?? null)
      : null;
    const mins = minutesSince(pos.recorded_at ?? null, asOf);
    const stale = mins != null && mins > STALE_THRESHOLD_MIN;

    let state: LiveMapMarker["state"];
    if (device.status === "offline" || device.status === "disconnected")
      state = "offline_gps";
    else if (stale) state = "stale_location";
    else if (rental) state = "active_rental";
    else if (v.status === "maintenance") state = "maintenance";
    else if (v.status === "out_of_service" || v.status === "sold")
      state = "out_of_service";
    else state = "available";

    markers.push({
      vehicle_id: v.id,
      vehicle_label: vehicleLabel(v),
      plate: v.license_plate,
      state,
      latitude: pos.latitude,
      longitude: pos.longitude,
      last_seen: pos.recorded_at ?? null,
      ignition_status: pos.ignition_status ?? null,
      speed: pos.speed ?? null,
      device_status: device.status,
      renter_name: renter ? `${renter.first_name} ${renter.last_name}` : null,
      rental_id: rental?.id ?? null,
      rental_number: rental?.agreement_number ?? null,
    });
  }
  return markers;
}

// ───────────────────────── Alerts ─────────────────────────

export function selectTelematicsAlerts(
  store: StoreLike,
  t: TelematicsStoreView,
): TelematicsAlertRow[] {
  return t.alerts
    .map((a) => {
      const v = store.vehicles.find((x) => x.id === a.vehicle_id);
      if (!v) return null; // org-scoped: unknown vehicle = not ours
      const rental = a.rental_id
        ? (store.rentals.find((r) => r.id === a.rental_id) ?? null)
        : null;
      const renter = rental
        ? (store.customers.find((c) => c.id === rental.customer_id) ?? null)
        : null;
      return {
        id: a.id,
        vehicle_id: v.id,
        vehicle_label: vehicleLabel(v),
        plate: v.license_plate,
        rental_id: rental?.id ?? null,
        rental_number: rental?.agreement_number ?? null,
        renter_name: renter ? `${renter.first_name} ${renter.last_name}` : null,
        event_id: a.event_id,
        severity: a.severity,
        type: a.type,
        occurred_at: a.occurred_at,
        location: a.location,
        status: a.status,
        assigned_to: a.assigned_to,
        acknowledged_at: a.acknowledged_at,
        acknowledged_by: a.acknowledged_by,
        resolution_notes: a.resolution_notes,
      } satisfies TelematicsAlertRow;
    })
    .filter((x): x is TelematicsAlertRow => x !== null)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

// ───────────────────────── Trips ─────────────────────────

export interface TripFilter {
  start?: Date;
  end?: Date;
  vehicleId?: string;
  rentalOnly?: boolean;
}

export function selectTelematicsTrips(
  store: StoreLike,
  t: TelematicsStoreView,
  filter: TripFilter = {},
): TelematicsTripRow[] {
  return t.trips
    .map((trip) => {
      const v = store.vehicles.find((x) => x.id === trip.vehicle_id);
      if (!v) return null;
      const rentalId = selectTripRentalLink(trip, store.rentals);
      const rental = rentalId
        ? (store.rentals.find((r) => r.id === rentalId) ?? null)
        : null;
      const renter = rental
        ? (store.customers.find((c) => c.id === rental.customer_id) ?? null)
        : null;
      return { trip, v, rental, renter };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter(({ trip, v, rental }) => {
      if (filter.vehicleId && v.id !== filter.vehicleId) return false;
      if (filter.rentalOnly && !rental) return false;
      if (filter.start) {
        const tripStart = Date.parse(trip.started_at);
        if (!Number.isNaN(tripStart) && tripStart < filter.start.getTime())
          return false;
      }
      if (filter.end) {
        const tripEnd = Date.parse(trip.ended_at);
        if (!Number.isNaN(tripEnd) && tripEnd > filter.end.getTime())
          return false;
      }
      return true;
    })
    .map(({ trip, v, rental, renter }) => ({
      id: trip.id,
      vehicle_id: v.id,
      vehicle_label: vehicleLabel(v),
      plate: v.license_plate,
      device_id: trip.device_id,
      started_at: trip.started_at,
      ended_at: trip.ended_at,
      start_location: trip.start_location,
      end_location: trip.end_location,
      distance: trip.distance ?? null,
      duration_minutes: trip.duration_minutes ?? null,
      max_speed: trip.max_speed ?? null,
      average_speed: trip.average_speed ?? null,
      rental_id: rental?.id ?? null,
      rental_number: rental?.agreement_number ?? null,
      renter_name: renter ? `${renter.first_name} ${renter.last_name}` : null,
    }))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/**
 * Deterministic trip→rental match: a trip belongs to the rental whose vehicle
 * matches AND whose possession window (checkout..actual_return) contains the
 * trip start time. Never creates/alters a Rental record.
 */
export function selectTripRentalLink(
  trip: TelematicsTrip,
  rentals: RentalLike[],
): string | null {
  if (trip.rental_id) return trip.rental_id; // explicit (mock seed) override
  const tripStart = Date.parse(trip.started_at);
  if (Number.isNaN(tripStart)) return null;
  const candidates = rentals.filter((r) => r.vehicle_id === trip.vehicle_id);
  if (candidates.length === 0) return null;
  // Derive a rental possession window from authoritative dates. For an ACTIVE
  // rental the scheduled return is advisory (the rental may have been extended),
  // so the window opens at checkout and stays open-ended until the actual
  // return is recorded. A trip that starts at/after checkout and (when the
  // rental is closed) before/at the actual return links to that rental.
  const match = candidates.find((r) => {
    const start = r.checkout_date ?? r.start_date;
    if (!start) return r.status === "active";
    const s = Date.parse(start + "T00:00:00Z");
    if (Number.isNaN(s)) return r.status === "active";
    if (tripStart < s) return false;
    if (r.status === "active") return true; // open-ended until actual return
    const end = r.actual_return_date ?? r.scheduled_return_date ?? r.end_date;
    if (!end) return false;
    const e = Date.parse(end + "T23:59:59Z");
    if (Number.isNaN(e)) return false;
    return tripStart <= e;
  });
  return match?.id ?? null;
}

// ───────────────────────── Devices ─────────────────────────

export function selectDeviceRoster(
  store: { vehicles: VehicleLike[] },
  t: TelematicsStoreView,
): DeviceRosterRow[] {
  return t.devices.map((d) => {
    const v = d.vehicle_id
      ? (store.vehicles.find((x) => x.id === d.vehicle_id) ?? null)
      : null;
    return {
      id: d.id,
      provider: d.provider,
      providerLabel: PROVIDER_LABELS[d.provider] ?? d.provider,
      external_device_id: d.external_device_id,
      imei_or_serial: d.imei_or_serial ?? null,
      vehicle_id: d.vehicle_id ?? null,
      vehicle_label: v ? vehicleLabel(v) : null,
      status: d.status,
      installed_at: d.installed_at,
      last_connected_at: d.last_connected_at ?? null,
      battery_voltage: d.battery_voltage ?? null,
    };
  });
}

export const PROVIDER_LABELS: Record<TelematicsDevice["provider"], string> = {
  advantage: "Advantage GPS",
  svr: "SVR Tracking",
  custom: "Custom / Other",
};

// ───────────────────────── Vehicle Detail card ─────────────────────────

export interface VehicleTelemetrySummary {
  device: TelematicsDevice | null;
  position: TelematicsPosition | null;
  rental: RentalLike | null;
  renter_name: string | null;
  rental_number: string | null;
  recentAlerts: TelematicsAlert[];
  recentTrip: TelematicsTrip | null;
  stale: boolean;
}

export function selectVehicleTelemetry(
  store: StoreLike,
  t: TelematicsStoreView,
  vehicleId: string,
  asOf: Date,
): VehicleTelemetrySummary {
  const device = deviceForVehicle(t.devices, vehicleId);
  const position = device
    ? latestPositionForDevice(t.positions, device.id)
    : null;
  const rental = activeRentalForVehicle(store.rentals, vehicleId, asOf);
  const renter = rental
    ? (store.customers.find((c) => c.id === rental.customer_id) ?? null)
    : null;
  const recentAlerts = t.alerts
    .filter((a) => a.vehicle_id === vehicleId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 3);
  const recentTrip =
    t.trips
      .filter((tr) => tr.vehicle_id === vehicleId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
  const mins = position
    ? minutesSince(position.recorded_at ?? null, asOf)
    : null;
  return {
    device,
    position,
    rental,
    renter_name: renter ? `${renter.first_name} ${renter.last_name}` : null,
    rental_number: rental?.agreement_number ?? null,
    recentAlerts,
    recentTrip,
    stale: mins != null && mins > STALE_THRESHOLD_MIN,
  };
}

// ───────────────────────── Rental Detail compact card ─────────────────────────

export interface RentalTelemetrySummary {
  vehicle_id: string;
  device: TelematicsDevice | null;
  position: TelematicsPosition | null;
  last_seen: string | null;
  stale: boolean;
  ignition_status: TelematicsPosition["ignition_status"] | null;
  movement_state: "moving" | "parked" | "unknown";
  speed: number | null;
  device_status: TelematicsDevice["status"] | null;
  active_alerts: TelematicsAlert[];
}

export function selectRentalTelemetry(
  t: TelematicsStoreView,
  vehicleId: string,
  rentalId: string,
  asOf: Date,
): RentalTelemetrySummary {
  const device = deviceForVehicle(t.devices, vehicleId);
  const position = device
    ? latestPositionForDevice(t.positions, device.id)
    : null;
  const mins = position
    ? minutesSince(position.recorded_at ?? null, asOf)
    : null;
  const stale = mins != null && mins > STALE_THRESHOLD_MIN;
  let movement: RentalTelemetrySummary["movement_state"] = "unknown";
  if (position) {
    if (position.ignition_status === "on" && (position.speed ?? 0) > 0)
      movement = "moving";
    else if (position.ignition_status === "off" || (position.speed ?? 0) === 0)
      movement = "parked";
  }
  const activeAlerts = t.alerts.filter(
    (a) =>
      a.vehicle_id === vehicleId &&
      (a.rental_id ?? null) === rentalId &&
      a.status !== "dismissed" &&
      a.status !== "resolved",
  );
  return {
    vehicle_id: vehicleId,
    device,
    position,
    last_seen: position?.recorded_at ?? null,
    stale,
    ignition_status: position?.ignition_status ?? null,
    movement_state: movement,
    speed: position?.speed ?? null,
    device_status: device?.status ?? null,
    active_alerts: activeAlerts,
  };
}

// ───────────────────────── Reservation / checkout indicator ─────────────────────────

export type GpsReadiness = "online" | "offline" | "stale" | "no_device";

export function selectVehicleGpsReadiness(
  t: TelematicsStoreView,
  vehicleId: string,
  asOf: Date,
): GpsReadiness {
  const device = deviceForVehicle(t.devices, vehicleId);
  if (!device) return "no_device";
  if (
    device.status === "offline" ||
    device.status === "disconnected" ||
    device.status === "unknown"
  )
    return "offline";
  const pos = latestPositionForDevice(t.positions, device.id);
  if (!pos) return "offline";
  const mins = minutesSince(pos.recorded_at ?? null, asOf);
  if (mins != null && mins > STALE_THRESHOLD_MIN) return "stale";
  return "online";
}

// ───────────────────────── Capabilities ─────────────────────────

export function selectAdapterForProvider(
  adapters: TelematicsProviderAdapter[],
  provider: TelematicsDevice["provider"],
): TelematicsProviderAdapter | null {
  return adapters.find((a) => a.provider === provider) ?? null;
}

// ───────────────────────── Action Center feed ─────────────────────────

export interface TelematicsAttentionItem {
  id: string;
  vehicle_id: string;
  vehicle_label: string;
  plate: string;
  rental_id: string | null;
  rental_number: string | null;
  severity: "high" | "medium" | "low";
  type: TelematicsAlert["type"];
  occurred_at: string;
  status: TelematicsAlert["status"];
}

export function selectTelematicsAttention(
  store: StoreLike,
  t: TelematicsStoreView,
): TelematicsAttentionItem[] {
  return t.alerts
    .filter((a) => a.status === "new" || a.status === "acknowledged")
    .filter((a) => a.severity === "high" || a.severity === "medium")
    .map((a) => {
      const v = store.vehicles.find((x) => x.id === a.vehicle_id);
      if (!v) return null;
      const rental = a.rental_id
        ? (store.rentals.find((r) => r.id === a.rental_id) ?? null)
        : null;
      return {
        id: a.id,
        vehicle_id: v.id,
        vehicle_label: vehicleLabel(v),
        plate: v.license_plate,
        rental_id: rental?.id ?? null,
        rental_number: rental?.agreement_number ?? null,
        severity: a.severity,
        type: a.type,
        occurred_at: a.occurred_at,
        status: a.status,
      } satisfies TelematicsAttentionItem;
    })
    .filter((x): x is TelematicsAttentionItem => x !== null)
    .sort(
      (a, b) =>
        (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1) ||
        b.occurred_at.localeCompare(a.occurred_at),
    );
}

// ───────────────────────── Store view (structural typing) ─────────────────────────

export interface TelematicsStoreView {
  devices: TelematicsDevice[];
  positions: TelematicsPosition[];
  trips: TelematicsTrip[];
  alerts: TelematicsAlert[];
  geofences: TelematicsGeofence[];
  assignmentHistory: TelematicsDeviceAssignment[];
  adapters: TelematicsProviderAdapter[];
}
