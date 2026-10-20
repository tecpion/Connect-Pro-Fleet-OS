// Connect Pro Fleet — Phase 2 Cloud store hydration + persistence sync
// (rentals + rental ledger transactions + security deposits + deposit history +
// booking requests + inspections).
//
// Mirrors the established Phase 1 (storeSync) and Phase 5 (phase5StoreSync)
// pattern: the frozen in-memory store keeps its useState arrays as the UI
// cache; this module hydrates them from Cloud on auth/org change and persists
// mutations through the repository abstraction
// (UI → store method → repository → Cloud). In memory mode (no Cloud config)
// every function is a no-op so the seeded demo experience is unchanged.
//
// Frozen V1 semantics preserved: the ledger stays the financial source of
// truth, deposits are operational lifecycle records, booking requests are the
// CRM intake layer, and inspections are checkout/checkin evidence. No direct
// Supabase calls from components.

import type { RentalAgreement } from "../types";
import type { FinancialTransaction } from "../types";
import type { RentalDeposit, DepositHistoryEvent } from "../depositTypes";
import type { BookingRequest } from "../bookingRequestTypes";
import type { Inspection } from "../inspectionTypes";
import { getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type {
  RentalRepository,
  LedgerRepository,
  DepositRepository,
  BookingRequestRepository,
  InspectionRepository,
} from "./repository";

export interface Phase2Repositories {
  rentals: RentalRepository | null;
  ledger: LedgerRepository | null;
  deposits: DepositRepository | null;
  bookingRequests: BookingRequestRepository | null;
  inspections: InspectionRepository | null;
}

function repos(): Phase2Repositories | null {
  if (getBackendMode() !== "supabase") return null;
  const r = createRepositories();
  return {
    rentals: r.rentals,
    ledger: r.ledger,
    deposits: r.deposits,
    bookingRequests: r.bookingRequests,
    inspections: r.inspections,
  };
}

// ── Hydration handles (the slices Phase 2 owns) ──────────────────────────

export interface Phase2SyncHandles {
  setRentals: (updater: (prev: RentalAgreement[]) => RentalAgreement[]) => void;
  setTransactions: (
    updater: (prev: FinancialTransaction[]) => FinancialTransaction[],
  ) => void;
  setRentalDeposits: (
    updater: (prev: RentalDeposit[]) => RentalDeposit[],
  ) => void;
  setDepositHistory: (
    updater: (prev: DepositHistoryEvent[]) => DepositHistoryEvent[],
  ) => void;
}

// Booking requests + inspections live in their own React contexts
// (bookingRequestStore.tsx / inspection state). Hydration restores them too.
export interface BookingRequestSyncHandles {
  setBookingRequests: (
    updater: (prev: BookingRequest[]) => BookingRequest[],
  ) => void;
}

export interface InspectionSyncHandles {
  setInspections: (updater: (prev: Inspection[]) => Inspection[]) => void;
}

/**
 * Hydrate the Phase 2 core slices (rentals, ledger transactions, security
 * deposits, deposit history) from Cloud into the store cache. Ledger
 * transactions are scoped per-rental in the repository; hydrate across every
 * rental so the in-memory ledger reflects Cloud state after relogin.
 *
 * Returns true when Cloud mode is active and hydration ran. On any read
 * failure the seeded in-memory cache stays (never wipes valid local state).
 */
export async function hydratePhase2Slices(
  orgId: string,
  handles: Phase2SyncHandles,
  repositories?: Phase2Repositories,
): Promise<boolean> {
  const r = repositories ?? repos();
  if (!r?.rentals || !r.deposits) return false;
  try {
    const [rentals, deposits] = await Promise.all([
      r.rentals.list(orgId),
      r.deposits.list(orgId),
    ]);
    // Ledger transactions are per-rental in the repository. Hydrate across
    // every rental so the in-memory ledger reflects Cloud after relogin.
    const transactions: FinancialTransaction[] = [];
    if (r.ledger) {
      for (const rental of rentals) {
        const txns = await r.ledger.listForRental(orgId, rental.id);
        transactions.push(...txns);
      }
    }
    // Deposit history is per-deposit in the repository; hydrate each deposit's
    // audit trail to restore the org-wide history after relogin.
    const depositHistory: DepositHistoryEvent[] = [];
    for (const dep of deposits) {
      const events = await r.deposits.listHistory(orgId, dep.id);
      depositHistory.push(...events);
    }
    handles.setRentals(() => rentals);
    handles.setTransactions(() => transactions);
    handles.setRentalDeposits(() => deposits);
    handles.setDepositHistory(() => depositHistory);
    return true;
  } catch (e) {
    console.error("[phase2Sync] hydration failed", e);
    return false;
  }
}

/** Hydrate booking requests from Cloud into the booking-request context. */
export async function hydrateBookingRequests(
  orgId: string,
  handles: BookingRequestSyncHandles,
  repositories?: Phase2Repositories,
): Promise<boolean> {
  const r = repositories ?? repos();
  if (!r?.bookingRequests) return false;
  try {
    const requests = await r.bookingRequests.list(orgId);
    handles.setBookingRequests(() => requests);
    return true;
  } catch (e) {
    console.error("[phase2Sync] booking request hydration failed", e);
    return false;
  }
}

/** Hydrate inspections from Cloud into the store cache. */
export async function hydrateInspections(
  orgId: string,
  handles: InspectionSyncHandles,
  repositories?: Phase2Repositories,
): Promise<boolean> {
  const r = repositories ?? repos();
  if (!r?.inspections) return false;
  try {
    const inspections = await r.inspections.list(orgId);
    handles.setInspections(() => inspections);
    return true;
  } catch (e) {
    console.error("[phase2Sync] inspection hydration failed", e);
    return false;
  }
}

// ── Persistence hooks (fire-and-forget; local state already updated) ────

export function persistRentalInsert(r: RentalAgreement): void {
  const repo = repos();
  if (!repo?.rentals) return;
  void repo.rentals
    .insert(r)
    .catch((e: unknown) =>
      console.error("[phase2Sync] rental insert failed", e),
    );
}

export function persistRentalUpdate(
  orgId: string,
  id: string,
  patch: Partial<RentalAgreement>,
): void {
  const r = repos();
  if (!r?.rentals) return;
  void r.rentals
    .update(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase2Sync] rental update failed", e),
    );
}

export function persistLedgerInsert(t: FinancialTransaction): void {
  const r = repos();
  if (!r?.ledger) return;
  void r.ledger
    .insert(t)
    .catch((e: unknown) =>
      console.error("[phase2Sync] ledger insert failed", e),
    );
}

export function persistLedgerUpdate(
  orgId: string,
  id: string,
  patch: Partial<FinancialTransaction>,
): void {
  const r = repos();
  if (!r?.ledger) return;
  void r.ledger
    .update(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase2Sync] ledger update failed", e),
    );
}

export function persistDepositInsert(d: RentalDeposit): void {
  const r = repos();
  if (!r?.deposits) return;
  void r.deposits
    .insert(d)
    .catch((e: unknown) =>
      console.error("[phase2Sync] deposit insert failed", e),
    );
}

export function persistDepositUpdate(
  orgId: string,
  id: string,
  patch: Partial<RentalDeposit>,
): void {
  const r = repos();
  if (!r?.deposits) return;
  void r.deposits
    .update(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase2Sync] deposit update failed", e),
    );
}

export function persistDepositHistoryInsert(e: DepositHistoryEvent): void {
  const r = repos();
  if (!r?.deposits) return;
  void r.deposits
    .insertHistory(e)
    .catch((err: unknown) =>
      console.error("[phase2Sync] deposit history insert failed", err),
    );
}

export function persistBookingRequestInsert(b: BookingRequest): void {
  const r = repos();
  if (!r?.bookingRequests) return;
  void r.bookingRequests
    .insert(b)
    .catch((e: unknown) =>
      console.error("[phase2Sync] booking request insert failed", e),
    );
}

export function persistBookingRequestUpdate(
  orgId: string,
  id: string,
  patch: Partial<BookingRequest>,
): void {
  const r = repos();
  if (!r?.bookingRequests) return;
  void r.bookingRequests
    .update(orgId, id, patch)
    .catch((e: unknown) =>
      console.error("[phase2Sync] booking request update failed", e),
    );
}

export function persistInspectionInsert(i: Inspection): void {
  const r = repos();
  if (!r?.inspections) return;
  void r.inspections
    .insert(i)
    .catch((e: unknown) =>
      console.error("[phase2Sync] inspection insert failed", e),
    );
}

export type {
  RentalRepository,
  LedgerRepository,
  DepositRepository,
  BookingRequestRepository,
  InspectionRepository,
};
