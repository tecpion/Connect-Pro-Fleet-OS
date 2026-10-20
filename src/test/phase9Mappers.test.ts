// Phase 9B — mapper round-trip + financial non-equivalence tests.

import { describe, it, expect } from "vitest";
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
} from "@/lib/supabase/phase9Mappers";
import type { RentalEvent } from "@/lib/types";
import type { Invoice, Receipt } from "@/lib/invoiceTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
} from "@/lib/paymentArrangementTypes";
import type { ActivityEntry } from "@/lib/store/storeContext";
import type { AgreementTemplate } from "@/lib/settingsTypes";
import type { MasterAgreement, AgreementInstance } from "@/lib/types";

const ORG = "org-a-123";

describe("Phase 9 mappers — round trips", () => {
  it("rental event preserves id, org, rental, type, tone, staff_id, nullability", () => {
    const e: RentalEvent = {
      id: "re-1",
      rental_id: "rental-1",
      type: "checkout",
      label: "Checked out",
      at: "2026-01-02T03:04:05Z",
      tone: "rented",
      staff_id: "staff-1",
    };
    const row = rentalEventToRow(ORG, e);
    expect(row.organization_id).toBe(ORG);
    expect(row.rental_id).toBe("rental-1");
    expect(row.staff_id).toBe("staff-1");
    const back = rowToRentalEvent({
      ...row,
      created_at: "2026-01-02T03:04:06Z",
    });
    expect(back).toEqual({ ...e });
  });

  it("rental event preserves null staff_id", () => {
    const e: RentalEvent = {
      id: "re-2",
      rental_id: "rental-2",
      type: "created",
      label: "Created",
      at: "2026-01-02T00:00:00Z",
      tone: "neutral",
      staff_id: null,
    };
    const row = rentalEventToRow(ORG, e);
    expect(row.staff_id).toBeNull();
    expect(rowToRentalEvent({ ...row, created_at: "x" }).staff_id).toBeNull();
  });

  it("invoice round trips with money normalization + nullability", () => {
    const i: Invoice = {
      id: "inv-1",
      tenant_id: ORG,
      invoice_number: "INV-001",
      customer_id: "cust-1",
      rental_id: "rental-1",
      reservation_id: null,
      billing_period_start: null,
      billing_period_end: null,
      issue_date: "2026-01-01",
      due_date: "2026-01-15",
      status: "open",
      line_items: [
        {
          id: "li-1",
          description: "Weekly",
          transaction_id: null,
          amount: 500,
        },
      ],
      subtotal: 500,
      tax: 0,
      total: 500,
      amount_paid: 0,
      balance_due: 500,
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      created_by: null,
    };
    const row = invoiceToRow(i);
    expect(row.organization_id).toBe(ORG);
    expect(row.invoice_number).toBe("INV-001");
    expect(row.rental_id).toBe("rental-1");
    expect(row.reservation_id).toBeNull();
    const back = rowToInvoice({
      ...row,
      created_at: i.created_at,
      updated_at: "x",
    });
    expect(back.tenant_id).toBe(ORG);
    expect(back.invoice_number).toBe("INV-001");
    expect(back.line_items).toEqual(i.line_items);
    expect(back.balance_due).toBe(500);
    expect(back.status).toBe("open");
  });

  it("invoice patch maps only provided fields", () => {
    const patch = invoicePatchToRow({
      status: "paid",
      amount_paid: 500,
      balance_due: 0,
    });
    expect(patch.status).toBe("paid");
    expect(patch.amount_paid).toBe(500);
    expect(patch.balance_due).toBe(0);
    expect(patch.invoice_number).toBeUndefined();
  });

  it("receipt round trips and preserves payment linkage", () => {
    const r: Receipt = {
      id: "rc-1",
      tenant_id: ORG,
      receipt_number: "RCP-001",
      customer_id: "cust-1",
      rental_id: "rental-1",
      reservation_id: null,
      vehicle_id: "veh-1",
      payment_transaction_id: "txn-1",
      amount: 250,
      payment_method: "card_payment",
      external_transaction_id: null,
      applied_invoice_ids: ["inv-1"],
      remaining_balance: 250,
      issued_at: "2026-01-03T00:00:00Z",
      issued_by: "staff-1",
      status: "issued",
    };
    const row = receiptToRow(r);
    expect(row.organization_id).toBe(ORG);
    expect(row.payment_transaction_id).toBe("txn-1");
    const back = rowToReceipt({ ...row, created_at: "x" });
    expect(back.tenant_id).toBe(ORG);
    expect(back.applied_invoice_ids).toEqual(["inv-1"]);
    expect(back.payment_transaction_id).toBe("txn-1");
    expect(back.amount).toBe(250);
  });

  it("payment arrangement round trips with all lifecycle timestamps", () => {
    const a: PaymentArrangement = {
      id: "pa-1",
      tenant_id: ORG,
      arrangement_number: "PA-000123",
      customer_id: "cust-1",
      rental_id: "rental-1",
      invoice_id: "inv-1",
      billing_period_ids: ["bp-1", "bp-2"],
      original_outstanding_amount: 1000,
      arrangement_amount: 900,
      status: "active",
      start_date: "2026-01-01",
      grace_period_days: 3,
      terms_summary: "Weekly $100",
      reason: "Hardship",
      created_by: "staff-1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      completed_at: null,
      broken_at: null,
      cancelled_at: null,
    };
    const row = paymentArrangementToRow(a);
    expect(row.organization_id).toBe(ORG);
    expect(row.arrangement_number).toBe("PA-000123");
    expect(row.billing_period_ids).toEqual(["bp-1", "bp-2"]);
    const back = rowToPaymentArrangement({
      ...row,
      created_at: a.created_at,
      updated_at: a.updated_at,
    });
    expect(back.tenant_id).toBe(ORG);
    expect(back.arrangement_number).toBe("PA-000123");
    expect(back.billing_period_ids).toEqual(["bp-1", "bp-2"]);
    expect(back.status).toBe("active");
    expect(back.broken_at).toBeNull();
  });

  it("arrangement patch maps only provided fields", () => {
    const patch = paymentArrangementPatchToRow({
      status: "broken",
      broken_at: "2026-02-01",
    });
    expect(patch.status).toBe("broken");
    expect(patch.broken_at).toBe("2026-02-01");
    expect(patch.arrangement_number).toBeUndefined();
  });

  it("installment round trips; linked_payments preserved as references", () => {
    const inst: PaymentArrangementInstallment = {
      id: "inst-1",
      tenant_id: ORG,
      arrangement_id: "pa-1",
      sequence: 1,
      amount_due: 100,
      due_date: "2026-01-08",
      linked_payment_transaction_ids: ["txn-1"],
      linked_payments: [{ transaction_id: "txn-1", amount: 100 }],
      paid_at: "2026-01-08T00:00:00Z",
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    const row = paymentArrangementInstallmentToRow(inst);
    expect(row.organization_id).toBe(ORG);
    expect(row.sequence).toBe(1);
    const back = rowToPaymentArrangementInstallment({
      ...row,
      created_at: inst.created_at,
    });
    expect(back.tenant_id).toBe(ORG);
    expect(back.sequence).toBe(1);
    expect(back.linked_payment_transaction_ids).toEqual(["txn-1"]);
    expect(back.linked_payments).toEqual([
      { transaction_id: "txn-1", amount: 100 },
    ]);
  });

  it("installment handles empty/missing linked_payments safely", () => {
    const row = {
      id: "inst-2",
      organization_id: ORG,
      arrangement_id: "pa-1",
      sequence: 2,
      amount_due: 100,
      due_date: "2026-01-15",
      linked_payment_transaction_ids: null,
      linked_payments: null,
      paid_at: null,
      notes: null,
      created_at: "x",
    };
    const back = rowToPaymentArrangementInstallment(row as never);
    expect(back.linked_payment_transaction_ids).toEqual([]);
    expect(back.linked_payments).toEqual([]);
  });

  it("arrangement event round trips with actor/source + installment link", () => {
    const e: ArrangementEvent = {
      id: "ae-1",
      tenant_id: ORG,
      arrangement_id: "pa-1",
      type: "payment_linked",
      label: "Payment linked",
      at: "2026-01-08T00:00:00Z",
      staff_id: "staff-1",
      amount: 100,
      installment_id: "inst-1",
      notes: "Auto",
    };
    const row = arrangementEventToRow(e);
    expect(row.organization_id).toBe(ORG);
    expect(row.staff_id).toBe("staff-1");
    expect(row.installment_id).toBe("inst-1");
    expect(row.amount).toBe(100);
    const back = rowToArrangementEvent({ ...row, created_at: "x" });
    expect(back.tenant_id).toBe(ORG);
    expect(back.staff_id).toBe("staff-1");
    expect(back.installment_id).toBe("inst-1");
    expect(back.amount).toBe(100);
  });

  it("arrangement event preserves null actor/amount/installment", () => {
    const e: ArrangementEvent = {
      id: "ae-2",
      tenant_id: ORG,
      arrangement_id: "pa-1",
      type: "note",
      label: "Note",
      at: "2026-01-09T00:00:00Z",
      staff_id: null,
    };
    const row = arrangementEventToRow(e);
    expect(row.staff_id).toBeNull();
    expect(row.amount).toBeNull();
    expect(row.installment_id).toBeNull();
    expect(row.notes).toBeNull();
  });

  it("activity entry round trips; staff_id preserved on the row (actor/source)", () => {
    const e: ActivityEntry = {
      id: "act-1",
      at: "2026-01-01T00:00:00Z",
      label: "Invoice created",
      tone: "neutral",
    };
    const row = activityEntryToRow(ORG, e, "staff-1");
    expect(row.organization_id).toBe(ORG);
    expect(row.staff_id).toBe("staff-1");
    const back = rowToActivityEntry(row);
    expect(back.id).toBe("act-1");
    expect(back.label).toBe("Invoice created");
    expect(back.tone).toBe("neutral");
  });

  it("agreement template round trips with version + default + status", () => {
    const t: AgreementTemplate = {
      id: "tpl-1",
      tenant_id: ORG,
      name: "Standard",
      agreement_type: "rental",
      description: "Std rental",
      file_url: "https://x/a.pdf",
      file_name: "a.pdf",
      version: 2,
      effective_date: "2026-01-01",
      status: "active",
      is_default: true,
      created_at: "2026-01-01T00:00:00Z",
      created_by: "staff-1",
    };
    const row = agreementTemplateToRow(t);
    expect(row.organization_id).toBe(ORG);
    expect(row.version).toBe(2);
    expect(row.is_default).toBe(true);
    expect(row.file_path).toBe("https://x/a.pdf");
    const back = rowToAgreementTemplate({ ...row, created_at: t.created_at });
    expect(back.tenant_id).toBe(ORG);
    expect(back.version).toBe(2);
    expect(back.is_default).toBe(true);
    expect(back.status).toBe("active");
  });

  it("master agreement round trips with signature path + terms version", () => {
    const m: MasterAgreement = {
      id: "ma-1",
      driver_id: "drv-1",
      tenant_id: ORG,
      signature_url: "https://x/sig.png",
      signed_at: "2026-01-01T00:00:00Z",
      terms_version: "v3",
      expires_at: "2027-01-01",
      status: "active",
      rate_at_signing: 500,
      vehicle_id_at_signing: "veh-1",
    };
    const row = masterAgreementToRow(m);
    expect(row.organization_id).toBe(ORG);
    expect(row.signature_path).toBe("https://x/sig.png");
    expect(row.terms_version).toBe("v3");
    expect(row.driver_id).toBe("drv-1");
    const back = rowToMasterAgreement(row);
    expect(back.tenant_id).toBe(ORG);
    expect(back.signature_url).toBe("https://x/sig.png");
    expect(back.terms_version).toBe("v3");
    expect(back.rate_at_signing).toBe(500);
  });

  it("agreement instance round trips with rendered data + pdf reference", () => {
    const a: AgreementInstance = {
      id: "ai-1",
      master_agreement_id: "ma-1",
      reservation_id: "res-1",
      period_start: "2026-01-01",
      period_end: "2026-01-08",
      vehicle_id: "veh-1",
      mileage_start: 1000,
      mileage_end: 1500,
      rate: 500,
      pdf_url: "https://x/agreement.pdf",
      generated_at: "2026-01-01T00:00:00Z",
      tenant_id: ORG,
    };
    const row = agreementInstanceToRow(a);
    expect(row.organization_id).toBe(ORG);
    expect(row.master_agreement_id).toBe("ma-1");
    expect(row.pdf_path).toBe("https://x/agreement.pdf");
    expect(row.mileage_end).toBe(1500);
    const back = rowToAgreementInstance({
      ...row,
      generated_at: a.generated_at,
    });
    expect(back.tenant_id).toBe(ORG);
    expect(back.master_agreement_id).toBe("ma-1");
    expect(back.pdf_url).toBe("https://x/agreement.pdf");
    expect(back.mileage_end).toBe(1500);
    expect(back.rate).toBe(500);
  });
});

describe("Phase 9 mappers — financial non-equivalence", () => {
  it("invoice mapping produces no payment/ledger field", () => {
    const i: Invoice = {
      id: "inv-1",
      tenant_id: ORG,
      invoice_number: "INV-1",
      customer_id: "c-1",
      rental_id: null,
      reservation_id: null,
      billing_period_start: null,
      billing_period_end: null,
      issue_date: "2026-01-01",
      due_date: "2026-01-15",
      status: "open",
      line_items: [],
      subtotal: 100,
      tax: 0,
      total: 100,
      amount_paid: 0,
      balance_due: 100,
      notes: null,
      created_at: "x",
      created_by: null,
    };
    const row = invoiceToRow(i) as Record<string, unknown>;
    expect(row).not.toHaveProperty("payment_transaction_id");
    expect(row).not.toHaveProperty("direction");
    expect(row).not.toHaveProperty("ledger_transaction_id");
  });

  it("receipt maps an EXISTING payment_transaction_id, never a new payment", () => {
    const r: Receipt = {
      id: "rc-1",
      tenant_id: ORG,
      receipt_number: "RCP-1",
      customer_id: "c-1",
      rental_id: null,
      reservation_id: null,
      vehicle_id: null,
      payment_transaction_id: "txn-existing",
      amount: 50,
      payment_method: "cash",
      external_transaction_id: null,
      applied_invoice_ids: [],
      remaining_balance: 0,
      issued_at: "x",
      issued_by: null,
      status: "issued",
    };
    const row = receiptToRow(r);
    expect(row.payment_transaction_id).toBe("txn-existing");
    expect(row).not.toHaveProperty("direction");
  });

  it("arrangement + installment carry no P&L / revenue field", () => {
    const a: PaymentArrangement = {
      id: "pa-1",
      tenant_id: ORG,
      arrangement_number: "PA-1",
      customer_id: "c-1",
      rental_id: null,
      invoice_id: null,
      billing_period_ids: [],
      original_outstanding_amount: 100,
      arrangement_amount: 100,
      status: "active",
      start_date: "2026-01-01",
      grace_period_days: 0,
      terms_summary: "x",
      reason: null,
      created_by: null,
      created_at: "x",
      updated_at: "x",
      completed_at: null,
      broken_at: null,
      cancelled_at: null,
    };
    const aRow = paymentArrangementToRow(a) as Record<string, unknown>;
    expect(aRow).not.toHaveProperty("revenue");
    expect(aRow).not.toHaveProperty("payment_id");
    expect(aRow).not.toHaveProperty("direction");

    const inst: PaymentArrangementInstallment = {
      id: "inst-1",
      tenant_id: ORG,
      arrangement_id: "pa-1",
      sequence: 1,
      amount_due: 50,
      due_date: "2026-01-08",
      linked_payment_transaction_ids: ["txn-1"],
      linked_payments: [{ transaction_id: "txn-1", amount: 50 }],
      paid_at: null,
      notes: null,
      created_at: "x",
    };
    const iRow = paymentArrangementInstallmentToRow(inst) as Record<
      string,
      unknown
    >;
    expect(iRow).not.toHaveProperty("amount_paid");
    expect(iRow.linked_payments).toBeDefined();
  });
});
