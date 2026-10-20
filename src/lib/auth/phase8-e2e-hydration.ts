// Phase 8 E2E — relogin + Phase 8 hydration. Sign Org A out, create a fresh
// authenticated session, run the real hydratePhase8Slices path, and confirm the
// newly created Org A records restore correctly into the store cache.
// Also proves the Cloud-hydrated organization timezone continues to control
// existing Phase 6 business-calendar logic (no fallback to browser/server tz).

import {
  hydratePhase8Slices,
  type Phase8SyncHandles,
} from "@/lib/supabase/phase8StoreSync";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import { step, type Phase8Runtime } from "./phase8-e2e-runtime";
import type { Phase8Step } from "./phase8-e2e.server";

export interface Phase8HydrationResult {
  steps: Phase8Step[];
}

export async function runPhase8Hydration(
  runtime: Phase8Runtime,
): Promise<Phase8HydrationResult> {
  const steps: Phase8Step[] = [];
  const {
    a,
    orgA,
    emailA,
    password,
    locations,
    staffAssignments,
    tasks,
    notifications,
    companySettings,
    vehicleClasses,
    addons,
  } = runtime;

  // ── Fresh authenticated Org A session ────────────────────────────────────
  const reloginOk = await step(
    steps,
    "org_a_relogin_fresh_session",
    async () => {
      const out = await a.auth.signOut();
      if (out.error) throw out.error;
      const login = await a.auth.signInWithPassword({
        email: emailA,
        password,
      });
      if (login.error) throw login.error;
      return login.data.user?.id === runtime.userAId;
    },
  );
  if (!reloginOk) return { steps };

  // ── Run the real Phase 8 hydration path ─────────────────────────────────
  // Capture hydrated slices into a plain object so we can assert exactly what
  // the StoreProvider would restore after relogin. Pass the already-authenticated
  // Org A repositories explicitly so hydration uses them instead of re-deriving
  // via getBackendMode() (which reads browser env and is not "supabase" inside a
  // server route). This mirrors the Phase 5/7 hydration pattern.
  const cache: Record<string, unknown> = {};
  // Build a setter matching Phase8SyncHandles' functional-updater contract:
  //   (updater: (prev: T) => T) => void
  // We capture the updater result into `cache[key]` with prev = undefined so
  // hydration (which ignores prev and replaces the cache) lands here.
  const makeHandle = <T>(key: string) =>
    ((updater: (prev: T) => T) => {
      cache[key] = updater(undefined as T);
    }) as (updater: (prev: T) => T) => void;

  const handles: Phase8SyncHandles = {
    setLocations: makeHandle("locations"),
    setStaff: makeHandle("staff"),
    setDrivers: makeHandle("drivers"),
    setTasks: makeHandle("tasks"),
    setTaskEvents: makeHandle("taskEvents"),
    setTaskNotes: makeHandle("taskNotes"),
    setNotifications: makeHandle("notifications"),
    setNotificationDeliveries: makeHandle("notificationDeliveries"),
    setNotificationPreferences: makeHandle("notificationPreferences"),
    setCompanyInfo: makeHandle("companyInfo"),
    setVehicleClasses: makeHandle("vehicleClasses"),
    setAddonCategories: makeHandle("addonCategories"),
    setAddonCatalog: makeHandle("addonCatalog"),
    applySettingsConfig: (cfg) => {
      cache.settingsConfig = cfg;
    },
  };

  const repos = {
    locations,
    staffAssignments,
    tasks,
    notifications,
    companySettings,
    vehicleClasses,
    addons,
  };
  const ran = await hydratePhase8Slices(orgA, handles, repos);
  const hydrationRanOk = await step(
    steps,
    "phase8_hydration_ran",
    () => ran === true,
  );
  if (!hydrationRanOk) return { steps };

  // ── Confirm every Phase 8 domain restored correctly ──────────────────────
  const locs = (cache.locations ?? []) as { id: string; timezone: string }[];
  const staff = (cache.staff ?? []) as { id: string; status: string }[];
  const drivers = (cache.drivers ?? []) as { id: string }[];
  const tasksHyd = (cache.tasks ?? []) as { id: string; due_date: string }[];
  const evs = (cache.taskEvents ?? []) as { id: string; task_id: string }[];
  const nos = (cache.taskNotes ?? []) as { id: string; task_id: string }[];
  const notifs = (cache.notifications ?? []) as {
    id: string;
    read_at: string | null;
  }[];
  const dels = (cache.notificationDeliveries ?? []) as {
    id: string;
    notification_id: string;
  }[];
  const prefs = (cache.notificationPreferences ?? []) as {
    user_id: string;
    category: string;
    email_enabled: boolean;
  }[];
  const ci = cache.companyInfo as
    { timezone: string; legal_name: string } | undefined;
  const vcs = (cache.vehicleClasses ?? []) as {
    id: string;
    description: string;
    minimum_rental_unit: string;
    display_order: number;
  }[];
  const cats = (cache.addonCategories ?? []) as { id: string }[];
  const items = (cache.addonCatalog ?? []) as {
    id: string;
    category_id: string;
    pricing_type: string;
  }[];

  await step(
    steps,
    "locations_hydrated",
    () =>
      locs.length === 1 &&
      locs[0].id === runtime.recordIds.location &&
      locs[0].timezone === "America/New_York",
  );
  await step(
    steps,
    "staff_hydrated",
    () =>
      staff.length === 1 &&
      staff[0].id === runtime.recordIds.staff &&
      staff[0].status === "active",
  );
  await step(steps, "drivers_hydrated", () =>
    drivers.some((d) => d.id === runtime.recordIds.driver),
  );
  await step(
    steps,
    "tasks_hydrated",
    () =>
      tasksHyd.length === 1 &&
      tasksHyd[0].id === runtime.recordIds.task &&
      tasksHyd[0].due_date === runtime.date,
  );
  await step(
    steps,
    "task_events_hydrated",
    () =>
      evs.length === 1 &&
      evs[0].id === runtime.recordIds.taskEvent &&
      evs[0].task_id === runtime.recordIds.task,
  );
  await step(
    steps,
    "task_notes_hydrated",
    () =>
      nos.length === 1 &&
      nos[0].id === runtime.recordIds.taskNote &&
      nos[0].task_id === runtime.recordIds.task,
  );
  await step(
    steps,
    "notifications_hydrated",
    () =>
      notifs.length === 1 && notifs[0].id === runtime.recordIds.notification,
  );
  await step(
    steps,
    "notification_read_state_hydrated",
    () => notifs.length === 1 && notifs[0].read_at !== null,
  );
  await step(
    steps,
    "notification_deliveries_hydrated",
    () =>
      dels.length === 1 &&
      dels[0].id === runtime.recordIds.notificationDelivery &&
      dels[0].notification_id === runtime.recordIds.notification,
  );
  await step(
    steps,
    "notification_preferences_hydrated",
    () =>
      prefs.length === 1 &&
      prefs[0].user_id === runtime.userAId &&
      prefs[0].category === "task" &&
      prefs[0].email_enabled === false,
  );
  await step(
    steps,
    "company_info_hydrated",
    () =>
      !!ci &&
      ci.timezone === "America/New_York" &&
      ci.legal_name === "Phase8 Fleet LLC",
  );
  await step(
    steps,
    "settings_config_hydrated",
    () => cache.settingsConfig !== undefined,
  );
  await step(
    steps,
    "vehicle_classes_hydrated",
    () =>
      vcs.length === 1 &&
      vcs[0].id === runtime.recordIds.vehicleClass &&
      vcs[0].description === "Phase8 economy class" &&
      vcs[0].minimum_rental_unit === "day" &&
      vcs[0].display_order === 1,
  );
  await step(
    steps,
    "addon_categories_hydrated",
    () => cats.length === 1 && cats[0].id === runtime.recordIds.addonCategory,
  );
  await step(
    steps,
    "addon_items_hydrated",
    () =>
      items.length === 1 &&
      items[0].id === runtime.recordIds.addonItem &&
      items[0].category_id === runtime.recordIds.addonCategory &&
      items[0].pricing_type === "per_day",
  );

  // ── Idempotency: repeated hydration does not duplicate ───────────────────
  const cache2: Record<string, unknown> = {};
  const makeHandle2 = <T>(key: string) =>
    ((updater: (prev: T) => T) => {
      cache2[key] = updater(undefined as T);
    }) as (updater: (prev: T) => T) => void;
  const handles2: Phase8SyncHandles = {
    setLocations: makeHandle2("locations"),
    setStaff: makeHandle2("staff"),
    setDrivers: makeHandle2("drivers"),
    setTasks: makeHandle2("tasks"),
    setTaskEvents: makeHandle2("taskEvents"),
    setTaskNotes: makeHandle2("taskNotes"),
    setNotifications: makeHandle2("notifications"),
    setNotificationDeliveries: makeHandle2("notificationDeliveries"),
    setNotificationPreferences: makeHandle2("notificationPreferences"),
    setCompanyInfo: makeHandle2("companyInfo"),
    setVehicleClasses: makeHandle2("vehicleClasses"),
    setAddonCategories: makeHandle2("addonCategories"),
    setAddonCatalog: makeHandle2("addonCatalog"),
    applySettingsConfig: () => {},
  };
  await hydratePhase8Slices(orgA, handles2, repos);
  await step(steps, "repeated_hydration_no_duplicates", () => {
    const c = (k: string) => ((cache2[k] ?? []) as unknown[]).length;
    return (
      c("locations") === 1 &&
      c("staff") === 1 &&
      c("drivers") === 1 &&
      c("tasks") === 1 &&
      c("taskEvents") === 1 &&
      c("taskNotes") === 1 &&
      c("notifications") === 1 &&
      c("notificationDeliveries") === 1 &&
      c("notificationPreferences") === 1 &&
      c("vehicleClasses") === 1 &&
      c("addonCategories") === 1 &&
      c("addonCatalog") === 1
    );
  });

  // ── Settings upsert idempotency: one authoritative row ────────────────────
  await step(steps, "settings_single_authoritative_row", async () => {
    const { data, error } = await (
      a as never as {
        from: (t: string) => {
          select: () => {
            eq: (
              c: string,
              v: string,
            ) => Promise<{ data: unknown[]; error: unknown }>;
          };
        };
      }
    )
      .from("company_settings")
      .select()
      .eq("organization_id", orgA);
    return !error && Array.isArray(data) && data.length === 1;
  });

  // ── Timezone restoration + business-calendar proof ───────────────────────
  // The hydrated CompanyInfo.timezone must continue to control existing Phase 6
  // business-calendar logic. We use the hydrated timezone string directly
  // (the same value the StoreProvider restores into companyInfo.timezone) and
  // prove a business-calendar boundary follows the ORG zone, not the server.
  await step(steps, "hydrated_timezone_controls_business_calendar", () => {
    const tz = ci?.timezone ?? "UTC";
    // 2026-09-01T14:30:00Z is Sep 1 10:30 in America/New_York → "this_month"
    // start in NY is 2026-09-01T04:00:00Z (local midnight). If the timezone had
    // fallen back to UTC, the start would be 2026-09-01T00:00:00Z instead.
    const asOf = new Date("2026-09-01T14:30:00Z");
    const start = resolveProfitabilityRange(
      "this_month",
      undefined,
      asOf,
      tz,
    ).start.toISOString();
    return tz === "America/New_York" && start === "2026-09-01T04:00:00.000Z";
  });

  // ── Stale-org protection: a hydration started for Org A must not land into
  // an Org B cache. We simulate the org switch by passing Org B's id to a
  // second hydration while keeping the Org A repositories; the slices captured
  // under Org B must be EMPTY (Org B has no Phase 8 rows). This proves the
  // hydration result is scoped to the active org id, not the repositories.
  await step(
    steps,
    "stale_org_a_hydration_does_not_contaminate_org_b",
    async () => {
      const cacheB: Record<string, unknown> = {};
      const makeB = <T>(key: string) =>
        ((updater: (prev: T) => T) => {
          cacheB[key] = updater(undefined as T);
        }) as (updater: (prev: T) => T) => void;
      const handlesB: Phase8SyncHandles = {
        setLocations: makeB("locations"),
        setStaff: makeB("staff"),
        setDrivers: makeB("drivers"),
        setTasks: makeB("tasks"),
        setTaskEvents: makeB("taskEvents"),
        setTaskNotes: makeB("taskNotes"),
        setNotifications: makeB("notifications"),
        setNotificationDeliveries: makeB("notificationDeliveries"),
        setNotificationPreferences: makeB("notificationPreferences"),
        setCompanyInfo: makeB("companyInfo"),
        setVehicleClasses: makeB("vehicleClasses"),
        setAddonCategories: makeB("addonCategories"),
        setAddonCatalog: makeB("addonCatalog"),
        applySettingsConfig: () => {},
      };
      await hydratePhase8Slices(runtime.orgB, handlesB, repos);
      const c = (k: string) => ((cacheB[k] ?? []) as unknown[]).length;
      return (
        c("locations") === 0 &&
        c("staff") === 0 &&
        c("tasks") === 0 &&
        c("notifications") === 0 &&
        c("vehicleClasses") === 0 &&
        c("addonCategories") === 0
      );
    },
  );

  return { steps };
}
