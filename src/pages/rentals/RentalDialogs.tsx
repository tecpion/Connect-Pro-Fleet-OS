// Connect Pro Fleet — Rental action dialogs (Build #3 / Build #14).
// Extracted from RentalDetail.tsx (which is at its size ceiling). Contains the
// record-payment, extend, add-charge, and add-ticket dialogs. State is owned
// by the parent and passed in; this keeps RentalDetail focused on layout.
// Build #14: record-payment uses the shared canonical tender + processor dialog.

import { useStore } from "@/lib/store";
import type { ChargeType, RentalAgreement, Vehicle } from "@/lib/types";
import {
  transactionTypeMeta,
  fmtMoney,
  fmtMoneyExact,
  fmtDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
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
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { toast } from "sonner";

const CHARGE_TYPES: ChargeType[] = [
  "damage_charge",
  "cleaning_fee",
  "fuel_charge",
  "mileage_charge",
  "ticket_charge",
  "toll_charge",
  "exchange_fee",
  "maintenance_customer_charge",
  "miscellaneous_charge",
];

export interface RentalDialogState {
  payOpen: boolean;
  setPayOpen: (v: boolean) => void;
  payAmount: number;
  setPayAmount: (v: number) => void;
  extendOpen: boolean;
  setExtendOpen: (v: boolean) => void;
  extendDays: number;
  setExtendDays: (v: number) => void;
  chargeOpen: boolean;
  setChargeOpen: (v: boolean) => void;
  chargeType: ChargeType;
  setChargeType: (v: ChargeType) => void;
  chargeAmount: number;
  setChargeAmount: (v: number) => void;
  chargeDesc: string;
  setChargeDesc: (v: string) => void;
}

export function RentalDialogs({
  rental,
  vehicle,
  state,
  recordPayment,
  extendRental,
}: {
  rental: RentalAgreement;
  vehicle: Vehicle | undefined;
  state: RentalDialogState;
  recordPayment: (
    amount: number,
    tender: import("@/lib/paymentMethodTypes").TenderMethod,
    processor: import("@/lib/paymentMethodTypes").PaymentProcessor | null,
    reference: string,
  ) => void;
  extendRental: (days: number) => void;
}) {
  const { postCharge } = useStore();

  return (
    <>
      {/* Record payment — uses the shared canonical tender + processor dialog */}
      <RecordPaymentDialog
        open={state.payOpen}
        onOpenChange={state.setPayOpen}
        balanceDue={rental.balance_due}
        defaultAmount={state.payAmount}
        onSubmit={(r) =>
          recordPayment(r.amount, r.tender, r.processor, r.reference)
        }
      />

      {/* Extend rental */}
      <Dialog open={state.extendOpen} onOpenChange={state.setExtendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend rental</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current return:{" "}
              <span className="font-mono tabular text-foreground">
                {fmtDate(rental.scheduled_return_date)}
              </span>
            </p>
            <div>
              <Label>Extend by (days)</Label>
              <Input
                type="number"
                min={1}
                value={state.extendDays}
                onChange={(e) =>
                  state.setExtendDays(Math.max(1, Number(e.target.value)))
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => state.setExtendDays(d)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium",
                    state.extendDays === d
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  +{d}d
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => state.setExtendOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => extendRental(state.extendDays)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Extend rental
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add charge */}
      <Dialog open={state.chargeOpen} onOpenChange={state.setChargeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add charge</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Charge type</Label>
              <select
                value={state.chargeType}
                onChange={(e) =>
                  state.setChargeType(e.target.value as ChargeType)
                }
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CHARGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {transactionTypeMeta[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Amount ($)</Label>
              <Input
                type="number"
                min={0}
                value={state.chargeAmount}
                onChange={(e) =>
                  state.setChargeAmount(Math.max(0, Number(e.target.value)))
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={state.chargeDesc}
                onChange={(e) => state.setChargeDesc(e.target.value)}
                placeholder={transactionTypeMeta[state.chargeType].label}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => state.setChargeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={state.chargeAmount <= 0}
              onClick={() => {
                postCharge(rental.id, {
                  type: state.chargeType,
                  amount: state.chargeAmount,
                  description: state.chargeDesc || undefined,
                });
                toast.success(
                  `${transactionTypeMeta[state.chargeType].label} of ${fmtMoney(state.chargeAmount)} added.`,
                );
                state.setChargeOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Add charge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
