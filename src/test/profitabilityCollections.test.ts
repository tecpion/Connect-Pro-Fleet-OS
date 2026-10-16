// Connect Pro Fleet — profitability collection reporting tests (Build #16).

import { describe, it, expect } from "vitest";
import {
  getCollectionsByTenderMethod,
  getCollectionsByProcessor,
  getTotalCollections,
} from "@/lib/collectionSelectors";
import { txn } from "./profitabilityFixtures";

describe("Build #16 — collection method reporting", () => {
  it("groups collections by tender method", () => {
    const txns = [
      txn({
        id: "p1",
        transaction_type: "zelle_payment",
        category: "payment",
        amount: 400,
        payment_method: "zelle",
        metadata: { tender_method: "zelle" },
      }),
      txn({
        id: "p2",
        transaction_type: "cash_payment",
        category: "payment",
        amount: 200,
        payment_method: "cash",
        metadata: { tender_method: "cash" },
      }),
      txn({
        id: "p3",
        transaction_type: "card_payment",
        category: "payment",
        amount: 500,
        payment_method: "card",
        metadata: { tender_method: "credit_card", processor: "stripe" },
      }),
    ];
    const groups = getCollectionsByTenderMethod(txns);
    expect(groups.find((g) => g.tender === "zelle")?.total).toBe(400);
    expect(groups.find((g) => g.tender === "cash")?.total).toBe(200);
    expect(groups.find((g) => g.tender === "credit_card")?.total).toBe(500);
  });

  it("tender grouping sums to total collections (no double count)", () => {
    const txns = [
      txn({
        id: "p1",
        category: "payment",
        amount: 400,
        payment_method: "zelle",
        metadata: { tender_method: "zelle" },
      }),
      txn({
        id: "p2",
        category: "payment",
        amount: 500,
        payment_method: "card",
        metadata: { tender_method: "credit_card", processor: "stripe" },
      }),
    ];
    const groups = getCollectionsByTenderMethod(txns);
    const sum = groups.reduce((s, g) => s + g.total, 0);
    expect(sum).toBe(900);
    expect(getTotalCollections(txns)).toBe(900);
  });

  it("groups collections by processor", () => {
    const txns = [
      txn({
        id: "p1",
        category: "payment",
        amount: 500,
        payment_method: "card",
        metadata: { tender_method: "credit_card", processor: "stripe" },
      }),
      txn({
        id: "p2",
        category: "payment",
        amount: 300,
        payment_method: "card",
        metadata: { tender_method: "credit_card", processor: "square" },
      }),
    ];
    const procs = getCollectionsByProcessor(txns);
    expect(procs.find((p) => p.processor === "stripe")?.total).toBe(500);
    expect(procs.find((p) => p.processor === "square")?.total).toBe(300);
  });

  it("excludes deposit collection from collections", () => {
    const txns = [
      txn({
        id: "p1",
        category: "payment",
        amount: 400,
        payment_method: "zelle",
        metadata: { tender_method: "zelle" },
      }),
      txn({
        id: "d1",
        category: "payment",
        amount: 300,
        deposit_id: "dep_1",
        metadata: { deposit_kind: "collection" },
      }),
    ];
    expect(getTotalCollections(txns)).toBe(400);
  });

  it("legacy payment method normalizes to canonical tender", () => {
    const txns = [
      txn({
        id: "p1",
        category: "payment",
        amount: 200,
        payment_method: "cash",
      }),
    ];
    const groups = getCollectionsByTenderMethod(txns);
    expect(groups.find((g) => g.tender === "cash")?.total).toBe(200);
  });
});
