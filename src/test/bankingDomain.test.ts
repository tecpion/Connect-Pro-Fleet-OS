// Connect Pro Fleet — Build #15 banking domain tests.
//
// Pure-function tests for CSV parsing, amount/direction resolution, date
// parsing, fingerprint dedupe, match scoring (exact ID, amount/date, name
// similarity, ambiguity), and financial non-duplication invariants. These do
// NOT mount the store — they test the pure domain helpers directly.

import { describe, it, expect } from "vitest";
import {
  parseCsvLine,
  parseCsv,
  parseStatementDate,
  parseAmount,
  mapRows,
  resolveAmountDirection,
  validateRows,
  importFingerprint,
  normalizeDescription,
} from "@/lib/csvImport";
import {
  suggestPaymentMatches,
  suggestExpenseMatches,
  isAutoMatchable,
} from "@/lib/reconciliationRules";
import type { ImportedTransaction, ImportDirection } from "@/lib/bankingTypes";
import type { FinancialTransaction } from "@/lib/types";
import type { ExpenseTransaction } from "@/lib/expenseTypes";

describe("CSV parsing", () => {
  it("parses quoted fields with embedded commas", () => {
    expect(parseCsvLine('"Hello, World",42,"quoted ""value"""')).toEqual([
      "Hello, World",
      "42",
      'quoted "value"',
    ]);
  });

  it("parses a full CSV with headers and blank-row skipping", () => {
    const csv =
      "Date,Description,Amount\n2026-08-01,Shell,50.00\n\n2026-08-02,AutoZone,75.50";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].Description).toBe("Shell");
  });

  it("strips BOM and normalizes line endings", () => {
    const csv = "\uFEFFDate,Amount\r\n2026-08-01,50\r\n";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["Date", "Amount"]);
    expect(rows).toHaveLength(1);
  });
});

describe("date + amount parsing", () => {
  it("parses ISO dates", () => {
    expect(parseStatementDate("2026-08-01")).toBe("2026-08-01");
  });
  it("parses MM/DD/YYYY", () => {
    expect(parseStatementDate("8/1/2026")).toBe("2026-08-01");
  });
  it("parses MM/DD/YY", () => {
    expect(parseStatementDate("8/1/26")).toBe("2026-08-01");
  });
  it("returns null for invalid", () => {
    expect(parseStatementDate("not-a-date")).toBeNull();
  });

  it("parses amounts with $ and commas", () => {
    expect(parseAmount("$1,234.56")).toBe(1234.56);
  });
  it("treats parentheses as negative", () => {
    expect(parseAmount("(50.00)")).toBe(-50);
  });
  it("handles explicit negative", () => {
    expect(parseAmount("-75.50")).toBe(-75.5);
  });
  it("returns null for invalid", () => {
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("amount/direction resolution", () => {
  const mk = (over: Partial<ReturnType<typeof mapRows>[number]> = {}) =>
    ({
      rowIndex: 1,
      raw: {},
      date: "2026-08-01",
      description: "x",
      amount: null,
      debit: null,
      credit: null,
      postedDate: null,
      merchant: null,
      runningBalance: null,
      reference: null,
      externalId: null,
      ...over,
    }) as ReturnType<typeof mapRows>[number];

  it("signed positive amount -> money_in", () => {
    expect(resolveAmountDirection(mk({ amount: 500 }))).toEqual({
      amount: 500,
      direction: "money_in",
    });
  });
  it("signed negative amount -> money_out", () => {
    expect(resolveAmountDirection(mk({ amount: -500 }))).toEqual({
      amount: 500,
      direction: "money_out",
    });
  });
  it("debit column -> money_out", () => {
    expect(resolveAmountDirection(mk({ debit: 75 }))).toEqual({
      amount: 75,
      direction: "money_out",
    });
  });
  it("credit column -> money_in", () => {
    expect(resolveAmountDirection(mk({ credit: 300 }))).toEqual({
      amount: 300,
      direction: "money_in",
    });
  });
  it("both zero -> null", () => {
    expect(resolveAmountDirection(mk({ amount: 0 }))).toBeNull();
  });
});

describe("row validation", () => {
  it("flags missing date", () => {
    const rows = mapRows([{ Date: "", Description: "x", Amount: "50" }], {
      Date: "date",
      Description: "description",
      Amount: "amount",
    });
    const v = validateRows(rows);
    expect(v.invalidRows).toHaveLength(1);
    expect(v.invalidRows[0].reason).toContain("date");
  });
  it("flags missing amount", () => {
    const rows = mapRows(
      [{ Date: "2026-08-01", Description: "x", Amount: "" }],
      { Date: "date", Description: "description", Amount: "amount" },
    );
    const v = validateRows(rows);
    expect(v.invalidRows).toHaveLength(1);
  });
  it("computes date range + totals", () => {
    const rows = mapRows(
      [
        { Date: "2026-08-01", Description: "a", Amount: "100" },
        { Date: "2026-08-05", Description: "b", Amount: "-50" },
      ],
      { Date: "date", Description: "description", Amount: "amount" },
    );
    const v = validateRows(rows);
    expect(v.dateRange).toEqual({ start: "2026-08-01", end: "2026-08-05" });
    expect(v.totalIn).toBe(100);
    expect(v.totalOut).toBe(50);
  });
});

describe("import fingerprint (dedupe)", () => {
  const row = {
    rowIndex: 1,
    raw: {},
    date: "2026-08-01",
    description: "Shell",
    amount: 50,
    debit: null,
    credit: null,
    postedDate: null,
    merchant: null,
    runningBalance: null,
    reference: null,
    externalId: null,
  } as ReturnType<typeof mapRows>[number];

  it("is stable for the same row", () => {
    const a = importFingerprint("tnt", "acc", row, "money_out", 50);
    const b = importFingerprint("tnt", "acc", row, "money_out", 50);
    expect(a).toBe(b);
  });
  it("differs by account", () => {
    const a = importFingerprint("tnt", "acc1", row, "money_out", 50);
    const b = importFingerprint("tnt", "acc2", row, "money_out", 50);
    expect(a).not.toBe(b);
  });
  it("uses external ID when present (takes precedence)", () => {
    const withExt = { ...row, externalId: "EXT123" } as ReturnType<
      typeof mapRows
    >[number];
    const a = importFingerprint("tnt", "acc", withExt, "money_in", 100);
    expect(a).toContain("ext:EXT123");
  });
});

describe("normalizeDescription", () => {
  it("uppercases and takes first two tokens", () => {
    expect(normalizeDescription("AutoZone 1234 Detroit MI")).toBe(
      "AUTOZONE 1234",
    );
  });
  it("strips non-alphanumeric", () => {
    expect(normalizeDescription("Shell Oil #5555")).toBe("SHELL OIL");
  });
});

// --- Match engine ---

function mkImport(
  over: Partial<ImportedTransaction> = {},
): ImportedTransaction {
  return {
    id: "imp_1",
    tenant_id: "tnt",
    financial_account_id: "acc",
    statement_id: null,
    external_transaction_id: null,
    transaction_date: "2026-08-24",
    posted_date: null,
    description: "ZELLE FROM MARCUS",
    normalized_description: "ZELLE",
    amount: 400,
    direction: "money_in",
    currency: "USD",
    running_balance: null,
    merchant_name: null,
    transaction_type: null,
    reference: null,
    raw_data: null,
    import_batch_id: "b1",
    import_fingerprint: "fp",
    review_status: "unreviewed",
    match_status: "unmatched",
    transfer_status: "none",
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
    ...over,
  };
}

function mkPayment(
  over: Partial<FinancialTransaction> = {},
): FinancialTransaction {
  return {
    id: "txn_1",
    tenant_id: "tnt",
    rental_id: "rnt_1",
    reservation_id: null,
    customer_id: "cus_1",
    vehicle_id: null,
    invoice_id: null,
    deposit_id: null,
    transaction_type: "zelle_payment",
    category: "payment",
    description: "Payment · Zelle",
    amount: 400,
    direction: "payment",
    payment_method: "zelle",
    external_transaction_id: null,
    status: "posted",
    effective_date: "2026-08-24",
    created_at: "2026-08-24T09:00:00Z",
    created_by: "stf_1",
    notes: null,
    related_transaction_id: null,
    billing_period: null,
    metadata: { tender_method: "zelle", processor: null, payment_source: null },
    ...over,
  };
}

function mkExpense(over: Partial<ExpenseTransaction> = {}): ExpenseTransaction {
  return {
    id: "exp_1",
    tenant_id: "tnt",
    expense_number: "EXP-2026-000001",
    transaction_date: "2026-08-24",
    entered_at: "2026-08-24T09:00:00Z",
    entered_by_user_id: "stf_1",
    description: "AutoZone parts",
    memo: null,
    amount: 328.72,
    currency: "USD",
    expense_category_id: "ec_parts",
    vendor_id: null,
    payment_method: "credit_card",
    payment_source: null,
    processor: null,
    paid_by_type: "company",
    paid_by_user_id: null,
    reimbursement_status: "not_required",
    location_id: null,
    vehicle_id: null,
    rental_id: null,
    maintenance_work_order_id: null,
    receipt_status: "attached",
    receipt_required: false,
    no_receipt_reason: null,
    status: "posted",
    reversal_of: null,
    source: "manual",
    dedupe_key: null,
    created_at: "2026-08-24T09:00:00Z",
    updated_at: "2026-08-24T09:00:00Z",
    ...over,
  };
}

describe("payment match scoring", () => {
  it("exact external ID gives highest confidence + auto-matchable", () => {
    const imp = mkImport({
      external_transaction_id: "ch_1",
      description: "STRIPE PAYOUT",
    });
    const pay = mkPayment({ external_transaction_id: "ch_1", amount: 400 });
    const cands = suggestPaymentMatches(imp, [pay], () => "Marcus Johnson");
    expect(cands[0].confidence).toBe("high");
    expect(isAutoMatchable(cands[0])).toBe(true);
  });
  it("same amount + close date + name similarity scores medium/high", () => {
    const imp = mkImport({ description: "ZELLE FROM MARCUS JOHNSON" });
    const pay = mkPayment({ amount: 400, effective_date: "2026-08-24" });
    const cands = suggestPaymentMatches(imp, [pay], () => "Marcus Johnson");
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].score).toBeGreaterThanOrEqual(40);
  });
  it("wrong date lowers score", () => {
    const imp = mkImport({ description: "ZELLE FROM MARCUS" });
    const pay = mkPayment({ amount: 400, effective_date: "2026-08-10" });
    const close = suggestPaymentMatches(imp, [pay], () => "Marcus");
    const pay2 = mkPayment({ amount: 400, effective_date: "2026-08-24" });
    const far = suggestPaymentMatches(mkImport(), [pay2], () => "Marcus");
    expect(far[0].score).toBeGreaterThan(close[0].score);
  });
  it("two same-amount candidates both surface (ambiguous)", () => {
    const imp = mkImport();
    const p1 = mkPayment({ id: "t1", amount: 400 });
    const p2 = mkPayment({ id: "t2", amount: 400 });
    const cands = suggestPaymentMatches(imp, [p1, p2], () => "Marcus");
    expect(cands).toHaveLength(2);
  });
  it("amount mismatch yields no suggestion", () => {
    const imp = mkImport({ amount: 400 });
    const pay = mkPayment({ amount: 500 });
    const cands = suggestPaymentMatches(imp, [pay], () => "Marcus");
    expect(cands).toHaveLength(0);
  });
});

describe("expense match scoring", () => {
  it("matches by amount + name similarity", () => {
    const imp = mkImport({
      direction: "money_out",
      amount: 328.72,
      description: "AUTOZONE 1234 DETROIT MI",
    });
    const exp = mkExpense({ amount: 328.72, description: "AutoZone parts" });
    const cands = suggestExpenseMatches(imp, [exp], () => "");
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].target_type).toBe("expense");
  });
  it("amount mismatch yields no suggestion", () => {
    const imp = mkImport({
      direction: "money_out",
      amount: 100,
      description: "x",
    });
    const exp = mkExpense({ amount: 200 });
    const cands = suggestExpenseMatches(imp, [exp], () => "");
    expect(cands).toHaveLength(0);
  });
});
