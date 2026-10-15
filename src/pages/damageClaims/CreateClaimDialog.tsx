// Connect Pro Fleet — create damage claim dialog (Build #17).

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
  DialogDescription,
} from "@/components/ui/dialog";
import type { DamageSource, DamageSeverity } from "@/lib/damageClaimTypes";
import {
  DAMAGE_SOURCES,
  SEVERITIES,
  sourceLabel,
  severityLabel,
} from "./shared";

export function CreateClaimDialog({
  vehicles,
  rentals,
  staff,
  prefillVehicleId,
  prefillRentalId,
  prefillCustomerId,
  prefillInspectionId,
  prefillIncidentId,
  onClose,
  onSave,
}: {
  vehicles: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
    year: number;
  }[];
  rentals: {
    id: string;
    agreement_number: string;
    customer_id: string;
    vehicle_id: string;
  }[];
  staff: { id: string; full_name: string }[];
  prefillVehicleId?: string | null;
  prefillRentalId?: string | null;
  prefillCustomerId?: string | null;
  prefillInspectionId?: string | null;
  prefillIncidentId?: string | null;
  onClose: () => void;
  onSave: (input: {
    vehicle_id: string;
    rental_id: string | null;
    reservation_id: string | null;
    customer_id: string | null;
    inspection_id: string | null;
    incident_id: string | null;
    damage_source: DamageSource;
    description: string;
    severity: DamageSeverity;
    blocks_vehicle_use: boolean;
    estimated_repair_cost: number | null;
    assigned_user_id: string | null;
  }) => void;
}) {
  const [vehicleId, setVehicleId] = useState(prefillVehicleId ?? "");
  const [damageSource, setDamageSource] = useState<DamageSource>(
    prefillInspectionId ? "checkin_inspection" : "staff_discovery",
  );
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<DamageSeverity>("minor");
  const [blocksVehicle, setBlocksVehicle] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [assignee, setAssignee] = useState("");

  const vehicleLabel = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model} · ${v.license_plate}` : "—";
  };

  function save() {
    if (!vehicleId || !description.trim()) return;
    const rental = prefillRentalId
      ? rentals.find((r) => r.id === prefillRentalId)
      : null;
    onSave({
      vehicle_id: vehicleId,
      rental_id: prefillRentalId ?? null,
      reservation_id: null,
      customer_id: prefillCustomerId ?? rental?.customer_id ?? null,
      inspection_id: prefillInspectionId ?? null,
      incident_id: prefillIncidentId ?? null,
      damage_source: damageSource,
      description: description.trim(),
      severity,
      blocks_vehicle_use: blocksVehicle,
      estimated_repair_cost: estimate ? Number(estimate) : null,
      assigned_user_id: assignee || null,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create damage claim</DialogTitle>
          <DialogDescription>
            Open an operational case for a damage incident. You can add
            evidence, determine responsibility, and bill the customer after
            review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="dc-vehicle">Vehicle</Label>
            <select
              id="dc-vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {vehicleLabel(v.id)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="dc-source">Damage source</Label>
            <select
              id="dc-source"
              value={damageSource}
              onChange={(e) => setDamageSource(e.target.value as DamageSource)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {DAMAGE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="dc-desc">Description</Label>
            <Textarea
              id="dc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the damage…"
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dc-sev">Severity</Label>
              <select
                id="dc-sev"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as DamageSeverity)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {severityLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="dc-est">Estimated repair cost</Label>
              <Input
                id="dc-est"
                type="number"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="0"
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="dc-assign">Assign to</Label>
            <select
              id="dc-assign"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={blocksVehicle}
              onChange={(e) => setBlocksVehicle(e.target.checked)}
              className="rounded border-input"
            />
            Take vehicle out of service
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!vehicleId || !description.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Create claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
