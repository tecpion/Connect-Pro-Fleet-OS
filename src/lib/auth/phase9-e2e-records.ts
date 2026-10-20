// Phase 9D E2E — create Phase 9 domain records through the real repository
// path, split into resumable sub-stages so no single staged request exceeds the
// platform deadline. Every insert uses the authenticated Org A repository
// adapter; none uses the service-role admin. Test-harness only.
//
// Sub-stages (each mutates `runtime.recordIds` / `runtime.phase9` in place):
//   runFinancialDocsRecords  — rental event, invoice, payment txn, receipt
//   runArrangementsRecords   — arrangement, installment, arrangement event
//   runAgreementsRecords     — agreement template, master agreement, instance
//   runActivityRecords       — activity/audit entry
//
// Financial safeguards proven inline:
//   - invoice insert is a document, not a ledger row (we read the ledger before
//     and after and assert the count did not change).
//   - receipt insert references an EXISTING payment_transaction_id (created
//     through the authoritative ledger repository) and does NOT create a
//     second ledger row.
//   - arrangement insert is a promise; the ledger is unchanged.
//   - installment carries linked_payments only; amount_paid is derived, never
//     stored (no amount_paid column on the installment row).

import type { RentalEvent, MasterAgreement, AgreementInstance } from "@/lib/types";
import type { Invoice, Receipt } from "@/lib/invoiceTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
} from "@/lib/paymentArrangementTypes";
import type { AgreementTemplate } from "@/lib/settingsTypes";
import type { ActivityEntry } from "@/lib/store/storeContext";
import type { FinancialTransaction } from "@/lib/chargeTypes";
import { step, requireOk, type Phase9Runtime } from "./phase9-e2e-runtime";
import type { Phase9Step } from "./phase9-e2e.server";

export interface Phase9RecordsStageResult {
  steps: Phase9Step[];
}

/** Full un-split record creation (used by the single-shot setup stage). */
export async function runCreatePhase9Records(
  runtime: Phase9Runtime,
): Promise<Phase9RecordsStageResult> {
  const steps: Phase9Step[] = [];
  steps.push(...(await runFinancialDocsRecords(runtime)).steps);
  steps.push(...(await runArrangementsRecords(runtime)).steps);
  steps.push(...(await runAgreementsRecords(runtime)).steps);
  steps.push(...(await runActivityRecords(runtime)).steps);
  return { steps };
}

// ── Sub-stage: rental event + invoice + payment txn + receipt ───────────────
export async function runFinancialDocsRecords(
  runtime: Phase9Runtime,
): Promise<Phase9RecordsStageResult> {
  const steps: Phase9Step[] = [];
  const { rentalEvents, invoices, ledger, receipts, orgA, ctx, now } = runtime;

  const event: RentalEvent = {
    id: crypto.randomUUID(),
    rental_id: ctx.rentalId,
    type: "checkout",
    label: "Phase9 checked out",
    at: now,
    tone: "rented",
    staff_id: null,
  };
  await rentalEvents.insert(orgA, event);
  runtime.recordIds.rentalEvent = event.id;
  runtime.phase9.rentalEvent = event;
  requireOk(
    await step(steps, "rental_event_persistence", async () => {
      const rows = await rentalEvents.listAll(orgA);
      return rows.some((r) => r.id === event.id && r.rental_id === ctx.rentalId);
    }),
  );

  // ── Invoice: document owed, NOT revenue. Prove no ledger row is created. ──
  const ledgerBefore = await ledger.listForRental(orgA, ctx.rentalId);
  const invoice: Invoice = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    invoice_number: `INV-P9-${runtime.stamp}`,
    customer_id: ctx.custId,
    rental_id: ctx.rentalId,
    reservation_id: null,
    billing_period_start: null,
    billing_period_end: null,
    issue_date: runtime.date,
    due_date: runtime.date,
    status: "open",
    line_items: [],
    subtotal: 250,
    tax: 0,
    total: 250,
    amount_paid: 0,
    balance_due: 250,
    notes: "Phase9 invoice",
    created_at: now,
    created_by: null,
  };
  await invoices.insert(invoice);
  runtime.recordIds.invoice = invoice.id;
  runtime.phase9.invoice = invoice;
  requireOk(
    await step(steps, "invoice_persistence", async () => {
      const rows = await invoices.list(orgA);
      return rows.some((r) => r.id === invoice.id && r.invoice_number === invoice.invoice_number);
    }),
  );
  requireOk(
    await step(steps, "invoice_insert_creates_no_ledger_transaction", async () => {
      const ledgerAfter = await ledger.listForRental(orgA, ctx.rentalId);
      return ledgerAfter.length === ledgerBefore.length;
    }),
  );

  // ── Authoritative payment through the ledger repository (the only path that
  //    writes rental_ledger_transactions). The receipt will REFERENCE this row. ──
  const paymentTxn: FinancialTransaction = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    rental_id: ctx.rentalId,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    transaction_type: "card_payment",
    category: "payment",
    description: "Phase9 card payment",
    amount: 250,
    direction: "payment",
    payment_method: "card",
    external_transaction_id: null,
    status: "posted",
    effective_date: runtime.date,
    created_at: now,
    created_by: null,
  };
  await ledger.insert(paymentTxn);
  runtime.recordIds.paymentTransaction = paymentTxn.id;
  runtime.phase9.paymentTransaction = paymentTxn;

  // ── Receipt: evidence of the EXISTING payment. Prove it creates NO second
  //    ledger row (it only references payment_transaction_id). ──
  const ledgerBeforeReceipt = await ledger.listForRental(orgA, ctx.rentalId);
  const receipt: Receipt = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    receipt_number: `R-P9-${runtime.stamp}`,
    customer_id: ctx.custId,
    rental_id: ctx.rentalId,
    reservation_id: null,
    vehicle_id: ctx.vehId,
    payment_transaction_id: paymentTxn.id,
    amount: 250,
    payment_method: "card",
    external_transaction_id: null,
    applied_invoice_ids: [invoice.id],
    remaining_balance: 0,
    issued_at: now,
    issued_by: null,
    status: "issued",
  };
  await receipts.insert(receipt);
  runtime.recordIds.receipt = receipt.id;
  runtime.phase9.receipt = receipt;
  requireOk(
    await step(steps, "receipt_persistence", async () => {
      const rows = await receipts.list(orgA);
      return rows.some(
        (r) => r.id === receipt.id && r.payment_transaction_id === paymentTxn.id,
      );
    }),
  );
  requireOk(
    await step(steps, "receipt_insert_creates_no_ledger_transaction", async () => {
      const ledgerAfter = await ledger.listForRental(orgA, ctx.rentalId);
      return ledgerAfter.length === ledgerBeforeReceipt.length;
    }),
  );

  return { steps };
}

// ── Sub-stage: arrangement + installment + event ───────────────────────────
export async function runArrangementsRecords(
  runtime: Phase9Runtime,
): Promise<Phase9RecordsStageResult> {
  const steps: Phase9Step[] = [];
  const { paymentArrangements, ledger, orgA, ctx, now } = runtime;

  // Due date = today (org-local). We pin the date so the timezone proof in the
  // hydration stage is deterministic regardless of server tz.
  const dueDate = runtime.date;

  const ledgerBefore = await ledger.listForRental(orgA, ctx.rentalId);

  const arrangement: PaymentArrangement = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    arrangement_number: `PA-P9-${runtime.stamp}`,
    customer_id: ctx.custId,
    rental_id: ctx.rentalId,
    invoice_id: runtime.recordIds.invoice ?? null,
    billing_period_ids: [],
    original_outstanding_amount: 250,
    arrangement_amount: 250,
    status: "active",
    start_date: runtime.date,
    grace_period_days: 3,
    terms_summary: "Weekly",
    reason: "Phase9 arrangement",
    created_by: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    broken_at: null,
    cancelled_at: null,
  };
  await paymentArrangements.insert(arrangement);
  runtime.recordIds.arrangement = arrangement.id;
  runtime.phase9.arrangement = arrangement;
  requireOk(
    await step(steps, "arrangement_persistence", async () => {
      const rows = await paymentArrangements.list(orgA);
      return rows.some((r) => r.id === arrangement.id && r.status === "active");
    }),
  );
  requireOk(
    await step(steps, "arrangement_insert_creates_no_revenue", async () => {
      const ledgerAfter = await ledger.listForRental(orgA, ctx.rentalId);
      return ledgerAfter.length === ledgerBefore.length;
    }),
  );

  const installment: PaymentArrangementInstallment = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    arrangement_id: arrangement.id,
    sequence: 1,
    amount_due: 250,
    due_date: dueDate,
    linked_payment_transaction_ids: [runtime.recordIds.paymentTransaction!],
    linked_payments: [
      { transaction_id: runtime.recordIds.paymentTransaction!, amount: 250 },
    ],
    paid_at: null,
    notes: "Phase9 installment",
    created_at: now,
  };
  await paymentArrangements.insertInstallment(installment);
  runtime.recordIds.installment = installment.id;
  runtime.phase9.installment = installment;
  requireOk(
    await step(steps, "installment_persistence", async () => {
      const rows = await paymentArrangements.listInstallments(orgA, arrangement.id);
      const row = rows.find((r) => r.id === installment.id);
      return (
        !!row &&
        row.sequence === 1 &&
        // The mapped domain object carries no amount_paid field — it is derived.
        !("amount_paid" in row)
      );
    }),
  );

  const arrEvent: ArrangementEvent = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    arrangement_id: arrangement.id,
    type: "created",
    label: "Arrangement created",
    at: now,
    staff_id: null,
  };
  await paymentArrangements.insertEvent(arrEvent);
  runtime.recordIds.arrangementEvent = arrEvent.id;
  runtime.phase9.arrangementEvent = arrEvent;
  requireOk(
    await step(steps, "arrangement_event_persistence", async () => {
      const rows = await paymentArrangements.listEvents(orgA, arrangement.id);
      return rows.some((r) => r.id === arrEvent.id && r.type === "created");
    }),
  );

  return { steps };
}

// ── Sub-stage: agreement template + master + instance ──────────────────────
export async function runAgreementsRecords(
  runtime: Phase9Runtime,
): Promise<Phase9RecordsStageResult> {
  const steps: Phase9Step[] = [];
  const { agreements, orgA, ctx, now } = runtime;

  const template: AgreementTemplate = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    name: "Phase9 Standard Rental",
    agreement_type: "rental",
    description: "Phase9 default rental agreement",
    file_url: "https://example.com/phase9-template.pdf",
    file_name: "phase9-template.pdf",
    version: 3,
    effective_date: runtime.date,
    status: "active",
    is_default: true,
    created_at: now,
    created_by: null,
  };
  await agreements.insertTemplate(template);
  runtime.recordIds.template = template.id;
  runtime.phase9.template = template;
  requireOk(
    await step(steps, "agreement_template_persistence", async () => {
      const rows = await agreements.listTemplates(orgA);
      return (
        rows.some((r) => r.id === template.id) &&
        rows.find((r) => r.id === template.id)?.version === 3 &&
        rows.find((r) => r.id === template.id)?.is_default === true
      );
    }),
  );

  const master: MasterAgreement = {
    id: crypto.randomUUID(),
    driver_id: ctx.custId,
    tenant_id: orgA,
    signature_url: "https://example.com/phase9-sig.png",
    signed_at: now,
    terms_version: "v3",
    expires_at: "2027-01-01",
    status: "active",
    rate_at_signing: 250,
    vehicle_id_at_signing: ctx.vehId,
  };
  await agreements.insertMasterAgreement(master);
  runtime.recordIds.masterAgreement = master.id;
  runtime.phase9.masterAgreement = master;
  requireOk(
    await step(steps, "master_agreement_persistence", async () => {
      const rows = await agreements.listMasterAgreements(orgA);
      return rows.some((r) => r.id === master.id && r.terms_version === "v3");
    }),
  );

  const instance: AgreementInstance = {
    id: crypto.randomUUID(),
    master_agreement_id: master.id,
    reservation_id: crypto.randomUUID(),
    period_start: runtime.date,
    period_end: "2027-01-01",
    vehicle_id: ctx.vehId,
    mileage_start: 1000,
    mileage_end: null,
    rate: 250,
    pdf_url: "https://example.com/phase9-instance.pdf",
    generated_at: now,
    tenant_id: orgA,
  };
  await agreements.insertInstance(instance);
  runtime.recordIds.agreementInstance = instance.id;
  runtime.phase9.agreementInstance = instance;
  requireOk(
    await step(steps, "agreement_instance_persistence", async () => {
      const rows = await agreements.listInstances(orgA);
      return (
        rows.some((r) => r.id === instance.id) &&
        rows.find((r) => r.id === instance.id)?.master_agreement_id === master.id
      );
    }),
  );

  return { steps };
}

// ── Sub-stage: activity/audit entry ────────────────────────────────────────
export async function runActivityRecords(
  runtime: Phase9Runtime,
): Promise<Phase9RecordsStageResult> {
  const steps: Phase9Step[] = [];
  const { activityAudit, orgA, userAId, now } = runtime;

  const activity: ActivityEntry = {
    id: crypto.randomUUID(),
    at: now,
    label: "Phase9 rental checked out",
    tone: "neutral",
  };
  await activityAudit.insert(orgA, activity, userAId);
  runtime.recordIds.activity = activity.id;
  runtime.phase9.activity = activity;
  requireOk(
    await step(steps, "activity_persistence", async () => {
      const rows = await activityAudit.list(orgA);
      return rows.some((r) => r.id === activity.id && r.label === activity.label);
    }),
  );

  return { steps };
}