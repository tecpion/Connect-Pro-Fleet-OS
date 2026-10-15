// Connect Pro Fleet — Work Order dialogs (Build #13).
// Complete, Cancel, and Cost-correction dialogs. Split from WorkOrderDetail
// to stay under the line limit.

import { useState } from "react";
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
import type { MaintenanceWorkOrder } from "@/lib/maintenanceTypes";

export function CompleteDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (data: {
    work_performed: string | null;
    actual_cost: number | null;
    labor_cost: number | null;
    parts_cost: number | null;
    tax_cost: number | null;
    other_cost: number | null;
    odometer_out: number | null;
    next_service_due_date: string | null;
    next_service_due_odometer: number | null;
    note: string | null;
  }) => void;
}) {
  const [workPerformed, setWorkPerformed] = useState("");
  const [actualCost, setActualCost] = useState("");
  const [labor, setLabor] = useState("");
  const [parts, setParts] = useState("");
  const [tax, setTax] = useState("");
  const [other, setOther] = useState("");
  const [odometerOut, setOdometerOut] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextOdometer, setNextOdometer] = useState("");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete work order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Work performed</Label>
            <Textarea
              value={workPerformed}
              onChange={(e) => setWorkPerformed(e.target.value)}
              placeholder="What was done?"
              className="mt-1"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Actual cost (or leave blank if unknown)</Label>
              <Input
                type="number"
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
                placeholder="Unknown"
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Odometer out (optional)</Label>
              <Input
                type="number"
                value={odometerOut}
                onChange={(e) => setOdometerOut(e.target.value)}
                placeholder="—"
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Labor</Label>
              <Input
                type="number"
                value={labor}
                onChange={(e) => setLabor(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Parts</Label>
              <Input
                type="number"
                value={parts}
                onChange={(e) => setParts(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Tax</Label>
              <Input
                type="number"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Other</Label>
              <Input
                type="number"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Next service date (optional)</Label>
              <Input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Next service mileage (optional)</Label>
              <Input
                type="number"
                value={nextOdometer}
                onChange={(e) => setNextOdometer(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Completion note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                work_performed: workPerformed.trim() || null,
                actual_cost: actualCost ? Number(actualCost) : null,
                labor_cost: labor ? Number(labor) : null,
                parts_cost: parts ? Number(parts) : null,
                tax_cost: tax ? Number(tax) : null,
                other_cost: other ? Number(other) : null,
                odometer_out: odometerOut ? Number(odometerOut) : null,
                next_service_due_date: nextDate || null,
                next_service_due_odometer: nextOdometer
                  ? Number(nextOdometer)
                  : null,
                note: note.trim() || null,
              })
            }
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel work order</DialogTitle>
        </DialogHeader>
        <div>
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being cancelled?"
            className="mt-1"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Cancel work order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CostDialog({
  open,
  onOpenChange,
  wo,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wo: MaintenanceWorkOrder;
  onConfirm: (data: {
    actual_cost: number | null;
    labor_cost: number | null;
    parts_cost: number | null;
    tax_cost: number | null;
    other_cost: number | null;
    note: string | null;
  }) => void;
}) {
  const [actual, setActual] = useState(wo.actual_cost?.toString() ?? "");
  const [labor, setLabor] = useState(wo.labor_cost?.toString() ?? "");
  const [parts, setParts] = useState(wo.parts_cost?.toString() ?? "");
  const [tax, setTax] = useState(wo.tax_cost?.toString() ?? "");
  const [other, setOther] = useState(wo.other_cost?.toString() ?? "");
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update cost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Actual cost</Label>
            <Input
              type="number"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="mt-1 font-mono tabular"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Labor</Label>
              <Input
                type="number"
                value={labor}
                onChange={(e) => setLabor(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Parts</Label>
              <Input
                type="number"
                value={parts}
                onChange={(e) => setParts(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Tax</Label>
              <Input
                type="number"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Other</Label>
              <Input
                type="number"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                actual_cost: actual ? Number(actual) : null,
                labor_cost: labor ? Number(labor) : null,
                parts_cost: parts ? Number(parts) : null,
                tax_cost: tax ? Number(tax) : null,
                other_cost: other ? Number(other) : null,
                note: note.trim() || null,
              })
            }
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
