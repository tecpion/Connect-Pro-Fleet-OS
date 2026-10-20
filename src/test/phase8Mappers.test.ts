// Phase 8B — mapper round-trip tests.
//
// Verifies the Phase 8 row↔domain mappers preserve every frozen domain field
// (incl. nullability, organization ownership, and Phase 6 timezone).

import { describe, it, expect } from "vitest";
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
  rowToTask,
  taskToRow,
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
  rowToVehicleClass,
  vehicleClassToRow,
  vehicleClassPatchToRow,
  rowToAddonCategory,
  addonCategoryToRow,
  addonCategoryPatchToRow,
  rowToAddonCatalogItem,
  addonCatalogItemToRow,
  addonCatalogItemPatchToRow,
} from "@/lib/supabase/phase8Mappers";
import type {
  LocationRow,
  StaffRow,
  OperationalStaffAssignmentRow,
  DriverRow,
  CompanySettingsRow,
  AddonCategoryRow,
  AddonCatalogItemRow,
  VehicleClassRow,
} from "@/lib/supabase/dbTypesCore";
import type {
  TaskRow,
  TaskEventRow,
  TaskNoteRow,
  NotificationRow,
  NotificationDeliveryRow,
  NotificationPreferenceRow,
} from "@/lib/supabase/dbTypesTasks";

describe("location mappers", () => {
  it("round-trips preserving org ownership + timezone + is_default", () => {
    const row: LocationRow = {
      id: "loc-1",
      organization_id: "org-A",
      name: "Downtown",
      address: "123 Main",
      phone: "555-1234",
      timezone: "America/New_York",
      is_default: true,
    };
    const d = rowToLocation(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.timezone).toBe("America/New_York");
    expect(d.is_default).toBe(true);
    const back = locationToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.timezone).toBe("America/New_York");
  });

  it("patch maps only provided fields", () => {
    const patch = locationPatchToRow({ name: "New Name" });
    expect(patch.name).toBe("New Name");
    expect(patch.timezone).toBeUndefined();
  });

  it("preserves is_default defaulting to false", () => {
    const row: LocationRow = {
      id: "loc-2",
      organization_id: "org-A",
      name: "Airport",
      address: "456 Rd",
      phone: "555",
      timezone: "UTC",
      is_default: false,
    };
    expect(rowToLocation(row).is_default).toBe(false);
  });
});

describe("staff mappers", () => {
  it("round-trips preserving responsibilities + location_ids + role", () => {
    const row: StaffRow = {
      id: "stf-1",
      organization_id: "org-A",
      full_name: "Sarah Chen",
      email: "sarah@a.com",
      role: "admin",
      permission_overrides: { "x.y": true },
      phone: "555",
      display_role: "Owner",
      role_id: "role-1",
      location_ids: ["loc-1", "loc-2"],
      status: "active",
      last_activity_at: "2026-01-01T00:00:00Z",
      theme: "dark",
      brand_color: "#ff0000",
      responsibilities: ["customer_service"],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    const d = rowToStaff(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.responsibilities).toEqual(["customer_service"]);
    expect(d.location_ids).toEqual(["loc-1", "loc-2"]);
    const back = staffToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.responsibilities).toEqual(["customer_service"]);
  });

  it("patch maps only provided fields", () => {
    const patch = staffPatchToRow({ brand_color: "#abc" });
    expect(patch.brand_color).toBe("#abc");
    expect(patch.role).toBeUndefined();
  });
});

describe("operational staff assignment mappers", () => {
  it("round-trips preserving entity refs + reassign chain", () => {
    const row: OperationalStaffAssignmentRow = {
      id: "asg-1",
      organization_id: "org-A",
      staff_id: "stf-1",
      assignment_type: "rental_csr",
      entity_type: "rental",
      entity_id: "rnt-1",
      entity_label: "RA-0001",
      status: "active",
      assigned_by: "stf-2",
      assigned_at: "2026-01-01T00:00:00Z",
      due_at: null,
      priority: "high",
      notes: null,
      completed_at: null,
      reassigned_to: null,
      reassign_reason: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToOperationalStaffAssignment(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.entity_id).toBe("rnt-1");
    expect(d.priority).toBe("high");
    const back = operationalStaffAssignmentToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.entity_id).toBe("rnt-1");
  });

  it("patch maps only provided fields", () => {
    const patch = operationalStaffAssignmentPatchToRow({ status: "completed" });
    expect(patch.status).toBe("completed");
    expect(patch.staff_id).toBeUndefined();
  });
});

describe("driver mappers", () => {
  it("round-trips preserving license + verification + reservation link", () => {
    const row: DriverRow = {
      id: "drv-1",
      organization_id: "org-A",
      reservation_id: "rsv-1",
      full_name: "Grace Liu",
      license_number: "DL123",
      license_state: "TX",
      license_expiry: "2030-01-01",
      verification_status: "verified",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    const d = rowToDriver(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.reservation_id).toBe("rsv-1");
    expect(d.verification_status).toBe("verified");
    const back = driverToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.reservation_id).toBe("rsv-1");
  });

  it("patch maps only provided fields", () => {
    const patch = driverPatchToRow({ verification_status: "failed" });
    expect(patch.verification_status).toBe("failed");
    expect(patch.license_number).toBeUndefined();
  });
});

describe("task mappers", () => {
  it("round-trips preserving status/priority/category + due date-only", () => {
    const row: TaskRow = {
      id: "tsk-1",
      organization_id: "org-A",
      task_number: "TSK-0001",
      title: "Follow up",
      description: "Call customer",
      status: "open",
      priority: "high",
      source_type: "manual",
      source_event: null,
      dedupe_key: null,
      assigned_to_user_id: "stf-1",
      assigned_by_user_id: "stf-2",
      created_by_user_id: "stf-2",
      due_date: "2026-02-01",
      due_time: null,
      completed_at: null,
      completed_by_user_id: null,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      entity_type: "customer",
      entity_id: "cust-1",
      entity_label: "Grace Liu",
      location_id: "loc-1",
      category: "customer_follow_up",
      tags: ["vip"],
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToTask(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.due_date).toBe("2026-02-01");
    expect(d.due_time).toBeNull();
    expect(d.tags).toEqual(["vip"]);
    const back = taskToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.due_date).toBe("2026-02-01");
    expect(back.tags).toEqual(["vip"]);
  });

  it("task event round-trip preserves type + actor_is_system", () => {
    const row: TaskEventRow = {
      id: "ev-1",
      organization_id: "org-A",
      task_id: "tsk-1",
      event_type: "assigned",
      actor_user_id: "stf-1",
      actor_is_system: false,
      old_value: null,
      new_value: "stf-2",
      note: "Assigned to Sarah",
      created_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToTaskEvent(row);
    expect(d.type).toBe("assigned");
    expect(d.actor_is_system).toBe(false);
    expect(d.label).toBe("Assigned to Sarah");
    expect(taskEventToRow(d).event_type).toBe("assigned");
  });

  it("task note round-trip", () => {
    const row: TaskNoteRow = {
      id: "nt-1",
      organization_id: "org-A",
      task_id: "tsk-1",
      author_user_id: "stf-1",
      text: "Called, no answer",
      created_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToTaskNote(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.text).toBe("Called, no answer");
    expect(taskNoteToRow(d).organization_id).toBe("org-A");
  });
});

describe("notification mappers", () => {
  it("round-trips preserving type/priority/read state + metadata", () => {
    const row: NotificationRow = {
      id: "ntf-1",
      organization_id: "org-A",
      recipient_user_id: "stf-1",
      notification_type: "task.assigned",
      category: "task",
      priority: "normal",
      title: "Task assigned",
      message: "You have a new task",
      entity_type: "task",
      entity_id: "tsk-1",
      entity_label: "TSK-0001",
      action_url: "/tasks/tsk-1",
      source_event: "task.assigned",
      source_event_id: "evt-1",
      dedupe_key: "dk-1",
      actor_user_id: "stf-2",
      read_at: null,
      archived_at: null,
      expires_at: "2026-12-01T00:00:00Z",
      metadata: { foo: "bar" },
      created_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToNotification(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.notification_type).toBe("task.assigned");
    expect(d.read_at).toBeNull();
    expect(d.metadata).toEqual({ foo: "bar" });
    const back = notificationToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.metadata).toEqual({ foo: "bar" });
  });

  it("notification patch maps only provided fields", () => {
    const patch = notificationPatchToRow({ read_at: "2026-01-02T00:00:00Z" });
    expect(patch.read_at).toBe("2026-01-02T00:00:00Z");
    expect(patch.title).toBeUndefined();
  });

  it("delivery round-trip preserves channel + status", () => {
    const row: NotificationDeliveryRow = {
      id: "dlv-1",
      organization_id: "org-A",
      notification_id: "ntf-1",
      recipient_user_id: "stf-1",
      channel: "in_app",
      destination: "in-app",
      status: "sent",
      provider: null,
      provider_message_id: null,
      attempt_count: 1,
      last_attempt_at: "2026-01-01T00:00:00Z",
      sent_at: "2026-01-01T00:00:00Z",
      failed_at: null,
      failure_reason: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToNotificationDelivery(row);
    expect(d.channel).toBe("in_app");
    expect(d.status).toBe("sent");
    expect(notificationDeliveryToRow(d).channel).toBe("in_app");
  });

  it("preference round-trip preserves category + flags", () => {
    const row: NotificationPreferenceRow = {
      organization_id: "org-A",
      user_id: "stf-1",
      category: "task",
      in_app_enabled: true,
      email_enabled: false,
      connect_pro_enabled: false,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToNotificationPreference(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.in_app_enabled).toBe(true);
    expect(notificationPreferenceToRow(d).organization_id).toBe("org-A");
  });
});

describe("company settings mappers", () => {
  it("round-trips company_info + structured settings_config as durable JSON", () => {
    const companyInfo = {
      legal_name: "Acme Rents",
      dba: "Acme",
      logo_url: null,
      business_phone: "555",
      business_email: "x@y.com",
      website: "acme.com",
      street: "1 St",
      street2: "",
      city: "Austin",
      state: "TX",
      zip: "78701",
      country: "US",
      tax_id: null,
      registration_number: null,
      support_email: null,
      support_phone: null,
      timezone: "America/Chicago",
      currency: "USD",
      language: "en",
    };
    const settingsConfig = {
      companyPolicies: { id: "pol-1", tenant_id: "org-A" },
      agreementRules: {
        default_template_id: null,
        master_duration_days: 365,
        require_resign_on_expiry: true,
        require_resign_on_vehicle_change: false,
        require_resign_on_rate_change: false,
        require_resign_on_terms_change: true,
        require_manual_resign: false,
      },
      taxRules: [],
      feeRules: [],
    };
    const row = companySettingsToRow(
      "org-A",
      companyInfo as never,
      settingsConfig as never,
    );
    expect(row.organization_id).toBe("org-A");
    const back = rowToCompanySettings(row as CompanySettingsRow);
    expect(back).not.toBeNull();
    expect(back!.companyInfo.timezone).toBe("America/Chicago");
    expect(back!.settingsConfig.agreementRules.master_duration_days).toBe(365);
  });

  it("returns null when company_info is missing", () => {
    const row: CompanySettingsRow = {
      id: "1",
      organization_id: "org-A",
      company_info: null,
      settings_config: null,
      created_at: "",
      updated_at: "",
    };
    expect(rowToCompanySettings(row)).toBeNull();
  });

  it("companySettingsToRow carries organization_id as the unique key", () => {
    const row = companySettingsToRow(
      "org-B",
      {
        legal_name: "B",
        dba: "B",
        logo_url: null,
        business_phone: "",
        business_email: "",
        website: "",
        street: "",
        street2: "",
        city: "",
        state: "",
        zip: "",
        country: "",
        tax_id: null,
        registration_number: null,
        support_email: null,
        support_phone: null,
        timezone: "UTC",
        currency: "USD",
        language: "en",
      } as never,
      {
        companyPolicies: {} as never,
        agreementRules: {} as never,
        taxRules: [],
        feeRules: [],
      },
    );
    expect(row.organization_id).toBe("org-B");
  });
});

describe("vehicle class mappers", () => {
  it("round-trips preserving pricing fields + minimum_rental_unit", () => {
    const row: VehicleClassRow = {
      id: "cls-1",
      organization_id: "org-A",
      name: "Economy",
      description: "Compact cars",
      vehicle_type: "sedan",
      daily_rate: 45,
      weekly_rate: 280,
      deposit_amount: 500,
      minimum_rental_duration: 3,
      minimum_rental_unit: "day",
      default_deposit_policy_id: null,
      active: true,
      display_order: 1,
      created_by: "stf-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    const d = rowToVehicleClass(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.daily_rate).toBe(45);
    expect(d.weekly_rate).toBe(280);
    expect(d.minimum_rental_unit).toBe("day");
    const back = vehicleClassToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.daily_rate).toBe(45);
  });

  it("patch maps only provided fields", () => {
    const patch = vehicleClassPatchToRow({ daily_rate: 50 });
    expect(patch.daily_rate).toBe(50);
    expect(patch.weekly_rate).toBeUndefined();
  });

  it("preserves default_deposit_policy_id optional uuid ref", () => {
    const row: VehicleClassRow = {
      id: "cls-2",
      organization_id: "org-A",
      name: "Premium",
      description: "",
      vehicle_type: "suv",
      daily_rate: 100,
      weekly_rate: 600,
      deposit_amount: 1000,
      minimum_rental_duration: 1,
      minimum_rental_unit: "day",
      default_deposit_policy_id: "dep-pol-1",
      active: true,
      display_order: 2,
      created_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(rowToVehicleClass(row).default_deposit_policy_id).toBe("dep-pol-1");
  });
});

describe("add-on mappers", () => {
  it("category round-trip", () => {
    const row: AddonCategoryRow = {
      id: "ac-1",
      organization_id: "org-A",
      name: "Protection",
      description: "Coverage add-ons",
      active: true,
      display_order: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToAddonCategory(row);
    expect(d.tenant_id).toBe("org-A");
    expect(addonCategoryToRow(d).organization_id).toBe("org-A");
  });

  it("category patch maps only provided fields", () => {
    const patch = addonCategoryPatchToRow({ active: false });
    expect(patch.active).toBe(false);
    expect(patch.name).toBeUndefined();
  });

  it("catalog item round-trip preserving price + pricing_type", () => {
    const row: AddonCatalogItemRow = {
      id: "ai-1",
      organization_id: "org-A",
      category_id: "ac-1",
      name: "LDW",
      description: "Loss damage waiver",
      price: 12.5,
      pricing_type: "per_day",
      taxable: true,
      required: false,
      active: true,
      display_order: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToAddonCatalogItem(row);
    expect(d.tenant_id).toBe("org-A");
    expect(d.price).toBe(12.5);
    expect(d.pricing_type).toBe("per_day");
    const back = addonCatalogItemToRow(d);
    expect(back.organization_id).toBe("org-A");
    expect(back.price).toBe(12.5);
  });

  it("catalog item patch maps only provided fields", () => {
    const patch = addonCatalogItemPatchToRow({ price: 15 });
    expect(patch.price).toBe(15);
    expect(patch.name).toBeUndefined();
  });

  it("catalog item maps null category_id to empty string and back", () => {
    const row: AddonCatalogItemRow = {
      id: "ai-2",
      organization_id: "org-A",
      category_id: null,
      name: "GPS",
      description: "",
      price: 5,
      pricing_type: "one_time",
      taxable: false,
      required: false,
      active: true,
      display_order: 2,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const d = rowToAddonCatalogItem(row);
    expect(d.category_id).toBe("");
    expect(addonCatalogItemToRow(d).category_id).toBeNull();
  });
});
