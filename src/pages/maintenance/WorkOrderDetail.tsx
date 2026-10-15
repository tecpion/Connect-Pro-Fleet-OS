// Connect Pro Fleet — Work Order detail (Build #13 + Workspace).
// The operational command center for a single maintenance work order. Shows
// the command header (contextual actions), a lifecycle indicator, key info,
// issue/work (editable), cost (with linked-expense traceability), a richer
// downtime panel, service details, receipts, and timeline. Dialogs are split
// into WorkOrderDialogs.tsx; helpers into WorkOrderHelpers.tsx.

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { StatusPill } from "@/components/Status";
import { fmtMoneyExact, fmtNumber, fmtDate, fmtDateTime } from "@/lib/format";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONE,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_PRIORITY_TONE,
  MAINTENANCE_TYPE_LABELS,
  WORK_ORDER_SOURCE_LABELS,
  RECEIPT_TYPE_LABELS,
} from "@/lib/maintenanceTypes";
import {
  isWorkOrderActive,
  isWorkOrderPastExpectedReady,
  getDowntimeDuration,
  formatDowntime,
  getWorkOrderCost,
} from "@/lib/maintenanceSelectors";
import { deriveMaintenanceAttention } from "@/lib/maintenanceAttention";
import { MaintenanceAttentionBadge } from "./MaintenanceAttentionBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Wrench,
  Clock,
  DollarSign,
  Paperclip,
  CalendarClock,
  ListTodo,
  FileText,
  CheckCircle2,
  RotateCcw,
  Car,
  XCircle,
  PlayCircle,
  Timer,
  Link2,
} from "lucide-react";
import { CreateTaskDialog } from "@/pages/tasks/CreateTaskDialog";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import {
  Section,
  Tile,
  CostTile,
  LifecycleBar,
  EditableField,
} from "./WorkOrderHelpers";
import { CompleteDialog, CancelDialog, CostDialog } from "./WorkOrderDialogs";

const NOW = new Date();

export function WorkOrderDetail({ workOrderId }: { workOrderId: string }) {
  const s = useStore();
  const dc = useDamageClaims();
  const wo = s.workOrderById(workOrderId);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [receiptName, setReceiptName] = useState("");

  if (!wo) return null;

  const currentStaff = s.staff.find((x) => x.id === s.currentStaffId);
  const role = currentStaff
    ? (s.roles.find((r) => r.id === currentStaff.role_id) ??
      s.roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const canEdit = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.edit",
  );
  const canComplete = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.complete",
  );
  const canViewCost = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.view_costs",
  );
  const canEditCost = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.edit_costs",
  );
  const canManageDowntime = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.manage_downtime",
  );

  const vehicle = s.vehicles.find((v) => v.id === wo.vehicle_id);
  const vendor = wo.vendor_id
    ? s.maintenanceVendors.find((v) => v.id === wo.vendor_id)
    : null;
  const assignee = wo.assigned_user_id
    ? s.staff.find((x) => x.id === wo.assigned_user_id)
    : null;
  const events = s.workOrderEvents(workOrderId);
  const receipts = s.workOrderReceipts(workOrderId);
  const active = isWorkOrderActive(wo);
  const pastReady = isWorkOrderPastExpectedReady(wo, NOW);
  const cost = getWorkOrderCost(wo);
  const downtime = getDowntimeDuration(wo, NOW);
  const vehicleWOs = s.vehicleWorkOrders(wo.vehicle_id);
  const attention = deriveMaintenanceAttention(wo, NOW);

  // Linked expense (auto-synced on completion — traceability, not duplication).
  const linkedExpense = s.expenses.find(
    (e) => e.maintenance_work_order_id === wo.id && !e.reversal_of,
  );

  const saveField = (
    field: "reported_issue" | "diagnosis" | "work_performed",
    value: string,
  ) => {
    s.updateWorkOrder(wo.id, { [field]: value.trim() || null });
    toast.success("Updated.");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-semibold text-foreground">
              {wo.work_order_number}
            </p>
            <StatusPill tone={WORK_ORDER_STATUS_TONE[wo.status]}>
              {WORK_ORDER_STATUS_LABELS[wo.status]}
            </StatusPill>
            <StatusPill tone={WORK_ORDER_PRIORITY_TONE[wo.priority]}>
              {WORK_ORDER_PRIORITY_LABELS[wo.priority]}
            </StatusPill>
            {pastReady && active && (
              <StatusPill tone="out">Past expected ready</StatusPill>
            )}
            {wo.blocks_vehicle_use && active && (
              <StatusPill tone="maintenance">Vehicle down</StatusPill>
            )}
            <MaintenanceAttentionBadge attention={attention} compact />
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold text-foreground">
            {wo.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {MAINTENANCE_TYPE_LABELS[wo.maintenance_type]} ·{" "}
            {WORK_ORDER_SOURCE_LABELS[wo.source]}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          {active && canEdit && wo.status === "open" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => s.startWorkOrder(wo.id)}
            >
              <PlayCircle size={14} /> Start work
            </Button>
          )}
          {active && canComplete && (
            <Button
              size="sm"
              onClick={() => setShowComplete(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <CheckCircle2 size={14} /> Complete
            </Button>
          )}
          {active && canManageDowntime && !wo.downtime_started_at && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => s.startDowntime(wo.id)}
            >
              <Car size={14} /> Take out of service
            </Button>
          )}
          {wo.downtime_started_at &&
            !wo.downtime_ended_at &&
            canManageDowntime && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => s.markVehicleReady(wo.id)}
              >
                <CheckCircle2 size={14} /> Return to service
              </Button>
            )}
          {wo.status === "completed" && canComplete && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => s.reopenWorkOrder(wo.id)}
            >
              <RotateCcw size={14} /> Reopen
            </Button>
          )}
          {active && canComplete && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCancel(true)}
            >
              <XCircle size={14} /> Cancel
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowTask(true)}>
            <ListTodo size={14} /> Create task
          </Button>
        </div>
      </div>

      <LifecycleBar wo={wo} />

      {/* Key info grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Vehicle"
          value={vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
          sub={vehicle?.license_plate}
        />
        <Tile label="Vendor" value={vendor?.name ?? "—"} />
        <Tile label="Assigned to" value={assignee?.full_name ?? "Unassigned"} />
        <Tile
          label="Expected ready"
          value={wo.expected_ready_at ? fmtDateTime(wo.expected_ready_at) : "—"}
          highlight={pastReady}
        />
      </div>

      {/* Issue & work (editable) */}
      <Section title="Issue & work" icon={<Wrench size={15} />}>
        <div className="space-y-3 text-sm">
          <EditableField
            label="Reported issue"
            field="reported_issue"
            value={wo.reported_issue}
            canEdit={canEdit}
            onEdit={() => {}}
            onSave={saveField}
          />
          <EditableField
            label="Diagnosis"
            field="diagnosis"
            value={wo.diagnosis}
            canEdit={canEdit}
            onEdit={() => {}}
            onSave={saveField}
          />
          <EditableField
            label="Work performed"
            field="work_performed"
            value={wo.work_performed}
            canEdit={canEdit}
            onEdit={() => {}}
            onSave={saveField}
          />
        </div>
      </Section>

      {/* Cost + traceability */}
      {canViewCost && (
        <Section title="Cost" icon={<DollarSign size={15} />}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CostTile label="Estimated" value={wo.estimated_cost} />
            <CostTile label="Labor" value={wo.labor_cost} />
            <CostTile label="Parts" value={wo.parts_cost} />
            <CostTile label="Tax" value={wo.tax_cost} />
            <CostTile label="Other" value={wo.other_cost} />
            <CostTile label="Actual total" value={cost} highlight />
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Linked expense
              </p>
              {linkedExpense ? (
                <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                  <Link2 size={13} className="text-primary" />
                  <span className="font-mono tabular">
                    {linkedExpense.expense_number}
                  </span>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No linked expense
                </p>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {cost != null
              ? `Actual: ${fmtMoneyExact(cost)}`
              : wo.estimated_cost != null
                ? `Estimate: ${fmtMoneyExact(wo.estimated_cost)} (not yet posted)`
                : "No cost recorded."}
          </p>
          {canEditCost && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setShowCost(true)}
            >
              Update cost
            </Button>
          )}
        </Section>
      )}

      {/* Downtime — richer panel */}
      <Section title="Downtime" icon={<Clock size={15} />}>
        {wo.downtime_started_at ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Tile
                label="Out of service since"
                value={fmtDateTime(wo.downtime_started_at)}
              />
              <Tile
                label="Returned to service"
                value={
                  wo.downtime_ended_at ? fmtDateTime(wo.downtime_ended_at) : "—"
                }
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-3">
              <Timer size={16} className="text-status-maintenance" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Actual downtime
                </p>
                <p className="font-mono text-lg font-semibold tabular text-foreground">
                  {formatDowntime(downtime)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vehicle has not been taken out of service for this work order.
          </p>
        )}
      </Section>

      {/* Service details */}
      <Section title="Service details" icon={<CalendarClock size={15} />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Odometer in"
            value={
              wo.odometer_in != null ? `${fmtNumber(wo.odometer_in)} mi` : "—"
            }
          />
          <Tile
            label="Odometer out"
            value={
              wo.odometer_out != null ? `${fmtNumber(wo.odometer_out)} mi` : "—"
            }
          />
          <Tile
            label="Next service date"
            value={
              wo.next_service_due_date ? fmtDate(wo.next_service_due_date) : "—"
            }
          />
          <Tile
            label="Next service mileage"
            value={
              wo.next_service_due_odometer != null
                ? `${fmtNumber(wo.next_service_due_odometer)} mi`
                : "—"
            }
          />
        </div>
      </Section>

      {/* Receipts */}
      <Section
        title="Receipts & documents"
        icon={<Paperclip size={15} />}
        right={
          <div className="flex items-center gap-2">
            <Input
              placeholder="File name"
              value={receiptName}
              onChange={(e) => setReceiptName(e.target.value)}
              className="h-8 w-32 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!receiptName.trim()) {
                  toast.error("Enter a file name.");
                  return;
                }
                s.addReceipt({
                  work_order_id: wo.id,
                  file_name: receiptName.trim(),
                  file_url: `/receipts/${receiptName.trim()}`,
                });
                setReceiptName("");
                toast.success("Receipt added.");
              }}
            >
              Add
            </Button>
          </div>
        }
      >
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText
                    size={15}
                    className="shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.file_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {RECEIPT_TYPE_LABELS[r.receipt_type]}
                      {r.amount != null && ` · ${fmtMoneyExact(r.amount)}`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    s.voidReceipt(r.id);
                    toast.success("Receipt voided.");
                  }}
                >
                  Void
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Timeline */}
      <Section title="Timeline" icon={<Clock size={15} />}>
        <ol className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">{e.label}</p>
                <p className="font-mono text-xs tabular text-muted-foreground">
                  {fmtDateTime(e.created_at)}
                  {e.actor_user_id &&
                    ` · ${s.staff.find((x) => x.id === e.actor_user_id)?.full_name ?? "System"}`}
                </p>
                {e.note && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Notes */}
      <Section title="Notes" icon={<FileText size={15} />}>
        <div className="flex gap-2">
          <Input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!noteText.trim()) return;
              s.addWorkOrderNote(wo.id, noteText.trim());
              setNoteText("");
              toast.success("Note added.");
            }}
          >
            Add
          </Button>
        </div>
      </Section>

      {/* Other work orders for this vehicle */}
      {vehicleWOs.filter((w) => w.id !== wo.id).length > 0 && (
        <Section
          title="Other work orders for this vehicle"
          icon={<Wrench size={15} />}
        >
          <ul className="divide-y divide-border">
            {vehicleWOs
              .filter((w) => w.id !== wo.id)
              .map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="font-mono text-foreground">
                    {w.work_order_number}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {w.title}
                  </span>
                  <StatusPill tone={WORK_ORDER_STATUS_TONE[w.status]}>
                    {WORK_ORDER_STATUS_LABELS[w.status]}
                  </StatusPill>
                </li>
              ))}
          </ul>
        </Section>
      )}

      {dc.damageClaims.some((c) => c.maintenance_work_order_id === wo.id) && (
        <Section title="Linked damage claim" icon={<FileText size={15} />}>
          {dc.damageClaims
            .filter((c) => c.maintenance_work_order_id === wo.id)
            .map((c) => (
              <Link
                key={c.id}
                to={`/damage-claims?claim=${c.id}`}
                className="block py-1 font-mono text-sm text-primary hover:underline"
              >
                {c.claim_number} · {c.description}
              </Link>
            ))}
        </Section>
      )}

      {/* Dialogs */}
      <CompleteDialog
        open={showComplete}
        onOpenChange={setShowComplete}
        onConfirm={(data) => {
          s.completeWorkOrder({ id: wo.id, ...data });
          setShowComplete(false);
          toast.success("Work order completed.");
        }}
      />
      <CancelDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        onConfirm={(reason) => {
          s.cancelWorkOrder(wo.id, reason);
          setShowCancel(false);
          toast.success("Work order cancelled.");
        }}
      />
      <CostDialog
        open={showCost}
        onOpenChange={setShowCost}
        wo={wo}
        onConfirm={(data) => {
          s.updateWorkOrderCost({ id: wo.id, ...data });
          setShowCost(false);
          toast.success("Cost updated.");
        }}
      />
      <CreateTaskDialog
        open={showTask}
        onOpenChange={setShowTask}
        preset={{
          entityType: "maintenance_work_order",
          entityId: wo.id,
          entityLabel: `${wo.work_order_number} · ${vehicle ? `${vehicle.make} ${vehicle.model}` : ""}`,
          title: `Follow up — ${wo.title}`,
          category: "maintenance",
        }}
      />
    </div>
  );
}
