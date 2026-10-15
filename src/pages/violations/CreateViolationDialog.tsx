// Connect Pro Fleet — create violation dialog (Build #25).

import { useMemo, useState } from "react";
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
import { useViolations } from "@/lib/violationStoreProvider";
import type { ViolationType } from "@/lib/violationTypes";
import { ALL_TYPES, typeLabel } from "./shared";

export function CreateViolationDialog({
  vehicles,
  staff,
  prefillVehicleId,
  prefillRentalId,
  prefillCustomerId,
  onClose,
  onCreated,
}: {
  vehicles: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
    year: number;
  }[];
  staff: { id: string; full_name: string }[];
  prefillVehicleId?: string | null;
  prefillRentalId?: string | null;
  prefillCustomerId?: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const vio = useViolations();
  const [vehicleId, setVehicleId] = useState(prefillVehicleId ?? "");
  const [type, setType] = useState<ViolationType>("toll");
  const [occurredAt, setOccurredAt] = useState("");
  const [authority, setAuthority] = useState("");
  const [citation, setCitation] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [base, setBase] = useState("");
  const [penalties, setPenalties] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");

  const vehicleLabel = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model} · ${v.license_plate}` : "—";
  };

  // Live possession suggestion — auto-suggest, never auto-charge.
  const suggestion = useMemo(() => {
    if (!vehicleId || !occurredAt) return null;
    const res = vio.resolvePossession(vehicleId, occurredAt);
    if (res.status === "exact_match" && res.rental) {
      return {
        status: res.status,
        rentalId: res.rental.id,
        agreement: res.rental.agreement_number,
      };
    }
    return { status: res.status, rentalId: null, agreement: null };
  }, [vehicleId, occurredAt, vio]);

  function save() {
    if (!vehicleId || !occurredAt) return;
    const id = vio.createViolation({
      violation_type: type,
      vehicle_id: vehicleId,
      occurred_at: occurredAt.includes("T")
        ? occurredAt
        : `${occurredAt}T00:00:00Z`,
      issuing_authority: authority.trim() || null,
      citation_number: citation.trim() || null,
      due_at: dueAt ? `${dueAt}T23:59:59Z` : null,
      base_amount: base ? Number(base) : 0,
      penalties_amount: penalties ? Number(penalties) : 0,
      plate_number_snapshot:
        vehicles.find((v) => v.id === vehicleId)?.license_plate ?? null,
      location_description: location.trim() || null,
      description: description.trim() || null,
      rental_id: prefillRentalId ?? null,
      customer_id: prefillCustomerId ?? null,
      assigned_staff_id: assignee || null,
      source: "manual",
    });
    onCreated(id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add violation</DialogTitle>
          <DialogDescription>
            Record a toll, ticket, or citation. The system identifies which
            rental had the vehicle at the violation time — review before
            charging.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-type">Type</Label>
              <select
                id="v-type"
                value={type}
                onChange={(e) => setType(e.target.value as ViolationType)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="v-vehicle">Vehicle</Label>
              <select
                id="v-vehicle"
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
          </div>

          <div>
            <Label htmlFor="v-occurred">Occurred date / time</Label>
            <Input
              id="v-occurred"
              type="datetime-local"
              value={occurredAt.replace("Z", "").slice(0, 16)}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="mt-1"
            />
            {suggestion && (
              <p className="mt-1 text-xs text-muted-foreground">
                {suggestion.status === "exact_match" ? (
                  <>
                    Suggested match:{" "}
                    <span className="font-medium text-foreground">
                      {suggestion.agreement}
                    </span>{" "}
                    — review before charging.
                  </>
                ) : suggestion.status === "no_match" ? (
                  "No rental possessed this vehicle at that time — will route to Needs Review."
                ) : (
                  "Multiple conflicting possession matches — will route to Needs Review."
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-auth">Issuing authority</Label>
              <Input
                id="v-auth"
                value={authority}
                onChange={(e) => setAuthority(e.target.value)}
                placeholder="e.g. SunPass, City of Miami"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="v-cite">Citation / reference #</Label>
              <Input
                id="v-cite"
                value={citation}
                onChange={(e) => setCitation(e.target.value)}
                placeholder="e.g. SP-8841-2290"
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-base">Base amount</Label>
              <Input
                id="v-base"
                type="number"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="0"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="v-pen">Penalties</Label>
              <Input
                id="v-pen"
                type="number"
                value={penalties}
                onChange={(e) => setPenalties(e.target.value)}
                placeholder="0"
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="v-due">Due date</Label>
              <Input
                id="v-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="v-loc">Location</Label>
              <Input
                id="v-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. I-95 MM 12"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="v-desc">Description</Label>
            <Textarea
              id="v-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the violation…"
              className="mt-1"
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="v-assign">Assign to</Label>
            <select
              id="v-assign"
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!vehicleId || !occurredAt}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add violation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
