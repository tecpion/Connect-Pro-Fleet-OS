// Connect Pro Fleet — Create Work Order dialog (Build #13 + Workspace).
// Fast work-order creation with grouped sections: Work, Assignment, Schedule,
// Vehicle Availability (explicit Keep Available / Out of Service), Cost, and
// Notes/Source. Supports contextual pre-fill (vehicle) via props. Source/context
// captures where the work order originated. No domain logic changes — the
// createWorkOrder store method remains authoritative.

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAINTENANCE_TYPE_LABELS,
  WORK_ORDER_PRIORITY_LABELS,
  WORK_ORDER_SOURCE_LABELS,
} from "@/lib/maintenanceTypes";
import type {
  MaintenanceType,
  WorkOrderPriority,
  WorkOrderSource,
} from "@/lib/maintenanceTypes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPES = Object.keys(MAINTENANCE_TYPE_LABELS) as MaintenanceType[];
const PRIORITIES = Object.keys(
  WORK_ORDER_PRIORITY_LABELS,
) as WorkOrderPriority[];
const SOURCES = Object.keys(WORK_ORDER_SOURCE_LABELS) as WorkOrderSource[];

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function CreateWorkOrderDialog({
  open,
  onOpenChange,
  presetVehicleId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetVehicleId?: string | null;
}) {
  const { vehicles, maintenanceVendors, staff, createWorkOrder } = useStore();
  const [vehicleId, setVehicleId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MaintenanceType>("routine_service");
  const [priority, setPriority] = useState<WorkOrderPriority>("normal");
  const [vendorId, setVendorId] = useState("__none__");
  const [assignee, setAssignee] = useState("__none__");
  const [scheduledStart, setScheduledStart] = useState("");
  const [expectedReady, setExpectedReady] = useState("");
  const [estimatedDowntime, setEstimatedDowntime] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [availability, setAvailability] = useState<"keep" | "out">("keep");
  const [currentOdometer, setCurrentOdometer] = useState("");
  const [reportedIssue, setReportedIssue] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<WorkOrderSource>("manual");

  useEffect(() => {
    if (open) {
      setVehicleId(presetVehicleId ?? vehicles[0]?.id ?? "");
      setTitle("");
      setType("routine_service");
      setPriority("normal");
      setVendorId("__none__");
      setAssignee("__none__");
      setScheduledStart("");
      setExpectedReady("");
      setEstimatedDowntime("");
      setEstimatedCost("");
      setAvailability("keep");
      setCurrentOdometer("");
      setReportedIssue("");
      setNotes("");
      setSource("manual");
    }
  }, [open, presetVehicleId, vehicles]);

  const submit = () => {
    if (!vehicleId) {
      toast.error("Select a vehicle.");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a title for the work order.");
      return;
    }
    createWorkOrder({
      vehicle_id: vehicleId,
      title: title.trim(),
      maintenance_type: type,
      priority,
      source,
      description: notes.trim() || null,
      reported_issue: reportedIssue.trim() || null,
      vendor_id: vendorId === "__none__" ? null : vendorId,
      assigned_user_id: assignee === "__none__" ? null : assignee,
      scheduled_start_at: scheduledStart
        ? new Date(scheduledStart).toISOString()
        : null,
      expected_ready_at: expectedReady
        ? new Date(expectedReady).toISOString()
        : null,
      estimated_cost: estimatedCost ? Number(estimatedCost) : null,
      blocks_vehicle_use: availability === "out",
      notes: notes.trim() || null,
    });
    toast.success("Work order created.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create work order</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Work */}
          <div className="space-y-3">
            <GroupTitle>Work</GroupTitle>
            <div>
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model} · {v.license_plate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title / issue</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Brake pads + rotors replacement"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label>Reported issue (optional)</Label>
              <Textarea
                value={reportedIssue}
                onChange={(e) => setReportedIssue(e.target.value)}
                placeholder="What's wrong with the vehicle?"
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Maintenance type</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as MaintenanceType)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {MAINTENANCE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as WorkOrderPriority)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {WORK_ORDER_PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="space-y-3">
            <GroupTitle>Assignment</GroupTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor (optional)</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No vendor</SelectItem>
                    {maintenanceVendors
                      .filter((v) => v.active)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign to (optional)</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <GroupTitle>Schedule</GroupTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Scheduled start (optional)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  className="mt-1 font-mono tabular"
                />
              </div>
              <div>
                <Label>Expected ready (optional)</Label>
                <Input
                  type="datetime-local"
                  value={expectedReady}
                  onChange={(e) => setExpectedReady(e.target.value)}
                  className="mt-1 font-mono tabular"
                />
              </div>
            </div>
            <div>
              <Label>Estimated downtime (optional)</Label>
              <Input
                value={estimatedDowntime}
                onChange={(e) => setEstimatedDowntime(e.target.value)}
                placeholder="e.g. 2 hours, 1 day, 3 days"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Planning metadata only — separate from actual downtime.
              </p>
            </div>
          </div>

          {/* Vehicle Availability */}
          <div className="space-y-3">
            <GroupTitle>Vehicle Availability</GroupTitle>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAvailability("keep")}
                data-testid="availability-keep"
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  availability === "keep"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="block font-medium">
                  Keep Vehicle Available
                </span>
                <span className="text-xs">Vehicle stays in service.</span>
              </button>
              <button
                type="button"
                onClick={() => setAvailability("out")}
                data-testid="availability-out"
                className={cn(
                  "rounded-lg border p-3 text-left text-sm transition-colors",
                  availability === "out"
                    ? "border-status-out bg-status-out/5 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="block font-medium">
                  Take Vehicle Out of Service
                </span>
                <span className="text-xs">
                  Removes vehicle from availability.
                </span>
              </button>
            </div>
          </div>

          {/* Cost */}
          <div className="space-y-3">
            <GroupTitle>Cost</GroupTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estimated cost (optional)</Label>
                <Input
                  type="number"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(e.target.value)}
                  placeholder="0"
                  className="mt-1 font-mono tabular"
                />
              </div>
              <div>
                <Label>Current odometer (optional)</Label>
                <Input
                  type="number"
                  value={currentOdometer}
                  onChange={(e) => setCurrentOdometer(e.target.value)}
                  placeholder="—"
                  className="mt-1 font-mono tabular"
                />
              </div>
            </div>
          </div>

          {/* Notes / Source */}
          <div className="space-y-3">
            <GroupTitle>Notes / Source</GroupTitle>
            <div>
              <Label>Source</Label>
              <Select
                value={source}
                onValueChange={(v) => setSource(v as WorkOrderSource)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {WORK_ORDER_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Parts ordered, follow-up, context…"
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Create work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
