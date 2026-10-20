// Connect Pro Fleet — Phase 8 row ↔ domain mappers: locations + staff +
// operational assignments + drivers.

import type { Location, Staff, Driver } from "../types";
import type {
  OperationalStaffAssignment,
  OperationalAssignmentType,
  AssignmentEntityType,
  AssignmentStatus,
} from "../staffTypes";
import type {
  LocationRow,
  StaffRow,
  OperationalStaffAssignmentRow,
  DriverRow,
} from "./dbTypesCore";

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export function rowToLocation(r: LocationRow): Location {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    address: r.address,
    phone: r.phone,
    timezone: r.timezone,
    is_default: r.is_default,
  };
}

export function locationToRow(l: Location): Partial<LocationRow> {
  return {
    id: l.id,
    organization_id: l.tenant_id,
    name: l.name,
    address: l.address,
    phone: l.phone,
    timezone: l.timezone,
    is_default: l.is_default ?? false,
  };
}

export function locationPatchToRow(
  patch: Partial<Location>,
): Partial<LocationRow> {
  const row: Partial<LocationRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.is_default !== undefined) row.is_default = patch.is_default;
  return row;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function rowToStaff(r: StaffRow): Staff {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    full_name: r.full_name,
    email: r.email,
    role: r.role as Staff["role"],
    permission_overrides:
      (r.permission_overrides as Record<string, unknown> | null) ?? null,
    created_at: r.created_at,
    phone: r.phone,
    display_role: (r.display_role as Staff["display_role"] | null) ?? undefined,
    role_id: r.role_id,
    location_ids: Array.isArray(r.location_ids)
      ? (r.location_ids as string[])
      : [],
    status: (r.status as Staff["status"] | undefined) ?? undefined,
    last_activity_at: r.last_activity_at,
    theme: (r.theme as Staff["theme"] | undefined) ?? undefined,
    brand_color: r.brand_color,
    responsibilities: Array.isArray(r.responsibilities)
      ? (r.responsibilities as string[])
      : [],
  };
}

export function staffToRow(s: Staff): Partial<StaffRow> {
  return {
    id: s.id,
    organization_id: s.tenant_id,
    full_name: s.full_name,
    email: s.email,
    role: s.role,
    permission_overrides: (s.permission_overrides ??
      null) as StaffRow["permission_overrides"],
    phone: s.phone ?? null,
    display_role: s.display_role ?? null,
    role_id: s.role_id ?? null,
    location_ids: (s.location_ids ?? []) as StaffRow["location_ids"],
    status: s.status ?? "active",
    last_activity_at: s.last_activity_at ?? null,
    theme: s.theme ?? "system",
    brand_color: s.brand_color ?? null,
    responsibilities: (s.responsibilities ??
      []) as StaffRow["responsibilities"],
  };
}

export function staffPatchToRow(patch: Partial<Staff>): Partial<StaffRow> {
  const row: Partial<StaffRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.full_name !== undefined) row.full_name = patch.full_name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.permission_overrides !== undefined)
    row.permission_overrides =
      patch.permission_overrides as StaffRow["permission_overrides"];
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.display_role !== undefined) row.display_role = patch.display_role;
  if (patch.role_id !== undefined) row.role_id = patch.role_id;
  if (patch.location_ids !== undefined)
    row.location_ids = patch.location_ids as StaffRow["location_ids"];
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.last_activity_at !== undefined)
    row.last_activity_at = patch.last_activity_at;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.brand_color !== undefined) row.brand_color = patch.brand_color;
  if (patch.responsibilities !== undefined)
    row.responsibilities =
      patch.responsibilities as StaffRow["responsibilities"];
  return row;
}

// ---------------------------------------------------------------------------
// Operational staff assignments
// ---------------------------------------------------------------------------

export function rowToOperationalStaffAssignment(
  r: OperationalStaffAssignmentRow,
): OperationalStaffAssignment {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    staff_id: r.staff_id,
    assignment_type: r.assignment_type as OperationalAssignmentType,
    entity_type: r.entity_type as AssignmentEntityType,
    entity_id: r.entity_id,
    entity_label: r.entity_label,
    status: r.status as AssignmentStatus,
    assigned_by: r.assigned_by,
    assigned_at: r.assigned_at,
    due_at: r.due_at,
    priority: r.priority as OperationalStaffAssignment["priority"],
    notes: r.notes,
    completed_at: r.completed_at,
    reassigned_to: r.reassigned_to,
    reassign_reason: r.reassign_reason,
  };
}

export function operationalStaffAssignmentToRow(
  a: OperationalStaffAssignment,
): Partial<OperationalStaffAssignmentRow> {
  return {
    id: a.id,
    organization_id: a.tenant_id,
    staff_id: a.staff_id,
    assignment_type: a.assignment_type,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    entity_label: a.entity_label,
    status: a.status,
    assigned_by: a.assigned_by,
    assigned_at: a.assigned_at,
    due_at: a.due_at,
    priority: a.priority,
    notes: a.notes,
    completed_at: a.completed_at,
    reassigned_to: a.reassigned_to,
    reassign_reason: a.reassign_reason,
  };
}

export function operationalStaffAssignmentPatchToRow(
  patch: Partial<OperationalStaffAssignment>,
): Partial<OperationalStaffAssignmentRow> {
  const row: Partial<OperationalStaffAssignmentRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.staff_id !== undefined) row.staff_id = patch.staff_id;
  if (patch.assignment_type !== undefined)
    row.assignment_type = patch.assignment_type;
  if (patch.entity_type !== undefined) row.entity_type = patch.entity_type;
  if (patch.entity_id !== undefined) row.entity_id = patch.entity_id;
  if (patch.entity_label !== undefined) row.entity_label = patch.entity_label;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.assigned_by !== undefined) row.assigned_by = patch.assigned_by;
  if (patch.assigned_at !== undefined) row.assigned_at = patch.assigned_at;
  if (patch.due_at !== undefined) row.due_at = patch.due_at;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.completed_at !== undefined) row.completed_at = patch.completed_at;
  if (patch.reassigned_to !== undefined)
    row.reassigned_to = patch.reassigned_to;
  if (patch.reassign_reason !== undefined)
    row.reassign_reason = patch.reassign_reason;
  return row;
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export function rowToDriver(r: DriverRow): Driver {
  return {
    id: r.id,
    reservation_id: r.reservation_id ?? "",
    full_name: r.full_name,
    license_number: r.license_number,
    license_state: r.license_state,
    license_expiry: r.license_expiry ?? "",
    verification_status: r.verification_status as Driver["verification_status"],
    tenant_id: r.organization_id,
  };
}

export function driverToRow(d: Driver): Partial<DriverRow> {
  return {
    id: d.id,
    organization_id: d.tenant_id,
    reservation_id: d.reservation_id || null,
    full_name: d.full_name,
    license_number: d.license_number,
    license_state: d.license_state,
    license_expiry: d.license_expiry || null,
    verification_status: d.verification_status,
  };
}

export function driverPatchToRow(patch: Partial<Driver>): Partial<DriverRow> {
  const row: Partial<DriverRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.reservation_id !== undefined)
    row.reservation_id = patch.reservation_id || null;
  if (patch.full_name !== undefined) row.full_name = patch.full_name;
  if (patch.license_number !== undefined)
    row.license_number = patch.license_number;
  if (patch.license_state !== undefined)
    row.license_state = patch.license_state;
  if (patch.license_expiry !== undefined)
    row.license_expiry = patch.license_expiry || null;
  if (patch.verification_status !== undefined)
    row.verification_status = patch.verification_status;
  return row;
}
