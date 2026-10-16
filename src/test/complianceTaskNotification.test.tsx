// Connect Pro Fleet — Build #26 closure: compliance task + notification
// integration tests. Proves the `auto_create_review_task` switch is wired to
// the Build #11 Task system (idempotent create + resolve) and the Build #12
// Notification system (idempotent, internal-only). Uses renderHook against the
// real provider tree.
//
// Seed facts (NOW = 2026-09-02): veh_2 EXPIRED registration (blocking), veh_3
// insurance EXPIRING SOON (warning only), cus_8 DL REJECTED. Default policy:
// registration+insurance+DL+agreement required (block); inspection + customer
// insurance NOT required. auto_create_review_task defaults to false.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store/StoreProvider";
import {
  CompanyPolicyProvider,
  useCompanyPolicies,
} from "@/lib/store/companyPolicyStore";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import { useStore } from "@/lib/store/useStore";
import {
  generateComplianceTasksPass,
  generateComplianceNotificationsPass,
  taskSourceForReason,
  notificationTypeForReason,
  complianceOccurrence,
  deriveComplianceIssues,
} from "@/lib/complianceTaskScan";
import type {
  DocumentRecord,
  ComplianceRequirement,
} from "@/lib/complianceTypes";
import type { Task } from "@/lib/taskTypes";
import { TENANT_ID } from "@/lib/store/ids";

const NOW = new Date("2026-09-02T12:00:00Z");
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number) => iso(new Date(NOW.getTime() + n * DAY));

function baseReq(
  over: Partial<ComplianceRequirement> = {},
): ComplianceRequirement {
  return {
    id: "req_r",
    tenant_id: TENANT_ID,
    entity_type: "vehicle",
    document_type: "registration",
    required: true,
    blocks_operation_if_missing: true,
    blocks_operation_if_expired: true,
    requires_verification: true,
    warning_days: 30,
    active: true,
    source: "policy",
    applies_to: null,
    created_at: iso(NOW),
    updated_at: iso(NOW),
    ...over,
  };
}

function baseDoc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc_x",
    tenant_id: TENANT_ID,
    document_type: "registration",
    entity_type: "vehicle",
    entity_id: "veh_x",
    entity_label: "Test Vehicle",
    document_number: null,
    issuer: null,
    state_jurisdiction: null,
    effective_date: null,
    expiration_date: null,
    status: "uploaded",
    verification_status: "not_reviewed",
    file_reference: "mem://x",
    original_filename: "x",
    mime_type: null,
    notes: null,
    source: "upload",
    uploaded_by: "stf_1",
    uploaded_at: iso(NOW),
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: "stf_1",
    created_at: iso(NOW),
    updated_at: iso(NOW),
    ...over,
  };
}

describe("Build #26 closure — pure scan helpers", () => {
  it("taskSourceForReason maps each reason to a TaskSourceEvent", () => {
    expect(taskSourceForReason("missing_required")).toBe(
      "compliance.missing_required",
    );
    expect(taskSourceForReason("expired")).toBe("compliance.expired");
    expect(taskSourceForReason("expiring_soon")).toBe(
      "compliance.expiring_soon",
    );
    expect(taskSourceForReason("rejected")).toBe("compliance.rejected");
    expect(taskSourceForReason("pending_review")).toBe(
      "compliance.pending_review",
    );
    expect(taskSourceForReason("failed_inspection")).toBe("compliance.expired");
    expect(taskSourceForReason("file_missing")).toBe(
      "compliance.missing_required",
    );
  });

  it("notificationTypeForReason maps expired/expiring/blocking", () => {
    expect(notificationTypeForReason("expired")).toBe("compliance.expired");
    expect(notificationTypeForReason("expiring_soon")).toBe(
      "compliance.expiring_soon",
    );
    expect(notificationTypeForReason("missing_required")).toBe(
      "compliance.blocking",
    );
  });

  it("complianceOccurrence uses expiration date when present", () => {
    const issue = {
      entity_type: "vehicle" as const,
      entity_id: "veh_x",
      entity_label: "V",
      document_type: "registration" as const,
      document_id: null,
      reason: "expired" as const,
      severity: "critical" as const,
      blocking: true,
      expiration_date: "2026-08-01",
    };
    expect(complianceOccurrence(issue)).toBe("2026-08-01");
    expect(complianceOccurrence({ ...issue, expiration_date: null })).toBe("1");
  });

  it("deriveComplianceIssues surfaces the expired-registration issue", () => {
    const docs = [
      baseDoc({
        verification_status: "verified",
        expiration_date: daysFromNow(-5),
      }),
    ];
    const issues = deriveComplianceIssues(
      [{ type: "vehicle", id: "veh_x", label: "V" }],
      [baseReq()],
      docs,
      [],
      NOW,
      30,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].issue.reason).toBe("expired");
    expect(issues[0].issue.blocking).toBe(true);
  });
});

// --- provider-backed integration tests -------------------------------------

function ProviderTree({
  children,
  enableTasks,
}: {
  children: ReactNode;
  enableTasks: boolean;
}) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <PolicyToggle enableTasks={enableTasks} />
        <ComplianceProvider>{children}</ComplianceProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

function PolicyToggle({ enableTasks }: { enableTasks: boolean }) {
  const pol = useCompanyPolicies();
  if (pol.companyPolicies.compliance.auto_create_review_task !== enableTasks) {
    pol.updateCompanyPolicies({
      compliance: {
        ...pol.companyPolicies.compliance,
        auto_create_review_task: enableTasks,
      },
    });
  }
  return null;
}

function useAllWithFlag(enableTasks: boolean) {
  return renderHook(() => ({ store: useStore(), comp: useCompliance() }), {
    wrapper: ({ children }) => (
      <ProviderTree enableTasks={enableTasks}>{children}</ProviderTree>
    ),
  }).result;
}
function useAll() {
  return renderHook(() => ({ store: useStore(), comp: useCompliance() }), {
    wrapper: ({ children }) => (
      <ProviderTree enableTasks>{children}</ProviderTree>
    ),
  }).result;
}

const complianceTasks = (r: { store: ReturnType<typeof useStore> }) =>
  r.store.tasks.filter(
    (t) =>
      t.source_type === "system" && t.source_event?.startsWith("compliance."),
  );

describe("Build #26 closure — task integration (auto_create_review_task)", () => {
  it("1. flag=false → generateComplianceTasks creates nothing", () => {
    const r = useAllWithFlag(false);
    const before = r.current.store.tasks.length;
    act(() => {
      expect(r.current.comp.generateComplianceTasks().created).toBe(0);
    });
    expect(r.current.store.tasks.length).toBe(before);
  });

  it("2. flag=true → creates a task for the expired-registration issue (veh_2)", () => {
    const r = useAllWithFlag(true);
    const before = complianceTasks(r.current).length;
    act(() => {
      expect(r.current.comp.generateComplianceTasks().created).toBeGreaterThan(
        0,
      );
    });
    const tasks = complianceTasks(r.current);
    expect(tasks.length).toBeGreaterThan(before);
    expect(
      tasks.some(
        (t) =>
          t.source_event === "compliance.expired" && t.entity_id === "veh_2",
      ),
    ).toBe(true);
  });

  it("3. repeated evaluation → one task (idempotent dedupe)", () => {
    const r = useAllWithFlag(true);
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    const after1 = complianceTasks(r.current).length;
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    expect(complianceTasks(r.current).length).toBe(after1);
  });

  it("4. different compliance issues → separate tasks (distinct dedupe keys)", () => {
    const r = useAllWithFlag(true);
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    const keys = new Set(complianceTasks(r.current).map((t) => t.dedupe_key));
    expect(keys.size).toBeGreaterThan(1);
  });

  it("5. resolving an issue completes the matching task (no re-creation)", () => {
    const r = useAllWithFlag(true);
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    const t = r.current.store.tasks.find(
      (x) => x.source_event === "compliance.expired" && x.entity_id === "veh_2",
    );
    expect(t).toBeTruthy();
    expect(t!.status).toBe("open");
    act(() => {
      const id = r.current.comp.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_2",
        entity_label: "2022 Tesla Model 3 (FL-EV2290)",
        document_type: "registration",
        expiration_date: daysFromNow(365),
        file_reference: "mem://veh_2_reg_new.pdf",
      });
      r.current.comp.verifyDocument(id);
    });
    let res = { resolved: 0 };
    act(() => {
      res = r.current.comp.generateComplianceTasks();
    });
    expect(res.resolved).toBeGreaterThanOrEqual(1);
    const after = r.current.store.tasks.find((x) => x.id === t!.id);
    expect(after!.status).toBe("completed");
  });

  it("6. rejected required document creates a review task (cus_8)", () => {
    const r = useAllWithFlag(true);
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    expect(
      complianceTasks(r.current).some(
        (t) =>
          t.source_event === "compliance.rejected" && t.entity_id === "cus_8",
      ),
    ).toBe(true);
  });

  it("7. compliance task uses the existing Task model (source_type=system)", () => {
    const r = useAllWithFlag(true);
    act(() => {
      r.current.comp.generateComplianceTasks();
    });
    const t = complianceTasks(r.current)[0];
    expect(t.source_type).toBe("system");
    expect(t.dedupe_key).toBeTruthy();
    expect(t.category).toBe("document");
  });
});

describe("Build #26 closure — notification integration", () => {
  it("8. generateComplianceNotifications surfaces the expired issue to managers", () => {
    const r = useAll();
    const before = r.current.store.notifications.filter((n) =>
      n.notification_type?.startsWith("compliance."),
    ).length;
    act(() => {
      r.current.comp.generateComplianceNotifications();
    });
    expect(
      r.current.store.notifications.filter((n) =>
        n.notification_type?.startsWith("compliance."),
      ).length,
    ).toBeGreaterThan(before);
  });

  it("9. repeated notification evaluation is idempotent (no duplicate)", () => {
    const r = useAll();
    act(() => {
      r.current.comp.generateComplianceNotifications();
    });
    const after1 = r.current.store.notifications.filter((n) =>
      n.notification_type?.startsWith("compliance."),
    ).length;
    act(() => {
      r.current.comp.generateComplianceNotifications();
    });
    act(() => {
      r.current.comp.generateComplianceNotifications();
    });
    expect(
      r.current.store.notifications.filter((n) =>
        n.notification_type?.startsWith("compliance."),
      ).length,
    ).toBe(after1);
  });

  it("10. blocking compliance issue surfaces a compliance.blocking notification", () => {
    const r = useAll();
    act(() => {
      r.current.comp.generateComplianceNotifications();
    });
    const blocking = r.current.store.notifications.filter(
      (n) => n.notification_type === "compliance.blocking",
    );
    // veh_2 expired registration is blocking → at least one blocking alert.
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.some((n) => n.priority === "urgent")).toBe(true);
  });

  it("11. notifications are internal-only (staff recipients, no customer channel)", () => {
    const r = useAll();
    act(() => {
      r.current.comp.generateComplianceNotifications();
    });
    const staffIds = new Set(r.current.store.staff.map((s) => s.id));
    const notifs = r.current.store.notifications.filter((n) =>
      n.notification_type?.startsWith("compliance."),
    );
    expect(notifs.length).toBeGreaterThan(0);
    for (const n of notifs)
      expect(staffIds.has(n.recipient_user_id)).toBe(true);
  });
});

describe("Build #26 closure — valid → expiring → expired transition", () => {
  it("12. status selectors update across the transition (deterministic dates)", () => {
    const reqs = [baseReq()];
    const ent = [{ type: "vehicle" as const, id: "veh_x", label: "V" }];
    // Verified + valid → no issue.
    const valid = baseDoc({
      verification_status: "verified",
      expiration_date: daysFromNow(120),
    });
    expect(deriveComplianceIssues(ent, reqs, [valid], [], NOW, 30).length).toBe(
      0,
    );
    // Verified + expiring soon.
    const expiring = baseDoc({
      verification_status: "verified",
      expiration_date: daysFromNow(10),
    });
    const ei = deriveComplianceIssues(ent, reqs, [expiring], [], NOW, 30);
    expect(ei.some((i) => i.issue.reason === "expiring_soon")).toBe(true);
    // Verified + expired (blocking).
    const expired = baseDoc({
      verification_status: "verified",
      expiration_date: daysFromNow(-5),
    });
    const ed = deriveComplianceIssues(ent, reqs, [expired], [], NOW, 30);
    expect(ed.some((i) => i.issue.reason === "expired")).toBe(true);
    expect(ed[0].issue.blocking).toBe(true);
  });

  it("13. transition does not explode tasks (one per occurrence)", () => {
    const reqs = [baseReq()];
    const docs = [baseDoc({ expiration_date: daysFromNow(10) })];
    const seen = new Set<string>();
    const ensure = (input: {
      sourceEvent: string;
      entityId: string;
      occurrence?: string;
    }) => {
      const k = `${input.sourceEvent}:${input.entityId}:${input.occurrence}`;
      const created = !seen.has(k);
      seen.add(k);
      return { created, taskId: "tsk" };
    };
    const deps = {
      ensureSystemTask: ensure as never,
      resolveSystemTasksForEntity: () => 0,
      tasks: [] as Task[],
    };
    const opts = { autoCreateReviewTask: true, now: NOW, warningDays: 30 };
    generateComplianceTasksPass(
      [{ type: "vehicle", id: "veh_x", label: "V" }],
      reqs,
      docs,
      [],
      deps,
      opts,
    );
    generateComplianceTasksPass(
      [{ type: "vehicle", id: "veh_x", label: "V" }],
      reqs,
      docs,
      [],
      deps,
      opts,
    );
    expect(seen.size).toBe(1);
  });
});

describe("Build #26 closure — pure notification pass (mocked notify)", () => {
  it("14. notify called once per recipient per occurrence", () => {
    const calls: string[] = [];
    generateComplianceNotificationsPass(
      [{ type: "vehicle", id: "veh_x", label: "V" }],
      [baseReq()],
      [baseDoc({ expiration_date: daysFromNow(-5) })],
      [],
      {
        notify: (i) => {
          calls.push(`${i.recipientUserId}:${i.type}:${i.occurrence}`);
          return "ntf_1";
        },
        managerUserIds: ["stf_1"],
        defaultComplianceOwnerId: null,
      },
      { now: NOW, warningDays: 30 },
    );
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("compliance.");
  });

  it("15. no managers + no owner → no notifications created", () => {
    let created = 0;
    generateComplianceNotificationsPass(
      [{ type: "vehicle", id: "veh_x", label: "V" }],
      [baseReq()],
      [baseDoc({ expiration_date: daysFromNow(-5) })],
      [],
      {
        notify: () => {
          created++;
          return "ntf";
        },
        managerUserIds: [],
        defaultComplianceOwnerId: null,
      },
      { now: NOW, warningDays: 30 },
    );
    expect(created).toBe(0);
  });
});
