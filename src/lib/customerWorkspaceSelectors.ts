// Connect Pro Fleet — Customer workspace selectors (Build #38 — Customers V1).
//
// Pure presentation/composition selectors for the Customers list workspace:
// lifecycle vs standing/flags, ready-to-rent readiness (transparent reasons),
// KPIs, quick filters, tags, duplicate detection, import/export helpers.
//
// These selectors DO NOT redefine financial truth. Balances, lifetime revenue,
// and rental counts come from the authoritative fleet store + ledger. Readiness
// defers to the existing Compliance engine (complianceStatus.ts) — there is NO
// second blocker engine here. Verification participates only when the tenant
// has verification enabled (see verificationConfig.ts); when Off, verification
// is ignored completely.
//
// Lifecycle and standing are PRESENTATION decompositions of the existing
// customer_status field. The underlying model is not destructively migrated —
// we compose lifecycle + standing flags from the authoritative status so a
// customer can be "Previous Renter + VIP" without conflicting states.

import type {
  Customer,
  CustomerStatus,
  RentalAgreement,
  Vehicle,
} from "./types";
import type { EntityComplianceResult } from "./complianceStoreInterface";
import type { CompanyPolicies } from "./companyPolicyTypes";
import { isVerificationEnabled } from "./verificationConfig";

// ---------------------------------------------------------------------------
// Lifecycle vs standing (presentation decomposition of customer_status)
// ---------------------------------------------------------------------------

export type CustomerLifecycle =
  "applicant_prospect" | "current_renter" | "previous_renter";

export const LIFECYCLE_LABELS: Record<CustomerLifecycle, string> = {
  applicant_prospect: "Applicant / Prospect",
  current_renter: "Current Renter",
  previous_renter: "Previous Renter",
};

/** Derive the customer lifecycle from authoritative status + active rental.
 *  A customer is a Current Renter when they have an in-progress rental;
 *  otherwise Previous Renter when their status indicates prior rentals;
 *  otherwise Applicant / Prospect. */
export function customerLifecycle(
  status: CustomerStatus,
  hasActiveRental: boolean,
): CustomerLifecycle {
  if (hasActiveRental) return "current_renter";
  if (
    status === "previous_renter" ||
    status === "active_renter" // active_renter without an open rental = prior
  )
    return "previous_renter";
  if (
    status === "good_standing" ||
    status === "watchlist" ||
    status === "do_not_rent" ||
    status === "vip" ||
    status === "pending_verification"
  ) {
    // These may still be previous renters in practice, but without rental
    // history we present them as prospects unless flagged otherwise. The
    // caller can refine using rental history (see lifecycleFromRentals).
    return "applicant_prospect";
  }
  return "applicant_prospect";
}

/** Refine lifecycle using actual rental history (preferred when available). */
export function lifecycleFromRentals(
  status: CustomerStatus,
  totalRentals: number,
  hasActiveRental: boolean,
): CustomerLifecycle {
  if (hasActiveRental) return "current_renter";
  if (totalRentals > 0) return "previous_renter";
  return customerLifecycle(status, false);
}

// ---------------------------------------------------------------------------
// Standing / flags
// ---------------------------------------------------------------------------

export type CustomerStanding =
  | "good_standing"
  | "pending_verification"
  | "watchlist"
  | "do_not_rent"
  | "vip";

export const STANDING_LABELS: Record<CustomerStanding, string> = {
  good_standing: "Good Standing",
  pending_verification: "Pending Verification",
  watchlist: "Watchlist",
  do_not_rent: "Do Not Rent",
  vip: "VIP",
};

/** Derive the standing/flag from the authoritative customer_status. The
 *  lifecycle (active/previous) is separate, so a VIP who is a previous renter
 *  shows both. pending_verification only surfaces as a standing when the
 *  tenant has verification enabled. */
export function customerStanding(
  status: CustomerStatus,
  verificationEnabled: boolean,
): CustomerStanding {
  switch (status) {
    case "do_not_rent":
      return "do_not_rent";
    case "vip":
      return "vip";
    case "watchlist":
      return "watchlist";
    case "pending_verification":
      return verificationEnabled ? "pending_verification" : "good_standing";
    case "active_renter":
    case "good_standing":
    default:
      return "good_standing";
  }
}

// ---------------------------------------------------------------------------
// Readiness (Ready / Needs Attention / Blocked) — transparent reasons
// ---------------------------------------------------------------------------

export type ReadinessState = "ready" | "needs_attention" | "blocked";

export interface CustomerReadiness {
  state: ReadinessState;
  /** Human-readable reasons (never opaque scores). */
  reasons: string[];
}

const ACTIVE_RENTAL_STATUSES = new Set([
  "active",
  "late",
  "overdue",
  "payment_due",
  "return_pending",
]);

/** Determine customer readiness from authoritative inputs. Verification only
 *  participates when the tenant has verification enabled. Compliance remains
 *  the authoritative blocker engine — we read its blocking reasons directly
 *  rather than re-evaluating. Do Not Rent blocks independently of verification.
 */
export function customerReadiness(input: {
  status: CustomerStatus;
  hasActiveRental: boolean;
  outstandingBalance: number;
  blockingBalancePolicy?: boolean;
  compliance?: EntityComplianceResult | null;
  verificationEnabled: boolean;
}): CustomerReadiness {
  const reasons: string[] = [];
  let blocked = false;

  // Do Not Rent — independent authoritative blocker (not owned by verification).
  if (input.status === "do_not_rent") {
    reasons.push("Do Not Rent");
    blocked = true;
  }

  // Blocking balance — only when the tenant policy enables it.
  if (input.blockingBalancePolicy && input.outstandingBalance > 0) {
    reasons.push(`Outstanding balance ${input.outstandingBalance.toFixed(2)}`);
    blocked = true;
  }

  // Compliance — authoritative blocker engine. blockingReasons come from
  // configured compliance rules (e.g. expired driver license when the rule is
  // enabled as blocking). We do NOT create a second engine here.
  if (input.compliance) {
    for (const r of input.compliance.blockingReasons) {
      reasons.push(r);
      blocked = true;
    }
    // Non-blocking compliance issues surface as Needs Attention.
    for (const issue of input.compliance.issues) {
      if (issue.blocking) continue; // already captured above
      // Only surface verification-related issues when verification is enabled.
      if (
        !input.verificationEnabled &&
        isVerificationDocType(issue.document_type)
      ) {
        continue;
      }
      reasons.push(
        `${issue.document_type} — ${issue.reason.replace(/_/g, " ")}`,
      );
    }
  }

  // Conflicting active rental — a customer already in an in-progress rental
  // cannot start another simultaneously (operational readiness).
  if (input.hasActiveRental) {
    reasons.push("Active rental in progress");
    blocked = true;
  }

  if (blocked) return { state: "blocked", reasons };
  if (reasons.length > 0) return { state: "needs_attention", reasons };
  return { state: "ready", reasons: [] };
}

const VERIFICATION_DOC_TYPES = new Set([
  "driver_license",
  "government_id",
  "insurance",
]);

function isVerificationDocType(t: string): boolean {
  return VERIFICATION_DOC_TYPES.has(t);
}

// ---------------------------------------------------------------------------
// Row composition
// ---------------------------------------------------------------------------

export interface CustomerWorkspaceRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  license: string | null;
  status: CustomerStatus;
  lifecycle: CustomerLifecycle;
  standing: CustomerStanding;
  currentVehicle: string | null;
  currentVehicleId: string | null;
  activeRentalId: string | null;
  balance: number;
  totalRentals: number;
  lifetimeRevenue: number;
  lastRentalDate: string | null;
  readiness: CustomerReadiness;
  tags: string[];
}

export interface CustomerWorkspaceSources {
  customers: Customer[];
  rentals: RentalAgreement[];
  vehicles: Vehicle[];
  policies: Pick<CompanyPolicies, "customer_verification">;
  /** Resolver returning the compliance result for a customer (or null). The
   *  caller wires this to the real ComplianceProvider so this module never
   *  imports the compliance store directly (avoids a second engine). */
  complianceFor?: (
    customerId: string,
    customerLabel: string,
  ) => EntityComplianceResult | null;
  /** Resolver returning the tags for a customer (default: none). */
  tagsFor?: (customerId: string) => string[];
  /** Whether a blocking-balance policy is active for this tenant. */
  blockingBalancePolicy?: boolean;
  now?: Date;
}

/** Build the full workspace row set from authoritative sources. */
export function buildCustomerRows(
  src: CustomerWorkspaceSources,
): CustomerWorkspaceRow[] {
  const now = src.now ?? new Date();
  const verificationEnabled = isVerificationEnabled(src.policies);
  return src.customers.map((c) => {
    const custRentals = src.rentals.filter((r) => r.customer_id === c.id);
    const totalRentals = custRentals.length;
    const lifetimeRevenue = custRentals.reduce((s, r) => s + r.amount_paid, 0);
    const balance = custRentals
      .filter((r) => ACTIVE_RENTAL_STATUSES.has(r.status))
      .reduce((s, r) => s + r.balance_due, 0);
    const activeRental = custRentals.find((r) =>
      ACTIVE_RENTAL_STATUSES.has(r.status),
    );
    const currentVehicle = activeRental
      ? src.vehicles.find((v) => v.id === activeRental.vehicle_id)
      : undefined;
    const lastRental = custRentals
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const hasActiveRental = !!activeRental;
    const compliance = src.complianceFor
      ? src.complianceFor(c.id, `${c.first_name} ${c.last_name}`)
      : null;
    const readiness = customerReadiness({
      status: c.customer_status,
      hasActiveRental,
      outstandingBalance: balance,
      blockingBalancePolicy: src.blockingBalancePolicy ?? false,
      compliance,
      verificationEnabled,
    });
    return {
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
      email: c.email,
      license: c.drivers_license_number ?? null,
      status: c.customer_status,
      lifecycle: lifecycleFromRentals(
        c.customer_status,
        totalRentals,
        hasActiveRental,
      ),
      standing: customerStanding(c.customer_status, verificationEnabled),
      currentVehicle: currentVehicle
        ? `${currentVehicle.make} ${currentVehicle.model}`
        : null,
      currentVehicleId: currentVehicle?.id ?? null,
      activeRentalId: activeRental?.id ?? null,
      balance,
      totalRentals,
      lifetimeRevenue,
      lastRentalDate: lastRental?.created_at ?? null,
      readiness,
      tags: src.tagsFor ? src.tagsFor(c.id) : [],
    };
  });
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface CustomerKpis {
  total: number;
  activeRenters: number;
  outstandingBalance: number;
  pendingVerification: number;
  doNotRent: number;
  previousRenters: number;
}

export function customerKpis(
  rows: CustomerWorkspaceRow[],
  verificationEnabled: boolean,
): CustomerKpis {
  return {
    total: rows.length,
    activeRenters: rows.filter((r) => r.lifecycle === "current_renter").length,
    outstandingBalance: rows.reduce((s, r) => s + r.balance, 0),
    pendingVerification: verificationEnabled
      ? rows.filter((r) => r.standing === "pending_verification").length
      : 0,
    doNotRent: rows.filter((r) => r.standing === "do_not_rent").length,
    previousRenters: rows.filter((r) => r.lifecycle === "previous_renter")
      .length,
  };
}

// ---------------------------------------------------------------------------
// Quick filters
// ---------------------------------------------------------------------------

export type QuickFilter =
  | "all"
  | "active_renter"
  | "previous_renter"
  | "good_standing"
  | "pending_verification"
  | "watchlist"
  | "do_not_rent"
  | "vip"
  | "has_balance"
  | "no_balance"
  | "ready"
  | "needs_attention"
  | "blocked"
  | "rented_30d"
  | "rented_90d"
  | "rented_12m";

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  all: "All",
  active_renter: "Active Renter",
  previous_renter: "Previous Renter",
  good_standing: "Good Standing",
  pending_verification: "Pending Verification",
  watchlist: "Watchlist",
  do_not_rent: "Do Not Rent",
  vip: "VIP",
  has_balance: "Has Balance",
  no_balance: "No Balance",
  ready: "Ready to Rent",
  needs_attention: "Needs Attention",
  blocked: "Blocked",
  rented_30d: "Rented in last 30 days",
  rented_90d: "Rented in last 90 days",
  rented_12m: "Rented in last 12 months",
};

/** Filters that are verification-specific and hidden when verification is Off. */
export const VERIFICATION_QUICK_FILTERS: QuickFilter[] = [
  "pending_verification",
];

export function applyQuickFilter(
  rows: CustomerWorkspaceRow[],
  filter: QuickFilter,
  now: Date = new Date(),
): CustomerWorkspaceRow[] {
  const withinDays = (days: number) =>
    rows.filter((r) => {
      if (!r.lastRentalDate) return false;
      const d = new Date(r.lastRentalDate).getTime();
      return !isNaN(d) && now.getTime() - d <= days * 86_400_000;
    });
  switch (filter) {
    case "all":
      return rows;
    case "active_renter":
      return rows.filter((r) => r.lifecycle === "current_renter");
    case "previous_renter":
      return rows.filter((r) => r.lifecycle === "previous_renter");
    case "good_standing":
      return rows.filter((r) => r.standing === "good_standing");
    case "pending_verification":
      return rows.filter((r) => r.standing === "pending_verification");
    case "watchlist":
      return rows.filter((r) => r.standing === "watchlist");
    case "do_not_rent":
      return rows.filter((r) => r.standing === "do_not_rent");
    case "vip":
      return rows.filter((r) => r.standing === "vip");
    case "has_balance":
      return rows.filter((r) => r.balance > 0);
    case "no_balance":
      return rows.filter((r) => r.balance <= 0);
    case "ready":
      return rows.filter((r) => r.readiness.state === "ready");
    case "needs_attention":
      return rows.filter((r) => r.readiness.state === "needs_attention");
    case "blocked":
      return rows.filter((r) => r.readiness.state === "blocked");
    case "rented_30d":
      return withinDays(30);
    case "rented_90d":
      return withinDays(90);
    case "rented_12m":
      return withinDays(365);
    default:
      return rows;
  }
}

/** Search by name, phone, email, driver license, or customer reference. */
export function searchCustomers(
  rows: CustomerWorkspaceRow[],
  query: string,
): CustomerWorkspaceRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const hay =
      `${r.name} ${r.phone} ${r.email} ${r.license ?? ""} ${r.id}`.toLowerCase();
    return hay.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Duplicate detection (strong identifiers only — never name-only)
// ---------------------------------------------------------------------------

export interface DuplicateMatch {
  customer: Customer;
  signal: "phone" | "email" | "license";
}

export function normalizePhone(s: string): string {
  return s.replace(/\D/g, "");
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** Detect likely duplicates using authoritative strong identifiers. Name-only
 *  matches NEVER force a duplicate. Returns the first strong match. */
export function findDuplicateCustomer(
  customers: Customer[],
  input: {
    phone?: string | null;
    email?: string | null;
    license?: string | null;
  },
): DuplicateMatch | null {
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : "";
  if (phone) {
    const m = customers.find(
      (c) => c.phone && normalizePhone(c.phone) === phone,
    );
    if (m) return { customer: m, signal: "phone" };
  }
  const email = input.email?.trim() ? normalizeEmail(input.email) : "";
  if (email) {
    const m = customers.find(
      (c) => c.email && normalizeEmail(c.email) === email,
    );
    if (m) return { customer: m, signal: "email" };
  }
  const license = input.license?.trim()
    ? input.license.trim().toLowerCase()
    : "";
  if (license) {
    const m = customers.find(
      (c) =>
        c.drivers_license_number &&
        c.drivers_license_number.toLowerCase() === license,
    );
    if (m) return { customer: m, signal: "license" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Export helpers (permission-aware)
// ---------------------------------------------------------------------------

export interface ExportPermissions {
  viewLicense: boolean;
  viewInsurance: boolean;
  viewFinancials: boolean;
  viewVerification: boolean;
}

export interface CustomerExportRow {
  name: string;
  phone: string;
  email: string;
  lifecycle: string;
  standing: string;
  tags: string;
  activeRenter: string;
  currentVehicle: string;
  outstandingBalance: string;
  rentalCount: string;
  lifetimeRevenue: string;
  lastRental: string;
  verificationState: string;
  readinessState: string;
  /** Sensitive — only included when permitted. */
  licenseNumber?: string;
}

/** Build export rows from workspace rows + customers, respecting permissions.
 *  Sensitive fields (license number, balances) are omitted unless permitted. */
export function buildExportRows(
  rows: CustomerWorkspaceRow[],
  customers: Customer[],
  perms: ExportPermissions,
  verificationEnabled: boolean,
): CustomerExportRow[] {
  return rows.map((r) => {
    const c = customers.find((x) => x.id === r.id);
    const out: CustomerExportRow = {
      name: r.name,
      phone: r.phone,
      email: r.email,
      lifecycle: LIFECYCLE_LABELS[r.lifecycle],
      standing: STANDING_LABELS[r.standing],
      tags: r.tags.join("; "),
      activeRenter: r.lifecycle === "current_renter" ? "Yes" : "No",
      currentVehicle: r.currentVehicle ?? "",
      outstandingBalance: perms.viewFinancials ? r.balance.toFixed(2) : "",
      rentalCount: String(r.totalRentals),
      lifetimeRevenue: perms.viewFinancials ? r.lifetimeRevenue.toFixed(2) : "",
      lastRental: r.lastRentalDate ?? "",
      verificationState: verificationEnabled ? r.standing : "",
      readinessState: r.readiness.state,
    };
    if (perms.viewLicense && c?.drivers_license_number) {
      out.licenseNumber = c.drivers_license_number;
    }
    return out;
  });
}

/** CSV-escape a single field value. */
export function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  const needsQuoting =
    s.indexOf(",") !== -1 ||
    s.indexOf("\n") !== -1 ||
    s.indexOf("\r") !== -1 ||
    s.indexOf('"') !== -1;
  if (!needsQuoting) return s;
  return '"' + s.split('"').join('""') + '"';
}

/** Convert export rows to CSV text. Sensitive columns are only included when
 *  their permission flag is set, so the header adapts to the viewer. */
export function exportRowsToCsv(
  rows: CustomerExportRow[],
  perms: ExportPermissions,
): string {
  const baseHeaders = [
    "Customer Name",
    "Phone",
    "Email",
    "Lifecycle",
    "Standing",
    "Tags",
    "Active Renter",
    "Current Vehicle",
    "Outstanding Balance",
    "Rental Count",
    "Lifetime Revenue",
    "Last Rental",
    "Verification State",
    "Readiness State",
  ];
  const headers = perms.viewLicense
    ? [...baseHeaders, "Driver License Number"]
    : baseHeaders;
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    const base = [
      r.name,
      r.phone,
      r.email,
      r.lifecycle,
      r.standing,
      r.tags,
      r.activeRenter,
      r.currentVehicle,
      r.outstandingBalance,
      r.rentalCount,
      r.lifetimeRevenue,
      r.lastRental,
      r.verificationState,
      r.readinessState,
    ];
    const vals = perms.viewLicense ? [...base, r.licenseNumber ?? ""] : base;
    lines.push(vals.map(csvEscape).join(","));
  }
  return lines.join("\n");
}
