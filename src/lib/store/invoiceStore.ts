// Connect Pro Fleet — invoice methods (Build #5).
// Invoices organize ledger charges; receipts document ledger payments. The
// ledger stays the source of truth. Depends on the ledger module's postPayment
// for invoice-linked payments.

import { padSeq } from "../format";
import type { Invoice, InvoiceStatus, PaymentMethod } from "../types";
import type { TenderMethod, PaymentProcessor } from "../paymentMethodTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

const DAY = 86_400_000;

export function buildInvoiceMethods(
  s: StoreState,
  ledger: {
    postPayment: (
      rentalId: string,
      amount: number,
      method: PaymentMethod | TenderMethod,
      opts?: {
        reference?: string;
        notes?: string;
        effectiveDate?: string;
        invoiceId?: string;
        processor?: PaymentProcessor | null;
      },
    ) => number;
  },
) {
  function recomputeInvoice(invoiceId: string) {
    const inv = s.invoices.find((i) => i.id === invoiceId);
    if (!inv || inv.status === "void") return;
    const txns = s.transactions.filter(
      (t) => t.invoice_id === invoiceId && t.status === "posted",
    );
    const charges = txns
      .filter((t) => t.category === "charge")
      .reduce((sum, t) => sum + t.amount, 0);
    const paid = txns
      .filter((t) => t.category === "payment")
      .reduce((sum, t) => sum + t.amount, 0);
    const total = charges + inv.tax;
    const balance = Math.max(0, total - paid);
    const today = new Date().toISOString().slice(0, 10);
    const pastDue = balance > 0 && inv.due_date < today;
    const status: InvoiceStatus =
      balance <= 0
        ? "paid"
        : paid > 0
          ? pastDue
            ? "past_due"
            : "partially_paid"
          : pastDue
            ? "past_due"
            : inv.status === "draft"
              ? "draft"
              : "open";
    s.setInvoices((is) =>
      is.map((i) =>
        i.id === invoiceId
          ? {
              ...i,
              subtotal: charges,
              total,
              amount_paid: paid,
              balance_due: balance,
              status,
            }
          : i,
      ),
    );
  }

  return {
    generateInvoice: (input: {
      rentalId: string;
      billingPeriodStart?: string;
      billingPeriodEnd?: string;
      dueDate?: string;
      notes?: string;
    }): string | null => {
      const rental = s.rentals.find((r) => r.id === input.rentalId);
      if (!rental) return null;
      const periodStart =
        input.billingPeriodStart ??
        rental.checkout_date ??
        new Date().toISOString().slice(0, 10);
      const periodEnd =
        input.billingPeriodEnd ??
        (rental.rate_type === "weekly"
          ? new Date(new Date(periodStart).getTime() + 7 * DAY)
              .toISOString()
              .slice(0, 10)
          : (rental.scheduled_return_date ?? periodStart));
      const allCharges = s.transactions.filter(
        (t) =>
          t.rental_id === input.rentalId &&
          t.category === "charge" &&
          t.status === "posted",
      );
      const inWindow = allCharges.filter((t) => {
        // Build #9 cleanup — only include charges linked to this billing
        // period (via billing_period date or metadata.billing_period_id).
        // Start-time charges (billing_period null) are NOT included in a
        // period invoice; they're invoiced separately.
        if (t.billing_period) {
          return t.billing_period === periodStart;
        }
        const bpId = t.metadata?.billing_period_id;
        if (bpId) {
          // Match by the BillingPeriod id if the period record is findable.
          return false; // period-linked charges carry billing_period too
        }
        return false;
      });
      if (inWindow.length === 0) return null;
      const now = new Date().toISOString();
      const year = new Date().getFullYear();
      const seq = padSeq(1240 + s.invoices.length);
      const invoiceId = uid("inv");
      const lineItems = inWindow.map((t) => ({
        id: uid("li"),
        description: t.description,
        transaction_id: t.id,
        amount: t.amount,
      }));
      const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
      const invoice: Invoice = {
        id: invoiceId,
        tenant_id: TENANT_ID,
        invoice_number: `INV-${year}-${seq}`,
        customer_id: rental.customer_id,
        rental_id: input.rentalId,
        reservation_id: rental.reservation_id,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        issue_date: now.slice(0, 10),
        due_date: input.dueDate ?? periodEnd,
        status: "open",
        line_items: lineItems,
        subtotal,
        tax: 0,
        total: subtotal,
        amount_paid: 0,
        balance_due: subtotal,
        notes: input.notes ?? null,
        created_at: now,
        created_by: s.currentStaffId,
      };
      s.setInvoices((is) => [invoice, ...is]);
      s.setTransactions((ts) =>
        ts.map((t) =>
          inWindow.some((c) => c.id === t.id)
            ? { ...t, invoice_id: invoiceId }
            : t,
        ),
      );
      return invoiceId;
    },

    generateCustomerInvoice: (input: {
      customerId: string;
      rentalId?: string | null;
      dueDate?: string;
      notes?: string;
    }): string | null => {
      const customer = s.customers.find((c) => c.id === input.customerId);
      if (!customer) return null;
      const charges = s.transactions.filter(
        (t) =>
          t.customer_id === input.customerId &&
          t.category === "charge" &&
          t.status === "posted" &&
          !t.invoice_id,
      );
      if (charges.length === 0) return null;
      const now = new Date().toISOString();
      const year = new Date().getFullYear();
      const seq = padSeq(1240 + s.invoices.length);
      const invoiceId = uid("inv");
      const lineItems = charges.map((t) => ({
        id: uid("li"),
        description: t.description,
        transaction_id: t.id,
        amount: t.amount,
      }));
      const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
      const due =
        input.dueDate ??
        new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
      const invoice: Invoice = {
        id: invoiceId,
        tenant_id: TENANT_ID,
        invoice_number: `INV-${year}-${seq}`,
        customer_id: input.customerId,
        rental_id: input.rentalId ?? null,
        reservation_id: null,
        billing_period_start: null,
        billing_period_end: null,
        issue_date: now.slice(0, 10),
        due_date: due,
        status: "open",
        line_items: lineItems,
        subtotal,
        tax: 0,
        total: subtotal,
        amount_paid: 0,
        balance_due: subtotal,
        notes: input.notes ?? null,
        created_at: now,
        created_by: s.currentStaffId,
      };
      s.setInvoices((is) => [invoice, ...is]);
      s.setTransactions((ts) =>
        ts.map((t) =>
          charges.some((c) => c.id === t.id)
            ? { ...t, invoice_id: invoiceId }
            : t,
        ),
      );
      return invoiceId;
    },

    voidInvoice: (invoiceId: string, reason?: string) => {
      const inv = s.invoices.find((i) => i.id === invoiceId);
      if (!inv || inv.status === "void") return;
      const now = new Date().toISOString();
      s.setInvoices((is) =>
        is.map((i) => (i.id === invoiceId ? { ...i, status: "void" } : i)),
      );
      s.setTransactions((ts) =>
        ts.map((t) =>
          t.invoice_id === invoiceId ? { ...t, invoice_id: null } : t,
        ),
      );
      s.setActivity((a) =>
        [
          {
            id: uid("act"),
            at: now,
            label: `Invoice ${inv.invoice_number} voided${reason ? ` — ${reason}` : ""}. Ledger history preserved.`,
            tone: "neutral" as const,
          },
          ...a,
        ].slice(0, 30),
      );
    },

    recordInvoicePayment: (
      invoiceId: string,
      amount: number,
      method: PaymentMethod | TenderMethod,
      opts?: {
        reference?: string;
        notes?: string;
        processor?: PaymentProcessor | null;
      },
    ) => {
      const inv = s.invoices.find((i) => i.id === invoiceId);
      if (!inv || inv.status === "void" || amount <= 0 || !inv.rental_id)
        return;
      ledger.postPayment(inv.rental_id, amount, method, {
        reference: opts?.reference,
        notes: opts?.notes,
        invoiceId,
        processor: opts?.processor ?? null,
      });
      recomputeInvoice(invoiceId);
    },

    rentalInvoices: (rentalId: string) =>
      s.invoices
        .filter((i) => i.rental_id === rentalId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    customerInvoices: (customerId: string) =>
      s.invoices
        .filter((i) => i.customer_id === customerId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    customerReceipts: (customerId: string) =>
      s.receipts
        .filter((r) => r.customer_id === customerId)
        .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1)),
    receiptForPayment: (paymentTxnId: string) =>
      s.receipts.find((r) => r.payment_transaction_id === paymentTxnId),
  };
}
