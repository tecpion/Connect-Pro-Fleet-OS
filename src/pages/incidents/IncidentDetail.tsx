import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { uid } from "@/lib/incidentsStore";
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
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";
import type { Incident } from "@/lib/incidents";
import {
  INCIDENT_STATUSES,
  INCIDENT_PAY_STATUSES,
  RESPONSIBLE_PARTIES,
  titleCase,
  Field,
} from "./shared";

export function IncidentDetail({
  incident,
  onClose,
  onUpdate,
  onStatus,
  onAssignStaff,
  vehicleLabel,
  vehiclePlate,
  staffName,
  staff,
  reservations,
}: {
  incident: Incident;
  onClose: () => void;
  onUpdate: (patch: Partial<Incident>) => void;
  onStatus: (s: Incident["status"]) => void;
  onAssignStaff: (id: string | null) => void;
  vehicleLabel: (id: string) => string;
  vehiclePlate: (id: string) => string;
  staffName: (id: string | null) => string;
  staff: { id: string; full_name: string }[];
  reservations: { id: string; renter_name: string; vehicle_id: string }[];
}) {
  const [description, setDescription] = useState(incident.description);
  const [responsible, setResponsible] = useState(incident.responsible_party);
  const [payStatus, setPayStatus] = useState(incident.payment_status);
  const [payAmount, setPayAmount] = useState(incident.payment_amount);
  const [claimNum, setClaimNum] = useState(
    incident.insurance_claim_number ?? "",
  );
  const [billingOpen, setBillingOpen] = useState(false);
  const dc = useDamageClaims();
  const { reservations: allReservations } = useStore();

  const linkedRes = reservations.find((r) => r.id === incident.reservation_id);
  const fullRes = allReservations.find((r) => r.id === incident.reservation_id);

  const createDamageClaimFromIncident = () => {
    const source =
      incident.incident_type === "accident" ? "accident" : "incident";
    dc.createClaim({
      vehicle_id: incident.vehicle_id,
      reservation_id: incident.reservation_id,
      customer_id: fullRes?.customer_id ?? null,
      incident_id: incident.id,
      damage_source: source,
      description:
        incident.description ||
        `Damage from ${titleCase(incident.incident_type)}`,
      severity: "moderate",
    });
    toast.success("Damage claim created from incident.");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {titleCase(incident.incident_type)} ·{" "}
            <span className="font-mono text-sm">{incident.id}</span>
          </DialogTitle>
          <DialogDescription>
            {vehicleLabel(incident.vehicle_id)} ·{" "}
            <span className="font-mono">
              {vehiclePlate(incident.vehicle_id)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field
              label="Occurred"
              value={fmtDate(incident.occurred_at)}
              mono
            />
            <Field
              label="Reported"
              value={fmtDate(incident.reported_at)}
              mono
            />
            <Field
              label="Responsible party"
              value={titleCase(incident.responsible_party)}
            />
            <Field
              label="Assigned to"
              value={staffName(incident.assigned_staff_id)}
            />
          </div>

          {linkedRes && (
            <p className="text-sm text-muted-foreground">
              Linked rental:{" "}
              <Link
                to={`/reservations/${linkedRes.id}`}
                className="text-primary hover:underline"
              >
                {linkedRes.renter_name}
              </Link>
            </p>
          )}

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Responsible party</Label>
              <select
                value={responsible}
                onChange={(e) =>
                  setResponsible(
                    e.target.value as Incident["responsible_party"],
                  )
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
            <div>
              <Label>Payment status</Label>
              <select
                value={payStatus}
                onChange={(e) =>
                  setPayStatus(e.target.value as Incident["payment_status"])
                }
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {INCIDENT_PAY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {payStatus === "insurance_claim" && (
            <div>
              <Label>Insurance claim number</Label>
              <Input
                value={claimNum}
                onChange={(e) => setClaimNum(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Charge amount ($)</Label>
              <Input
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) =>
                  setPayAmount(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Assigned staff</Label>
              <select
                value={incident.assigned_staff_id ?? ""}
                onChange={(e) => onAssignStaff(e.target.value || null)}
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

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {INCIDENT_STATUSES.map((s) => (
              <Button
                key={s}
                variant={incident.status === s ? "default" : "outline"}
                size="sm"
                onClick={() => onStatus(s)}
              >
                {titleCase(s)}
              </Button>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            {payAmount > 0 && incident.reservation_id && (
              <Button variant="outline" onClick={() => setBillingOpen(true)}>
                Bill renter {fmtMoney(payAmount)}
              </Button>
            )}
            <Button variant="outline" onClick={createDamageClaimFromIncident}>
              Create damage claim
            </Button>
            <Button
              onClick={() => {
                onUpdate({
                  description,
                  responsible_party: responsible,
                  payment_status: payStatus,
                  payment_amount: payAmount,
                  insurance_claim_number: claimNum || null,
                });
                onClose();
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Save changes
            </Button>
          </div>
        </div>

        {billingOpen && (
          <BillIncidentDialog
            incident={incident}
            amount={payAmount}
            onClose={() => setBillingOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Bill renter — posts an incident_charge through the existing ledger.
// Resolution order: security deposit first, then insurance (Resource Center
// Insurance Verification), then direct billing as a last resort.
function BillIncidentDialog({
  incident,
  amount,
  onClose,
}: {
  incident: Incident;
  amount: number;
  onClose: () => void;
}) {
  const {
    reservations,
    convertReservationToRental,
    rentals,
    postTransaction,
    logActivity,
  } = useStore();
  const res = reservations.find((r) => r.id === incident.reservation_id);
  const rental = rentals.find((r) => r.id === res?.converted_to_rental_id);
  const [method, setMethod] = useState<"deposit" | "insurance" | "direct">(
    "direct",
  );

  const handleBill = () => {
    if (method === "deposit" && res && res.deposit_status === "held") {
      toast.success(`Drew ${fmtMoney(amount)} from the held security deposit.`);
      logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Incident ${incident.id} billed ${fmtMoney(amount)} — security deposit applied`,
        tone: "maintenance",
      });
      onClose();
      return;
    }
    if (method === "insurance" && incident.insurance_claim_number) {
      toast.success(
        `Filed ${fmtMoney(amount)} against insurance claim ${incident.insurance_claim_number}.`,
      );
      onClose();
      return;
    }
    if (rental) {
      postTransaction({
        rental_id: rental.id,
        reservation_id: rental.reservation_id,
        customer_id: rental.customer_id,
        vehicle_id: rental.vehicle_id,
        transaction_type: "incident_charge",
        category: "charge",
        description: `Incident charge — ${titleCase(incident.incident_type)}`,
        amount,
        direction: "charge",
        status: "posted",
        effective_date: new Date().toISOString().slice(0, 10),
      });
      logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Incident ${incident.id} charged ${fmtMoney(amount)} to ${rental.agreement_number}`,
        tone: "maintenance",
      });
      toast.success(`Charged ${fmtMoney(amount)} to the rental ledger.`);
    } else if (res && !rental) {
      const newRentalId = convertReservationToRental(res.id);
      if (newRentalId) {
        postTransaction({
          rental_id: newRentalId,
          reservation_id: res.id,
          customer_id: res.customer_id ?? "",
          vehicle_id: res.vehicle_id,
          transaction_type: "incident_charge",
          category: "charge",
          description: `Incident charge — ${titleCase(incident.incident_type)}`,
          amount,
          direction: "charge",
          status: "posted",
          effective_date: new Date().toISOString().slice(0, 10),
        });
        toast.success(`Converted reservation and charged ${fmtMoney(amount)}.`);
      }
    } else {
      toast.error(
        "No linked rental to bill. Link the incident to a reservation first.",
      );
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bill renter for incident</DialogTitle>
          <DialogDescription>
            Resolution order: security deposit first, then confirmed insurance
            coverage, then direct billing as a last resort.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Billing method</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as never)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              <option
                value="deposit"
                disabled={!res || res.deposit_status !== "held"}
              >
                Security deposit{" "}
                {res?.deposit_status === "held" ? "(held)" : "(unavailable)"}
              </option>
              <option
                value="insurance"
                disabled={!incident.insurance_claim_number}
              >
                Insurance claim{" "}
                {incident.insurance_claim_number
                  ? `(${incident.insurance_claim_number})`
                  : "(no claim)"}
              </option>
              <option value="direct">Direct charge to rental ledger</option>
            </select>
          </div>
          <p className="font-mono text-sm tabular text-foreground">
            Charge: {fmtMoney(amount)}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleBill}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Post charge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
