// Phase 8 E2E — create Phase 8 domain records through the real repository path,
// split into resumable sub-stages so no single staged request exceeds the
// platform deadline. Every insert uses the authenticated Org A repository
// adapter; none uses the service-role admin. Test-harness only.
//
// Sub-stages (each mutates `runtime.recordIds` / `runtime.phase8` in place):
//   runOperationalRecords      — location, staff, operational assignment, driver
//   runTasksNotificationsRecords — task, task event, task note, notification,
//                                 notification delivery, notification preference
//   runConfigRecords           — company settings, vehicle class, addon category,
//                                 addon catalog item

import type { Location, Staff, Driver } from "@/lib/types";
import type { OperationalStaffAssignment } from "@/lib/staffTypes";
import type { Task, TaskEvent, TaskNote } from "@/lib/taskTypes";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "@/lib/notificationTypes";
import type {
  CompanyInfo,
  VehicleClass,
  AddonCategory,
  AddonCatalogItem,
} from "@/lib/settingsTypes";
import type { CompanySettingsConfig } from "@/lib/supabase/phase8Mappers";
import { step, requireOk, type Phase8Runtime } from "./phase8-e2e-runtime";
import type { Phase8Step } from "./phase8-e2e.server";

export interface Phase8RecordsStageResult {
  steps: Phase8Step[];
}

// ── Sub-stage: operational (location, staff, assignment, driver) ───────────
export async function runOperationalRecords(
  runtime: Phase8Runtime,
): Promise<Phase8RecordsStageResult> {
  const steps: Phase8Step[] = [];
  const { locations, staffAssignments, orgA, now } = runtime;

  const location: Location = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    name: "Phase8 Downtown Lot",
    address: "100 Main St",
    phone: "555-0100",
    timezone: "America/New_York",
    is_default: true,
  };
  await locations.insert(location);
  runtime.recordIds.location = location.id;
  requireOk(
    await step(steps, "location_persistence", async () => {
      const rows = await locations.list(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === location.id &&
        rows[0].timezone === "America/New_York"
      );
    }),
  );

  const staff: Staff = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    full_name: "Phase8 CSR",
    email: `csr-${runtime.stamp}@phase8.test`,
    role: "staff",
    permission_overrides: null,
    created_at: now,
    phone: "555-0200",
    display_role: "custom",
    role_id: null,
    location_ids: [location.id],
    status: "active",
    last_activity_at: null,
    theme: "system",
    brand_color: null,
    responsibilities: ["customer_service"],
  };
  await staffAssignments.insertStaff(staff);
  runtime.recordIds.staff = staff.id;
  requireOk(
    await step(steps, "staff_persistence", async () => {
      const rows = await staffAssignments.listStaff(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === staff.id &&
        rows[0].status === "active"
      );
    }),
  );

  // Operational staff assignment — owned by StaffAssignmentProvider in the app.
  // Created through the repository path (the same path the provider's
  // createAssignment mutation persists through).
  const assignment: OperationalStaffAssignment = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    staff_id: staff.id,
    assignment_type: "rental_csr",
    entity_type: "rental",
    entity_id: runtime.ctx.rentalId,
    entity_label: "Phase8 Rental",
    status: "active",
    assigned_by: null,
    assigned_at: now,
    due_at: null,
    priority: "normal",
    notes: "Phase8 CSR assignment",
    completed_at: null,
    reassigned_to: null,
    reassign_reason: null,
  };
  await staffAssignments.insertAssignment(assignment);
  runtime.recordIds.assignment = assignment.id;
  requireOk(
    await step(steps, "operational_assignment_persistence", async () => {
      const rows = await staffAssignments.listAssignments(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === assignment.id &&
        rows[0].staff_id === staff.id &&
        rows[0].entity_id === runtime.ctx.rentalId &&
        rows[0].status === "active"
      );
    }),
  );

  const driver: Driver = {
    id: crypto.randomUUID(),
    reservation_id: "",
    full_name: "Phase8 Driver",
    license_number: "D8-12345",
    license_state: "NY",
    license_expiry: "2030-01-01",
    verification_status: "pending",
    tenant_id: orgA,
  };
  await staffAssignments.insertDriver(driver);
  runtime.recordIds.driver = driver.id;
  requireOk(
    await step(steps, "driver_persistence", async () => {
      const rows = await staffAssignments.listDrivers(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === driver.id &&
        rows[0].full_name === "Phase8 Driver"
      );
    }),
  );

  runtime.phase8.location = location;
  runtime.phase8.staff = staff;
  runtime.phase8.assignment = assignment;
  runtime.phase8.driver = driver;

  return { steps };
}

// ── Sub-stage: tasks + notifications ───────────────────────────────────────
export async function runTasksNotificationsRecords(
  runtime: Phase8Runtime,
): Promise<Phase8RecordsStageResult> {
  const steps: Phase8Step[] = [];
  const { tasks, notifications, orgA, userAId, now, date } = runtime;

  const task: Task = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    task_number: `TSK-P8-${runtime.stamp}`,
    title: "Phase8 follow-up task",
    description: "Phase8 task description",
    status: "open",
    priority: "high",
    source_type: "manual",
    source_event: null,
    assigned_to_user_id: userAId,
    assigned_by_user_id: userAId,
    created_by_user_id: userAId,
    due_date: date,
    due_time: null,
    completed_at: null,
    completed_by_user_id: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    entity_type: "rental",
    entity_id: runtime.ctx.rentalId,
    entity_label: "Phase8 Rental",
    location_id: runtime.recordIds.location ?? null,
    category: "customer_follow_up",
    tags: ["phase8"],
    notes: null,
    dedupe_key: null,
    created_at: now,
    updated_at: now,
  };
  await tasks.insert(task);
  runtime.recordIds.task = task.id;
  requireOk(
    await step(steps, "task_persistence", async () => {
      const rows = await tasks.list(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === task.id &&
        rows[0].status === "open" &&
        rows[0].due_date === date
      );
    }),
  );

  const taskEvent: TaskEvent = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    task_id: task.id,
    type: "created",
    label: "Task created",
    at: now,
    actor_id: userAId,
    actor_is_system: false,
    old_value: null,
    new_value: "open",
  };
  await tasks.insertTaskEvent(taskEvent);
  runtime.recordIds.taskEvent = taskEvent.id;

  const taskNote: TaskNote = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    task_id: task.id,
    author_id: userAId,
    author_is_system: false,
    text: "Phase8 task note",
    at: now,
  };
  await tasks.insertTaskNote(taskNote);
  runtime.recordIds.taskNote = taskNote.id;
  requireOk(
    await step(steps, "task_event_and_note_persistence", async () => {
      const evs = await tasks.listTaskEvents(orgA, task.id);
      const nos = await tasks.listTaskNotes(orgA, task.id);
      return (
        evs.length === 1 &&
        evs[0].id === taskEvent.id &&
        evs[0].type === "created" &&
        nos.length === 1 &&
        nos[0].id === taskNote.id &&
        nos[0].text === "Phase8 task note"
      );
    }),
  );

  const notification: Notification = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    recipient_user_id: userAId,
    notification_type: "task.assigned",
    category: "task",
    priority: "normal",
    title: "Phase8 task assigned",
    message: "You have a new task",
    entity_type: "task",
    entity_id: task.id,
    entity_label: "Phase8 follow-up task",
    action_url: null,
    source_event: "task.assigned",
    source_event_id: task.id,
    dedupe_key: `task.assigned:${task.id}`,
    actor_user_id: userAId,
    read_at: null,
    archived_at: null,
    created_at: now,
    expires_at: null,
    metadata: null,
  };
  await notifications.insert(notification);
  runtime.recordIds.notification = notification.id;
  requireOk(
    await step(steps, "notification_persistence", async () => {
      const rows = await notifications.list(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === notification.id &&
        rows[0].read_at === null
      );
    }),
  );

  // Read/unread update through the repository path.
  const readAt = now;
  await notifications.update(orgA, notification.id, { read_at: readAt });
  requireOk(
    await step(steps, "notification_read_update", async () => {
      const got = await notifications.get(orgA, notification.id);
      return !!got && got.read_at === readAt;
    }),
  );

  const delivery: NotificationDelivery = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    notification_id: notification.id,
    recipient_user_id: userAId,
    channel: "in_app",
    destination: "",
    status: "sent",
    provider: null,
    provider_message_id: null,
    attempt_count: 0,
    last_attempt_at: null,
    sent_at: now,
    failed_at: null,
    failure_reason: null,
    created_at: now,
  };
  await notifications.insertDelivery(delivery);
  runtime.recordIds.notificationDelivery = delivery.id;
  requireOk(
    await step(steps, "notification_delivery_persistence", async () => {
      const rows = await notifications.listDeliveries(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === delivery.id &&
        rows[0].notification_id === notification.id
      );
    }),
  );

  const preference: NotificationPreference = {
    tenant_id: orgA,
    user_id: userAId,
    category: "task",
    in_app_enabled: true,
    email_enabled: false,
    connect_pro_enabled: false,
    updated_at: now,
  };
  await notifications.upsertPreference(preference);
  runtime.recordIds.notificationPreference = `${orgA}:${userAId}:task`;
  requireOk(
    await step(steps, "notification_preference_persistence", async () => {
      const rows = await notifications.listPreferences(orgA);
      return (
        rows.length === 1 &&
        rows[0].user_id === userAId &&
        rows[0].category === "task" &&
        rows[0].email_enabled === false
      );
    }),
  );

  runtime.phase8.task = task;
  runtime.phase8.taskEvent = taskEvent;
  runtime.phase8.taskNote = taskNote;
  runtime.phase8.notification = notification;
  runtime.phase8.notificationDelivery = delivery;
  runtime.phase8.notificationPreference = preference;

  return { steps };
}

// ── Sub-stage: config (company settings, vehicle class, add-ons) ────────────
export async function runConfigRecords(
  runtime: Phase8Runtime,
): Promise<Phase8RecordsStageResult> {
  const steps: Phase8Step[] = [];
  const { companySettings, vehicleClasses, addons, orgA, userAId, now } =
    runtime;

  const companyInfo: CompanyInfo = {
    legal_name: "Phase8 Fleet LLC",
    dba: "Phase8",
    logo_url: null,
    business_phone: "555-0100",
    business_email: "ops@phase8.test",
    website: "",
    street: "100 Main St",
    street2: "",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "US",
    tax_id: null,
    registration_number: null,
    support_email: null,
    support_phone: null,
    timezone: "America/New_York",
    currency: "USD",
    language: "en",
  };
  const settingsConfig: CompanySettingsConfig = {
    companyPolicies: {} as never,
    agreementRules: {
      default_template_id: null,
      master_duration_days: 365,
      require_resign_on_expiry: false,
      require_resign_on_vehicle_change: false,
      require_resign_on_rate_change: false,
      require_resign_on_terms_change: false,
      require_manual_resign: false,
    },
    taxRules: [],
    feeRules: [],
  };
  await companySettings.upsert(orgA, companyInfo, settingsConfig);
  runtime.recordIds.companySettings = orgA;
  requireOk(
    await step(steps, "company_settings_single_record", async () => {
      const got = await companySettings.get(orgA);
      return (
        !!got &&
        got.companyInfo.timezone === "America/New_York" &&
        got.companyInfo.legal_name === "Phase8 Fleet LLC"
      );
    }),
  );

  // Repeated upsert must NOT create a second row.
  await companySettings.upsert(orgA, companyInfo, settingsConfig);
  requireOk(
    await step(steps, "company_settings_upsert_no_duplicate", async () => {
      const { data, error } = await (
        runtime.a as never as {
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
    }),
  );

  const vehicleClass: VehicleClass = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    name: "Phase8 Economy",
    description: "Phase8 economy class",
    daily_rate: 75,
    weekly_rate: 450,
    minimum_rental_duration: 1,
    minimum_rental_unit: "day",
    default_deposit_policy_id: null,
    active: true,
    display_order: 1,
    created_at: now,
    updated_at: now,
    created_by: userAId,
  };
  await vehicleClasses.insert(vehicleClass);
  runtime.recordIds.vehicleClass = vehicleClass.id;
  requireOk(
    await step(steps, "vehicle_class_persistence", async () => {
      const rows = await vehicleClasses.list(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === vehicleClass.id &&
        rows[0].description === "Phase8 economy class" &&
        rows[0].minimum_rental_unit === "day" &&
        rows[0].display_order === 1 &&
        rows[0].daily_rate === 75
      );
    }),
  );

  const addonCategory: AddonCategory = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    name: "Phase8 Protection",
    description: "Phase8 add-on category",
    active: true,
    display_order: 1,
    created_at: now,
  };
  await addons.insertCategory(addonCategory);
  runtime.recordIds.addonCategory = addonCategory.id;

  const addonItem: AddonCatalogItem = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    category_id: addonCategory.id,
    name: "Phase8 CDW",
    description: "Collision damage waiver",
    price: 25,
    pricing_type: "per_day",
    taxable: true,
    required: false,
    active: true,
    display_order: 1,
    created_at: now,
  };
  await addons.insertItem(addonItem);
  runtime.recordIds.addonItem = addonItem.id;
  requireOk(
    await step(steps, "addon_category_and_item_persistence", async () => {
      const cats = await addons.listCategories(orgA);
      const items = await addons.listItems(orgA);
      return (
        cats.length === 1 &&
        cats[0].id === addonCategory.id &&
        items.length === 1 &&
        items[0].id === addonItem.id &&
        items[0].category_id === addonCategory.id &&
        items[0].pricing_type === "per_day"
      );
    }),
  );

  runtime.phase8.companyInfo = companyInfo;
  runtime.phase8.vehicleClass = vehicleClass;
  runtime.phase8.addonCategory = addonCategory;
  runtime.phase8.addonItem = addonItem;

  return { steps };
}

// ── Legacy single-call entry kept for the un-staged POST path. ──────────────
export async function runCreatePhase8Records(
  runtime: Phase8Runtime,
): Promise<Phase8RecordsStageResult> {
  const steps: Phase8Step[] = [];
  const op = await runOperationalRecords(runtime);
  steps.push(...op.steps);
  const tn = await runTasksNotificationsRecords(runtime);
  steps.push(...tn.steps);
  const cfg = await runConfigRecords(runtime);
  steps.push(...cfg.steps);
  return { steps };
}
