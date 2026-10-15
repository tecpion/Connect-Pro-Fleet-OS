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
import { uid, TENANT_ID } from "@/lib/incidentsStore";
import type { Incident, IncidentType, ResponsibleParty } from "@/lib/incidents";
import type {
  IncidentDriverAuthorization,
  IncidentDriverFact,
} from "@/lib/defenseTypes";
import { INCIDENT_TYPES, RESPONSIBLE_PARTIES, titleCase } from "./shared";

// Build #52 — driver-at-incident authorization options. The authorization
// status is captured AS OF the incident date/time; later revocation does not
// alter the historical fact. No legal conclusion is produced.
const DRIVER_AUTH_OPTIONS: {
  value: IncidentDriverAuthorization;
  label: string;
}[] = [
  { value: "primary", label: "Primary renter" },
  { value: "authorized_additional", label: "Authorized additional driver" },
  { value: "unauthorized", label: "Unauthorized driver" },
  { value: "unknown", label: "Unknown" },
];

export function AddIncidentDialog({
  vehicles,
  reservations,
  staff,
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
  reservations: { id: string; renter_name: string; vehicle_id: string }[];
  staff: { id: string; full_name: string }[];
  onClose: () => void;
  onSave: (i: Incident) => void;
}) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [resId, setResId] = useState("");
  const [type, setType] = useState<IncidentType>("accident");
  const [description, setDescription] = useState("");
  const [occurred, setOccurred] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [reported, setReported] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [responsible, setResponsible] = useState<ResponsibleParty>("unknown");
  const [amount, setAmount] = useState(0);
  const [assignedStaff, setAssignedStaff] = useState("");
  // Build #52 — Rental Risk & Defense Record incident intake fields.
  const [driverName, setDriverName] = useState("");
  const [driverAuth, setDriverAuth] =
    useState<IncidentDriverAuthorization>("unknown");
  const [renterStatement, setRenterStatement] = useState("");
  const [policeReportNumber, setPoliceReportNumber] = useState("");
  const [injuries, setInjuries] = useState<"yes" | "no" | "unknown">("unknown");
  const [towed, setTowed] = useState(false);
  const [location, setLocation] = useState("");

  const candidateRes = reservations.filter((r) => r.vehicle_id === vehicleId);

  const save = () => {
    if (!vehicleId) return;
    // Build the historical driver-at-incident fact only when a driver name is
    // captured. The authorization status is frozen AS OF the incident.
    const incidentDriver: IncidentDriverFact | null = driverName.trim()
      ? {
          rental_driver_id: null,
          actual_driver_name: driverName.trim(),
          license_reference: null,
          authorization_at_incident: driverAuth,
          driver_snapshot: null,
        }
      : null;
    onSave({
      id: uid("inc"),
      tenant_id: TENANT_ID,
      vehicle_id: vehicleId,
      reservation_id: resId || null,
      incident_type: type,
      description: description || `${titleCase(type)} on ${vehicleId}`,
      occurred_at: occurred,
      reported_at: reported,
      status: "open",
      responsible_party: responsible,
      payment_amount: amount,
      payment_status: amount > 0 ? "pending" : "waived",
      insurance_claim_number: null,
      assigned_staff_id: assignedStaff || null,
      photos: [],
      created_at: new Date().toISOString(),
      // Build #52 — defense intake fields.
      incident_driver: incidentDriver,
      renter_statement: renterStatement.trim() || null,
      police_report_url: null,
      police_report_number: policeReportNumber.trim() || null,
      injuries_reported: injuries,
      vehicle_towed: towed,
      vehicle_condition_notes: null,
      linked_damage_claim_id: null,
      post_incident_inspection_id: null,
      incident_location: location.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vehicle</Label>
            <select
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setResId("");
              }}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} · {v.license_plate}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Linked rental (optional)</Label>
            <select
              value={resId}
              onChange={(e) => setResId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {candidateRes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.renter_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as IncidentType)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Responsible party</Label>
              <select
                value={responsible}
                onChange={(e) =>
                  setResponsible(e.target.value as ResponsibleParty)
                }
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {RESPONSIBLE_PARTIES.map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Occurred</Label>
              <Input
                type="date"
                value={occurred}
                onChange={(e) => setOccurred(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label>Reported</Label>
              <Input
                type="date"
                value={reported}
                onChange={(e) => setReported(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={3}
              placeholder="What happened, where, and what's damaged?"
            />
          </div>
          {/* Build #52 — Accident SOP intake. Captures the factual evidence
              needed for insurance/claims/legal review. No legal conclusion. */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Incident evidence
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Who was driving?</Label>
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="mt-1"
                  placeholder="Driver name"
                />
              </div>
              <div>
                <Label>Driver authorization</Label>
                <select
                  value={driverAuth}
                  onChange={(e) =>
                    setDriverAuth(e.target.value as IncidentDriverAuthorization)
                  }
                  className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                >
                  {DRIVER_AUTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Renter statement</Label>
              <Textarea
                value={renterStatement}
                onChange={(e) => setRenterStatement(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Renter's written account of the incident"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Police report number</Label>
                <Input
                  value={policeReportNumber}
                  onChange={(e) => setPoliceReportNumber(e.target.value)}
                  className="mt-1"
                  placeholder="PR-2026-0000"
                />
              </div>
              <div>
                <Label>Injuries reported?</Label>
                <select
                  value={injuries}
                  onChange={(e) =>
                    setInjuries(e.target.value as "yes" | "no" | "unknown")
                  }
                  className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1"
                  placeholder="Intersection / address"
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={towed}
                    onChange={(e) => setTowed(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Vehicle towed
                </label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Charge amount ($)</Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Assign to</Label>
              <select
                value={assignedStaff}
                onChange={(e) => setAssignedStaff(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!vehicleId}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Log incident
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
