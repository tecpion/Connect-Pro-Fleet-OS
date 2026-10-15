import type {
  AddonType,
  CustomerSource,
  CustomerStatus,
  DepositStatus,
  FinancialTransaction,
  InspectionType,
  InvoiceStatus,
  PaymentMethod,
  RateType,
  RentalStatus,
  ReservationSource,
  ReservationStatus,
  TransactionType,
  VehicleStatus,
} from "./types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const fmtMoney = (n: number) => currency.format(n);

export const fmtMoneyExact = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat("en-US").format(n);

// Build #20 — date safety. The previous report build hit an "Invalid time
// value" runtime error from formatting missing/invalid dates. These helpers
// now guard against undefined/null/empty/NaN and return a fallback instead of
// throwing. Callers that need the raw behavior can use the `*Unsafe` variants.
function safeParse(iso: string): Date | null {
  if (iso == null) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export const fmtDate = (iso: string) => {
  const d = safeParse(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** Alias for fmtDate — date-only formatting (no time). */
export const fmtDateOnly = fmtDate;

export const fmtDateShort = (iso: string) => {
  const d = safeParse(iso);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const fmtDateTime = (iso: string) => {
  const d = safeParse(iso);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const fmtTime = (iso: string) => {
  const d = safeParse(iso);
  if (!d) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

export const daysBetween = (start: string, end: string) => {
  const s = safeParse(start);
  const e = safeParse(end);
  if (!s || !e) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
};

export const isPast = (iso: string) => {
  const d = safeParse(iso);
  return d ? d < new Date() : false;
};
export const isFuture = (iso: string) => {
  const d = safeParse(iso);
  return d ? d > new Date() : false;
};

export const pct = (n: number) => `${Math.round(n)}%`;
/** Alias for pct — formats a 0..100 number as a percentage string. */
export const fmtPct = pct;

export const vehicleStatusMeta: Record<
  VehicleStatus,
  { label: string; tone: "available" | "maintenance" | "out" | "rented" }
> = {
  available: { label: "Available", tone: "available" },
  rented: { label: "On rental", tone: "rented" },
  maintenance: { label: "In maintenance", tone: "maintenance" },
  out_of_service: { label: "Out of service", tone: "out" },
};

export const reservationStatusMeta: Record<
  ReservationStatus,
  {
    label: string;
    tone: "available" | "maintenance" | "out" | "rented" | "neutral";
  }
> = {
  pending_verification: { label: "Pending verification", tone: "maintenance" },
  manual_review: { label: "Needs review", tone: "maintenance" },
  pending_insurance_addon: { label: "Add insurance", tone: "maintenance" },
  confirmed: { label: "Confirmed", tone: "available" },
  active: { label: "Active rental", tone: "rented" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  blocked_license: { label: "License blocked", tone: "out" },
};

export const sourceMeta: Record<ReservationSource, string> = {
  ghl_webhook: "Connect Pro",
  manual: "Manual entry",
  marketplace: "Marketplace",
  website: "Website",
  referral: "Referral",
  api: "API",
};

export const depositStatusMeta: Record<DepositStatus, string> = {
  held: "Held",
  released: "Released",
  forfeited: "Forfeited",
};

export const inspectionTypeMeta: Record<InspectionType, string> = {
  checkout: "Checkout",
  checkin: "Check-in",
};

export const addonMeta: Record<AddonType, { label: string; price: number }> = {
  extra_driver: { label: "Extra driver", price: 12 },
  delivery: { label: "Delivery / pickup", price: 45 },
  prepaid_fuel: { label: "Prepaid fuel", price: 38 },
  child_seat: { label: "Child seat", price: 10 },
  gps_unit: { label: "GPS unit", price: 8 },
  insurance_waiver: { label: "Damage waiver", price: 24 },
};

// ---------------------------------------------------------------------------
// Phase 2 metadata
// ---------------------------------------------------------------------------

export const customerStatusMeta: Record<
  CustomerStatus,
  {
    label: string;
    tone: "available" | "maintenance" | "out" | "rented" | "neutral";
  }
> = {
  good_standing: { label: "Good Standing", tone: "available" },
  active_renter: { label: "Active Renter", tone: "rented" },
  previous_renter: { label: "Previous Renter", tone: "neutral" },
  watchlist: { label: "Watchlist", tone: "maintenance" },
  do_not_rent: { label: "Do Not Rent", tone: "out" },
  vip: { label: "VIP", tone: "available" },
  pending_verification: { label: "Pending Verification", tone: "maintenance" },
};

export const customerSourceMeta: Record<CustomerSource, string> = {
  connect_pro: "Connect Pro",
  website: "Website",
  marketplace: "Marketplace",
  staff: "Staff",
  referral: "Referral",
  api: "API",
};

export const rentalStatusMeta: Record<
  RentalStatus,
  {
    label: string;
    tone: "available" | "maintenance" | "out" | "rented" | "neutral";
  }
> = {
  draft: { label: "Draft", tone: "neutral" },
  ready_for_checkout: { label: "Ready for Checkout", tone: "maintenance" },
  active: { label: "Active", tone: "rented" },
  payment_due: { label: "Payment Due", tone: "maintenance" },
  late: { label: "Late", tone: "maintenance" },
  overdue: { label: "Overdue", tone: "out" },
  return_pending: { label: "Return Pending", tone: "maintenance" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const rateTypeMeta: Record<RateType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  custom: "Custom",
};

// ---------------------------------------------------------------------------
// Financial transaction ledger metadata
// ---------------------------------------------------------------------------

export const paymentMethodMeta: Record<PaymentMethod, string> = {
  card: "Card",
  cash: "Cash",
  ach: "ACH",
  zelle: "Zelle",
  cashapp: "Cash App",
  external: "External",
  other: "Other",
};

// Maps a payment method to the canonical payment transaction type.
export const paymentTypeForMethod: Record<PaymentMethod, TransactionType> = {
  card: "card_payment",
  cash: "cash_payment",
  ach: "ach_payment",
  zelle: "zelle_payment",
  cashapp: "cashapp_payment",
  external: "external_payment",
  other: "other_payment",
};

export const transactionTypeMeta: Record<
  TransactionType,
  { label: string; category: FinancialTransaction["category"] }
> = {
  // Charges
  rental_charge: { label: "Rental charge", category: "charge" },
  weekly_rental_charge: { label: "Weekly rental", category: "charge" },
  late_fee: { label: "Late fee", category: "charge" },
  damage_charge: { label: "Damage charge", category: "charge" },
  cleaning_fee: { label: "Cleaning fee", category: "charge" },
  fuel_charge: { label: "Fuel charge", category: "charge" },
  mileage_charge: { label: "Mileage charge", category: "charge" },
  ticket_charge: { label: "Ticket charge", category: "charge" },
  toll_charge: { label: "Toll charge", category: "charge" },
  exchange_fee: { label: "Exchange fee", category: "charge" },
  maintenance_customer_charge: {
    label: "Maintenance charge",
    category: "charge",
  },
  miscellaneous_charge: { label: "Miscellaneous charge", category: "charge" },
  incident_charge: { label: "Incident charge", category: "charge" },
  violation_charge: { label: "Traffic violation charge", category: "charge" },
  tax_charge: { label: "Tax", category: "charge" },
  fee_charge: { label: "Fee", category: "charge" },
  migration_opening_balance: {
    label: "Migration opening balance",
    category: "charge",
  },
  // Payments
  card_payment: { label: "Card payment", category: "payment" },
  cash_payment: { label: "Cash payment", category: "payment" },
  ach_payment: { label: "ACH payment", category: "payment" },
  zelle_payment: { label: "Zelle payment", category: "payment" },
  cashapp_payment: { label: "Cash App payment", category: "payment" },
  external_payment: { label: "External payment", category: "payment" },
  other_payment: { label: "Other payment", category: "payment" },
  // Adjustments
  credit: { label: "Credit", category: "credit" },
  discount: { label: "Discount", category: "credit" },
  fee_waiver: { label: "Fee waiver", category: "credit" },
  write_off: { label: "Write-off", category: "credit" },
  manual_adjustment: { label: "Manual adjustment", category: "credit" },
  // Refunds
  refund: { label: "Refund", category: "refund" },
};

export const statusToneClasses: Record<
  "available" | "maintenance" | "out" | "rented" | "neutral",
  { border: string; text: string; dot: string; bg: string }
> = {
  available: {
    border: "border-l-status-available",
    text: "text-status-available",
    dot: "bg-status-available",
    bg: "bg-status-available/10",
  },
  maintenance: {
    border: "border-l-status-maintenance",
    text: "text-status-maintenance",
    dot: "bg-status-maintenance",
    bg: "bg-status-maintenance/10",
  },
  out: {
    border: "border-l-status-out",
    text: "text-status-out",
    dot: "bg-status-out",
    bg: "bg-status-out/10",
  },
  rented: {
    border: "border-l-status-rented",
    text: "text-status-rented",
    dot: "bg-status-rented",
    bg: "bg-status-rented/10",
  },
  neutral: {
    border: "border-l-border",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    bg: "bg-muted",
  },
};

// ---------------------------------------------------------------------------
// Invoice & receipt metadata
// ---------------------------------------------------------------------------

export const invoiceStatusMeta: Record<
  InvoiceStatus,
  { label: string; tone: "available" | "maintenance" | "out" | "neutral" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  open: { label: "Open", tone: "maintenance" },
  partially_paid: { label: "Partially Paid", tone: "maintenance" },
  paid: { label: "Paid", tone: "available" },
  past_due: { label: "Past Due", tone: "out" },
  void: { label: "Void", tone: "neutral" },
};

/** Formats a sequence number as a zero-padded 6-digit string. */
export const padSeq = (n: number) => String(n).padStart(6, "0");
