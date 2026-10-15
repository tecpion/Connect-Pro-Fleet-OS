// Connect Pro Fleet — Unassigned Work view (Build #24).
// Surfaces entities the company expects to have an owner but don't: active
// rentals with no CSR, open work orders with no coordinator, active damage
// claims with no owner, and high/urgent unassigned tasks. Useful for
// owners/managers to prevent orphaned work. Reuses getUnassignedWork selector.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { getUnassignedWork, type WorkloadInputs } from "@/lib/staffSelectors";
import { ASSIGNMENT_ENTITY_LABELS } from "@/lib/staffTypes";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router-compat";
import { Inbox } from "lucide-react";

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-status-out",
  high: "text-status-out",
  normal: "text-muted-foreground",
  low: "text-muted-foreground",
};

const ENTITY_HREF: Record<string, string> = {
  rental: "/rentals",
  work_order: "/maintenance",
  damage_claim: "/damage-claims",
  general: "/tasks",
};

export function UnassignedWork({ inputs }: { inputs: WorkloadInputs }) {
  const store = useStore();
  const assignments = useStaffAssignments();
  const damageClaims = useDamageClaims();

  const items = useMemo(
    () =>
      getUnassignedWork({
        tasks: store.tasks,
        rentals: store.rentals,
        workOrders: store.workOrders,
        damageClaims: damageClaims.damageClaims,
        assignments: assignments.assignments,
      }),
    [
      store.tasks,
      store.rentals,
      store.workOrders,
      damageClaims.damageClaims,
      assignments.assignments,
    ],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nothing needs assignment. All work has an owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {items.length} item{items.length === 1 ? "" : "s"} need assignment.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <Link
            key={`${it.entityType}-${it.entityId}`}
            to={ENTITY_HREF[it.entityType] ?? "/"}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[10px]">
                {ASSIGNMENT_ENTITY_LABELS[it.entityType]}
              </Badge>
              <span
                className={`text-[11px] font-medium ${PRIORITY_TONE[it.priority]}`}
              >
                {it.priority}
              </span>
            </div>
            <p className="truncate text-sm font-medium text-foreground">
              {it.label}
            </p>
            <p className="text-xs text-muted-foreground">{it.reason}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
