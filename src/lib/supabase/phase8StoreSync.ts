// Connect Pro Fleet — Phase 8 Cloud store hydration + persistence sync
// (Locations + Staff/Assignments/Drivers + Tasks + Notifications +
//  Company Settings + Vehicle Classes/Pricing + Add-ons).
//
// Bridges the frozen in-memory StoreProvider to the Phase 8 Cloud repository
// layer WITHOUT changing the synchronous `useStore()` API. The store keeps its
// useState arrays as the UI cache; this module hydrates them from Cloud on
// auth/org change and persists mutations through the repository abstraction
// (UI → store method → repository → Cloud).
//
// Frozen semantics preserved:
// - CompanyInfo.timezone remains authoritative (Phase 6); never replaced with
//   browser/server timezone. Hydration restores the org timezone verbatim.
// - Task due-today/overdue logic is untouched; due_date is a date-only string
//   with no timezone shift.
// - One authoritative company_settings row per organization (upsert on
//   organization_id) — repeated updates never accumulate duplicate rows.
// - Repeated hydration replaces the cache with Cloud-authoritative state
//   (idempotent — no duplicates) and ignores stale async responses after an
//   org switch.
//
// In memory mode (no Cloud config) every function is a no-op so the existing
// seeded demo experience is unchanged.

import type { Location, Staff, Driver } from "../types";
import type { OperationalStaffAssignment } from "../staffTypes";
import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "../notificationTypes";
import type {
  CompanyInfo,
  VehicleClass,
  AddonCatalogItem,
  AddonCategory,
} from "../settingsTypes";
import type { CompanyPolicies } from "../companyPolicyTypes";
import type { AgreementRules } from "../settingsTypes";
import type { TaxRule, FeeRule } from "../taxFeeTypes";
import { getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type {
  LocationsRepository,
  StaffAssignmentsRepository,
  TasksRepository,
  NotificationsRepository,
  CompanySettingsRepository,
  VehicleClassesRepository,
  AddonsRepository,
} from "./repository";
import type { CompanySettingsConfig } from "./phase8Mappers";

export interface Phase8Repositories {
  locations: LocationsRepository | null;
  staffAssignments: StaffAssignmentsRepository | null;
  tasks: TasksRepository | null;
  notifications: NotificationsRepository | null;
  companySettings: CompanySettingsRepository | null;
  vehicleClasses: VehicleClassesRepository | null;
  addons: AddonsRepository | null;
}

function repos(): Phase8Repositories | null {
  if (getBackendMode() !== "supabase") return null;
  const r = createRepositories();
  return {
    locations: r.locations,
    staffAssignments: r.staffAssignments,
    tasks: r.tasks,
    notifications: r.notifications,
    companySettings: r.companySettings,
    vehicleClasses: r.vehicleClasses,
    addons: r.addons,
  };
}

// ── Hydration handles ──────────────────────────────────────────────────────
// Each setter accepts a functional updater (prev => next) so hydration can
// replace the cache atomically while preserving the React state contract.

export interface Phase8SyncHandles {
  setLocations: (updater: (prev: Location[]) => Location[]) => void;
  setStaff: (updater: (prev: Staff[]) => Staff[]) => void;
  /** Operational staff assignments live in the standalone
   *  StaffAssignmentProvider (its own useState), separate from the legacy
   *  reservation-slot StaffAssignment[] in the core store. Optional so the
   *  core StoreProvider — which only owns the legacy slot assignments — can
   *  hydrate the other Phase 8 slices without a type clash. */
  setAssignments?: (
    updater: (
      prev: OperationalStaffAssignment[],
    ) => OperationalStaffAssignment[],
  ) => void;
  setDrivers: (updater: (prev: Driver[]) => Driver[]) => void;
  setTasks: (updater: (prev: Task[]) => Task[]) => void;
  setTaskEvents: (updater: (prev: TaskEvent[]) => TaskEvent[]) => void;
  setTaskNotes: (updater: (prev: TaskNote[]) => TaskNote[]) => void;
  setNotifications: (updater: (prev: Notification[]) => Notification[]) => void;
  setNotificationDeliveries: (
    updater: (prev: NotificationDelivery[]) => NotificationDelivery[],
  ) => void;
  setNotificationPreferences: (
    updater: (prev: NotificationPreference[]) => NotificationPreference[],
  ) => void;
  setCompanyInfo: (updater: (prev: CompanyInfo) => CompanyInfo) => void;
  setVehicleClasses: (
    updater: (prev: VehicleClass[]) => VehicleClass[],
  ) => void;
  setAddonCategories: (
    updater: (prev: AddonCategory[]) => AddonCategory[],
  ) => void;
  setAddonCatalog: (
    updater: (prev: AddonCatalogItem[]) => AddonCatalogItem[],
  ) => void;
  /** Apply hydrated structured config (policies/agreementRules/taxRules/
   *  feeRules). Optional — only invoked when Cloud returns a settings row. */
  applySettingsConfig?: (cfg: CompanySettingsConfig) => void;
}

/** Hydrate all Phase 8 slices from Cloud into the store cache. Returns true
 *  when Cloud mode is active and hydration ran. Each domain is hydrated
 *  independently so a failure in one does not corrupt another's valid cache.
 *  Company settings hydration restores the authoritative org timezone. */
export async function hydratePhase8Slices(
  orgId: string,
  handles: Phase8SyncHandles,
  repositories?: Phase8Repositories | null,
): Promise<boolean> {
  const r = repositories ?? repos();
  if (!r) return false;

  // Locations
  if (r.locations) {
    try {
      const locations = await r.locations.list(orgId);
      handles.setLocations(() => locations);
    } catch (e) {
      console.error("[phase8Sync] locations hydration failed", e);
    }
  }

  // Staff + assignments + drivers
  if (r.staffAssignments) {
    try {
      const [staff, assignments, drivers] = await Promise.all([
        r.staffAssignments.listStaff(orgId),
        r.staffAssignments.listAssignments(orgId),
        r.staffAssignments.listDrivers(orgId),
      ]);
      handles.setStaff(() => staff);
      // Operational assignments are owned by StaffAssignmentProvider; only
      // apply them when the caller wired a setter for them.
      if (handles.setAssignments) handles.setAssignments(() => assignments);
      handles.setDrivers(() => drivers);
    } catch (e) {
      console.error(
        "[phase8Sync] staff/assignments/drivers hydration failed",
        e,
      );
    }
  }

  // Tasks + events + notes
  if (r.tasks) {
    try {
      const tasks = await r.tasks.list(orgId);
      // Events + notes are scoped per-task; hydrate across each task
      // preserving order. This keeps the task + events + notes relationship
      // intact without collapsing them.
      const events: TaskEvent[] = [];
      const notes: TaskNote[] = [];
      for (const t of tasks) {
        const [evs, nos] = await Promise.all([
          r.tasks.listTaskEvents(orgId, t.id),
          r.tasks.listTaskNotes(orgId, t.id),
        ]);
        events.push(...evs);
        notes.push(...nos);
      }
      handles.setTasks(() => tasks);
      handles.setTaskEvents(() => events);
      handles.setTaskNotes(() => notes);
    } catch (e) {
      console.error("[phase8Sync] tasks hydration failed", e);
    }
  }

  // Notifications + deliveries + preferences (internal state only)
  if (r.notifications) {
    try {
      const [notifications, deliveries, preferences] = await Promise.all([
        r.notifications.list(orgId),
        r.notifications.listDeliveries(orgId),
        r.notifications.listPreferences(orgId),
      ]);
      handles.setNotifications(() => notifications);
      handles.setNotificationDeliveries(() => deliveries);
      handles.setNotificationPreferences(() => preferences);
    } catch (e) {
      console.error("[phase8Sync] notifications hydration failed", e);
    }
  }

  // Company settings — one authoritative record per org. Restores the
  // authoritative org timezone (Phase 6) verbatim; never falls back to
  // browser/server timezone when a Cloud row exists.
  if (r.companySettings) {
    try {
      const got = await r.companySettings.get(orgId);
      if (got) {
        handles.setCompanyInfo(() => got.companyInfo);
        if (handles.applySettingsConfig) {
          handles.applySettingsConfig(got.settingsConfig);
        }
      }
      // When no row exists, leave the seeded companyInfo in place — the
      // first settings mutation will upsert the authoritative row.
    } catch (e) {
      console.error("[phase8Sync] company settings hydration failed", e);
    }
  }

  // Vehicle classes / pricing
  if (r.vehicleClasses) {
    try {
      const classes = await r.vehicleClasses.list(orgId);
      handles.setVehicleClasses(() => classes);
    } catch (e) {
      console.error("[phase8Sync] vehicle classes hydration failed", e);
    }
  }

  // Add-ons (categories + catalog items)
  if (r.addons) {
    try {
      const [categories, items] = await Promise.all([
        r.addons.listCategories(orgId),
        r.addons.listItems(orgId),
      ]);
      handles.setAddonCategories(() => categories);
      handles.setAddonCatalog(() => items);
    } catch (e) {
      console.error("[phase8Sync] addons hydration failed", e);
    }
  }

  return true;
}

// ── Locations persistence ───────────────────────────────────────────────────

export function persistLocationInsert(l: Location): void {
  const r = repos();
  if (!r?.locations) return;
  void r.locations
    .insert(l)
    .catch((e) => console.error("[phase8Sync] location insert failed", e));
}

export function persistLocationUpdate(
  orgId: string,
  id: string,
  patch: Partial<Location>,
): void {
  const r = repos();
  if (!r?.locations) return;
  void r.locations
    .update(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] location update failed", e));
}

// ── Staff persistence ───────────────────────────────────────────────────────

export function persistStaffInsert(s: Staff): void {
  const r = repos();
  if (!r?.staffAssignments) return;
  void r.staffAssignments
    .insertStaff(s)
    .catch((e) => console.error("[phase8Sync] staff insert failed", e));
}

export function persistStaffUpdate(
  orgId: string,
  id: string,
  patch: Partial<Staff>,
): void {
  const r = repos();
  if (!r?.staffAssignments) return;
  void r.staffAssignments
    .updateStaff(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] staff update failed", e));
}

// ── Operational assignments persistence ─────────────────────────────────────

export function persistAssignmentInsert(a: OperationalStaffAssignment): void {
  const r = repos();
  if (!r?.staffAssignments) return;
  void r.staffAssignments
    .insertAssignment(a)
    .catch((e) => console.error("[phase8Sync] assignment insert failed", e));
}

export function persistAssignmentUpdate(
  orgId: string,
  id: string,
  patch: Partial<OperationalStaffAssignment>,
): void {
  const r = repos();
  if (!r?.staffAssignments) return;
  void r.staffAssignments
    .updateAssignment(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] assignment update failed", e));
}

// ── Drivers persistence ─────────────────────────────────────────────────────

export function persistDriverInsert(d: Driver): void {
  const r = repos();
  if (!r?.staffAssignments) return;
  void r.staffAssignments
    .insertDriver(d)
    .catch((e) => console.error("[phase8Sync] driver insert failed", e));
}

export function persistDriverUpdate(
  orgId: string,
  id: string,
  patch: Partial<Driver>,
): void {
  const r = repos();
  if (!r?.staffAssignments) return;
  void r.staffAssignments
    .updateDriver(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] driver update failed", e));
}

// ── Tasks persistence ───────────────────────────────────────────────────────

export function persistTaskInsert(t: Task): void {
  const r = repos();
  if (!r?.tasks) return;
  void r.tasks
    .insert(t)
    .catch((e) => console.error("[phase8Sync] task insert failed", e));
}

export function persistTaskUpdate(
  orgId: string,
  id: string,
  patch: Partial<Task>,
): void {
  const r = repos();
  if (!r?.tasks) return;
  void r.tasks
    .update(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] task update failed", e));
}

export function persistTaskEventInsert(e: TaskEvent): void {
  const r = repos();
  if (!r?.tasks) return;
  void r.tasks
    .insertTaskEvent(e)
    .catch((err) =>
      console.error("[phase8Sync] task event insert failed", err),
    );
}

export function persistTaskNoteInsert(n: TaskNote): void {
  const r = repos();
  if (!r?.tasks) return;
  void r.tasks
    .insertTaskNote(n)
    .catch((err) => console.error("[phase8Sync] task note insert failed", err));
}

// ── Notifications persistence (internal state only) ─────────────────────────

export function persistNotificationInsert(n: Notification): void {
  const r = repos();
  if (!r?.notifications) return;
  void r.notifications
    .insert(n)
    .catch((e) => console.error("[phase8Sync] notification insert failed", e));
}

export function persistNotificationUpdate(
  orgId: string,
  id: string,
  patch: Partial<Notification>,
): void {
  const r = repos();
  if (!r?.notifications) return;
  void r.notifications
    .update(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] notification update failed", e));
}

export function persistNotificationDeliveryInsert(
  d: NotificationDelivery,
): void {
  const r = repos();
  if (!r?.notifications) return;
  void r.notifications
    .insertDelivery(d)
    .catch((e) =>
      console.error("[phase8Sync] notification delivery insert failed", e),
    );
}

export function persistNotificationPreferenceUpsert(
  p: NotificationPreference,
): void {
  const r = repos();
  if (!r?.notifications) return;
  void r.notifications
    .upsertPreference(p)
    .catch((e) =>
      console.error("[phase8Sync] notification preference upsert failed", e),
    );
}

// ── Company settings persistence ────────────────────────────────────────────
// One authoritative record per organization. Upsert on organization_id so
// repeated updates hit the same row — never multiple settings rows.

export function persistCompanySettings(
  orgId: string,
  companyInfo: CompanyInfo,
  settingsConfig: CompanySettingsConfig,
): void {
  const r = repos();
  if (!r?.companySettings) return;
  void r.companySettings
    .upsert(orgId, companyInfo, settingsConfig)
    .catch((e) =>
      console.error("[phase8Sync] company settings upsert failed", e),
    );
}

// ── Vehicle classes / pricing persistence ───────────────────────────────────

export function persistVehicleClassInsert(c: VehicleClass): void {
  const r = repos();
  if (!r?.vehicleClasses) return;
  void r.vehicleClasses
    .insert(c)
    .catch((e) => console.error("[phase8Sync] vehicle class insert failed", e));
}

export function persistVehicleClassUpdate(
  orgId: string,
  id: string,
  patch: Partial<VehicleClass>,
): void {
  const r = repos();
  if (!r?.vehicleClasses) return;
  void r.vehicleClasses
    .update(orgId, id, patch)
    .catch((e) => console.error("[phase8Sync] vehicle class update failed", e));
}

// ── Add-ons persistence ─────────────────────────────────────────────────────

export function persistAddonCategoryInsert(c: AddonCategory): void {
  const r = repos();
  if (!r?.addons) return;
  void r.addons
    .insertCategory(c)
    .catch((e) =>
      console.error("[phase8Sync] addon category insert failed", e),
    );
}

export function persistAddonCategoryUpdate(
  orgId: string,
  id: string,
  patch: Partial<AddonCategory>,
): void {
  const r = repos();
  if (!r?.addons) return;
  void r.addons
    .updateCategory(orgId, id, patch)
    .catch((e) =>
      console.error("[phase8Sync] addon category update failed", e),
    );
}

export function persistAddonCatalogItemInsert(a: AddonCatalogItem): void {
  const r = repos();
  if (!r?.addons) return;
  void r.addons
    .insertItem(a)
    .catch((e) =>
      console.error("[phase8Sync] addon catalog item insert failed", e),
    );
}

export function persistAddonCatalogItemUpdate(
  orgId: string,
  id: string,
  patch: Partial<AddonCatalogItem>,
): void {
  const r = repos();
  if (!r?.addons) return;
  void r.addons
    .updateItem(orgId, id, patch)
    .catch((e) =>
      console.error("[phase8Sync] addon catalog item update failed", e),
    );
}

// Re-export the structured config type for store wiring.
export type {
  CompanySettingsConfig,
  CompanyPolicies,
  AgreementRules,
  TaxRule,
  FeeRule,
};
