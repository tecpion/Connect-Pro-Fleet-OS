// Connect Pro Fleet — "My Work" view (Build #24).
// Shows the CURRENT user's assigned work, ordered by urgency:
// overdue → due today → blocking/urgent → upcoming → normal. Completed work
// is hidden. No financial values are surfaced (operational counts only).

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import type { WorkloadInputs } from "@/lib/staffSelectors";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router-compat";
import {
  AlertTriangle,
  CalendarClock,
  ListTodo,
  CheckSquare,
} from "lucide-react";

const ACTIVE_TASK_STATUSES = ["open", "in_progress"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

interface WorkItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  bucket: "overdue" | "today" | "urgent" | "upcoming" | "normal";
  icon: "task" | "rental" | "wo" | "claim";
}

const BUCKET_LABEL: Record<WorkItem["bucket"], string> = {
  overdue: "Overdue",
  today: "Due today",
  urgent: "Blocking / urgent",
  upcoming: "Upcoming",
  normal: "Normal",
};

const BUCKET_ORDER: WorkItem["bucket"][] = [
  "overdue",
  "today",
  "urgent",
  "upcoming",
  "normal",
];

export function MyWorkView({ inputs }: { inputs: WorkloadInputs }) {
  const store = useStore();
  const assignments = useStaffAssignments();
  const damageClaims = useDamageClaims();
  const me = store.currentStaffId;

  const items = useMemo<WorkItem[]>(() => {
    if (!me) return [];
    const now = new Date();
    const todayMs = startOfDay(now);
    const out: WorkItem[] = [];

    // Tasks assigned to me
    for (const t of store.tasks) {
      if (t.assigned_to_user_id !== me) continue;
      if (!ACTIVE_TASK_STATUSES.includes(t.status)) continue;
      let bucket: WorkItem["bucket"] = "normal";
      if (t.priority === "urgent") bucket = "urgent";
      if (t.due_date) {
        const due = new Date(
          t.due_date + (t.due_time ? `T${t.due_time}` : "T23:59"),
        );
        const dueDay = startOfDay(due);
        if (due < now) bucket = "overdue";
        else if (dueDay === todayMs) bucket = "today";
        else if (bucket !== "urgent") bucket = "upcoming";
      }
      out.push({
        id: t.id,
        title: t.title,
        subtitle: `Task${t.due_date ? ` · due ${t.due_date}` : ""}`,
        href: "/tasks",
        bucket,
        icon: "task",
      });
    }

    // Active rentals assigned to me (via operational assignments)
    const myRentalIds = new Set(
      assignments.assignments
        .filter(
          (a) =>
            a.staff_id === me &&
            a.status === "active" &&
            a.entity_type === "rental",
        )
        .map((a) => a.entity_id),
    );
    for (const r of store.rentals) {
      if (!myRentalIds.has(r.id)) continue;
      if (
        ![
          "active",
          "payment_due",
          "late",
          "overdue",
          "return_pending",
        ].includes(r.status)
      )
        continue;
      let bucket: WorkItem["bucket"] = "normal";
      if (["late", "overdue"].includes(r.status)) bucket = "overdue";
      out.push({
        id: r.id,
        title: r.agreement_number,
        subtitle: `Rental · ${r.status}`,
        href: `/rentals/${r.id}`,
        bucket,
        icon: "rental",
      });
    }

    // Work orders assigned to me
    for (const w of store.workOrders) {
      if (w.assigned_user_id !== me) continue;
      if (
        ![
          "open",
          "scheduled",
          "in_progress",
          "waiting_for_parts",
          "waiting_for_approval",
        ].includes(w.status)
      )
        continue;
      let bucket: WorkItem["bucket"] = "normal";
      if (w.priority === "urgent") bucket = "urgent";
      else if (w.priority === "high") bucket = "urgent";
      out.push({
        id: w.id,
        title: w.work_order_number,
        subtitle: `Work order · ${w.status}`,
        href: "/maintenance",
        bucket,
        icon: "wo",
      });
    }

    // Damage claims assigned to me
    for (const c of damageClaims.damageClaims) {
      if (c.assigned_user_id !== me) continue;
      if (
        ![
          "open",
          "under_review",
          "customer_responsible",
          "insurance_pending",
          "repair_in_progress",
          "recovery_pending",
        ].includes(c.claim_status)
      )
        continue;
      let bucket: WorkItem["bucket"] = "normal";
      if (c.severity === "critical") bucket = "urgent";
      else if (c.severity === "major") bucket = "urgent";
      out.push({
        id: c.id,
        title: c.claim_number,
        subtitle: `Damage claim · ${c.claim_status}`,
        href: "/damage-claims",
        bucket,
        icon: "claim",
      });
    }

    return out;
  }, [
    me,
    store.tasks,
    store.rentals,
    store.workOrders,
    damageClaims.damageClaims,
    assignments.assignments,
  ]);

  const grouped = useMemo(() => {
    const map = new Map<WorkItem["bucket"], WorkItem[]>();
    for (const b of BUCKET_ORDER) map.set(b, []);
    for (const it of items) map.get(it.bucket)!.push(it);
    return map;
  }, [items]);

  if (!me) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No active staff member selected.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <CheckSquare className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          You have no open work assigned. All caught up.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {BUCKET_ORDER.map((bucket) => {
        const list = grouped.get(bucket)!;
        if (list.length === 0) return null;
        return (
          <div key={bucket}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {BUCKET_LABEL[bucket]} ({list.length})
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {list.map((it) => (
                <Link
                  key={it.id}
                  to={it.href}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
                >
                  <ItemIcon icon={it.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {it.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.subtitle}
                    </p>
                  </div>
                  {bucket === "overdue" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-status-out"
                    >
                      overdue
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemIcon({ icon }: { icon: WorkItem["icon"] }) {
  const cls = "h-4 w-4 text-muted-foreground";
  if (icon === "task") return <ListTodo className={cls} />;
  if (icon === "rental") return <CalendarClock className={cls} />;
  if (icon === "wo") return <AlertTriangle className={cls} />;
  return <AlertTriangle className={cls} />;
}
