// Connect Pro Fleet — Customer Portal masking helpers (Build #32).
//
// Sensitive-value masking for the customer portal. A customer never sees full
// license plates, document numbers (DL, policy #), card/bank account numbers,
// or processor tokens. These helpers project customer-safe labels.

import { paymentMethodMeta } from "./format";

/** Mask a license plate: show last 3 chars, mask the rest. */
export function maskPlate(plate: string | null): string | null {
  if (!plate) return null;
  const s = plate.trim();
  if (s.length <= 3) return "•".repeat(s.length);
  return "•".repeat(s.length - 3) + s.slice(-3);
}

/** Mask a document number (DL, policy #): show last 4, mask the rest. */
export function maskDocumentNumber(num: string | null): string | null {
  if (!num) return null;
  const s = String(num).trim();
  if (s.length <= 4) return "•".repeat(s.length);
  return "•".repeat(s.length - 4) + s.slice(-4);
}

/** Mask a payment method reference: "Visa ending 4242" style. Never expose
 *  full card/bank numbers or processor tokens. */
export function maskPaymentMethod(
  method: string | null,
  reference: string | null,
): string {
  const label = method
    ? (paymentMethodMeta[method as keyof typeof paymentMethodMeta] ?? method)
    : "Payment";
  if (reference && /\d{4}$/.test(reference)) {
    return `${label} ending ${reference.slice(-4)}`;
  }
  return label;
}
