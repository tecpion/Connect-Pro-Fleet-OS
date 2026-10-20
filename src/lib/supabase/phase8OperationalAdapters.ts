// Connect Pro Fleet — Phase 8 repository adapters: locations + staff/
// assignments + drivers.
//
// Concrete repository implementations backed by the typed Supabase client.
// Each delegates to the row/domain mappers and normalizes errors. Used only
// when Supabase is configured; in memory mode the factory returns nulls.
//
// Architectural rule preserved: no component/page calls .from(table) directly.
// Every organization query is scoped by organization_id and relies on RLS
// (is_org_member) as the final authority.

import type { Location, Staff, Driver } from "../types";
import type { OperationalStaffAssignment } from "../staffTypes";
import type { getSupabase } from "./client";
import { normalizeError } from "./repository";
import {
  rowToLocation,
  locationToRow,
  locationPatchToRow,
  rowToStaff,
  staffToRow,
  staffPatchToRow,
  rowToOperationalStaffAssignment,
  operationalStaffAssignmentToRow,
  operationalStaffAssignmentPatchToRow,
  rowToDriver,
  driverToRow,
  driverPatchToRow,
} from "./phase8Mappers";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

// ── Locations Repository ──────────────────────────────────────────

export interface LocationsRepository {
  list(orgId: string): Promise<Location[]>;
  get(orgId: string, id: string): Promise<Location | null>;
  insert(l: Location): Promise<Location>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Location>,
  ): Promise<Location>;
  delete(orgId: string, id: string): Promise<void>;
}

export class SupabaseLocationsRepository implements LocationsRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<Location[]> {
    const { data, error } = await this.db
      .from("locations")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToLocation);
  }

  async get(orgId: string, id: string): Promise<Location | null> {
    const { data, error } = await this.db
      .from("locations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToLocation(data) : null;
  }

  async insert(l: Location): Promise<Location> {
    const { data, error } = await this.db
      .from("locations")
      .insert(locationToRow(l))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToLocation(data);
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<Location>,
  ): Promise<Location> {
    const { data, error } = await this.db
      .from("locations")
      .update(locationPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToLocation(data);
  }

  async delete(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("locations")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }
}

// ── Staff / Assignments / Drivers Repository ──────────────────────

export interface StaffAssignmentsRepository {
  listStaff(orgId: string): Promise<Staff[]>;
  getStaff(orgId: string, id: string): Promise<Staff | null>;
  insertStaff(s: Staff): Promise<Staff>;
  updateStaff(orgId: string, id: string, patch: Partial<Staff>): Promise<Staff>;
  deleteStaff(orgId: string, id: string): Promise<void>;

  listAssignments(orgId: string): Promise<OperationalStaffAssignment[]>;
  listAssignmentsForStaff(
    orgId: string,
    staffId: string,
  ): Promise<OperationalStaffAssignment[]>;
  listAssignmentsForEntity(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<OperationalStaffAssignment[]>;
  insertAssignment(
    a: OperationalStaffAssignment,
  ): Promise<OperationalStaffAssignment>;
  updateAssignment(
    orgId: string,
    id: string,
    patch: Partial<OperationalStaffAssignment>,
  ): Promise<OperationalStaffAssignment>;

  listDrivers(orgId: string): Promise<Driver[]>;
  listDriversForReservation(
    orgId: string,
    reservationId: string,
  ): Promise<Driver[]>;
  insertDriver(d: Driver): Promise<Driver>;
  updateDriver(
    orgId: string,
    id: string,
    patch: Partial<Driver>,
  ): Promise<Driver>;
  deleteDriver(orgId: string, id: string): Promise<void>;
}

export class SupabaseStaffAssignmentsRepository implements StaffAssignmentsRepository {
  constructor(private db: Db) {}

  async listStaff(orgId: string): Promise<Staff[]> {
    const { data, error } = await this.db
      .from("staff")
      .select("*")
      .eq("organization_id", orgId)
      .order("full_name", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToStaff);
  }

  async getStaff(orgId: string, id: string): Promise<Staff | null> {
    const { data, error } = await this.db
      .from("staff")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToStaff(data) : null;
  }

  async insertStaff(s: Staff): Promise<Staff> {
    const { data, error } = await this.db
      .from("staff")
      .insert(staffToRow(s))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToStaff(data);
  }

  async updateStaff(
    orgId: string,
    id: string,
    patch: Partial<Staff>,
  ): Promise<Staff> {
    const { data, error } = await this.db
      .from("staff")
      .update(staffPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToStaff(data);
  }

  async deleteStaff(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("staff")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }

  async listAssignments(orgId: string): Promise<OperationalStaffAssignment[]> {
    const { data, error } = await this.db
      .from("operational_staff_assignments")
      .select("*")
      .eq("organization_id", orgId)
      .order("assigned_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToOperationalStaffAssignment);
  }

  async listAssignmentsForStaff(
    orgId: string,
    staffId: string,
  ): Promise<OperationalStaffAssignment[]> {
    const { data, error } = await this.db
      .from("operational_staff_assignments")
      .select("*")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .order("assigned_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToOperationalStaffAssignment);
  }

  async listAssignmentsForEntity(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<OperationalStaffAssignment[]> {
    const { data, error } = await this.db
      .from("operational_staff_assignments")
      .select("*")
      .eq("organization_id", orgId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("assigned_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToOperationalStaffAssignment);
  }

  async insertAssignment(
    a: OperationalStaffAssignment,
  ): Promise<OperationalStaffAssignment> {
    const { data, error } = await this.db
      .from("operational_staff_assignments")
      .insert(operationalStaffAssignmentToRow(a))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToOperationalStaffAssignment(data);
  }

  async updateAssignment(
    orgId: string,
    id: string,
    patch: Partial<OperationalStaffAssignment>,
  ): Promise<OperationalStaffAssignment> {
    const { data, error } = await this.db
      .from("operational_staff_assignments")
      .update(operationalStaffAssignmentPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToOperationalStaffAssignment(data);
  }

  async listDrivers(orgId: string): Promise<Driver[]> {
    const { data, error } = await this.db
      .from("drivers")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToDriver);
  }

  async listDriversForReservation(
    orgId: string,
    reservationId: string,
  ): Promise<Driver[]> {
    const { data, error } = await this.db
      .from("drivers")
      .select("*")
      .eq("organization_id", orgId)
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToDriver);
  }

  async insertDriver(d: Driver): Promise<Driver> {
    const { data, error } = await this.db
      .from("drivers")
      .insert(driverToRow(d))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToDriver(data);
  }

  async updateDriver(
    orgId: string,
    id: string,
    patch: Partial<Driver>,
  ): Promise<Driver> {
    const { data, error } = await this.db
      .from("drivers")
      .update(driverPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToDriver(data);
  }

  async deleteDriver(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("drivers")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }
}
