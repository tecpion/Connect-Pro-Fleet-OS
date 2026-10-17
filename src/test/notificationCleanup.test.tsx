// Connect Pro Fleet — Build #12 cleanup: runtime suppression + channel prefs.
//
// NOTE: state mutations within a single batched act() are not visible to the
// stale `s.*` closures until React re-renders, so setPreference / ensureSystemTask
// / assignTask / notify are each in their own act() block.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  setEmailProvider,
  nullEmailProvider,
  type EmailProvider,
  type EmailMessage,
  type EmailSendResult,
} from "@/lib/notificationEmail";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function fakeProvider(opts: {
  ok?: boolean;
  messageId?: string;
  failureReason?: string;
}): EmailProvider {
  return {
    name: "fake",
    isConfigured: () => true,
    async send(_m: EmailMessage): Promise<EmailSendResult> {
      if (opts.ok === false) {
        return {
          ok: false,
          provider: "fake",
          failureReason: opts.failureReason ?? "simulated failure",
        };
      }
      return {
        ok: true,
        provider: "fake",
        providerMessageId: opts.messageId ?? "msg_fake",
      };
    },
  };
}

describe("runtime task-coverage suppression", () => {
  it("direct notify for a covered rental-overdue event is suppressed", () => {
    const r = useStoreHook();
    // Act as stf_2 so assigning to stf_1 generates a real assignment
    // notification (self-assignment intentionally doesn't notify).
    act(() => r.current.setCurrentStaffId("stf_2"));
    let taskId = "";
    act(() => {
      taskId = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_cover1",
        entityLabel: "AGR-COVER-1",
        title: "Follow up on overdue rental",
        category: "return",
        priority: "high",
        occurrence: "2026-08-30",
      }).taskId;
    });
    act(() => r.current.assignTask(taskId, "stf_1"));
    const assigned = r.current
      .notificationsForUser("stf_1")
      .some((n) => n.notification_type === "task.assigned");
    expect(assigned).toBe(true);

    let id: string | null = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "rental.overdue",
        title: "Rental overdue",
        message: "m",
        entityType: "rental",
        entityId: "rnt_cover1",
        sourceEventId: "rnt_cover1",
        occurrence: "2026-08-30",
      });
    });
    expect(id).toBeNull();
  });

  it("covered payment-arrangement event does not duplicate task alert", () => {
    const r = useStoreHook();
    act(() => r.current.setCurrentStaffId("stf_2"));
    let taskId = "";
    act(() => {
      taskId = r.current.ensureSystemTask({
        sourceEvent: "payment_arrangement.broken",
        entityType: "payment_arrangement",
        entityId: "pa_cover1",
        entityLabel: "PA-COVER-1",
        title: "Follow up on broken payment arrangement",
        category: "payment_arrangement",
        priority: "high",
      }).taskId;
    });
    act(() => r.current.assignTask(taskId, "stf_1"));
    const before = r.current.notificationsForUser("stf_1").length;
    act(() => {
      r.current.notify({
        recipientUserId: "stf_1",
        type: "payment_arrangement.broken",
        title: "Arrangement broken",
        message: "m",
        entityType: "payment_arrangement",
        entityId: "pa_cover1",
        sourceEventId: "pa_cover1",
      });
    });
    expect(r.current.notificationsForUser("stf_1").length).toBe(before);
  });

  it("covered deposit refund-pending event does not duplicate", () => {
    const r = useStoreHook();
    act(() => r.current.setCurrentStaffId("stf_2"));
    let taskId = "";
    act(() => {
      taskId = r.current.ensureSystemTask({
        sourceEvent: "deposit.refund_pending",
        entityType: "deposit",
        entityId: "dep_cover1",
        entityLabel: "Deposit · Cover",
        title: "Process security deposit refund",
        category: "deposit",
        priority: "high",
      }).taskId;
    });
    act(() => r.current.assignTask(taskId, "stf_1"));
    const before = r.current.notificationsForUser("stf_1").length;
    act(() => {
      r.current.notify({
        recipientUserId: "stf_1",
        type: "deposit.refund_pending",
        title: "Refund pending",
        message: "m",
        entityType: "deposit",
        entityId: "dep_cover1",
        sourceEventId: "dep_cover1",
      });
    });
    expect(r.current.notificationsForUser("stf_1").length).toBe(before);
  });

  it("different occurrence still creates a new notification", () => {
    const r = useStoreHook();
    act(() => r.current.setCurrentStaffId("stf_2"));
    let taskId = "";
    act(() => {
      taskId = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_cover2",
        entityLabel: "AGR-COVER-2",
        title: "Follow up on overdue rental",
        category: "return",
        priority: "high",
        occurrence: "2026-08-30",
      }).taskId;
    });
    act(() => r.current.assignTask(taskId, "stf_1"));
    let id: string | null = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "rental.overdue",
        title: "Rental overdue",
        message: "m",
        entityType: "rental",
        entityId: "rnt_cover2",
        sourceEventId: "rnt_cover2",
        occurrence: "2026-09-05",
      });
    });
    expect(id).not.toBeNull();
  });

  it("different recipient still receives their own notification", () => {
    const r = useStoreHook();
    act(() => r.current.setCurrentStaffId("stf_2"));
    let taskId = "";
    act(() => {
      taskId = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_cover3",
        entityLabel: "AGR-COVER-3",
        title: "Follow up on overdue rental",
        category: "return",
        priority: "high",
      }).taskId;
    });
    act(() => r.current.assignTask(taskId, "stf_1"));
    let id: string | null = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_2",
        type: "rental.overdue",
        title: "Rental overdue",
        message: "m",
        entityType: "rental",
        entityId: "rnt_cover3",
        sourceEventId: "rnt_cover3",
      });
    });
    expect(id).not.toBeNull();
  });

  it("bypassCoverageSuppression forces creation even when covered", () => {
    const r = useStoreHook();
    act(() => r.current.setCurrentStaffId("stf_2"));
    let taskId = "";
    act(() => {
      taskId = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_cover4",
        entityLabel: "AGR-COVER-4",
        title: "Follow up on overdue rental",
        category: "return",
        priority: "high",
      }).taskId;
    });
    act(() => r.current.assignTask(taskId, "stf_1"));
    let id: string | null = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "rental.overdue",
        title: "Rental overdue",
        message: "m",
        entityType: "rental",
        entityId: "rnt_cover4",
        sourceEventId: "rnt_cover4",
        bypassCoverageSuppression: true,
      });
    });
    expect(id).not.toBeNull();
  });
});

describe("channel preferences", () => {
  it("In-App ON / Email OFF -> in-app only, no email delivery", () => {
    const r = useStoreHook();
    act(() => {
      r.current.setPreference({
        userId: "stf_1",
        category: "task",
        inApp: true,
        email: false,
      });
    });
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_chan1",
      })!;
    });
    const d = r.current.deliveriesFor(id);
    expect(d.some((x) => x.channel === "in_app" && x.status === "sent")).toBe(
      true,
    );
    expect(d.some((x) => x.channel === "email")).toBe(false);
  });

  it("In-App OFF / Email ON -> email only, NOT in the in-app feed", async () => {
    setEmailProvider(fakeProvider({ ok: true }));
    const r = useStoreHook();
    act(() => {
      r.current.setPreference({
        userId: "stf_1",
        category: "task",
        inApp: false,
        email: true,
      });
    });
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_chan2",
      })!;
    });
    // Deterministically wait for the async email send to land.
    await vi.waitFor(() => {
      expect(
        r.current
          .deliveriesFor(id)
          .some((x) => x.channel === "email" && x.status === "sent"),
      ).toBe(true);
    });
    const d = r.current.deliveriesFor(id);
    expect(d.some((x) => x.channel === "in_app")).toBe(false);
    expect(d.some((x) => x.channel === "email" && x.status === "sent")).toBe(
      true,
    );
    expect(
      r.current.notificationsForUser("stf_1").some((n) => n.id === id),
    ).toBe(false);
    setEmailProvider(nullEmailProvider);
  });

  it("Both OFF (non-urgent) -> no user-visible notification created", () => {
    const r = useStoreHook();
    act(() => {
      r.current.setPreference({
        userId: "stf_1",
        category: "payment",
        inApp: false,
        email: false,
      });
    });
    let id: string | null = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "payment.received",
        title: "T",
        message: "m",
        sourceEventId: "tsk_chan3",
      });
    });
    expect(id).toBeNull();
  });

  it("email-only event does not increase unread count", async () => {
    setEmailProvider(fakeProvider({ ok: true }));
    const r = useStoreHook();
    const before = r.current.unreadCount();
    act(() => {
      r.current.setPreference({
        userId: "stf_1",
        category: "task",
        inApp: false,
        email: true,
      });
    });
    act(() => {
      r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_chan4",
      });
    });
    await new Promise((res) => setTimeout(res, 30));
    expect(r.current.unreadCount()).toBe(before);
    setEmailProvider(nullEmailProvider);
  });

  it("mark all read ignores email-only deliveries", async () => {
    setEmailProvider(fakeProvider({ ok: true }));
    const r = useStoreHook();
    act(() => {
      r.current.setPreference({
        userId: "stf_1",
        category: "task",
        inApp: false,
        email: true,
      });
    });
    act(() => {
      r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_chan5",
      });
    });
    await new Promise((res) => setTimeout(res, 30));
    act(() => r.current.markAllRead());
    const emailOnly = r.current.notifications.find(
      (n) => n.source_event_id === "tsk_chan5",
    );
    expect(emailOnly?.read_at).toBeNull();
    setEmailProvider(nullEmailProvider);
  });
});
