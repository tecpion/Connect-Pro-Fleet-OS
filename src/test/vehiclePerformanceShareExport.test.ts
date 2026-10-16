// Vehicle Performance — Share Card PNG export + privacy.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import {
  buildShareCard,
  DEFAULT_SHARE_CARD_OPTIONS,
  SHAREABLE_METRICS,
  type ShareCardOptions,
} from "@/lib/vehiclePerformanceComparison";
import {
  downloadShareCardPng,
  shareCardFilename,
  DEFAULT_BRAND_COLOR,
} from "@/lib/vehiclePerformanceShareExport";
import { inputs, vehicle, txn } from "./profitabilityFixtures";

const NOW = new Date("2026-08-20");
const RANGE = resolvePerformanceRange("this_month", NOW);

function perfInputs(
  over: Partial<VehiclePerformanceInputs> = {},
): VehiclePerformanceInputs {
  return {
    ...inputs(),
    deposits: [],
    damageClaims: [],
    damageRecoveries: [],
    violations: [],
    workOrders: [],
    ...over,
  };
}

function basePerf() {
  return getVehiclePerformance(
    "veh_1",
    perfInputs({
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 31420,
          effective_date: "2026-08-15",
        }),
      ],
      vehicles: [
        vehicle({
          purchase_price: 5200,
          make: "Nissan",
          model: "Altima",
          year: 2021,
        }),
      ],
    }),
    RANGE,
    "this_month",
    NOW,
  );
}

describe("VP — Share Card export basics", () => {
  it("downloadShareCardPng returns a recoverable error in non-DOM env", async () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    const res = await downloadShareCardPng(card, {
      brandColor: DEFAULT_BRAND_COLOR,
    });
    // In the test/jsdom environment, canvas 2D context is unavailable, so the
    // export must fail gracefully (never throw) and preserve Share View state.
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error!.length).toBeGreaterThan(0);
  });

  it("export failure is recoverable and does not throw", async () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    await expect(downloadShareCardPng(card)).resolves.toBeDefined();
  });

  it("produces a safe, sanitized filename", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    const name = shareCardFilename(card);
    expect(name).toMatch(/^connect-pro-fleet-/);
    expect(name).toMatch(/\.png$/);
    // No unsafe characters.
    expect(name).not.toMatch(/[^a-z0-9.\-]/);
  });

  it("filename handles missing label gracefully", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    card.vehicleLabel = "   ";
    const name = shareCardFilename(card);
    expect(name).toContain("vehicle");
  });
});

describe("VP — Share Card metric inclusion", () => {
  it("selected metrics are included in the card", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      metrics: ["grossRevenue", "purchasePrice", "netContribution"],
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.metrics).toContain("grossRevenue");
    expect(card.options.metrics).toContain("purchasePrice");
    expect(card.options.metrics).toContain("netContribution");
  });

  it("deselected metrics are excluded", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      metrics: ["grossRevenue"],
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.metrics).not.toContain("cashCollected");
    expect(card.options.metrics).not.toContain("totalExpenses");
  });

  it("Gross Revenue is present by default", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    expect(card.options.metrics).toContain("grossRevenue");
    expect(card.grossRevenue).toBe(31420);
  });

  it("all shareable metrics are a closed set (no private metrics)", () => {
    // Private metrics must never appear in SHAREABLE_METRICS.
    const privateKeys = [
      "financing",
      "carNote",
      "lender",
      "investorPayout",
      "jvSplit",
      "customer",
      "rentalId",
      "insurance",
      "internalNotes",
    ];
    for (const p of privateKeys) {
      expect(SHAREABLE_METRICS as readonly string[]).not.toContain(p);
    }
  });
});

describe("VP — Share Card branding", () => {
  it("tenant logo option is respected", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      useBusinessLogo: true,
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.useBusinessLogo).toBe(true);
  });

  it("tenant colors option is respected", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      useBrandColors: false,
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.useBrandColors).toBe(false);
  });

  it("Powered by Connect Pro shown by default", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    expect(card.options.showConnectProBranding).toBe(true);
  });

  it("entitlement-based branding removal: forced back on when not entitled", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      showConnectProBranding: false,
      canRemoveBranding: false,
    };
    const card = buildShareCard(basePerf(), opts);
    // Not entitled → branding forced back ON despite the request to hide.
    expect(card.options.showConnectProBranding).toBe(true);
  });

  it("entitlement-based branding removal: omitted when entitled", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      showConnectProBranding: false,
      canRemoveBranding: true,
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.showConnectProBranding).toBe(false);
  });
});

describe("VP — Share Card privacy", () => {
  it("customer data is never in the card", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    const cardJson = JSON.stringify(card);
    // No customer/renter identifiers leak.
    expect(cardJson).not.toContain("customer");
    expect(cardJson).not.toContain("renter");
  });

  it("financing detail is excluded", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    const cardJson = JSON.stringify(card);
    expect(cardJson).not.toContain("carNote");
    expect(cardJson).not.toContain("lender");
    expect(cardJson).not.toContain("financing");
  });

  it("JV payout is excluded", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    const cardJson = JSON.stringify(card);
    expect(cardJson).not.toContain("investorPayout");
    expect(cardJson).not.toContain("jvSplit");
  });

  it("internal notes are excluded", () => {
    const card = buildShareCard(basePerf(), DEFAULT_SHARE_CARD_OPTIONS);
    const cardJson = JSON.stringify(card);
    expect(cardJson).not.toContain("notes");
    expect(cardJson).not.toContain("internal");
  });

  it("share card data is authoritative (no free-text overrides)", () => {
    const perf = basePerf();
    const card = buildShareCard(perf, DEFAULT_SHARE_CARD_OPTIONS);
    // Values match the authoritative performance object exactly.
    expect(card.grossRevenue).toBe(perf.grossRevenueGenerated);
    expect(card.cashCollected).toBe(perf.cashCollected);
    expect(card.totalExpenses).toBe(perf.totalExpenses);
    expect(card.netContribution).toBe(perf.netContribution);
    expect(card.purchasePrice).toBe(perf.purchasePrice);
  });
});

describe("VP — Share Card vehicle photo", () => {
  it("vehicle photo enabled option is respected", () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      showVehiclePhoto: true,
    };
    const card = buildShareCard(basePerf(), opts);
    expect(card.options.showVehiclePhoto).toBe(true);
  });

  it("vehicle photo missing does not break the card", () => {
    // Vehicle with no images.
    const perf = getVehiclePerformance(
      "veh_1",
      perfInputs({
        vehicles: [vehicle({ images: [] })],
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 1000,
            effective_date: "2026-08-15",
          }),
        ],
      }),
      RANGE,
      "this_month",
      NOW,
    );
    const card = buildShareCard(perf, {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      showVehiclePhoto: true,
    });
    // Card still builds; photo is simply omitted at render time.
    expect(card.vehicleLabel).toBeDefined();
  });
});

describe("VP — Share View configuration preserved after export", () => {
  it("export attempt does not mutate ShareCardOptions", async () => {
    const opts: ShareCardOptions = {
      ...DEFAULT_SHARE_CARD_OPTIONS,
      metrics: ["grossRevenue", "netContribution"],
      grossFocused: true,
    };
    const card = buildShareCard(basePerf(), opts);
    const snapshot = JSON.stringify(opts);
    await downloadShareCardPng(card, { brandColor: DEFAULT_BRAND_COLOR });
    // Options unchanged after a (failed) export attempt.
    expect(JSON.stringify(opts)).toBe(snapshot);
  });
});
