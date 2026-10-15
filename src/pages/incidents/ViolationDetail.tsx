import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { fmtMoney, fmtMoneyExact, fmtDate } from "@/lib/format";
import type { TrafficViolation, ViolationStatus } from "@/lib/incidents";
import { VIOLATION_STATUSES, titleCase, Field } from "./shared";

export function ViolationDetail({
  violation,
  onClose,
  onStatus,
  onMatch,
  vehicleLabel,
  vehiclePlate,
  reservations,
}: {
  violation: TrafficViolation;
  onClose: () => void;
  onStatus: (s: ViolationStatus) => void;
  onMatch: (reservationId: string) => void;
  vehicleLabel: (id: string) => string;
  vehiclePlate: (id: string) => string;
  reservations: { id: string; renter_name: string; vehicle_id: string }[];
}) {
  const candidateReservations = reservations.filter(
    (r) => r.vehicle_id === violation.vehicle_id,
  );
  const [matchRes, setMatchRes] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {titleCase(violation.violation_type)} violation ·{" "}
            <span className="font-mono text-sm">{violation.id}</span>
          </DialogTitle>
          <DialogDescription>
            {vehicleLabel(violation.vehicle_id)} ·{" "}
            <span className="font-mono">
              {vehiclePlate(violation.vehicle_id)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field
              label="Violation date"
              value={fmtDate(violation.violation_date)}
              mono
            />
            <Field label="Issuing agency" value={violation.issuing_agency} />
            <Field
              label="Fine amount"
              value={fmtMoneyExact(violation.fine_amount)}
              mono
            />
            <Field
              label="Renter billed"
              value={
                violation.renter_billed_amount > 0
                  ? fmtMoneyExact(violation.renter_billed_amount)
                  : "—"
              }
              mono
            />
          </div>

          {violation.status === "pending_match" ? (
            <div className="rounded-md border border-status-out/40 bg-status-out/5 p-3">
              <p className="text-sm font-medium text-status-out">
                This violation couldn't be auto-matched to a rental.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Multiple or no rentals covered this date on this vehicle. Assign
                it manually before billing — never auto-bill an ambiguous match.
              </p>
              <div className="mt-3 flex gap-2">
                <select
                  value={matchRes}
                  onChange={(e) => setMatchRes(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Select a rental…</option>
                  {candidateReservations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.renter_name}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={!matchRes}
                  onClick={() => {
                    onMatch(matchRes);
                    onClose();
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary-press"
                >
                  Assign
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {violation.matched_automatically
                ? "Auto-matched to the rental covering this date."
                : "Manually assigned to a rental."}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {VIOLATION_STATUSES.map((s) => (
              <Button
                key={s}
                variant={violation.status === s ? "default" : "outline"}
                size="sm"
                disabled={s === "pending_match"}
                onClick={() => onStatus(s)}
              >
                {titleCase(s)}
              </Button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={onClose}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
