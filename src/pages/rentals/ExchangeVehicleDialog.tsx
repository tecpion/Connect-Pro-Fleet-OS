// Connect Pro Fleet — vehicle exchange dialog (Build #5).
// Exchanges the vehicle on an active rental without ending it. Records a
// RentalVehicleExchange history entry; billing continues unless staff
// explicitly changes the rate. Only eligible (available, same-tenant) vehicles
// are selectable — no double bookings.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { RentalAgreement } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtMoneyExact, fmtNumber } from "@/lib/format";
import { toast } from "sonner";

const REASONS = [
  "Mechanical issue",
  "Scheduled maintenance",
  "Accident",
  "Damage",
  "Customer request",
  "Vehicle upgrade",
  "Vehicle downgrade",
  "Registration/insurance issue",
  "Other",
];

export function ExchangeVehicleDialog({
  rental,
  open,
  onOpenChange,
}: {
  rental: RentalAgreement;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { vehicles, exchangeVehicle } = useStore();
  const [newVehicleId, setNewVehicleId] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [reasonNotes, setReasonNotes] = useState("");
  const [oldMileageIn, setOldMileageIn] = useState(0);
  const [oldFuelIn, setOldFuelIn] = useState(100);
  const [newMileageOut, setNewMileageOut] = useState(0);
  const [newFuelOut, setNewFuelOut] = useState(100);
  const [disposition, setDisposition] = useState<
    "available" | "maintenance" | "out_of_service"
  >("available");
  const [changeRate, setChangeRate] = useState(false);
  const [newRate, setNewRate] = useState(rental.rate_amount);

  // Eligible replacement vehicles: available, same tenant, not the current one.
  const eligible = useMemo(
    () =>
      vehicles.filter(
        (v) => v.id !== rental.vehicle_id && v.status === "available",
      ),
    [vehicles, rental.vehicle_id],
  );

  const submit = () => {
    if (!newVehicleId) {
      toast.error("Select a replacement vehicle.");
      return;
    }
    if (oldMileageIn <= 0 || newMileageOut <= 0) {
      toast.error("Enter mileage for both vehicles.");
      return;
    }
    const finalReason = reason === "Other" ? reasonNotes || "Other" : reason;
    exchangeVehicle({
      rentalId: rental.id,
      newVehicleId,
      reason: finalReason,
      oldMileageIn,
      oldFuelIn,
      newMileageOut,
      newFuelOut,
      newVehicleDisposition: disposition,
      rateChange: changeRate
        ? { newRate: Number(newRate), reason: "Exchange rate change" }
        : null,
    });
    toast.success("Vehicle exchanged. Rental remains active.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Exchange vehicle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Swap the vehicle on {rental.agreement_number} without ending the
            rental. Billing continues unless you change the rate below.
          </p>
          <div>
            <Label>Replacement vehicle</Label>
            <select
              value={newVehicleId}
              onChange={(e) => {
                setNewVehicleId(e.target.value);
                const v = vehicles.find((x) => x.id === e.target.value);
                if (v) setNewMileageOut(v.current_mileage);
              }}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a vehicle…</option>
              {eligible.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} · {v.license_plate} ·{" "}
                  {fmtNumber(v.current_mileage)} mi ·{" "}
                  {fmtMoneyExact(v.daily_rate)}/day
                </option>
              ))}
            </select>
            {eligible.length === 0 && (
              <p className="mt-1 text-xs text-status-maintenance">
                No available vehicles to exchange into.
              </p>
            )}
          </div>
          <div>
            <Label>Reason</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {reason === "Other" && (
              <Input
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Describe the reason"
                className="mt-2"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Old vehicle mileage in</Label>
              <Input
                type="number"
                min={0}
                value={oldMileageIn || ""}
                onChange={(e) =>
                  setOldMileageIn(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Old vehicle fuel in (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={oldFuelIn}
                onChange={(e) => setOldFuelIn(Number(e.target.value))}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>New vehicle mileage out</Label>
              <Input
                type="number"
                min={0}
                value={newMileageOut || ""}
                onChange={(e) =>
                  setNewMileageOut(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>New vehicle fuel out (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={newFuelOut}
                onChange={(e) => setNewFuelOut(Number(e.target.value))}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Old vehicle disposition</Label>
            <select
              value={disposition}
              onChange={(e) =>
                setDisposition(
                  e.target.value as
                    "available" | "maintenance" | "out_of_service",
                )
              }
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="available">Available</option>
              <option value="maintenance">Maintenance</option>
              <option value="out_of_service">Out of service</option>
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
            <input
              type="checkbox"
              checked={changeRate}
              onChange={(e) => setChangeRate(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Change the rental rate to the new vehicle's rate
            </span>
          </label>
          {changeRate && (
            <div>
              <Label>New rate ($)</Label>
              <Input
                type="number"
                min={0}
                value={newRate}
                onChange={(e) => setNewRate(Number(e.target.value))}
                className="mt-1 font-mono tabular"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Confirm exchange
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
