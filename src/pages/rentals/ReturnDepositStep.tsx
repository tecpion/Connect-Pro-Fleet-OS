// Connect Pro Fleet — return workflow deposit step (Build #8).
//
// Reconciles the security deposit at return: shows held deposit, outstanding
// charges, and lets staff apply part/all of the deposit to charges and
// refund the remainder. Uses the operational RentalDeposit record + the
// authoritative settlement selector — no duplicate arithmetic.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtMoneyExact } from "@/lib/format";
import { getDepositHeldBalance, getDepositRefundDue } from "@/lib/deposit";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import type { RentalDeposit } from "@/lib/depositTypes";
import type {
  RentalAgreement,
  FinancialTransaction,
  PaymentMethod,
} from "@/lib/types";
import { toast } from "sonner";

const PAYMENT_METHODS: PaymentMethod[] = [
  "card",
  "cash",
  "ach",
  "zelle",
  "cashapp",
  "external",
  "other",
];

export function ReturnDepositStep({
  rental,
  deposit,
  transactions,
  totalCharges,
  onApply,
  onRefund,
}: {
  rental: RentalAgreement;
  deposit: RentalDeposit | null;
  transactions: FinancialTransaction[];
  totalCharges: number;
  onApply: (
    amount: number,
    requestKey: string,
  ) => { ok: boolean; error?: string };
  onRefund: (
    amount: number,
    method: PaymentMethod,
    requestKey: string,
  ) => { ok: boolean; error?: string };
}) {
  const held = deposit ? getDepositHeldBalance(deposit) : 0;
  const refundDue = deposit ? getDepositRefundDue(deposit) : 0;
  const settlement = getRentalSettlement(rental, transactions, deposit);
  const outstanding = settlement.customerBalanceDue + totalCharges;

  const [applyAmount, setApplyAmount] = useState(
    Math.min(held, Math.max(0, outstanding)),
  );
  const [refundAmount, setRefundAmount] = useState(refundDue);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("card");

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md bg-surface-2 px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Deposit held</span>
          <span className="font-mono tabular text-foreground">
            {fmtMoneyExact(held)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Outstanding charges
          </span>
          <span className="font-mono tabular text-status-maintenance">
            {fmtMoneyExact(outstanding)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Refundable</span>
          <span className="font-mono tabular text-foreground">
            {fmtMoneyExact(refundDue)}
          </span>
        </div>
      </div>

      {held > 0 && outstanding > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label>Apply deposit to charges</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={held}
              value={applyAmount || ""}
              onChange={(e) =>
                setApplyAmount(
                  Math.max(0, Math.min(held, Number(e.target.value))),
                )
              }
              className="font-mono tabular"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setApplyAmount(Math.min(held, Math.max(0, outstanding)))
              }
            >
              Max
            </Button>
            <Button
              size="sm"
              disabled={applyAmount <= 0}
              onClick={() => {
                const r = onApply(
                  applyAmount,
                  `retapply_${deposit?.id}_${Date.now()}`,
                );
                if (r.ok)
                  toast.success(
                    `Applied ${fmtMoneyExact(applyAmount)} to charges.`,
                  );
                else toast.error(r.error ?? "Could not apply.");
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Apply up to the lesser of held deposit and outstanding charges.
          </p>
        </div>
      )}

      {refundDue > 0 && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Label>Refund remaining deposit</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={refundDue}
              value={refundAmount || ""}
              onChange={(e) =>
                setRefundAmount(
                  Math.max(0, Math.min(refundDue, Number(e.target.value))),
                )
              }
              className="font-mono tabular"
            />
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
              className="rounded-md border border-input bg-surface px-2 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={refundAmount <= 0}
              onClick={() => {
                const r = onRefund(
                  refundAmount,
                  refundMethod,
                  `retrefund_${deposit?.id}_${Date.now()}`,
                );
                if (r.ok)
                  toast.success(`Refunded ${fmtMoneyExact(refundAmount)}.`);
                else toast.error(r.error ?? "Could not refund.");
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Refund
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can complete the return with a refund still pending — it will
            show as money owed back to the customer.
          </p>
        </div>
      )}

      {held === 0 && refundDue === 0 && (
        <p className="text-sm text-muted-foreground">
          No deposit held for this rental. Nothing to apply or refund.
        </p>
      )}
    </div>
  );
}
