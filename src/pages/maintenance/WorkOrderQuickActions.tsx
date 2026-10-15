// Connect Pro Fleet — Work Order quick action menu (•••).
//
// A permission- and status-aware dropdown of operational actions for a work
// order. Invalid actions are hidden (e.g. "Start Work" is hidden when the order
// is already in progress or completed; "Complete" is hidden for terminal
// statuses). Each action calls the existing authoritative store method or opens
// the existing detail drawer — no duplicate pages, no new domain logic.

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useCan } from "@/pages/settings/useCan";
import { canTransition } from "@/lib/maintenanceSelectors";
import type {
  MaintenanceWorkOrder,
  WorkOrderStatus,
} from "@/lib/maintenanceTypes";
import { MoreHorizontal } from "lucide-react";

export function WorkOrderQuickActions({
  wo,
  onView,
}: {
  wo: MaintenanceWorkOrder;
  /** Open the work order detail drawer. */
  onView: (id: string) => void;
}) {
  const s = useStore();
  const canEdit = useCan("maintenance.edit");
  const canComplete = useCan("maintenance.complete");
  const canManageDowntime = useCan("maintenance.manage_downtime");
  const canCreateTask = useCan("tasks.create");

  const active = !["completed", "cancelled"].includes(wo.status);
  const isDown =
    wo.downtime_started_at !== null && wo.downtime_ended_at === null;

  const canStartWork =
    canEdit && active && (wo.status === "open" || wo.status === "scheduled");
  const canMarkWaiting =
    canEdit &&
    active &&
    canTransition(wo.status as WorkOrderStatus, "waiting_for_parts");
  const canCompleteWo = canComplete && active;
  const canTakeOos = canManageDowntime && active && !wo.downtime_started_at;
  const canReturnToService = canManageDowntime && isDown;
  const canCancel = canComplete && active;

  const items: {
    label: string;
    show: boolean;
    onClick: () => void;
    destructive?: boolean;
  }[] = [
    {
      label: "View work order",
      show: true,
      onClick: () => onView(wo.id),
    },
    {
      label: "Start work",
      show: canStartWork,
      onClick: () => s.startWorkOrder(wo.id),
    },
    {
      label: "Mark waiting",
      show: canMarkWaiting,
      onClick: () => s.transitionWorkOrder(wo.id, "waiting_for_parts"),
    },
    {
      label: "Complete",
      show: canCompleteWo,
      onClick: () => onView(wo.id),
    },
    {
      label: "Take vehicle out of service",
      show: canTakeOos,
      onClick: () => s.startDowntime(wo.id),
    },
    {
      label: "Return vehicle to service",
      show: canReturnToService,
      onClick: () => s.markVehicleReady(wo.id),
    },
    {
      label: "Create task",
      show: canCreateTask,
      onClick: () => onView(wo.id),
    },
    {
      label: "Cancel work order",
      show: canCancel,
      onClick: () => onView(wo.id),
      destructive: true,
    },
  ];

  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;

  const [first, ...rest] = visible;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-testid={`wo-actions-${wo.id}`}
          aria-label="Work order actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          onClick={first.onClick}
          data-testid="action-view-work-order"
        >
          {first.label}
        </DropdownMenuItem>
        {rest.length > 0 && <DropdownMenuSeparator />}
        {rest.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onClick={item.onClick}
            className={item.destructive ? "text-destructive" : undefined}
            data-testid={`action-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
