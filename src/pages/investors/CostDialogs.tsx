import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { uid } from "@/lib/investorStore";
import { TENANT_ID } from "@/lib/store";
import type {
  VehicleOperatingCost,
  VehicleOperatingCostType,
  OperatingCostResponsibility,
} from "@/lib/investorTypes";

export function AddOperatingCostDialog({
  vehicleId,
  onClose,
  onSave,
}: {
  vehicleId: string;
  onClose: () => void;
  onSave: (c: VehicleOperatingCost) => void;
}) {
  const [costType, setCostType] =
    useState<VehicleOperatingCostType>("insurance");
  const [monthlyAmount, setMonthlyAmount] = useState(100);
  const [responsibility, setResponsibility] =
    useState<OperatingCostResponsibility>("operator_pays");

  const save = () => {
    if (monthlyAmount <= 0) return;
    onSave({
      id: uid("voc"),
      tenant_id: TENANT_ID,
      vehicle_id: vehicleId,
      cost_type: costType,
      monthly_amount: monthlyAmount,
      responsibility,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add operating cost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Cost type</Label>
            <select
              value={costType}
              onChange={(e) =>
                setCostType(e.target.value as VehicleOperatingCostType)
              }
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="insurance">Insurance</option>
              <option value="gps_tracker">GPS Tracker</option>
              <option value="maintenance">Maintenance</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label>Monthly amount ($)</Label>
            <Input
              type="number"
              min={0}
              value={monthlyAmount}
              onChange={(e) =>
                setMonthlyAmount(Math.max(0, Number(e.target.value)))
              }
              className="mt-1 font-mono tabular"
            />
          </div>
          <div>
            <Label>Paid by</Label>
            <select
              value={responsibility}
              onChange={(e) =>
                setResponsibility(e.target.value as OperatingCostResponsibility)
              }
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="operator_pays">Operator pays</option>
              <option value="investor_pays">Investor pays</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add cost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddRepairCostDialog({
  vehicleId,
  onClose,
  onSave,
}: {
  vehicleId: string;
  onClose: () => void;
  onSave: (c: import("@/lib/investorTypes").VehicleRepairCost) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [incurredDate, setIncurredDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [responsibility, setResponsibility] =
    useState<OperatingCostResponsibility>("operator_pays");

  const save = () => {
    if (!description.trim() || amount <= 0) return;
    onSave({
      id: uid("vrc"),
      tenant_id: TENANT_ID,
      vehicle_id: vehicleId,
      description: description.trim(),
      amount,
      incurred_date: incurredDate,
      responsibility,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add repair cost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              placeholder="e.g. Transmission repair"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount ($)</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Incurred</Label>
              <Input
                type="date"
                value={incurredDate}
                onChange={(e) => setIncurredDate(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <div>
            <Label>Paid by</Label>
            <select
              value={responsibility}
              onChange={(e) =>
                setResponsibility(e.target.value as OperatingCostResponsibility)
              }
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="operator_pays">Operator pays</option>
              <option value="investor_pays">Investor pays</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!description.trim() || amount <= 0}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add repair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
