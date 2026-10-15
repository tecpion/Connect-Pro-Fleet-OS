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
} from "@/components/ui/dialog";

export function GenerateSettlementDialog({
  vehicleLabel,
  onClose,
  onGenerate,
}: {
  vehicleLabel: string;
  onClose: () => void;
  onGenerate: (input: {
    periodStart: string;
    periodEnd: string;
    operatorFeePct: number;
  }) => void;
}) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(monthEnd);
  const [operatorFeePct, setOperatorFeePct] = useState(10);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate settlement · {vehicleLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Period start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label>Period end</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <div>
            <Label>
              Operator fee:{" "}
              <span className="font-mono tabular">{operatorFeePct}%</span> of
              gross revenue
            </Label>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={operatorFeePct}
              onChange={(e) => setOperatorFeePct(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Charged to the operator before the revenue split is applied.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onGenerate({ periodStart, periodEnd, operatorFeePct })
            }
            disabled={periodEnd < periodStart}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Generate settlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
