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
  DialogDescription,
} from "@/components/ui/dialog";
import { uid, TENANT_ID, type IncidentsStore } from "@/lib/incidentsStore";
import type { TrafficViolation, ViolationType } from "@/lib/incidents";
import { VIOLATION_TYPES, titleCase } from "./shared";

export function AddViolationDialog({
  vehicles,
  reservations,
  autoMatch,
  onClose,
  onSave,
}: {
  vehicles: {
    id: string;
    year: number;
    make: string;
    model: string;
    license_plate: string;
  }[];
  reservations: {
    id: string;
    vehicle_id: string;
    start_date: string;
    end_date: string;
  }[];
  autoMatch: IncidentsStore["autoMatchViolation"];
  onClose: () => void;
  onSave: (v: TrafficViolation) => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [type, setType] = useState<ViolationType>("toll");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fine, setFine] = useState(0);
  const [agency, setAgency] = useState("");

  const save = () => {
    if (!vehicleId || fine <= 0) return;
    const match = autoMatch(
      {
        vehicle_id: vehicleId,
        reservation_id: null,
        violation_type: type,
        violation_date: date,
        fine_amount: fine,
        issuing_agency: agency || "Unknown agency",
        status: "pending_match",
        renter_billed_amount: 0,
        renter_payment_status: "pending",
        notice_document_url: null,
        matched_automatically: false,
      },
      reservations,
    );
    onSave({
      id: uid("vio"),
      tenant_id: TENANT_ID,
      vehicle_id: vehicleId,
      reservation_id: match.reservation_id,
      violation_type: type,
      violation_date: date,
      fine_amount: fine,
      issuing_agency: agency || "Unknown agency",
      status: match.status,
      renter_billed_amount: match.reservation_id ? fine : 0,
      renter_payment_status: match.reservation_id ? "billed" : "pending",
      notice_document_url: null,
      matched_automatically: match.matched_automatically,
      created_at: new Date().toISOString(),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add traffic violation</DialogTitle>
          <DialogDescription>
            We'll match it to the renter who had the vehicle on this date. If
            the match is ambiguous, it lands in a queue for manual assignment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vehicle</Label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} · {v.license_plate}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Violation type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ViolationType)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {VIOLATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Violation date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <div>
            <Label>Issuing agency</Label>
            <Input
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              className="mt-1"
              placeholder="e.g. Florida Turnpike Enterprise"
            />
          </div>
          <div>
            <Label>Fine amount ($)</Label>
            <Input
              type="number"
              min={0}
              value={fine}
              onChange={(e) => setFine(Math.max(0, Number(e.target.value)))}
              className="mt-1 font-mono tabular"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!vehicleId || fine <= 0}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add violation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
