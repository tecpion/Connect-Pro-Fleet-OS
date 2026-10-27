// Connect Pro Fleet — Maintenance page (Build #13 + Maintenance Workspace).
// A maintenance command center: KPI summary, Maintenance Attention layer,
// segmented queue tabs, search/filter toolbar, enriched work-order table
// (desktop) / cards (mobile), and a work-order detail drawer. Legacy
// MaintenanceRecord history remains visible (read-only). No domain logic
// changes — pure UX composition over authoritative work-order records.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { fmtMoneyExact } from "@/lib/format";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_PRIORITY_LABELS,
} from "@/lib/maintenanceTypes";
import type { WorkOrderStatus } from "@/lib/maintenanceTypes";
import { toast } from "sonner";
import {
  isWorkOrderActive,
  isWorkOrderPastExpectedReady,
  getMonthlyMaintenanceCost,
  searchWorkOrders,
} from "@/lib/maintenanceSelectors";
import { deriveMaintenanceAttention } from "@/lib/maintenanceAttention";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Wrench,
  Plus,
  AlertTriangle,
  Clock,
  DollarSign,
  Car,
  Search,
  Timer,
} from "lucide-react";
import { CreateWorkOrderDialog } from "./maintenance/CreateWorkOrderDialog";
import {
  SmartCaptureDialog,
  SmartCaptureButton,
  MAINTENANCE_PRESET,
} from "@/components/smartcapture/SmartCapture";
import { WorkOrderDetail } from "./maintenance/WorkOrderDetail";
import { VendorsSection } from "./maintenance/VendorsSection";
import {
  MaintKpi,
  MobileCard,
  TabButton,
  WorkOrderTableBody,
  queueLabel,
  type QueueTab,
} from "./maintenance/MaintenanceParts";

const STATUSES = Object.keys(WORK_ORDER_STATUS_LABELS) as WorkOrderStatus[];
const NOW = new Date();

export default function Maintenance() {
  const {
    workOrders,
    vehicles,
    maintenanceVendors,
    staff,
    roles,
    currentStaffId,
    maintenance,
  } = useStore();

  const [tab, setTab] = useState<"work_orders" | "vendors">("work_orders");
  const [queue, setQueue] = useState<QueueTab>("open");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const currentStaff = staff.find((x) => x.id === currentStaffId);
  const role = currentStaff
    ? (roles.find((r) => r.id === currentStaff.role_id) ??
      roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const canCreate = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.add",
  );
  const canViewCost = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.view_costs",
  );

  // --- Attention map (derived, transparent) ---
  const attentionByWo = useMemo(() => {
    const m = new Map<string, ReturnType<typeof deriveMaintenanceAttention>>();
    for (const w of workOrders) m.set(w.id, deriveMaintenanceAttention(w, NOW));
    return m;
  }, [workOrders]);

  // --- KPIs (authoritative) ---
  const openCount = workOrders.filter((w) => isWorkOrderActive(w)).length;
  const inProgressCount = workOrders.filter(
    (w) => w.status === "in_progress",
  ).length;
  const waitingCount = workOrders.filter(
    (w) =>
      w.status === "waiting_for_parts" || w.status === "waiting_for_approval",
  ).length;
  const vehiclesDown = workOrders.filter(
    (w) =>
      w.blocks_vehicle_use &&
      isWorkOrderActive(w) &&
      w.downtime_started_at &&
      !w.downtime_ended_at,
  ).length;
  const dueOverdueCount = workOrders.filter((w) =>
    isWorkOrderPastExpectedReady(w, NOW),
  ).length;
  const yearMonth = new Date().toISOString().slice(0, 7);
  const monthCost = getMonthlyMaintenanceCost(workOrders, yearMonth);
  const needsAttentionCount = workOrders.filter((w) => {
    const a = attentionByWo.get(w.id);
    return a && (a.level === "attention" || a.level === "critical");
  }).length;

  // --- Queue filtering ---
  const filtered = useMemo(() => {
    let list = searchWorkOrders(
      workOrders,
      maintenanceVendors,
      vehicles,
      query,
    );
    if (statusFilter !== "all")
      list = list.filter((w) => w.status === statusFilter);
    if (vehicleFilter !== "all")
      list = list.filter((w) => w.vehicle_id === vehicleFilter);
    if (priorityFilter !== "all")
      list = list.filter((w) => w.priority === priorityFilter);
    if (attentionOnly)
      list = list.filter((w) => {
        const a = attentionByWo.get(w.id);
        return a && (a.level === "attention" || a.level === "critical");
      });
    switch (queue) {
      case "open":
        list = list.filter((w) => isWorkOrderActive(w));
        break;
      case "due":
        list = list.filter((w) => isWorkOrderPastExpectedReady(w, NOW));
        break;
      case "in_progress":
        list = list.filter((w) => w.status === "in_progress");
        break;
      case "waiting":
        list = list.filter(
          (w) =>
            w.status === "waiting_for_parts" ||
            w.status === "waiting_for_approval",
        );
        break;
      case "completed":
        list = list.filter((w) => w.status === "completed");
        break;
      case "all":
        break;
    }
    return list.sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));
  }, [
    workOrders,
    maintenanceVendors,
    vehicles,
    query,
    statusFilter,
    vehicleFilter,
    priorityFilter,
    attentionOnly,
    attentionByWo,
    queue,
  ]);

  const detailWo = detailId ? workOrders.find((w) => w.id === detailId) : null;

  const queueCounts: Record<QueueTab, number> = {
    open: workOrders.filter((w) => isWorkOrderActive(w)).length,
    due: dueOverdueCount,
    in_progress: inProgressCount,
    waiting: waitingCount,
    completed: workOrders.filter((w) => w.status === "completed").length,
    all: workOrders.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        subtitle="Track work orders, downtime, vendors, costs, and service readiness across your fleet."
        actions={
          canCreate && (
            <div className="flex items-center gap-2">
              <SmartCaptureButton
                label="Scan Service Receipt"
                onClick={() => setCaptureOpen(true)}
              />
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                <Plus size={16} className="mr-1.5" /> Create Work Order
              </Button>
            </div>
          )
        }
      />

      <SmartCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        preset={MAINTENANCE_PRESET}
        title="Smart Capture — Service Receipt"
        onConfirm={() => {
          toast.success(
            "Service receipt information ready — review and finish creating the work order.",
          );
          setCaptureOpen(false);
          setCreateOpen(true);
        }}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabButton
          active={tab === "work_orders"}
          onClick={() => setTab("work_orders")}
        >
          Work Orders
        </TabButton>
        <TabButton active={tab === "vendors"} onClick={() => setTab("vendors")}>
          Vendors
        </TabButton>
      </div>

      {tab === "vendors" ? (
        <VendorsSection />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MaintKpi
              icon={<Wrench size={20} />}
              label="Open"
              value={String(openCount)}
              tone="neutral"
            />
            <MaintKpi
              icon={<Clock size={20} />}
              label="In Progress"
              value={String(inProgressCount)}
              tone="rented"
            />
            <MaintKpi
              icon={<AlertTriangle size={20} />}
              label="Waiting"
              value={String(waitingCount)}
              tone="maintenance"
            />
            <MaintKpi
              icon={<Car size={20} />}
              label="Vehicles Down"
              value={String(vehiclesDown)}
              tone="out"
            />
            <MaintKpi
              icon={<Timer size={20} />}
              label="Due / Overdue"
              value={String(dueOverdueCount)}
              tone="out"
            />
            {canViewCost ? (
              <MaintKpi
                icon={<DollarSign size={20} />}
                label="Cost This Month"
                value={fmtMoneyExact(monthCost)}
                tone="available"
                mono
              />
            ) : (
              <MaintKpi
                icon={<AlertTriangle size={20} />}
                label="Needs Attention"
                value={String(needsAttentionCount)}
                tone="maintenance"
                onClick={() => setAttentionOnly((v) => !v)}
                active={attentionOnly}
              />
            )}
          </div>

          {/* Needs Attention filter chip */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAttentionOnly((v) => !v)}
              data-testid="needs-attention-filter"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                attentionOnly
                  ? "border-status-maintenance/40 bg-status-maintenance/10 text-status-maintenance"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              <AlertTriangle size={13} />
              Needs Attention
              <span className="rounded-full bg-status-maintenance/15 px-1.5 text-status-maintenance tabular">
                {needsAttentionCount}
              </span>
            </button>
          </div>

          {/* Queue tabs (segmented) */}
          <div className="seg-control flex flex-wrap">
            {(
              [
                "open",
                "due",
                "in_progress",
                "waiting",
                "completed",
                "all",
              ] as QueueTab[]
            ).map((q) => (
              <button
                key={q}
                onClick={() => setQueue(q)}
                data-testid={`queue-${q}`}
                data-active={queue === q}
                className="seg-control-item inline-flex items-center gap-1.5"
              >
                {queueLabel(q)}
                <span className="rounded-full bg-surface px-1.5 text-[0.65rem] tabular">
                  {queueCounts[q]}
                </span>
              </button>
            ))}
          </div>

          {/* Search + filter toolbar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search work orders, vehicles, vendors…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="wo-search"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-40" data-testid="wo-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {WORK_ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger
                className="sm:w-36"
                data-testid="wo-priority-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <SelectItem key={p} value={p}>
                    {WORK_ORDER_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
              <SelectTrigger
                className="sm:w-48"
                data-testid="wo-vehicle-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.make} {v.model} · {v.license_plate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Result count */}
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-mono font-semibold tabular text-foreground">
              {filtered.length}
            </span>{" "}
            of{" "}
            <span className="font-mono font-semibold tabular text-foreground">
              {workOrders.length}
            </span>{" "}
            work orders
          </p>

          {/* Work orders list — table on desktop, cards on mobile */}
          {filtered.length === 0 ? (
            <EmptyState
              title="No maintenance work orders."
              hint="Create a work order when a vehicle needs service or repair."
              icon={<Wrench size={28} />}
              tone="neutral"
              action={
                canCreate && (
                  <Button
                    onClick={() => setCreateOpen(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary-press"
                  >
                    <Plus size={16} className="mr-1.5" /> Create Work Order
                  </Button>
                )
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Work Order</th>
                        <th className="px-4 py-3 font-medium">Vehicle</th>
                        <th className="px-4 py-3 font-medium">Issue</th>
                        <th className="px-4 py-3 font-medium">Priority</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Vendor</th>
                        <th className="px-4 py-3 font-medium">
                          Expected Ready
                        </th>
                        <th className="px-4 py-3 font-medium">Downtime</th>
                        {canViewCost && (
                          <th className="px-4 py-3 text-right font-medium">
                            Cost
                          </th>
                        )}
                        <th className="px-4 py-3 font-medium">Attention</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <WorkOrderTableBody
                      filtered={filtered}
                      vehicles={vehicles}
                      maintenanceVendors={maintenanceVendors}
                      attentionByWo={attentionByWo}
                      canViewCost={canViewCost}
                      now={NOW}
                      onSelect={setDetailId}
                    />
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 lg:hidden">
                {filtered.map((w) => (
                  <MobileCard
                    key={w.id}
                    wo={w}
                    onClick={() => setDetailId(w.id)}
                    canViewCost={canViewCost}
                    attention={
                      attentionByWo.get(w.id) ?? {
                        level: "healthy" as const,
                        reasons: [],
                      }
                    }
                    now={NOW}
                  />
                ))}
              </div>
            </>
          )}

          {/* Legacy maintenance records (read-only history) */}
          {maintenance.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-2/50 p-4">
              <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Legacy service history
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {maintenance.length} records from the previous maintenance
                tracker. These remain read-only.
              </p>
            </div>
          )}
        </>
      )}

      <CreateWorkOrderDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Work order detail drawer */}
      <Sheet
        open={!!detailId}
        onOpenChange={(v) => {
          if (!v) setDetailId(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Work Order</SheetTitle>
          </SheetHeader>
          {detailWo && <WorkOrderDetail workOrderId={detailWo.id} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
