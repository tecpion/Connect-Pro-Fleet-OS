// Connect Pro Fleet — Banking review pure-selector tests (Build #42).
//
// Pure-function tests for the match-first banking review helpers. No store
// mount. Covers duplicate-expense detection, manual search, rule-candidate
// resolution, inbox fast-filter classification, inbox search, duplicate import
// detection, receipt suggestions, transfer pairs, and attention reasons.

import { describe, it, expect } from "vitest";
import {
  findDuplicateExpenses,
  searchExpenses,
  searchPayments,
  ruleCandidateFromTxn,
  applyInboxFilter,
  searchImportedTransactions,
  INBOX_FILTER_LABELS,
  type InboxFilter,
} from "@/lib/bankingReviewSelectors";
import { matchExpenseRule } from "@/lib/expenseRuleSelectors";
import {
  detectDuplicateTransactions,
  suggestReceiptMatches,
  suggestTransferPairs,
  transactionAttentionReasons,
} from "@/lib/bankingAttention";
import { isCollectionPayment } from "@/lib/collectionSelectors";
import type { ImportedTransaction } from "@/lib/bankingTypes";
import type { ExpenseTransaction } from "@/lib/expenseTypes";
import type { FinancialTransaction } from "@/lib/types";

function makeTxn(
  overrides: Partial<ImportedTransaction> & { id: string },
): ImportedTransaction {
  return {
    tenant_id: "tnt_1",
    financial_account_id: "fac_1",
    statement_id: null,
    external_transaction_id: null,
    transaction_date: "2026-08-22",
    posted_date: null,
    description: "SHELL OIL 5555",
    normalized_description: "SHELL",
    amount: 58.4,
    direction: "money_out",
    currency: "USD",
    running_balance: null,
    merchant_name: "Shell",
    transaction_type: null,
    reference: null,
    raw_data: null,
    import_batch_id: "imbatch_1",
    import_fingerprint: "fp_" + overrides.id,
    review_status: "unreviewed",
    match_status: "unmatched",
    transfer_status: "none",
    created_at: "2026-08-22T10:00:00Z",
    updated_at: "2026-08-22T10:00:00Z",
    ...overrides,
  };
}

function makeExpense(
  overrides: Partial<ExpenseTransaction> & { id: string },
): ExpenseTransaction {
  return {
    tenant_id: "tnt_1",
    expense_number: "EXP-2026-000099",
    transaction_date: "2026-08-22",
    entered_at: "2026-08-22T10:00:00Z",
    entered_by_user_id: null,
    description: "Shell fuel",
    memo: null,
    amount: 58.4,
    currency: "USD",
    expense_category_id: "ec_fuel",
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
    receipt_status: "not_required",
    receipt_required: false,
    no_receipt_reason: null,
    status: "posted",
    reversal_of: null,
    source: "manual",
    dedupe_key: null,
    reconciled_imported_id: null,
    metadata: null,
    created_at: "2026-08-22T10:00:00Z",
    updated_at: "2026-08-22T10:00:00Z",
    ...overrides,
  };
}

describe("duplicate-expense detection", () => {
  it("detects an existing expense with same amount + date", () => {
    const txn = makeTxn({ id: "t1" });
    const dupes = findDuplicateExpenses(txn, [makeExpense({ id: "e1" })]);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].signals).toContain("Same amount");
  });

  it("excludes voided and reversal expenses", () => {
    const txn = makeTxn({ id: "t1" });
    expect(
      findDuplicateExpenses(txn, [
        makeExpense({ id: "e1", status: "voided" }),
        makeExpense({ id: "e2", reversal_of: "e0" }),
      ]),
    ).toHaveLength(0);
  });

  it("flags already-linked expense as suspect", () => {
    const txn = makeTxn({ id: "t1" });
    const dupes = findDuplicateExpenses(txn, [
      makeExpense({ id: "e1", reconciled_imported_id: "t1" }),
    ]);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].signals).toContain("Already linked to this transaction");
  });

  it("returns empty for money-in transactions", () => {
    const txn = makeTxn({ id: "t1", direction: "money_in" });
    expect(
      findDuplicateExpenses(txn, [makeExpense({ id: "e1" })]),
    ).toHaveLength(0);
  });

  it("does not match when amounts differ", () => {
    const txn = makeTxn({ id: "t1", amount: 58.4 });
    expect(
      findDuplicateExpenses(txn, [makeExpense({ id: "e1", amount: 99.99 })]),
    ).toHaveLength(0);
  });
});

describe("manual record search", () => {
  it("searches expenses by description", () => {
    const txn = makeTxn({ id: "t1" });
    const results = searchExpenses("shell", txn, [
      makeExpense({ id: "e1", description: "Shell fuel stop" }),
      makeExpense({ id: "e2", description: "Office supplies", amount: 12.34 }),
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].target_id).toBe("e1");
    expect(results[0].target_type).toBe("expense");
  });

  it("searches expenses by expense number", () => {
    const txn = makeTxn({ id: "t1" });
    const results = searchExpenses("000042", txn, [
      makeExpense({ id: "e1", expense_number: "EXP-2026-000042" }),
    ]);
    expect(results).toHaveLength(1);
  });

  it("excludes already-reconciled expenses", () => {
    const txn = makeTxn({ id: "t1" });
    expect(
      searchExpenses("shell", txn, [
        makeExpense({ id: "e1", reconciled_imported_id: "other" }),
      ]),
    ).toHaveLength(0);
  });

  it("searches payments by customer name", () => {
    const txn = makeTxn({ id: "t1", direction: "money_in" });
    const payments: FinancialTransaction[] = [
      {
        id: "p1",
        tenant_id: "tnt_1",
        rental_id: "r1",
        customer_id: "cust_1",
        transaction_type: "card_payment",
        category: "payment",
        description: "Rental payment",
        amount: 58.4,
        direction: "credit",
        status: "posted",
        effective_date: "2026-08-22",
        created_at: "2026-08-22T10:00:00Z",
        created_by: null,
      },
    ];
    const results = searchPayments(
      "ortiz",
      txn,
      payments,
      () => "Hannah Ortiz",
      isCollectionPayment,
    );
    expect(results).toHaveLength(1);
    expect(results[0].target_type).toBe("customer_payment");
  });

  it("returns empty for empty query", () => {
    expect(
      searchExpenses("", makeTxn({ id: "t1" }), [makeExpense({ id: "e1" })]),
    ).toHaveLength(0);
  });
});

describe("expense-rule candidate resolution", () => {
  it("builds a candidate from a money-out transaction", () => {
    const candidate = ruleCandidateFromTxn(makeTxn({ id: "t1" }));
    expect(candidate).not.toBeNull();
    expect(candidate!.merchant).toBe("Shell");
    expect(candidate!.amount).toBe(58.4);
  });

  it("returns null for money-in transactions", () => {
    expect(
      ruleCandidateFromTxn(makeTxn({ id: "t1", direction: "money_in" })),
    ).toBeNull();
  });

  it("a rule suggestion never creates an expense", () => {
    const candidate = ruleCandidateFromTxn(
      makeTxn({ id: "t1", merchant_name: "AutoZone" }),
    )!;
    const result = matchExpenseRule(
      [
        {
          id: "rule_x",
          tenant_id: "tnt_1",
          name: "AutoZone → Parts",
          conditions: [
            { field: "merchant_contains", op: "contains", value: "autozone" },
          ],
          action: {
            category_id: "ec_parts",
            scope: "vehicle",
            vehicle_id: null,
            require_vehicle_selection: true,
            multi_vehicle_ids: null,
            allocation_method: null,
            receipt_required: "required",
            review_state: "recorded",
            notes: null,
          },
          mode: "suggest",
          active: true,
          times_used: 0,
          last_matched_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      candidate,
    );
    expect(result.matched).toBe(true);
    expect(result).not.toHaveProperty("expenseId");
  });
});

describe("inbox fast-filter classification", () => {
  const txns: ImportedTransaction[] = [
    makeTxn({ id: "in1", direction: "money_in", review_status: "unreviewed" }),
    makeTxn({
      id: "out1",
      direction: "money_out",
      review_status: "unreviewed",
    }),
    makeTxn({
      id: "matched1",
      direction: "money_in",
      match_status: "matched",
      review_status: "reviewed",
    }),
    makeTxn({ id: "sugg1", direction: "money_in", match_status: "suggested" }),
    makeTxn({
      id: "trans1",
      direction: "money_out",
      transfer_status: "transfer",
      review_status: "reviewed",
    }),
    makeTxn({ id: "ign1", direction: "money_out", review_status: "ignored" }),
  ];
  const emptyDupes = new Set<string>();

  it("filters money in", () => {
    expect(
      applyInboxFilter(txns, "money_in", emptyDupes).map((t) => t.id),
    ).toEqual(["in1", "matched1", "sugg1"]);
  });
  it("filters money out", () => {
    expect(
      applyInboxFilter(txns, "money_out", emptyDupes).map((t) => t.id),
    ).toEqual(["out1", "trans1", "ign1"]);
  });
  it("filters needs review", () => {
    expect(
      applyInboxFilter(txns, "needs_review", emptyDupes).map((t) => t.id),
    ).toEqual(["in1", "out1", "sugg1"]);
  });
  it("filters suggested", () => {
    expect(
      applyInboxFilter(txns, "suggested", emptyDupes).map((t) => t.id),
    ).toEqual(["sugg1"]);
  });
  it("filters matched", () => {
    expect(
      applyInboxFilter(txns, "matched", emptyDupes).map((t) => t.id),
    ).toEqual(["matched1"]);
  });
  it("filters transfers", () => {
    expect(
      applyInboxFilter(txns, "transfers", emptyDupes).map((t) => t.id),
    ).toEqual(["trans1"]);
  });
  it("filters ignored", () => {
    expect(
      applyInboxFilter(txns, "ignored", emptyDupes).map((t) => t.id),
    ).toEqual(["ign1"]);
  });
  it("filters duplicate suspected", () => {
    expect(
      applyInboxFilter(txns, "duplicate_suspected", new Set(["out1"])).map(
        (t) => t.id,
      ),
    ).toEqual(["out1"]);
  });
  it("all returns everything", () => {
    expect(applyInboxFilter(txns, "all", emptyDupes)).toHaveLength(6);
  });
  it("every filter has a label", () => {
    for (const k of Object.keys(INBOX_FILTER_LABELS) as InboxFilter[]) {
      expect(INBOX_FILTER_LABELS[k].length).toBeGreaterThan(0);
    }
  });
});

describe("inbox search", () => {
  const txns: ImportedTransaction[] = [
    makeTxn({
      id: "t1",
      description: "SHELL OIL",
      merchant_name: "Shell",
      reference: "ref123",
    }),
    makeTxn({
      id: "t2",
      description: "AUTOZONE",
      merchant_name: "AutoZone",
      amount: 99.5,
    }),
  ];

  it("searches by description", () => {
    expect(searchImportedTransactions(txns, "shell").map((t) => t.id)).toEqual([
      "t1",
    ]);
  });
  it("searches by merchant", () => {
    expect(
      searchImportedTransactions(txns, "autozone").map((t) => t.id),
    ).toEqual(["t2"]);
  });
  it("searches by reference", () => {
    expect(searchImportedTransactions(txns, "ref123").map((t) => t.id)).toEqual(
      ["t1"],
    );
  });
  it("searches by amount string", () => {
    expect(searchImportedTransactions(txns, "99.50").map((t) => t.id)).toEqual([
      "t2",
    ]);
  });
  it("empty query returns all", () => {
    expect(searchImportedTransactions(txns, "")).toHaveLength(2);
  });
});

describe("duplicate import detection", () => {
  it("detects same external transaction ID", () => {
    const suspects = detectDuplicateTransactions([
      makeTxn({ id: "a", external_transaction_id: "ext_1" }),
      makeTxn({ id: "b", external_transaction_id: "ext_1" }),
    ]);
    expect(suspects).toHaveLength(1);
    expect(suspects[0].signals).toContain("Same external transaction ID");
  });

  it("detects same import fingerprint", () => {
    expect(
      detectDuplicateTransactions([
        makeTxn({ id: "a", import_fingerprint: "fp_same" }),
        makeTxn({ id: "b", import_fingerprint: "fp_same" }),
      ]),
    ).toHaveLength(1);
  });

  it("detects same account + date + amount + direction", () => {
    const suspects = detectDuplicateTransactions([
      makeTxn({
        id: "a",
        financial_account_id: "fac_1",
        transaction_date: "2026-08-22",
        amount: 50,
        direction: "money_out",
      }),
      makeTxn({
        id: "b",
        financial_account_id: "fac_1",
        transaction_date: "2026-08-22",
        amount: 50,
        direction: "money_out",
      }),
    ]);
    expect(suspects.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag different amounts as duplicates", () => {
    expect(
      detectDuplicateTransactions([
        makeTxn({ id: "a", amount: 50 }),
        makeTxn({ id: "b", amount: 75 }),
      ]),
    ).toHaveLength(0);
  });
});

describe("receipt match suggestions", () => {
  it("suggests a receipt by merchant + date proximity", () => {
    const txn = makeTxn({
      id: "t1",
      merchant_name: "Shell",
      transaction_date: "2026-08-22",
      amount: 58.4,
    });
    const suggestions = suggestReceiptMatches(txn, [
      {
        id: "rib_1",
        file_name: "shell.pdf",
        amount: 52.1,
        merchant: "Shell",
        captured_at: "2026-08-22T09:00:00Z",
        state: "missing_info",
        matched_imported_id: null,
      },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].signals).toContain("Merchant match");
  });

  it("excludes already-matched receipts", () => {
    const txn = makeTxn({ id: "t1" });
    expect(
      suggestReceiptMatches(txn, [
        {
          id: "rib_1",
          file_name: "x.pdf",
          amount: 58.4,
          merchant: "Shell",
          captured_at: "2026-08-22T09:00:00Z",
          state: "matched",
          matched_imported_id: null,
        },
      ]),
    ).toHaveLength(0);
  });
});

describe("transfer pair suggestions", () => {
  it("suggests a pair when both sides present", () => {
    const pairs = suggestTransferPairs([
      makeTxn({
        id: "out1",
        direction: "money_out",
        financial_account_id: "fac_1",
        amount: 500,
        transaction_date: "2026-08-20",
      }),
      makeTxn({
        id: "in1",
        direction: "money_in",
        financial_account_id: "fac_2",
        amount: 500,
        transaction_date: "2026-08-20",
      }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].signals).toContain("Same amount");
  });

  it("does not pair same-account transactions", () => {
    expect(
      suggestTransferPairs([
        makeTxn({
          id: "out1",
          direction: "money_out",
          financial_account_id: "fac_1",
          amount: 500,
        }),
        makeTxn({
          id: "in1",
          direction: "money_in",
          financial_account_id: "fac_1",
          amount: 500,
        }),
      ]),
    ).toHaveLength(0);
  });
});

describe("transaction attention reasons", () => {
  it("unreviewed + unmatched money-out yields correct reasons", () => {
    const reasons = transactionAttentionReasons(
      makeTxn({ id: "t1", direction: "money_out", match_status: "unmatched" }),
      false,
    );
    expect(reasons).toContain("unreviewed");
    expect(reasons).toContain("missing_match");
    expect(reasons).toContain("unmatched_money_out");
  });

  it("matched transaction yields no attention", () => {
    expect(
      transactionAttentionReasons(
        makeTxn({
          id: "t1",
          match_status: "matched",
          review_status: "reviewed",
        }),
        true,
      ),
    ).toHaveLength(0);
  });

  it("ignored transaction yields no attention", () => {
    expect(
      transactionAttentionReasons(
        makeTxn({ id: "t1", review_status: "ignored" }),
        false,
      ),
    ).toHaveLength(0);
  });

  it("transfer transaction yields no attention", () => {
    expect(
      transactionAttentionReasons(
        makeTxn({ id: "t1", transfer_status: "transfer" }),
        false,
      ),
    ).toHaveLength(0);
  });

  it("suggested match yields suggested_match reason", () => {
    expect(
      transactionAttentionReasons(
        makeTxn({ id: "t1", match_status: "suggested" }),
        false,
      ),
    ).toContain("suggested_match");
  });
});
