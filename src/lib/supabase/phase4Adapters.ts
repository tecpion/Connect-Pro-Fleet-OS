// Connect Pro Fleet — Phase 4 Supabase repository adapters:
// Telematics + Tolls/Violations + Case Center.
//
// Concrete implementations backed by the typed Supabase client. Each delegates
// to the row/domain mappers and normalizes errors. Used only when Cloud is
// configured; in memory mode the factory returns nulls.
//
// NOTE: Phase 4 tables are not yet in the generated Database type, so .from()
// on them resolves to `never`. We cast to a loose client that accepts any
// table name; the mappers still enforce row/domain fidelity at the boundary.

import type {
  TelematicsDevice,
  TelematicsDeviceAssignment,
  TelematicsPosition,
  TelematicsEvent,
  TelematicsTrip,
  TelematicsAlert,
  TelematicsGeofence,
} from "../telematicsTypes";
import type {
  Violation,
  ViolationEvidence,
  ViolationEvent,
} from "../violationTypes";
import type { CaseRecord, CaseEvent } from "../caseCenterTypes";
import type { getSupabase } from "./client";
import { normalizeError } from "./repository";
import {
  rowToDevice,
  deviceToRow,
  devicePatchToRow,
  rowToAssignment,
  assignmentToRow,
  rowToPosition,
  rowToTelematicsEvent,
  rowToTrip,
  rowToAlert,
  alertToRow,
  alertPatchToRow,
  rowToGeofence,
  geofenceToRow,
  rowToViolation,
  violationToRow,
  violationPatchToRow,
  rowToViolationEvidence,
  violationEvidenceToRow,
  rowToViolationEvent,
  violationEventToRow,
  rowToCase,
  caseToRow,
  casePatchToRow,
  rowToCaseEvent,
  caseEventToRow,
} from "./phase4Mappers";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

// Loose client: .from(anyTable) returns a chainable query builder typed as any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from(table: string): any };

function loose(db: Db): LooseClient {
  return db as unknown as LooseClient;
}

// ── Telematics ────────────────────────────────────────────────────

export interface TelematicsRepository {
  listDevices(orgId: string): Promise<TelematicsDevice[]>;
  insertDevice(d: TelematicsDevice): Promise<TelematicsDevice>;
  updateDevice(
    orgId: string,
    id: string,
    patch: Partial<TelematicsDevice>,
  ): Promise<TelematicsDevice>;
  listAssignments(orgId: string): Promise<TelematicsDeviceAssignment[]>;
  insertAssignment(
    a: TelematicsDeviceAssignment,
    orgId: string,
  ): Promise<TelematicsDeviceAssignment>;
  updateAssignment(
    orgId: string,
    id: string,
    patch: Partial<TelematicsDeviceAssignment>,
  ): Promise<TelematicsDeviceAssignment>;
  listPositions(orgId: string): Promise<TelematicsPosition[]>;
  insertPosition(
    p: TelematicsPosition,
    orgId: string,
  ): Promise<TelematicsPosition>;
  listEvents(orgId: string): Promise<TelematicsEvent[]>;
  insertEvent(e: TelematicsEvent): Promise<TelematicsEvent>;
  listTrips(orgId: string): Promise<TelematicsTrip[]>;
  insertTrip(t: TelematicsTrip): Promise<TelematicsTrip>;
  listAlerts(orgId: string): Promise<TelematicsAlert[]>;
  insertAlert(a: TelematicsAlert): Promise<TelematicsAlert>;
  updateAlert(
    orgId: string,
    id: string,
    patch: Partial<TelematicsAlert>,
  ): Promise<TelematicsAlert>;
  listGeofences(orgId: string): Promise<TelematicsGeofence[]>;
  insertGeofence(g: TelematicsGeofence): Promise<TelematicsGeofence>;
  updateGeofence(
    orgId: string,
    id: string,
    patch: Partial<TelematicsGeofence>,
  ): Promise<TelematicsGeofence>;
  deleteGeofence(orgId: string, id: string): Promise<void>;
}

export class SupabaseTelematicsRepository implements TelematicsRepository {
  private q: LooseClient;
  constructor(db: Db) {
    this.q = loose(db);
  }
  async listDevices(orgId: string): Promise<TelematicsDevice[]> {
    const { data, error } = await this.q
      .from("telematics_devices")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToDevice);
  }
  async insertDevice(d: TelematicsDevice): Promise<TelematicsDevice> {
    const { data, error } = await this.q
      .from("telematics_devices")
      .insert(deviceToRow(d))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToDevice(data);
  }
  async updateDevice(
    orgId: string,
    id: string,
    patch: Partial<TelematicsDevice>,
  ): Promise<TelematicsDevice> {
    const { data, error } = await this.q
      .from("telematics_devices")
      .update(devicePatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToDevice(data);
  }
  async listAssignments(orgId: string): Promise<TelematicsDeviceAssignment[]> {
    const { data, error } = await this.q
      .from("telematics_device_assignments")
      .select("*")
      .eq("organization_id", orgId)
      .order("started_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAssignment);
  }
  async insertAssignment(
    a: TelematicsDeviceAssignment,
    orgId: string,
  ): Promise<TelematicsDeviceAssignment> {
    const { data, error } = await this.q
      .from("telematics_device_assignments")
      .insert(assignmentToRow(a, orgId))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAssignment(data);
  }
  async updateAssignment(
    orgId: string,
    id: string,
    patch: Partial<TelematicsDeviceAssignment>,
  ): Promise<TelematicsDeviceAssignment> {
    const row: Record<string, unknown> = {};
    if (patch.ended_at !== undefined) row.ended_at = patch.ended_at;
    if (patch.reason !== undefined) row.reason = patch.reason;
    const { data, error } = await this.q
      .from("telematics_device_assignments")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAssignment(data);
  }
  async listPositions(orgId: string): Promise<TelematicsPosition[]> {
    const { data, error } = await this.q
      .from("telematics_positions")
      .select("*")
      .eq("organization_id", orgId)
      .order("recorded_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToPosition);
  }
  async insertPosition(
    p: TelematicsPosition,
    orgId: string,
  ): Promise<TelematicsPosition> {
    const row = {
      organization_id: orgId,
      device_id: p.device_id,
      vehicle_id: p.vehicle_id,
      latitude: p.latitude,
      longitude: p.longitude,
      recorded_at: p.recorded_at,
      provider_timestamp: p.provider_timestamp,
      heading: p.heading,
      speed: p.speed,
      ignition_status: p.ignition_status,
      odometer: p.odometer,
      battery_voltage: p.battery_voltage,
      gps_signal_status: p.gps_signal_status,
    };
    const { data, error } = await this.q
      .from("telematics_positions")
      .insert(row)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToPosition(data);
  }
  async listEvents(orgId: string): Promise<TelematicsEvent[]> {
    const { data, error } = await this.q
      .from("telematics_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToTelematicsEvent);
  }
  async insertEvent(e: TelematicsEvent): Promise<TelematicsEvent> {
    const row = {
      organization_id: e.organization_id,
      device_id: e.device_id,
      vehicle_id: e.vehicle_id,
      type: e.type,
      occurred_at: e.occurred_at,
      latitude: e.latitude,
      longitude: e.longitude,
      metadata: e.metadata as never,
    };
    const { data, error } = await this.q
      .from("telematics_events")
      .insert(row)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTelematicsEvent(data);
  }
  async listTrips(orgId: string): Promise<TelematicsTrip[]> {
    const { data, error } = await this.q
      .from("telematics_trips")
      .select("*")
      .eq("organization_id", orgId)
      .order("started_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToTrip);
  }
  async insertTrip(t: TelematicsTrip): Promise<TelematicsTrip> {
    const { data, error } = await this.q
      .from("telematics_trips")
      .insert({
        organization_id: t.organization_id,
        vehicle_id: t.vehicle_id,
        device_id: t.device_id,
        started_at: t.started_at,
        ended_at: t.ended_at,
        start_location: t.start_location,
        end_location: t.end_location,
        distance: t.distance,
        duration_minutes: t.duration_minutes,
        max_speed: t.max_speed,
        average_speed: t.average_speed,
        rental_id: t.rental_id,
      })
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTrip(data);
  }
  async listAlerts(orgId: string): Promise<TelematicsAlert[]> {
    const { data, error } = await this.q
      .from("telematics_alerts")
      .select("*")
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAlert);
  }
  async insertAlert(a: TelematicsAlert): Promise<TelematicsAlert> {
    const { data, error } = await this.q
      .from("telematics_alerts")
      .insert(alertToRow(a))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAlert(data);
  }
  async updateAlert(
    orgId: string,
    id: string,
    patch: Partial<TelematicsAlert>,
  ): Promise<TelematicsAlert> {
    const { data, error } = await this.q
      .from("telematics_alerts")
      .update(alertPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAlert(data);
  }
  async listGeofences(orgId: string): Promise<TelematicsGeofence[]> {
    const { data, error } = await this.q
      .from("telematics_geofences")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToGeofence);
  }
  async insertGeofence(g: TelematicsGeofence): Promise<TelematicsGeofence> {
    const { data, error } = await this.q
      .from("telematics_geofences")
      .insert(geofenceToRow(g))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToGeofence(data);
  }
  async updateGeofence(
    orgId: string,
    id: string,
    patch: Partial<TelematicsGeofence>,
  ): Promise<TelematicsGeofence> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.center_latitude !== undefined)
      row.center_latitude = patch.center_latitude;
    if (patch.center_longitude !== undefined)
      row.center_longitude = patch.center_longitude;
    if (patch.radius_meters !== undefined)
      row.radius_meters = patch.radius_meters;
    if (patch.applies_to_all !== undefined)
      row.applies_to_all = patch.applies_to_all;
    if (patch.applies_to_class_id !== undefined)
      row.applies_to_class_id = patch.applies_to_class_id;
    if (patch.applies_to_vehicle_ids !== undefined)
      row.applies_to_vehicle_ids = patch.applies_to_vehicle_ids as never;
    if (patch.alert_on_enter !== undefined)
      row.alert_on_enter = patch.alert_on_enter;
    if (patch.alert_on_exit !== undefined)
      row.alert_on_exit = patch.alert_on_exit;
    const { data, error } = await this.q
      .from("telematics_geofences")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToGeofence(data);
  }
  async deleteGeofence(orgId: string, id: string): Promise<void> {
    const { error } = await this.q
      .from("telematics_geofences")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }
}

// ── Violations ────────────────────────────────────────────────────

export interface ViolationRepository {
  list(orgId: string): Promise<Violation[]>;
  get(orgId: string, id: string): Promise<Violation | null>;
  insert(v: Violation): Promise<Violation>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Violation>,
  ): Promise<Violation>;
  findByExternalEventId(
    orgId: string,
    provider: string,
    externalEventId: string,
  ): Promise<Violation | null>;
  listEvidence(orgId: string): Promise<ViolationEvidence[]>;
  insertEvidence(e: ViolationEvidence): Promise<ViolationEvidence>;
  listEvents(orgId: string): Promise<ViolationEvent[]>;
  insertEvent(e: ViolationEvent): Promise<ViolationEvent>;
}

export class SupabaseViolationRepository implements ViolationRepository {
  private q: LooseClient;
  constructor(db: Db) {
    this.q = loose(db);
  }
  async list(orgId: string): Promise<Violation[]> {
    const { data, error } = await this.q
      .from("violations")
      .select("*")
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToViolation);
  }
  async get(orgId: string, id: string): Promise<Violation | null> {
    const { data, error } = await this.q
      .from("violations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToViolation(data) : null;
  }
  async insert(v: Violation): Promise<Violation> {
    const { data, error } = await this.q
      .from("violations")
      .insert(violationToRow(v))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToViolation(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<Violation>,
  ): Promise<Violation> {
    const { data, error } = await this.q
      .from("violations")
      .update(violationPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToViolation(data);
  }
  async findByExternalEventId(
    orgId: string,
    provider: string,
    externalEventId: string,
  ): Promise<Violation | null> {
    const { data, error } = await this.q
      .from("violations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", provider)
      .eq("external_event_id", externalEventId)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToViolation(data) : null;
  }
  async listEvidence(orgId: string): Promise<ViolationEvidence[]> {
    const { data, error } = await this.q
      .from("violation_evidence")
      .select("*")
      .eq("organization_id", orgId)
      .order("uploaded_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToViolationEvidence);
  }
  async insertEvidence(e: ViolationEvidence): Promise<ViolationEvidence> {
    const { data, error } = await this.q
      .from("violation_evidence")
      .insert(violationEvidenceToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToViolationEvidence(data);
  }
  async listEvents(orgId: string): Promise<ViolationEvent[]> {
    const { data, error } = await this.q
      .from("violation_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToViolationEvent);
  }
  async insertEvent(e: ViolationEvent): Promise<ViolationEvent> {
    const { data, error } = await this.q
      .from("violation_events")
      .insert(violationEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToViolationEvent(data);
  }
}

// ── Cases ─────────────────────────────────────────────────────────

export interface CaseRepository {
  list(orgId: string): Promise<CaseRecord[]>;
  get(orgId: string, id: string): Promise<CaseRecord | null>;
  insert(c: CaseRecord): Promise<CaseRecord>;
  update(
    orgId: string,
    id: string,
    patch: Partial<CaseRecord>,
  ): Promise<CaseRecord>;
  listEvents(orgId: string): Promise<CaseEvent[]>;
  insertEvent(e: CaseEvent): Promise<CaseEvent>;
}

export class SupabaseCaseRepository implements CaseRepository {
  private q: LooseClient;
  constructor(db: Db) {
    this.q = loose(db);
  }
  async list(orgId: string): Promise<CaseRecord[]> {
    const { data, error } = await this.q
      .from("cases")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToCase);
  }
  async get(orgId: string, id: string): Promise<CaseRecord | null> {
    const { data, error } = await this.q
      .from("cases")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToCase(data) : null;
  }
  async insert(c: CaseRecord): Promise<CaseRecord> {
    const { data, error } = await this.q
      .from("cases")
      .insert(caseToRow(c))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToCase(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<CaseRecord>,
  ): Promise<CaseRecord> {
    const { data, error } = await this.q
      .from("cases")
      .update(casePatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToCase(data);
  }
  async listEvents(orgId: string): Promise<CaseEvent[]> {
    const { data, error } = await this.q
      .from("case_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToCaseEvent);
  }
  async insertEvent(e: CaseEvent): Promise<CaseEvent> {
    const { data, error } = await this.q
      .from("case_events")
      .insert(caseEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToCaseEvent(data);
  }
}
