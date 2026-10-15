// Connect Pro Fleet — Notifications page (Build #12).
//
// The staff awareness feed. Stacked cards (no wide tables), filters by
// category/archive, mark read/unread, mark all read, archive. Opening a
// notification marks it read and navigates to the action_url — it never alters
// the underlying domain record. User-scoped: selectors enforce isolation.

import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  isUnread,
  relativeTime,
  sortNotificationsOperational,
} from "@/lib/notificationSelectors";
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_PRIORITY_TONE,
  type Notification,
  type NotificationCategory,
} from "@/lib/notificationTypes";
import { statusToneClasses } from "@/lib/format";
import { Bell, CheckCheck, Archive, Check, RotateCcw } from "lucide-react";

type FilterKey = "all" | "unread" | "archived" | NotificationCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "task", label: "Tasks" },
  { key: "rental", label: "Rentals & Returns" },
  { key: "payment_arrangement", label: "Payments & Arrangements" },
  { key: "maintenance", label: "Vehicles & Maintenance" },
  { key: "document", label: "Documents & Verification" },
  { key: "deposit", label: "Deposits" },
  { key: "damage", label: "Incidents & Damage" },
  { key: "archived", label: "Archived" },
];

export default function Notifications() {
  const {
    currentStaffId,
    notificationsForUser,
    openNotification,
    markUnread,
    markAllRead,
    archiveNotification,
  } = useStore();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");

  // notificationsForUser is feed-filtered (in-app deliveries only) —
  // email-only notifications are excluded from the feed.
  const mine = useMemo(
    () => notificationsForUser(currentStaffId),
    [notificationsForUser, currentStaffId],
  );

  const rows = useMemo(() => {
    let r = mine;
    if (filter === "unread") r = r.filter(isUnread);
    else if (filter === "archived") r = r.filter((n) => n.archived_at !== null);
    else if (filter !== "all")
      r = r.filter((n) => n.category === filter && n.archived_at === null);
    else r = r.filter((n) => n.archived_at === null);
    return sortNotificationsOperational(r);
  }, [mine, filter]);

  const unreadCount = mine.filter(isUnread).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Operational alerts and updates that need your attention."
        actions={
          <Button
            variant="outline"
            onClick={() => markAllRead()}
            disabled={unreadCount === 0}
          >
            <CheckCheck size={15} className="mr-1.5" /> Mark all read
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          hint="No notifications here right now. New alerts will appear as they happen."
          icon={<Bell size={28} />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((n) => (
            <NotificationCard
              key={n.id}
              n={n}
              onOpen={() => {
                const url = openNotification(n.id);
                if (url) navigate(url);
              }}
              onUnread={() => markUnread(n.id)}
              onArchive={() => archiveNotification(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  n,
  onOpen,
  onUnread,
  onArchive,
}: {
  n: Notification;
  onOpen: () => void;
  onUnread: () => void;
  onArchive: () => void;
}) {
  const unread = isUnread(n);
  const tone = NOTIFICATION_PRIORITY_TONE[n.priority];
  return (
    <div
      className={cn(
        "rounded-lg border bg-surface p-4 transition-colors",
        unread ? "border-l-2 border-border" : "border-border opacity-80",
      )}
      style={unread ? { borderLeftColor: "var(--primary)" } : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            statusToneClasses[tone].dot,
          )}
          aria-label={`${n.priority} priority`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={onOpen}
              className="text-left text-sm font-semibold text-foreground hover:text-primary"
            >
              {n.title}
            </button>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {relativeTime(n.created_at)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
          {n.entity_label && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {n.entity_label}
              </span>
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {NOTIFICATION_CATEGORY_LABELS[n.category]}
            </span>
            {unread && (
              <button
                onClick={onUnread}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw size={11} /> Mark unread
              </button>
            )}
            <button
              onClick={onArchive}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Archive size={11} /> Archive
            </button>
            {n.action_url && (
              <button
                onClick={onOpen}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Check size={11} /> Open
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
