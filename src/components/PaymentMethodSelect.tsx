// Connect Pro Fleet — shared payment-method UI (Build #14 cleanup).
//
// ONE reusable control for selecting a canonical TenderMethod + optional
// PaymentProcessor, used by every Record Payment entry point (rental,
// Payments Due, checkout, reservation, invoice, security-deposit
// collect/refund). Keeps tender method separate from processor and renders
// the full canonical set (Cash, Zelle, Cash App, Apple Pay, Venmo, ACH, Bank
// Transfer, Check, Debit Card, Credit Card, PayPal, Other).

import { Label } from "@/components/ui/label";
import {
  TENDER_METHODS,
  TENDER_METHOD_LABELS,
  PROCESSOR_LABELS,
  type TenderMethod,
  type PaymentProcessor,
} from "@/lib/paymentMethodTypes";

/** Processors that make sense for a given tender. Cash/Zelle/ACH/etc. don't
 *  need a processor, so we only surface it for card + paypal. */
function processorsForTender(t: TenderMethod): PaymentProcessor[] {
  if (t === "credit_card" || t === "debit_card")
    return ["stripe", "square", "paypal", "connect_pro", "manual", "other"];
  if (t === "paypal") return ["paypal", "manual", "other"];
  return [];
}

export interface PaymentMethodValue {
  tender: TenderMethod;
  processor: PaymentProcessor | null;
}

export function PaymentMethodSelect({
  value,
  onChange,
  showProcessor = true,
}: {
  value: PaymentMethodValue;
  onChange: (v: PaymentMethodValue) => void;
  showProcessor?: boolean;
}) {
  const processors = processorsForTender(value.tender);
  return (
    <div className="space-y-3">
      <div>
        <Label>Payment method</Label>
        <select
          value={value.tender}
          onChange={(e) => {
            const t = e.target.value as TenderMethod;
            const ps = processorsForTender(t);
            onChange({ tender: t, processor: ps.length > 0 ? ps[0] : null });
          }}
          className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {TENDER_METHODS.map((m) => (
            <option key={m} value={m}>
              {TENDER_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      {showProcessor && processors.length > 0 && (
        <div>
          <Label>Processor / source</Label>
          <select
            value={value.processor ?? "manual"}
            onChange={(e) =>
              onChange({
                tender: value.tender,
                processor: e.target.value as PaymentProcessor,
              })
            }
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {processors.map((p) => (
              <option key={p} value={p}>
                {PROCESSOR_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export { TENDER_METHOD_LABELS, PROCESSOR_LABELS };
