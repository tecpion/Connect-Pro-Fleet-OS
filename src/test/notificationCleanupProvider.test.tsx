// Connect Pro Fleet — Build #12 cleanup: email provider + idempotency + finance.

import { describe, it, expect } from "vitest";
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

describe("email provider hardening", () => {
  it("null provider never returns SENT", () => {
    setEmailProvider(nullEmailProvider);
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_prov1",
      })!;
    });
    const email = r.current
      .deliveriesFor(id)
      .filter((x) => x.channel === "email");
    expect(email.every((x) => x.status !== "sent")).toBe(true);
  });

  it("configured provider success returns SENT", async () => {
    setEmailProvider(fakeProvider({ ok: true, messageId: "msg_ok" }));
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_prov2",
      })!;
    });
    await new Promise((res) => setTimeout(res, 30));
    const email = r.current
      .deliveriesFor(id)
      .filter((x) => x.channel === "email");
    expect(email.some((x) => x.status === "sent")).toBe(true);
    expect(email.some((x) => x.provider_message_id === "msg_ok")).toBe(true);
    setEmailProvider(nullEmailProvider);
  });

  it("provider failure returns FAILED", async () => {
    setEmailProvider(fakeProvider({ ok: false, failureReason: "boom" }));
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_prov3",
      })!;
    });
    await new Promise((res) => setTimeout(res, 30));
    const email = r.current
      .deliveriesFor(id)
      .filter((x) => x.channel === "email");
    expect(email.some((x) => x.status === "failed")).toBe(true);
    setEmailProvider(nullEmailProvider);
  });

  it("successful email cannot be retried into a duplicate send", async () => {
    setEmailProvider(fakeProvider({ ok: true, messageId: "msg_lock" }));
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_prov4",
      })!;
    });
    await new Promise((res) => setTimeout(res, 30));
    const sentBefore = r.current
      .deliveriesFor(id)
      .filter((x) => x.channel === "email" && x.status === "sent").length;
    act(() => r.current.retryEmail(id));
    await new Promise((res) => setTimeout(res, 30));
    const sentAfter = r.current
      .deliveriesFor(id)
      .filter((x) => x.channel === "email" && x.status === "sent").length;
    expect(sentAfter).toBe(sentBefore);
    setEmailProvider(nullEmailProvider);
  });

  it("failed email retry increments attempt count, no new notification", async () => {
    setEmailProvider(fakeProvider({ ok: false, failureReason: "retry me" }));
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_prov5",
      })!;
    });
    await new Promise((res) => setTimeout(res, 30));
    const notifBefore = r.current.notifications.length;
    act(() => r.current.retryEmail(id));
    await new Promise((res) => setTimeout(res, 30));
    expect(r.current.notifications.length).toBe(notifBefore);
    const attempts = r.current
      .deliveriesFor(id)
      .filter((x) => x.channel === "email");
    expect(attempts.some((x) => x.attempt_count >= 2)).toBe(true);
    setEmailProvider(nullEmailProvider);
  });
});

describe("idempotency", () => {
  it("rapid repeated action-driven event creates one occurrence", () => {
    const r = useStoreHook();
    let a: string | null = "";
    let b: string | null = "";
    act(() => {
      a = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_idem1",
      });
      b = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_idem1",
      });
    });
    expect(a).toBeTruthy();
    expect(b).toBeNull();
  });

  it("scan rerun creates no duplicate", () => {
    const r = useStoreHook();
    let second = 0;
    act(() => {
      r.current.generateNotifications();
    });
    act(() => {
      second = r.current.generateNotifications().created;
    });
    expect(second).toBe(0);
  });

  it("notification state not lost during rapid read/unread", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.notify({
        recipientUserId: "stf_1",
        type: "task.assigned",
        title: "T",
        message: "m",
        sourceEventId: "tsk_idem2",
      })!;
    });
    act(() => {
      r.current.markRead(id);
      r.current.markUnread(id);
      r.current.markRead(id);
    });
    const n = r.current.notificationsForUser("stf_1").find((x) => x.id === id);
    expect(n).toBeDefined();
    expect(n!.read_at).not.toBeNull();
  });
});

describe("financial non-interference", () => {
  it("suppression logic changes no financial state", () => {
    const r = useStoreHook();
    const before = r.current.transactions.length;
    act(() => {
      r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_fin1",
        entityLabel: "AGR-FIN-1",
        title: "Follow up on overdue rental",
        category: "return",
        priority: "high",
      });
      r.current.notify({
        recipientUserId: "stf_1",
        type: "rental.overdue",
        title: "T",
        message: "m",
        entityType: "rental",
        entityId: "rnt_fin1",
        sourceEventId: "rnt_fin1",
      });
    });
    expect(r.current.transactions.length).toBe(before);
  });

  it("channel preferences change no financial state", () => {
    const r = useStoreHook();
    const before = r.current.transactions.length;
    act(() => {
      r.current.setPreference({
        userId: "stf_1",
        category: "deposit",
        inApp: false,
        email: false,
      });
    });
    expect(r.current.transactions.length).toBe(before);
  });
});
