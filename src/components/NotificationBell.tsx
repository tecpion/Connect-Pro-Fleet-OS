// Connect Pro Fleet — notification bell (Build #12).
//
// Bell icon in the staff layout header showing the unread count (0 -> none,
// 1-99 -> number, 99+ -> "99+"). Click opens a recent-notifications panel
// (drawer on mobile). Opening a notification marks it read + navigates to the
// action_url. Unread state is not color-only (dot + bold + aria-label).
// Respects prefers-reduced-motion for the panel transition.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  isUnread,
  relativeTime,
  unreadBadge,
} from "@/lib/notificationSelectors";
import { NOTIFICATION_PRIORITY_TONE } from "@/lib/notificationTypes";
import { statusToneClasses } from "@/lib/format";
import { Bell, CheckCheck, X } from "lucide-react";

export function NotificationBell() {
  const {
    currentStaffId,
    unreadCount,
    openNotification,
    markAllRead,
    notificationsForUser,
  } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const count = unreadCount();
  const badge = unreadBadge(count);
  // notificationsForUser is feed-filtered (in-app deliveries only), so
  // email-only notifications never appear in the bell panel.
  const recent = notificationsForUser(currentStaffId).slice(0, 8);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${badge ? `, ${count} unread` : ""}`}
        aria-expanded={open}
        className="relative rounded-md p-2 text-foreground transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Bell size={18} />
        {badge && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D64545] px-1 font-mono text-[10px] font-semibold text-white"
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] origin-top-right rounded-lg border border-border bg-surface shadow-lg motion-reduce:transition-none"
          style={{ animation: "none" }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-display text-sm font-semibold text-foreground">
              Notifications
            </p>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck size={13} /> Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
                aria-label="Close notifications"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((n) => {
                  const unread = isUnread(n);
                  const tone = NOTIFICATION_PRIORITY_TONE[n.priority];
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          const url = openNotification(n.id);
                          setOpen(false);
                          if (url) navigate(url);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-2",
                          unread && "bg-surface-2/50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            statusToneClasses[tone].dot,
                          )}
                          aria-label={unread ? "Unread" : "Read"}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "truncate text-sm text-foreground",
                              unread && "font-semibold",
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {n.message}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {relativeTime(n.created_at)}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <button
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="w-full rounded-md py-1.5 text-center text-xs font-medium text-primary hover:underline"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
