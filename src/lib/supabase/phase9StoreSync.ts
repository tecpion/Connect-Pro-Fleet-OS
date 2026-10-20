// Connect Pro Fleet — Phase 9C-1 Cloud store-sync foundation.
//
// Bridges the frozen in-memory StoreProvider to the Phase 9 Cloud repository
// layer WITHOUT changing the synchronous `useStore()` API. The store keeps its
// useState arrays as the UI cache; this module hydrates them from Cloud on
// auth/org change and persists mutations through the repository abstraction
// (UI → store method → repository → Cloud).
//
// Phase 9C-1 scope: this file is the FOUNDATION only. It exposes
// `hydratePhase9Slices()` and a set of `persist*` helpers. It is NOT yet wired
// into StoreProvider or any store mutation path — that is Phase 9C-2.
//
// Frozen semantics preserved:
// - CompanyInfo.timezone remains authoritative (Phase 6); never replaced with
//   browser/server timezone. Arrangement due/broken logic is untouched.
// - Repeated hydration replaces the cache with Cloud-authoritative state
//   (idempotent — no duplicates) and ignores stale async responses after an
//   org switch via the passed cancellation handle.
//
// Financial safeguards (frozen V1 model):
//   invoice      = amount/document owed (NOT revenue). Persistence never
//                  inserts into rental_ledger_transactions.
//   receipt      = payment/document evidence (NOT a new payment). Persistence
//                  never creates a FinancialTransaction.
//   arrangement  = customer promise (NOT a payment, NOT P&L). Persistence never
//                  alters the ledger. linked_payments are references/evidence
//                  only; amount_paid is derived, never stored.
//   installment  = amount_paid is DERIVED from linked_payments; never stored.
// The rental_ledger_transactions table remains the authoritative financial
// source of truth. No helper in this module writes to it.
//
// In memory mode (no Cloud config) every function is a no-op so the existing
// seeded demo experience is unchanged.

import type { RentalEvent } from "../types";
import type { Invoice, Receipt } from "../invoiceTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
} from "../paymentArrangementTypes";
import type { ActivityEntry } from "../store/storeContext";
import type { AgreementTemplate } from "../settingsTypes";
import type { MasterAgreement, AgreementInstance } from "../types";
import { getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type {
  RentalEventsRepository,
  InvoicesRepository,
  ReceiptsRepository,
  PaymentArrangementsRepository,
  AgreementsRepository,
  ActivityAuditRepository,
} from "./phase9Adapters";

// ── Repository bundle ──────────────────────────────────────────────────────

export interface Phase9Repositories {
  rentalEvents: RentalEventsRepository | null;
  invoices: InvoicesRepository | null;
  receipts: ReceiptsRepository | null;
  paymentArrangements: PaymentArrangementsRepository | null;
  agreements: AgreementsRepository | null;
  activityAudit: ActivityAuditRepository | null;
}

function repos(): Phase9Repositories | null {
  if (getBackendMode() !== "supabase") return null;
  const r = createRepositories();
  return {
    rentalEvents: r.rentalEvents,
    invoices: r.invoices,
    receipts: r.receipts,
    paymentArrangements: r.paymentArrangements,
    agreements: r.agreements,
    activityAudit: r.activityAudit,
  };
}

// ── Stale-org cancellation handle ───────────────────────────────────────────
// Callers (StoreProvider in Phase 9C-2) pass a guard that returns false once
// the active organization has switched, so a slow Cloud response from Org A
// never overwrites Org B's cache. The handle is checked before every setter
// application; if it returns false the result is discarded.

export interface StaleOrgGuard {
  /** Returns true while the org that started hydration is still active. */
  isActive: (orgId: string) => boolean;
}

// ── Hydration handles ──────────────────────────────────────────────────────
// Each setter accepts a functional updater (prev => next) so hydration can
// replace the cache atomically while preserving the React state contract.
// Optional setters let StoreProvider hydrate only the slices it owns; slices
// owned by dedicated providers (e.g. agreements) stay unset on the core
// provider without a type clash.

export interface Phase9SyncHandles {
  setRentalEvents: (updater: (prev: RentalEvent[]) => RentalEvent[]) => void;
  setInvoices: (updater: (prev: Invoice[]) => Invoice[]) => void;
  setReceipts: (updater: (prev: Receipt[]) => Receipt[]) => void;
  setPaymentArrangements: (
    updater: (prev: PaymentArrangement[]) => PaymentArrangement[],
  ) => void;
  setArrangementInstallments: (
    updater: (
      prev: PaymentArrangementInstallment[],
    ) => PaymentArrangementInstallment[],
  ) => void;
  setArrangementEvents: (
    updater: (prev: ArrangementEvent[]) => ArrangementEvent[],
  ) => void;
  /** Agreement templates/master/instances may live on a dedicated provider;
   *  optional so the core StoreProvider can hydrate the other slices without
   *  a type clash. */
  setAgreementTemplates?: (
    updater: (prev: AgreementTemplate[]) => AgreementTemplate[],
  ) => void;
  setMasterAgreements?: (
    updater: (prev: MasterAgreement[]) => MasterAgreement[],
  ) => void;
  setAgreementInstances?: (
    updater: (prev: AgreementInstance[]) => AgreementInstance[],
  ) => void;
  setActivityLog: (updater: (prev: ActivityEntry[]) => ActivityEntry[]) => void;
}

/** Hydrate all Phase 9 slices from Cloud into the store cache. Returns true
 *  when Cloud mode is active and hydration ran. Each domain is hydrated
 *  independently so a failure in one does not corrupt another's valid cache.
 *  The stale-org guard is consulted before every setter so Org A state never
 *  lands after switching to Org B. */
export async function hydratePhase9Slices(
  orgId: string,
  handles: Phase9SyncHandles,
  repositories?: Phase9Repositories | null,
  guard?: StaleOrgGuard,
): Promise<boolean> {
  const r = repositories ?? repos();
  if (!r) return false;

  const stillActive = (): boolean => (guard ? guard.isActive(orgId) : true);

  // Rental events (append-only timeline; listAll across the org).
  if (r.rentalEvents) {
    try {
      const events = await r.rentalEvents.listAll(orgId);
      if (stillActive()) handles.setRentalEvents(() => events);
    } catch (e) {
      console.error("[phase9Sync] rental events hydration failed", e);
    }
  }

  // Invoices (document owed; NOT revenue).
  if (r.invoices) {
    try {
      const invoices = await r.invoices.list(orgId);
      if (stillActive()) handles.setInvoices(() => invoices);
    } catch (e) {
      console.error("[phase9Sync] invoices hydration failed", e);
    }
  }

  // Receipts (payment/document evidence; NOT a new payment).
  if (r.receipts) {
    try {
      const receipts = await r.receipts.list(orgId);
      if (stillActive()) handles.setReceipts(() => receipts);
    } catch (e) {
      console.error("[phase9Sync] receipts hydration failed", e);
    }
  }

  // Payment arrangements + installments + events (promise; NOT P&L).
  if (r.paymentArrangements) {
    try {
      const arrangements = await r.paymentArrangements.list(orgId);
      if (!stillActive()) return true;
      handles.setPaymentArrangements(() => arrangements);

      // Hydrate installments + events per arrangement, preserving the
      // arrangement relationship without collapsing the tables.
      const installments: PaymentArrangementInstallment[] = [];
      const events: ArrangementEvent[] = [];
      for (const a of arrangements) {
        if (!stillActive()) return true;
        const [insts, evs] = await Promise.all([
          r.paymentArrangements.listInstallments(orgId, a.id),
          r.paymentArrangements.listEvents(orgId, a.id),
        ]);
        installments.push(...insts);
        events.push(...evs);
      }
      if (stillActive()) {
        handles.setArrangementInstallments(() => installments);
        handles.setArrangementEvents(() => events);
      }
    } catch (e) {
      console.error("[phase9Sync] payment arrangements hydration failed", e);
    }
  }

  // Agreements (templates + master + instances). Optional setters — only
  // applied when the caller wired them (dedicated provider or core store).
  if (r.agreements) {
    try {
      const [templates, masters, instances] = await Promise.all([
        r.agreements.listTemplates(orgId),
        r.agreements.listMasterAgreements(orgId),
        r.agreements.listInstances(orgId),
      ]);
      if (stillActive()) {
        if (handles.setAgreementTemplates)
          handles.setAgreementTemplates(() => templates);
        if (handles.setMasterAgreements)
          handles.setMasterAgreements(() => masters);
        if (handles.setAgreementInstances)
          handles.setAgreementInstances(() => instances);
      }
    } catch (e) {
      console.error("[phase9Sync] agreements hydration failed", e);
    }
  }

  // Activity / audit (append-oriented feed; capped by the repository).
  if (r.activityAudit) {
    try {
      const activity = await r.activityAudit.list(orgId);
      if (stillActive()) handles.setActivityLog(() => activity);
    } catch (e) {
      console.error("[phase9Sync] activity/audit hydration failed", e);
    }
  }

  return true;
}

// ── Rental events persistence (append-only) ──────────────────────────────────

export function persistRentalEventAppend(orgId: string, e: RentalEvent): void {
  if (!orgId) return;
  const r = repos();
  if (!r?.rentalEvents) return;
  void r.rentalEvents
    .insert(orgId, e)
    .catch((err) =>
      console.error("[phase9Sync] rental event insert failed", err),
    );
}

// ── Invoices persistence (document owed; NO ledger synthesis) ────────────────

export function persistInvoiceInsert(i: Invoice): void {
  if (!i.tenant_id) return;
  const r = repos();
  if (!r?.invoices) return;
  void r.invoices
    .insert(i)
    .catch((err) => console.error("[phase9Sync] invoice insert failed", err));
}

export function persistInvoiceUpdate(
  orgId: string,
  id: string,
  patch: Partial<Invoice>,
): void {
  if (!orgId || !id) return;
  const r = repos();
  if (!r?.invoices) return;
  void r.invoices
    .update(orgId, id, patch)
    .catch((err) => console.error("[phase9Sync] invoice update failed", err));
}

// ── Receipts persistence (evidence only; NO payment synthesis) ────────────────

export function persistReceiptInsert(rc: Receipt): void {
  if (!rc.tenant_id) return;
  const r = repos();
  if (!r?.receipts) return;
  void r.receipts
    .insert(rc)
    .catch((err) => console.error("[phase9Sync] receipt insert failed", err));
}

// ── Payment arrangements persistence (promise; NOT P&L) ──────────────────────

export function persistPaymentArrangementInsert(a: PaymentArrangement): void {
  if (!a.tenant_id) return;
  const r = repos();
  if (!r?.paymentArrangements) return;
  void r.paymentArrangements
    .insert(a)
    .catch((err) =>
      console.error("[phase9Sync] arrangement insert failed", err),
    );
}

export function persistPaymentArrangementUpdate(
  orgId: string,
  id: string,
  patch: Partial<PaymentArrangement>,
): void {
  if (!orgId || !id) return;
  const r = repos();
  if (!r?.paymentArrangements) return;
  void r.paymentArrangements
    .update(orgId, id, patch)
    .catch((err) =>
      console.error("[phase9Sync] arrangement update failed", err),
    );
}

// ── Arrangement installments persistence ────────────────────────────────────
// amount_paid is DERIVED from linked_payments; the installment row stores only
// linked_payment_transaction_ids + linked_payments (references/evidence).
// No duplicate amount_paid is ever written.

export function persistArrangementInstallmentInsert(
  i: PaymentArrangementInstallment,
): void {
  if (!i.tenant_id) return;
  const r = repos();
  if (!r?.paymentArrangements) return;
  void r.paymentArrangements
    .insertInstallment(i)
    .catch((err) =>
      console.error("[phase9Sync] installment insert failed", err),
    );
}

export function persistArrangementInstallmentUpdate(
  orgId: string,
  id: string,
  patch: Partial<PaymentArrangementInstallment>,
): void {
  if (!orgId || !id) return;
  const r = repos();
  if (!r?.paymentArrangements) return;
  void r.paymentArrangements
    .updateInstallment(orgId, id, patch)
    .catch((err) =>
      console.error("[phase9Sync] installment update failed", err),
    );
}

// ── Arrangement events persistence (append-only audit trail) ────────────────

export function persistArrangementEventAppend(e: ArrangementEvent): void {
  if (!e.tenant_id) return;
  const r = repos();
  if (!r?.paymentArrangements) return;
  void r.paymentArrangements
    .insertEvent(e)
    .catch((err) =>
      console.error("[phase9Sync] arrangement event insert failed", err),
    );
}

// ── Agreements persistence (templates + master + instances) ─────────────────

export function persistAgreementTemplateInsert(t: AgreementTemplate): void {
  if (!t.tenant_id) return;
  const r = repos();
  if (!r?.agreements) return;
  void r.agreements
    .insertTemplate(t)
    .catch((err) =>
      console.error("[phase9Sync] agreement template insert failed", err),
    );
}

export function persistAgreementTemplateUpdate(
  orgId: string,
  id: string,
  patch: Partial<AgreementTemplate>,
): void {
  if (!orgId || !id) return;
  const r = repos();
  if (!r?.agreements) return;
  void r.agreements
    .updateTemplate(orgId, id, patch)
    .catch((err) =>
      console.error("[phase9Sync] agreement template update failed", err),
    );
}

export function persistMasterAgreementInsert(m: MasterAgreement): void {
  if (!m.tenant_id) return;
  const r = repos();
  if (!r?.agreements) return;
  void r.agreements
    .insertMasterAgreement(m)
    .catch((err) =>
      console.error("[phase9Sync] master agreement insert failed", err),
    );
}

export function persistAgreementInstanceInsert(a: AgreementInstance): void {
  if (!a.tenant_id) return;
  const r = repos();
  if (!r?.agreements) return;
  void r.agreements
    .insertInstance(a)
    .catch((err) =>
      console.error("[phase9Sync] agreement instance insert failed", err),
    );
}

// ── Activity / audit persistence (append-only feed) ──────────────────────────
// The domain ActivityEntry carries no staff_id; the caller passes the actor
// staff id so it is durable across relogin even when the in-memory feed does
// not surface it.

export function persistActivityAppend(
  orgId: string,
  e: ActivityEntry,
  staffId?: string | null,
): void {
  if (!orgId) return;
  const r = repos();
  if (!r?.activityAudit) return;
  void r.activityAudit
    .insert(orgId, e, staffId ?? null)
    .catch((err) => console.error("[phase9Sync] activity insert failed", err));
}
