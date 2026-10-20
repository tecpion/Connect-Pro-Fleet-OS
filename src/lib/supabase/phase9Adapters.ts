// Connect Pro Fleet — Phase 9 repository adapters: rental events + invoices +
// receipts + payment arrangements (+ installments/events) + agreements
// (templates/master/instances) + activity/audit.
//
// Concrete repository implementations backed by the typed Supabase client.
// Each delegates to the Phase 9 row/domain mappers and normalizes errors.
// Used only when Supabase is configured; in memory mode the factory returns
// nulls.
//
// Architectural rule preserved: no component/page calls .from(table) directly.
// Every organization query is scoped by organization_id and relies on RLS
// (is_org_member) as the final authority.
//
// Financial safeguards: these repositories persist documents/promises/evidence
// ONLY. They never insert into rental_ledger_transactions, never synthesize a
// payment, and never alter P&L. The ledger repository (Phase 1) remains the
// sole authority for actual financial movements.

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
import type { getSupabase } from "./client";
import { normalizeError } from "./repository";
import {
  rowToRentalEvent,
  rentalEventToRow,
  rowToInvoice,
  invoiceToRow,
  invoicePatchToRow,
  rowToReceipt,
  receiptToRow,
  rowToPaymentArrangement,
  paymentArrangementToRow,
  paymentArrangementPatchToRow,
  rowToPaymentArrangementInstallment,
  paymentArrangementInstallmentToRow,
  paymentArrangementInstallmentPatchToRow,
  rowToArrangementEvent,
  arrangementEventToRow,
  rowToActivityEntry,
  activityEntryToRow,
  rowToAgreementTemplate,
  agreementTemplateToRow,
  rowToMasterAgreement,
  masterAgreementToRow,
  rowToAgreementInstance,
  agreementInstanceToRow,
} from "./phase9Mappers";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

// ── Rental Events Repository ──────────────────────────────────────
// Append-only rental timeline. No update/delete — events are immutable.

export interface RentalEventsRepository {
  list(orgId: string, rentalId: string): Promise<RentalEvent[]>;
  listAll(orgId: string): Promise<RentalEvent[]>;
  insert(orgId: string, e: RentalEvent): Promise<RentalEvent>;
}

export class SupabaseRentalEventsRepository implements RentalEventsRepository {
  constructor(private db: Db) {}

  async list(orgId: string, rentalId: string): Promise<RentalEvent[]> {
    const { data, error } = await this.db
      .from("rental_events")
      .select("*")
      .eq("organization_id", orgId)
      .eq("rental_id", rentalId)
      .order("at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToRentalEvent);
  }

  async listAll(orgId: string): Promise<RentalEvent[]> {
    const { data, error } = await this.db
      .from("rental_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToRentalEvent);
  }

  async insert(orgId: string, e: RentalEvent): Promise<RentalEvent> {
    const { data, error } = await this.db
      .from("rental_events")
      .insert(rentalEventToRow(orgId, e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToRentalEvent(data);
  }
}

// ── Invoices Repository ────────────────────────────────────────────
// Document owed; NOT revenue. No ledger synthesis.

export interface InvoicesRepository {
  list(orgId: string): Promise<Invoice[]>;
  get(orgId: string, id: string): Promise<Invoice | null>;
  insert(i: Invoice): Promise<Invoice>;
  update(orgId: string, id: string, patch: Partial<Invoice>): Promise<Invoice>;
}

export class SupabaseInvoicesRepository implements InvoicesRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<Invoice[]> {
    const { data, error } = await this.db
      .from("invoices")
      .select("*")
      .eq("organization_id", orgId)
      .order("issue_date", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToInvoice);
  }

  async get(orgId: string, id: string): Promise<Invoice | null> {
    const { data, error } = await this.db
      .from("invoices")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToInvoice(data) : null;
  }

  async insert(i: Invoice): Promise<Invoice> {
    const { data, error } = await this.db
      .from("invoices")
      .insert(invoiceToRow(i))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToInvoice(data);
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<Invoice>,
  ): Promise<Invoice> {
    const { data, error } = await this.db
      .from("invoices")
      .update(invoicePatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToInvoice(data);
  }
}

// ── Receipts Repository ────────────────────────────────────────────
// Payment/document evidence; NOT a new payment. No ledger synthesis.

export interface ReceiptsRepository {
  list(orgId: string): Promise<Receipt[]>;
  get(orgId: string, id: string): Promise<Receipt | null>;
  insert(r: Receipt): Promise<Receipt>;
}

export class SupabaseReceiptsRepository implements ReceiptsRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<Receipt[]> {
    const { data, error } = await this.db
      .from("receipts")
      .select("*")
      .eq("organization_id", orgId)
      .order("issued_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToReceipt);
  }

  async get(orgId: string, id: string): Promise<Receipt | null> {
    const { data, error } = await this.db
      .from("receipts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToReceipt(data) : null;
  }

  async insert(r: Receipt): Promise<Receipt> {
    const { data, error } = await this.db
      .from("receipts")
      .insert(receiptToRow(r))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToReceipt(data);
  }
}

// ── Payment Arrangements Repository ────────────────────────────────
// Customer promise; NOT a payment, NOT P&L. Groups the arrangement + its
// installments + its append-only event trail coherently.

export interface PaymentArrangementsRepository {
  list(orgId: string): Promise<PaymentArrangement[]>;
  get(orgId: string, id: string): Promise<PaymentArrangement | null>;
  insert(a: PaymentArrangement): Promise<PaymentArrangement>;
  update(
    orgId: string,
    id: string,
    patch: Partial<PaymentArrangement>,
  ): Promise<PaymentArrangement>;

  listInstallments(
    orgId: string,
    arrangementId: string,
  ): Promise<PaymentArrangementInstallment[]>;
  insertInstallment(
    i: PaymentArrangementInstallment,
  ): Promise<PaymentArrangementInstallment>;
  updateInstallment(
    orgId: string,
    id: string,
    patch: Partial<PaymentArrangementInstallment>,
  ): Promise<PaymentArrangementInstallment>;

  listEvents(orgId: string, arrangementId: string): Promise<ArrangementEvent[]>;
  insertEvent(e: ArrangementEvent): Promise<ArrangementEvent>;
}

export class SupabasePaymentArrangementsRepository implements PaymentArrangementsRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<PaymentArrangement[]> {
    const { data, error } = await this.db
      .from("payment_arrangements")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToPaymentArrangement);
  }

  async get(orgId: string, id: string): Promise<PaymentArrangement | null> {
    const { data, error } = await this.db
      .from("payment_arrangements")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToPaymentArrangement(data) : null;
  }

  async insert(a: PaymentArrangement): Promise<PaymentArrangement> {
    const { data, error } = await this.db
      .from("payment_arrangements")
      .insert(paymentArrangementToRow(a))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToPaymentArrangement(data);
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<PaymentArrangement>,
  ): Promise<PaymentArrangement> {
    const { data, error } = await this.db
      .from("payment_arrangements")
      .update(paymentArrangementPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToPaymentArrangement(data);
  }

  async listInstallments(
    orgId: string,
    arrangementId: string,
  ): Promise<PaymentArrangementInstallment[]> {
    const { data, error } = await this.db
      .from("payment_arrangement_installments")
      .select("*")
      .eq("organization_id", orgId)
      .eq("arrangement_id", arrangementId)
      .order("sequence", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToPaymentArrangementInstallment);
  }

  async insertInstallment(
    i: PaymentArrangementInstallment,
  ): Promise<PaymentArrangementInstallment> {
    const { data, error } = await this.db
      .from("payment_arrangement_installments")
      .insert(paymentArrangementInstallmentToRow(i))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToPaymentArrangementInstallment(data);
  }

  async updateInstallment(
    orgId: string,
    id: string,
    patch: Partial<PaymentArrangementInstallment>,
  ): Promise<PaymentArrangementInstallment> {
    const { data, error } = await this.db
      .from("payment_arrangement_installments")
      .update(paymentArrangementInstallmentPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToPaymentArrangementInstallment(data);
  }

  async listEvents(
    orgId: string,
    arrangementId: string,
  ): Promise<ArrangementEvent[]> {
    const { data, error } = await this.db
      .from("payment_arrangement_events")
      .select("*")
      .eq("organization_id", orgId)
      .eq("arrangement_id", arrangementId)
      .order("at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToArrangementEvent);
  }

  async insertEvent(e: ArrangementEvent): Promise<ArrangementEvent> {
    const { data, error } = await this.db
      .from("payment_arrangement_events")
      .insert(arrangementEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToArrangementEvent(data);
  }
}

// ── Agreements Repository ──────────────────────────────────────────
// Groups templates + master agreements + instances coherently. No external
// e-sign behavior.

export interface AgreementsRepository {
  listTemplates(orgId: string): Promise<AgreementTemplate[]>;
  insertTemplate(t: AgreementTemplate): Promise<AgreementTemplate>;
  updateTemplate(
    orgId: string,
    id: string,
    patch: Partial<AgreementTemplate>,
  ): Promise<AgreementTemplate>;

  listMasterAgreements(orgId: string): Promise<MasterAgreement[]>;
  insertMasterAgreement(m: MasterAgreement): Promise<MasterAgreement>;

  listInstances(orgId: string): Promise<AgreementInstance[]>;
  insertInstance(a: AgreementInstance): Promise<AgreementInstance>;
}

export class SupabaseAgreementsRepository implements AgreementsRepository {
  constructor(private db: Db) {}

  async listTemplates(orgId: string): Promise<AgreementTemplate[]> {
    const { data, error } = await this.db
      .from("agreement_templates")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAgreementTemplate);
  }

  async insertTemplate(t: AgreementTemplate): Promise<AgreementTemplate> {
    const { data, error } = await this.db
      .from("agreement_templates")
      .insert(agreementTemplateToRow(t))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAgreementTemplate(data);
  }

  async updateTemplate(
    orgId: string,
    id: string,
    patch: Partial<AgreementTemplate>,
  ): Promise<AgreementTemplate> {
    const row: Partial<ReturnType<typeof agreementTemplateToRow>> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.agreement_type !== undefined)
      row.agreement_type = patch.agreement_type;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.file_url !== undefined) row.file_path = patch.file_url || null;
    if (patch.file_name !== undefined) row.file_name = patch.file_name || null;
    if (patch.version !== undefined) row.version = patch.version;
    if (patch.effective_date !== undefined)
      row.effective_date = patch.effective_date || null;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.is_default !== undefined) row.is_default = patch.is_default;
    if (patch.created_by !== undefined) row.created_by = patch.created_by;
    const { data, error } = await this.db
      .from("agreement_templates")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAgreementTemplate(data);
  }

  async listMasterAgreements(orgId: string): Promise<MasterAgreement[]> {
    const { data, error } = await this.db
      .from("master_agreements")
      .select("*")
      .eq("organization_id", orgId)
      .order("signed_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToMasterAgreement);
  }

  async insertMasterAgreement(m: MasterAgreement): Promise<MasterAgreement> {
    const { data, error } = await this.db
      .from("master_agreements")
      .insert(masterAgreementToRow(m))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToMasterAgreement(data);
  }

  async listInstances(orgId: string): Promise<AgreementInstance[]> {
    const { data, error } = await this.db
      .from("agreement_instances")
      .select("*")
      .eq("organization_id", orgId)
      .order("generated_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAgreementInstance);
  }

  async insertInstance(a: AgreementInstance): Promise<AgreementInstance> {
    const { data, error } = await this.db
      .from("agreement_instances")
      .insert(agreementInstanceToRow(a))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAgreementInstance(data);
  }
}

// ── Activity / Audit Repository ────────────────────────────────────
// Smallest durable append-oriented model compatible with the existing V1
// activity feed. Append + read only; no update/delete.

export interface ActivityAuditRepository {
  list(orgId: string): Promise<ActivityEntry[]>;
  insert(
    orgId: string,
    e: ActivityEntry,
    staffId?: string | null,
  ): Promise<ActivityEntry>;
}

export class SupabaseActivityAuditRepository implements ActivityAuditRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<ActivityEntry[]> {
    const { data, error } = await this.db
      .from("activity_log")
      .select("*")
      .eq("organization_id", orgId)
      .order("at", { ascending: false })
      .limit(200);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToActivityEntry);
  }

  async insert(
    orgId: string,
    e: ActivityEntry,
    staffId: string | null = null,
  ): Promise<ActivityEntry> {
    const { data, error } = await this.db
      .from("activity_log")
      .insert(activityEntryToRow(orgId, e, staffId))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToActivityEntry(data);
  }
}
