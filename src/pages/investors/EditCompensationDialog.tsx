// Connect Pro Fleet — edit an existing investor↔vehicle agreement (Build #6
// cleanup). Reuses the shared CompensationForm so percentage/fixed/custom
// editing is ONE implementation. Only users with investors.manage_agreements
// may open this (gated by the caller).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { CompensationArrangement } from "@/lib/ownershipTypes";
import type { InvestorVehicle as IV } from "@/lib/investorTypes";
import { CompensationForm } from "./CompensationForm";

export function EditCompensationDialog({
  pairing,
  vehicleLabel,
  onClose,
  onSave: onSave,
}: {
  pairing: IV;
  vehicleLabel: string;
  onClose: () => void;
  onSave: (compensation: CompensationArrangement) => void;
}) {
  const [value, setValue] = useState<CompensationArrangement | null>(
    pairing.compensation ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!value) {
      setError("Compensation is required.");
      return;
    }
    if (error) return;
    onSave(value);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage agreement</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          {vehicleLabel} · effective date applies to future periods only.
          Historical finalized settlements are not recomputed.
        </p>
        <CompensationForm
          initial={pairing.compensation ?? null}
          onChange={setValue}
          onError={setError}
        />
        {error && <p className="text-sm text-status-out">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!value || !!error}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Save agreement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
