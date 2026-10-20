// Connect Pro Fleet — Phase 8 repository adapters: tasks + notifications +
// company settings + vehicle classes (pricing) + add-ons.
//
// Concrete repository implementations backed by the typed Supabase client.
// Each delegates to the row/domain mappers and normalizes errors. Used only
// when Supabase is configured; in memory mode the factory returns nulls.
//
// Architectural rule preserved: no component/page calls .from(table) directly.
// Every organization query is scoped by organization_id and relies on RLS
// (is_org_member) as the final authority.

import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "../notificationTypes";
import type { CompanyInfo } from "../settingsTypes";
import type {
  VehicleClass,
  AddonCatalogItem,
  AddonCategory,
} from "../settingsTypes";
import type { getSupabase } from "./client";
import { normalizeError } from "./repository";
import {
  rowToTask,
  taskToRow,
  taskPatchToRow,
  rowToTaskEvent,
  taskEventToRow,
  rowToTaskNote,
  taskNoteToRow,
  rowToNotification,
  notificationToRow,
  notificationPatchToRow,
  rowToNotificationDelivery,
  notificationDeliveryToRow,
  rowToNotificationPreference,
  notificationPreferenceToRow,
  rowToCompanySettings,
  companySettingsToRow,
  type CompanySettingsConfig,
  rowToVehicleClass,
  vehicleClassToRow,
  vehicleClassPatchToRow,
  rowToAddonCategory,
  addonCategoryToRow,
  addonCategoryPatchToRow,
  rowToAddonCatalogItem,
  addonCatalogItemToRow,
  addonCatalogItemPatchToRow,
} from "./phase8Mappers";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

// ── Tasks Repository ──────────────────────────────────────────────
// Preserves the task + task_events + task_notes relationship without
// collapsing them. No business-rule changes to overdue/due-today.

export interface TasksRepository {
  list(orgId: string): Promise<Task[]>;
  get(orgId: string, id: string): Promise<Task | null>;
  insert(t: Task): Promise<Task>;
  update(orgId: string, id: string, patch: Partial<Task>): Promise<Task>;

  listTaskEvents(orgId: string, taskId: string): Promise<TaskEvent[]>;
  insertTaskEvent(e: TaskEvent): Promise<TaskEvent>;
  listTaskNotes(orgId: string, taskId: string): Promise<TaskNote[]>;
  insertTaskNote(n: TaskNote): Promise<TaskNote>;
}

export class SupabaseTasksRepository implements TasksRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<Task[]> {
    const { data, error } = await this.db
      .from("tasks")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToTask);
  }

  async get(orgId: string, id: string): Promise<Task | null> {
    const { data, error } = await this.db
      .from("tasks")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToTask(data) : null;
  }

  async insert(t: Task): Promise<Task> {
    const { data, error } = await this.db
      .from("tasks")
      .insert(taskToRow(t))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTask(data);
  }

  async update(orgId: string, id: string, patch: Partial<Task>): Promise<Task> {
    const { data, error } = await this.db
      .from("tasks")
      .update(taskPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTask(data);
  }

  async listTaskEvents(orgId: string, taskId: string): Promise<TaskEvent[]> {
    const { data, error } = await this.db
      .from("task_events")
      .select("*")
      .eq("organization_id", orgId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToTaskEvent);
  }

  async insertTaskEvent(e: TaskEvent): Promise<TaskEvent> {
    const { data, error } = await this.db
      .from("task_events")
      .insert(taskEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTaskEvent(data);
  }

  async listTaskNotes(orgId: string, taskId: string): Promise<TaskNote[]> {
    const { data, error } = await this.db
      .from("task_notes")
      .select("*")
      .eq("organization_id", orgId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToTaskNote);
  }

  async insertTaskNote(n: TaskNote): Promise<TaskNote> {
    const { data, error } = await this.db
      .from("task_notes")
      .insert(taskNoteToRow(n))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTaskNote(data);
  }
}

// ── Notifications Repository ───────────────────────────────────────
// Internal notification state persistence only. No external SMS/email
// delivery — deliveries here are internal delivery records.

export interface NotificationsRepository {
  list(orgId: string): Promise<Notification[]>;
  get(orgId: string, id: string): Promise<Notification | null>;
  insert(n: Notification): Promise<Notification>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Notification>,
  ): Promise<Notification>;
  findByDedupeKey(
    orgId: string,
    dedupeKey: string,
  ): Promise<Notification | null>;

  listDeliveries(orgId: string): Promise<NotificationDelivery[]>;
  insertDelivery(d: NotificationDelivery): Promise<NotificationDelivery>;
  listPreferences(orgId: string): Promise<NotificationPreference[]>;
  upsertPreference(p: NotificationPreference): Promise<NotificationPreference>;
}

export class SupabaseNotificationsRepository implements NotificationsRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<Notification[]> {
    const { data, error } = await this.db
      .from("notifications")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToNotification);
  }

  async get(orgId: string, id: string): Promise<Notification | null> {
    const { data, error } = await this.db
      .from("notifications")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToNotification(data) : null;
  }

  async insert(n: Notification): Promise<Notification> {
    const { data, error } = await this.db
      .from("notifications")
      .insert(notificationToRow(n))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToNotification(data);
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<Notification>,
  ): Promise<Notification> {
    const { data, error } = await this.db
      .from("notifications")
      .update(notificationPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToNotification(data);
  }

  async findByDedupeKey(
    orgId: string,
    dedupeKey: string,
  ): Promise<Notification | null> {
    const { data, error } = await this.db
      .from("notifications")
      .select("*")
      .eq("organization_id", orgId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToNotification(data) : null;
  }

  async listDeliveries(orgId: string): Promise<NotificationDelivery[]> {
    const { data, error } = await this.db
      .from("notification_deliveries")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToNotificationDelivery);
  }

  async insertDelivery(d: NotificationDelivery): Promise<NotificationDelivery> {
    const { data, error } = await this.db
      .from("notification_deliveries")
      .insert(notificationDeliveryToRow(d))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToNotificationDelivery(data);
  }

  async listPreferences(orgId: string): Promise<NotificationPreference[]> {
    const { data, error } = await this.db
      .from("notification_preferences")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToNotificationPreference);
  }

  async upsertPreference(
    p: NotificationPreference,
  ): Promise<NotificationPreference> {
    const row = notificationPreferenceToRow(p);
    const { data, error } = await this.db
      .from("notification_preferences")
      .upsert(row, {
        onConflict: "organization_id,user_id,category",
      })
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToNotificationPreference(data);
  }
}

// ── Company Settings Repository ───────────────────────────────────
// One authoritative settings record per organization. Read → insert if
// absent → update/upsert the same row. CompanyInfo.timezone remains
// authoritative (Phase 6); never replaced with browser/server time.

export interface CompanySettingsRepository {
  get(orgId: string): Promise<{
    companyInfo: CompanyInfo;
    settingsConfig: CompanySettingsConfig;
  } | null>;
  upsert(
    orgId: string,
    companyInfo: CompanyInfo,
    settingsConfig: CompanySettingsConfig,
  ): Promise<{
    companyInfo: CompanyInfo;
    settingsConfig: CompanySettingsConfig;
  }>;
}

export class SupabaseCompanySettingsRepository implements CompanySettingsRepository {
  constructor(private db: Db) {}

  async get(orgId: string): Promise<{
    companyInfo: CompanyInfo;
    settingsConfig: CompanySettingsConfig;
  } | null> {
    const { data, error } = await this.db
      .from("company_settings")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw normalizeError(error);
    if (!data) return null;
    return rowToCompanySettings(data);
  }

  async upsert(
    orgId: string,
    companyInfo: CompanyInfo,
    settingsConfig: CompanySettingsConfig,
  ): Promise<{
    companyInfo: CompanyInfo;
    settingsConfig: CompanySettingsConfig;
  }> {
    const { data, error } = await this.db
      .from("company_settings")
      .upsert(companySettingsToRow(orgId, companyInfo, settingsConfig), {
        onConflict: "organization_id",
      })
      .select()
      .single();
    if (error) throw normalizeError(error);
    const parsed = rowToCompanySettings(data);
    if (!parsed)
      throw normalizeError(
        new Error("company_settings upsert returned no row"),
      );
    return parsed;
  }
}

// ── Vehicle Classes / Pricing Repository ──────────────────────────
// Preserves the frozen pricing/rate-plan model. Multiple configurable
// rental periods are supported by the existing minimum_rental_duration +
// minimum_rental_unit fields — not hard-coded to weekly.

export interface VehicleClassesRepository {
  list(orgId: string): Promise<VehicleClass[]>;
  get(orgId: string, id: string): Promise<VehicleClass | null>;
  insert(c: VehicleClass): Promise<VehicleClass>;
  update(
    orgId: string,
    id: string,
    patch: Partial<VehicleClass>,
  ): Promise<VehicleClass>;
  delete(orgId: string, id: string): Promise<void>;
}

export class SupabaseVehicleClassesRepository implements VehicleClassesRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<VehicleClass[]> {
    const { data, error } = await this.db
      .from("vehicle_classes")
      .select("*")
      .eq("organization_id", orgId)
      .order("display_order", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVehicleClass);
  }

  async get(orgId: string, id: string): Promise<VehicleClass | null> {
    const { data, error } = await this.db
      .from("vehicle_classes")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToVehicleClass(data) : null;
  }

  async insert(c: VehicleClass): Promise<VehicleClass> {
    const { data, error } = await this.db
      .from("vehicle_classes")
      .insert(vehicleClassToRow(c))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVehicleClass(data);
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<VehicleClass>,
  ): Promise<VehicleClass> {
    const { data, error } = await this.db
      .from("vehicle_classes")
      .update(vehicleClassPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVehicleClass(data);
  }

  async delete(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("vehicle_classes")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }
}

// ── Add-ons Repository ─────────────────────────────────────────────
// Rental add-on persistence only. No marketplace functionality.

export interface AddonsRepository {
  listCategories(orgId: string): Promise<AddonCategory[]>;
  insertCategory(c: AddonCategory): Promise<AddonCategory>;
  updateCategory(
    orgId: string,
    id: string,
    patch: Partial<AddonCategory>,
  ): Promise<AddonCategory>;
  deleteCategory(orgId: string, id: string): Promise<void>;

  listItems(orgId: string): Promise<AddonCatalogItem[]>;
  insertItem(a: AddonCatalogItem): Promise<AddonCatalogItem>;
  updateItem(
    orgId: string,
    id: string,
    patch: Partial<AddonCatalogItem>,
  ): Promise<AddonCatalogItem>;
  deleteItem(orgId: string, id: string): Promise<void>;
}

export class SupabaseAddonsRepository implements AddonsRepository {
  constructor(private db: Db) {}

  async listCategories(orgId: string): Promise<AddonCategory[]> {
    const { data, error } = await this.db
      .from("addon_categories")
      .select("*")
      .eq("organization_id", orgId)
      .order("display_order", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAddonCategory);
  }

  async insertCategory(c: AddonCategory): Promise<AddonCategory> {
    const { data, error } = await this.db
      .from("addon_categories")
      .insert(addonCategoryToRow(c))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAddonCategory(data);
  }

  async updateCategory(
    orgId: string,
    id: string,
    patch: Partial<AddonCategory>,
  ): Promise<AddonCategory> {
    const { data, error } = await this.db
      .from("addon_categories")
      .update(addonCategoryPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAddonCategory(data);
  }

  async deleteCategory(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("addon_categories")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }

  async listItems(orgId: string): Promise<AddonCatalogItem[]> {
    const { data, error } = await this.db
      .from("addon_catalog_items")
      .select("*")
      .eq("organization_id", orgId)
      .order("display_order", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAddonCatalogItem);
  }

  async insertItem(a: AddonCatalogItem): Promise<AddonCatalogItem> {
    const { data, error } = await this.db
      .from("addon_catalog_items")
      .insert(addonCatalogItemToRow(a))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAddonCatalogItem(data);
  }

  async updateItem(
    orgId: string,
    id: string,
    patch: Partial<AddonCatalogItem>,
  ): Promise<AddonCatalogItem> {
    const { data, error } = await this.db
      .from("addon_catalog_items")
      .update(addonCatalogItemPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAddonCatalogItem(data);
  }

  async deleteItem(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("addon_catalog_items")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }
}
