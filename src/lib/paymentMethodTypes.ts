// Connect Pro Fleet — Payment / Tender Method standardization (Build #14).
//
// ONE centralized taxonomy for how money moves, used by the rental ledger
// (incoming customer payments), the expense ledger (outgoing business
// spending), security deposits, and reporting. A tender METHOD (cash, card,
// Zelle…) is kept separate from the PROCESSOR / source (Stripe, Square,
// manual…). Existing legacy `PaymentMethod` values map safely to the new
// canonical set via `normalizePaymentMethod` so historical transactions keep
// working without a destructive migration.

/** Canonical incoming + outgoing tender methods. Shared across the rental
 *  ledger and the accounting expense ledger. */
export type TenderMethod =
  | "cash"
  | "zelle"
  | "cash_app"
  | "apple_pay"
  | "venmo"
  | "ach"
  | "bank_transfer"
  | "check"
  | "debit_card"
  | "credit_card"
  | "paypal"
  | "other";

export const TENDER_METHODS: TenderMethod[] = [
  "cash",
  "zelle",
  "cash_app",
  "apple_pay",
  "venmo",
  "ach",
  "bank_transfer",
  "check",
  "debit_card",
  "credit_card",
  "paypal",
  "other",
];

export const TENDER_METHOD_LABELS: Record<TenderMethod, string> = {
  cash: "Cash",
  zelle: "Zelle",
  cash_app: "Cash App",
  apple_pay: "Apple Pay",
  venmo: "Venmo",
  ach: "ACH",
  bank_transfer: "Bank Transfer",
  check: "Check",
  debit_card: "Debit Card",
  credit_card: "Credit Card",
  paypal: "PayPal",
  other: "Other",
};

/** The processor / platform that handled the money movement. Separate from the
 *  tender method — a credit card can run through Stripe, Square, or manual. */
export type PaymentProcessor =
  "stripe" | "square" | "paypal" | "connect_pro" | "manual" | "other";

export const PROCESSOR_LABELS: Record<PaymentProcessor, string> = {
  stripe: "Stripe",
  square: "Square",
  paypal: "PayPal",
  connect_pro: "Connect Pro",
  manual: "Manual",
  other: "Other",
};

/** Normalize an arbitrary processor string (e.g. from an inbound sync payload)
 *  to the canonical PaymentProcessor. Unknown values map to "other" so inbound
 *  events from unfamiliar systems never break the typed ledger contract. */
export function normalizeProcessor(
  p: PaymentProcessor | string | null | undefined,
): PaymentProcessor | null {
  if (!p) return null;
  switch (p) {
    case "stripe":
    case "square":
    case "paypal":
    case "connect_pro":
    case "manual":
    case "other":
      return p;
    default:
      return "other";
  }
}

/** Where a payment originated (for future webhook / bank-feed matching). */
export type PaymentSource =
  | "manual"
  | "connect_pro"
  | "website"
  | "marketplace"
  | "api"
  | "bank_feed"
  | "csv_import";

// ---------------------------------------------------------------------------
// Legacy compatibility mapping
// ---------------------------------------------------------------------------

/** The legacy `PaymentMethod` type used by the rental ledger (card, cash, ach,
 *  zelle, cashapp, external, other). This is preserved so existing seeded
 *  transactions and the rental ledger keep working. New code should prefer the
 *  canonical `TenderMethod`, but the rental ledger continues to store the
 *  legacy value for backward compatibility. */
export type LegacyPaymentMethod =
  "card" | "cash" | "ach" | "zelle" | "cashapp" | "external" | "other";

/** Map a legacy rental-ledger PaymentMethod to the canonical TenderMethod. */
export function normalizePaymentMethod(
  m: LegacyPaymentMethod | TenderMethod | string | null | undefined,
): TenderMethod {
  if (!m) return "other";
  switch (m) {
    case "card":
    case "credit_card":
    case "debit_card":
      return "credit_card";
    case "cash":
      return "cash";
    case "ach":
      return "ach";
    case "zelle":
      return "zelle";
    case "cashapp":
    case "cash_app":
      return "cash_app";
    case "external":
    case "bank_transfer":
      return "bank_transfer";
    case "apple_pay":
      return "apple_pay";
    case "venmo":
      return "venmo";
    case "check":
      return "check";
    case "paypal":
      return "paypal";
    default:
      return "other";
  }
}

/** Map a canonical TenderMethod back to the legacy rental-ledger PaymentMethod
 *  so new payments recorded through the standardized UI still post to the
 *  existing ledger correctly. */
export function toLegacyPaymentMethod(m: TenderMethod): LegacyPaymentMethod {
  switch (m) {
    case "cash":
      return "cash";
    case "ach":
      return "ach";
    case "zelle":
      return "zelle";
    case "cash_app":
      return "cashapp";
    case "credit_card":
    case "debit_card":
      return "card";
    case "bank_transfer":
    case "apple_pay":
    case "venmo":
    case "check":
    case "paypal":
      return "external";
    default:
      return "other";
  }
}

/** Human label for any payment method value (legacy or canonical). */
export function tenderLabel(
  m: LegacyPaymentMethod | TenderMethod | string | null | undefined,
): string {
  const canonical = normalizePaymentMethod(m);
  return TENDER_METHOD_LABELS[canonical];
}
