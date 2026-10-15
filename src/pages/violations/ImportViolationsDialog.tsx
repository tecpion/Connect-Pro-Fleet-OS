// Connect Pro Fleet — Violation CSV import dialog (Build #25).
// Paste/upload CSV → dry run (match vehicle, resolve possession, detect
// duplicates) → review summary → commit (no mutation during dry run).
// Reimporting the same citation is idempotent (strong duplicate detection on
// authority + citation_number).

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useViolations } from "@/lib/violationStoreProvider";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
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
import { dryRunViolationImport } from "@/lib/violationImport";
import { VIOLATION_TYPE_LABELS } from "@/lib/violationTypes";
import { toast } from "sonner";
import { Upload } from "lucide-react";

const SAMPLE = `citation,type,plate,state,occurred,amount,penalties,due,authority,location
SP-9912,toll,FL-RT8841,FL,2026-08-25 14:30,6.50,0,2026-09-25,SunPass,I-95 MM 12
MIA-PK-99213,parking_ticket,FL-EV2290,FL,2026-08-15 11:00,45.00,15.00,2026-09-15,City of Miami,Brickell Ave`;

export function ImportViolationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const store = useStore();
  const vio = useViolations();
  const [csvText, setCsvText] = useState("");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canImport = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "violations.import",
  );

  const allExchanges = useMemo(
    () => store.rentals.flatMap((r) => store.vehicleExchanges(r.id)),
    [store.rentals, store.vehicleExchanges],
  );

  const dryRun = useMemo(() => {
    if (!csvText.trim()) return null;
    return dryRunViolationImport(
      csvText,
      store.vehicles,
      store.rentals,
      allExchanges,
      vio.violations,
    );
  }, [csvText, store.vehicles, store.rentals, allExchanges, vio.violations]);

  function commit() {
    if (!dryRun) return;
    let created = 0;
    let skipped = 0;
    for (const rec of dryRun.records) {
      if (rec.duplicate || !rec.vehicle_id || !rec.occurred_at) {
        skipped++;
        continue;
      }
      vio.createViolation({
        violation_type: rec.violation_type,
        vehicle_id: rec.vehicle_id,
        occurred_at: rec.occurred_at,
        citation_number: rec.citation_number,
        base_amount: rec.base_amount,
        penalties_amount: rec.penalties_amount,
        due_at: rec.due_at,
        issuing_authority: rec.authority,
        location_description: rec.location,
        plate_number_snapshot: rec.plate,
        state_jurisdiction: rec.state,
        source: "csv_import",
      });
      created++;
    }
    toast.success(`${created} violation(s) imported`, {
      description: skipped
        ? `${skipped} skipped (duplicates / no match)`
        : undefined,
    });
    setCsvText("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import violations (CSV)</DialogTitle>
          <DialogDescription>
            Dry-run first: vehicles are matched by VIN / plate+state / internal
            number, then possession is resolved at the violation time. No
            mutation until you commit. Reimporting the same citation is
            idempotent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="vio-csv">CSV text</Label>
            <Textarea
              id="vio-csv"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              placeholder={SAMPLE}
              className="mt-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setCsvText(SAMPLE)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              Load sample
            </button>
          </div>

          {dryRun && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat label="Rows" value={dryRun.totalRows} />
                <Stat label="Vehicles matched" value={dryRun.matchedVehicles} />
                <Stat label="Rentals matched" value={dryRun.matchedRentals} />
                <Stat
                  label="No vehicle match"
                  value={dryRun.noVehicleMatch}
                  tone={dryRun.noVehicleMatch > 0 ? "danger" : undefined}
                />
                <Stat
                  label="Duplicates"
                  value={dryRun.duplicates}
                  tone={dryRun.duplicates > 0 ? "warning" : undefined}
                />
                <Stat
                  label="Issues"
                  value={dryRun.issues}
                  tone={dryRun.issues > 0 ? "warning" : undefined}
                />
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-left uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Citation</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Vehicle</th>
                      <th className="p-2">Rental</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.records.map((r) => {
                      const veh = store.vehicles.find(
                        (v) => v.id === r.vehicle_id,
                      );
                      return (
                        <tr key={r.rowIndex} className="border-t border-border">
                          <td className="p-2 font-mono">{r.rowIndex}</td>
                          <td className="p-2 font-mono">
                            {r.citation_number ?? "—"}
                          </td>
                          <td className="p-2">
                            {VIOLATION_TYPE_LABELS[r.violation_type]}
                          </td>
                          <td className="p-2">
                            {veh ? `${veh.make} ${veh.model}` : "No match"}
                          </td>
                          <td className="p-2 font-mono">
                            {r.rental_id ?? "—"}
                          </td>
                          <td className="p-2">{r.possession_status}</td>
                          <td className="p-2">
                            {r.duplicate ? "DUPLICATE " : ""}
                            {r.issues.join("; ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            disabled={!canImport || !dryRun || dryRun.totalRows === 0}
            onClick={commit}
          >
            <Upload size={15} className="mr-1.5" /> Commit import
          </Button>
        </DialogFooter>
        {!canImport && (
          <p className="text-xs text-muted-foreground">
            You need the violations.import permission to commit.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          tone === "danger"
            ? "font-mono text-sm font-semibold text-status-out"
            : tone === "warning"
              ? "font-mono text-sm font-semibold text-status-maintenance"
              : "font-mono text-sm font-semibold text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}
