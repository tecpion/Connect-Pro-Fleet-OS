import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  InvestorVehicle,
  InvestorOwnershipType,
} from "@/lib/investorTypes";
import type { CompensationArrangement } from "@/lib/ownershipTypes";
import { CompensationForm } from "./CompensationForm";

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function AddPairingDialog({
  investorId,
  vehicles,
  takenVehicleIds,
  onClose,
  onSave,
}: {
  investorId: string;
  vehicles: {
    id: string;
    year: number;
    make: string;
    model: string;
    license_plate: string;
  }[];
  takenVehicleIds: string[];
  onClose: () => void;
  onSave: (iv: InvestorVehicle) => void;
}) {
  const availableVehicles = vehicles.filter(
    (v) => !takenVehicleIds.includes(v.id),
  );
  const [vehicleId, setVehicleId] = useState(availableVehicles[0]?.id ?? "");
  const [ownership, setOwnership] =
    useState<InvestorOwnershipType>("contributed");
  const [compensation, setCompensation] =
    useState<CompensationArrangement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreementId, setAgreementId] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const save = () => {
    if (!vehicleId) return;
    if (!compensation) {
      setError("Compensation is required.");
      return;
    }
    if (error) return;
    onSave({
      id: uid("iv"),
      tenant_id: TENANT_ID,
      investor_id: investorId,
      vehicle_id: vehicleId,
      ownership_type: ownership,
      revenue_split_investor_pct:
        compensation.type === "percentage"
          ? compensation.investor_percentage
          : 0,
      revenue_split_operator_pct:
        compensation.type === "percentage"
          ? compensation.operator_percentage
          : 0,
      agreement_id: agreementId.trim() || null,
      active: true,
      compensation,
      effective_date: compensation.effective_date ?? today,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign vehicle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vehicle</Label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className={selectCls}
            >
              {availableVehicles.length === 0 && (
                <option value="">No available vehicles</option>
              )}
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} · {v.license_plate}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Ownership type</Label>
            <select
              value={ownership}
              onChange={(e) =>
                setOwnership(e.target.value as InvestorOwnershipType)
              }
              className={selectCls}
            >
              <option value="owned">Owned</option>
              <option value="contributed">Contributed</option>
            </select>
          </div>

          <CompensationForm onChange={setCompensation} onError={setError} />

          <div>
            <Label>Agreement ID (optional)</Label>
            <input
              value={agreementId}
              onChange={(e) => setAgreementId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm"
              placeholder="AGR-2026-000XXX"
            />
          </div>
          {error && <p className="text-sm text-status-out">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!vehicleId || !compensation}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Assign vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
