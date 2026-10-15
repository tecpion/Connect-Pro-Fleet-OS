// Connect Pro Fleet — seed: representative staff + custom roles (Build #24).
// Extends the core 3 staff (Owner, Manager, CSR) with realistic operational
// roles so the Staff Center has representative data: Fleet Manager, Bookkeeper,
// Damage Coordinator. Custom roles are seeded from ROLE_PRESETS so the role
// builder demonstrates editable custom roles alongside system roles.

import type { Role, Staff } from "../types";
import { SYSTEM_ROLE_PERMISSIONS } from "../permissions";
import { ROLE_PRESETS } from "../staffTypes";
import { TENANT_ID } from "./ids";

export const customRoles: Role[] = ROLE_PRESETS.map((p, i) => {
  const all: Record<string, boolean> = {};
  for (const k of Object.keys(SYSTEM_ROLE_PERMISSIONS.owner)) all[k] = false;
  for (const k of p.permissions) all[k] = true;
  return {
    id: `role_${p.id}`,
    tenant_id: TENANT_ID,
    name: p.name,
    description: p.description,
    is_system: false,
    is_protected: false,
    active: true,
    permissions: all,
    created_at: `2024-0${i + 5}-01T09:00:00Z`,
  };
});

export const additionalStaff: Staff[] = [
  {
    id: "stf_4",
    tenant_id: TENANT_ID,
    full_name: "Sarah Chen",
    email: "sarah@connectpro.fleet",
    role: "custom",
    permission_overrides: null,
    created_at: "2024-05-01T09:00:00Z",
    phone: "+1 305 555 0103",
    display_role: "custom",
    role_id: "role_preset_csr",
    location_ids: ["loc_1"],
    status: "active",
    last_activity_at: "2026-08-24T10:15:00Z",
    theme: "light",
    responsibilities: ["customer_service", "reservations", "collections"],
  },
  {
    id: "stf_5",
    tenant_id: TENANT_ID,
    full_name: "Marcus Webb",
    email: "mwebb@connectpro.fleet",
    role: "custom",
    permission_overrides: null,
    created_at: "2024-06-12T09:00:00Z",
    phone: "+1 305 555 0104",
    display_role: "custom",
    role_id: "role_preset_fleet_manager",
    location_ids: ["loc_1", "loc_2"],
    status: "active",
    last_activity_at: "2026-08-23T14:30:00Z",
    theme: "system",
    responsibilities: ["fleet_operations", "maintenance", "damage_claims"],
  },
  {
    id: "stf_6",
    tenant_id: TENANT_ID,
    full_name: "Priya Nair",
    email: "priya@connectpro.fleet",
    role: "custom",
    permission_overrides: null,
    created_at: "2024-07-01T09:00:00Z",
    phone: "+1 305 555 0105",
    display_role: "custom",
    role_id: "role_preset_bookkeeper",
    location_ids: [],
    status: "active",
    last_activity_at: "2026-08-22T16:00:00Z",
    theme: "light",
    responsibilities: ["expenses", "banking", "reports"],
  },
  {
    id: "stf_7",
    tenant_id: TENANT_ID,
    full_name: "Jordan Park",
    email: "jordan@connectpro.fleet",
    role: "custom",
    permission_overrides: null,
    created_at: "2024-08-15T09:00:00Z",
    phone: "+1 305 555 0106",
    display_role: "custom",
    role_id: "role_preset_damage_coordinator",
    location_ids: ["loc_2"],
    status: "invited",
    last_activity_at: null,
    theme: "system",
    responsibilities: ["damage_claims", "fleet_operations"],
  },
];
