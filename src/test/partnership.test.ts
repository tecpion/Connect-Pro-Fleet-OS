// Connect Pro Fleet — Build #7 partnership / JV wizard domain tests.
//
// Tests the pure partnership domain helpers: duplicate detection, ownership
// conflict detection, expense-rule helpers, net-agreement validation, and the
// full PartnershipInput validation that gates the review step. Also verifies
// legacy settlement compatibility is preserved.

import { describe, it, expect } from "vitest";
import type { Investor, InvestorVehicle } from "@/lib/investorTypes";
import type { Vehicle } from "@/lib/types";
import {
  findPossibleMatches,
  hasOwnershipConflict,
  makeExpenseRule,
  netAgreementNeedsExpenseRules,
  validatePartnershipInput,
  contributionSummary,
  expenseRulesSummary,
  partnershipSummary,
} from "@/lib/partnership";
import {
  makePercentageCompensation,
  makeFixedCompensation,
  makeCustomCompensation,
} from "@/lib/ownership";
import { getVehicleEconomics } from "@/lib/ownership";
import type { Partnership, PartnershipInput } from "@/lib/partnershipTypes";
import type { CompensationArrangement } from "@/lib/ownershipTypes";

const baseInvestor = (over: Partial<Investor> = {}): Investor => ({
  id: "inv_1",
  tenant_id: "tnt_connectpro",
  full_name: "Daniel Reyes",
  email: "daniel@example.com",
  phone: "+1 305 555 0210",
  relationship: "external",
  status: "active",
  joined_at: "2026-01-15",
  exited_at: null,
  exit_reason: null,
  ...over,
});

const basePairing = (over: Partial<InvestorVehicle> = {}): InvestorVehicle => ({
  id: "iv_1",
  tenant_id: "tnt_connectpro",
  investor_id: "inv_1",
  vehicle_id: "veh_1",
  ownership_type: "owned",
  revenue_split_investor_pct: 60,
  revenue_split_operator_pct: 40,
  agreement_id: null,
  active: true,
  ...over,
});

const baseVehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: "veh_1",
  vin: "1C4RJFBG0MC872341",
  make: "Jeep",
  model: "Wrangler",
  year: 2022,
  license_plate: "FL-RT8841",
  status: "available",
  location: "Miami Downtown",
  vehicle_type: "suv",
  daily_rate: 120,
  weekly_rate: 720,
  deposit_amount: 500,
  images: [],
  documents: [],
  purchase_date: "2022-03-04",
  purchase_price: 41200,
  current_mileage: 28410,
  insurance_policy_number: "AX-9901-22341",
  insurance_expiry: "2026-11-30",
  registration_expiry: "2027-02-28",
  tenant_id: "tnt_connectpro",
  created_at: "2022-03-04T10:00:00Z",
  updated_at: "2026-08-20T10:00:00Z",
  ...over,
});

const mkInput = (over: Partial<PartnershipInput> = {}): PartnershipInput => ({
  partner: {
    mode: "new",
    new: {
      full_name: "John Smith",
      email: "john@example.com",
      phone: "+1 305 555 0100",
      relationship: "external",
      joined_at: "2026-09-01",
    },
  },
  contribution: {
    contribution_type: "cash",
    cash_amount: 6000,
    vehicle_contribution: false,
    description: null,
    contribution_date: "2026-09-01",
    notes: null,
  },
  vehicle: {
    vehicle_id: "veh_1",
    ownership_type: "external_owner",
    ownership_notes: null,
    transfer_existing: false,
  },
  compensation: makePercentageCompensation(60, { basis: "net" }),
  expense_rules: [
    makeExpenseRule({
      tenant_id: "tnt_connectpro",
      pairing_id: "iv_tmp",
      category: "maintenance",
      treatment: "deduct_before_split",
    }),
  ],
  ...over,
});

describe("Build #7 — partner duplicate detection", () => {
  it("finds a match by email", () => {
    const investors = [
      baseInvestor({
        id: "inv_2",
        email: "john@example.com",
        full_name: "John Other",
      }),
    ];
    const matches = findPossibleMatches(
      { email: "john@example.com" },
      investors,
      [],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toBe("email");
  });

  it("finds a match by name", () => {
    const investors = [baseInvestor({ full_name: "Daniel Reyes" })];
    const matches = findPossibleMatches(
      { name: "Daniel Reyes" },
      investors,
      [],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].reason).toBe("name");
  });

  it("returns no matches when none exist", () => {
    const matches = findPossibleMatches(
      { name: "Nobody", email: "nobody@test.com", phone: "555" },
      [baseInvestor()],
      [],
    );
    expect(matches).toHaveLength(0);
  });

  it("does not silently merge — caller decides", () => {
    const investors = [baseInvestor({ full_name: "John Smith" })];
    const matches = findPossibleMatches({ name: "John Smith" }, investors, [
      basePairing(),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].vehicleCount).toBe(1);
  });
});

describe("Build #7 — ownership conflict", () => {
  it("detects an active pairing on the vehicle", () => {
    expect(hasOwnershipConflict("veh_1", [basePairing()])).toBe(true);
  });

  it("no conflict when vehicle is unpaired", () => {
    expect(hasOwnershipConflict("veh_2", [basePairing()])).toBe(false);
  });

  it("no conflict when pairing is inactive", () => {
    expect(
      hasOwnershipConflict("veh_1", [basePairing({ active: false })]),
    ).toBe(false);
  });
});

describe("Build #7 — contribution summaries", () => {
  it("cash contribution", () => {
    const s = contributionSummary({
      id: "pc_1",
      tenant_id: "tnt_connectpro",
      investor_id: "inv_1",
      vehicle_id: null,
      contribution_type: "cash",
      cash_amount: 6000,
      vehicle_contribution: false,
      description: null,
      contribution_date: "2026-09-01",
      notes: null,
      created_at: "2026-09-01",
      created_by: null,
    });
    expect(s).toContain("$6,000");
    expect(s).toContain("cash");
  });

  it("vehicle contribution", () => {
    const s = contributionSummary({
      id: "pc_2",
      tenant_id: "tnt_connectpro",
      investor_id: "inv_1",
      vehicle_id: "veh_1",
      contribution_type: "vehicle",
      cash_amount: null,
      vehicle_contribution: true,
      description: null,
      contribution_date: "2026-09-01",
      notes: null,
      created_at: "2026-09-01",
      created_by: null,
    });
    expect(s).toContain("Vehicle provided");
  });

  it("null contribution is none", () => {
    expect(contributionSummary(null)).toBe("None");
  });
});

describe("Build #7 — expense rules", () => {
  it("net agreement requires at least one deduct-before-split rule", () => {
    const comp = makePercentageCompensation(60, { basis: "net" });
    expect(netAgreementNeedsExpenseRules(comp, [])).toBe(true);
  });

  it("net agreement satisfied when a deduct rule exists", () => {
    const comp = makePercentageCompensation(60, { basis: "net" });
    const rules = [
      makeExpenseRule({
        tenant_id: "t",
        pairing_id: "p",
        category: "maintenance",
        treatment: "deduct_before_split",
      }),
    ];
    expect(netAgreementNeedsExpenseRules(comp, rules)).toBe(false);
  });

  it("gross agreement does not require deduct rules", () => {
    const comp = makePercentageCompensation(60, { basis: "gross" });
    expect(netAgreementNeedsExpenseRules(comp, [])).toBe(false);
  });

  it("fixed agreement does not require deduct rules", () => {
    const comp = makeFixedCompensation(500, "monthly");
    expect(netAgreementNeedsExpenseRules(comp, [])).toBe(false);
  });

  it("expense rules summary lists deduct categories", () => {
    const rules = [
      makeExpenseRule({
        tenant_id: "t",
        pairing_id: "p",
        category: "maintenance",
        treatment: "deduct_before_split",
      }),
      makeExpenseRule({
        tenant_id: "t",
        pairing_id: "p",
        category: "towing",
        treatment: "deduct_before_split",
      }),
    ];
    expect(expenseRulesSummary(rules)).toContain("maintenance");
    expect(expenseRulesSummary(rules)).toContain("towing");
  });
});

describe("Build #7 — partnership input validation", () => {
  it("valid input produces no errors", () => {
    const errors = validatePartnershipInput(mkInput(), {
      vehicles: [baseVehicle()],
      pairings: [],
    });
    expect(errors).toHaveLength(0);
  });

  it("missing partner name is an error", () => {
    const errors = validatePartnershipInput(
      mkInput({
        partner: {
          mode: "new",
          new: {
            full_name: "",
            email: "",
            phone: "",
            relationship: "external",
            joined_at: "2026-09-01",
          },
        },
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("missing vehicle is an error", () => {
    const errors = validatePartnershipInput(
      mkInput({
        vehicle: {
          vehicle_id: "",
          ownership_type: "external_owner",
          ownership_notes: null,
          transfer_existing: false,
        },
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    expect(errors.some((e) => e.includes("vehicle"))).toBe(true);
  });

  it("ownership conflict without transfer is an error", () => {
    const errors = validatePartnershipInput(mkInput(), {
      vehicles: [baseVehicle()],
      pairings: [basePairing()],
    });
    expect(errors.some((e) => e.includes("ownership"))).toBe(true);
  });

  it("ownership conflict with transfer is allowed", () => {
    const errors = validatePartnershipInput(
      mkInput({
        vehicle: {
          vehicle_id: "veh_1",
          ownership_type: "external_owner",
          ownership_notes: null,
          transfer_existing: true,
        },
      }),
      { vehicles: [baseVehicle()], pairings: [basePairing()] },
    );
    expect(errors.some((e) => e.includes("ownership"))).toBe(false);
  });

  it("net agreement with no deduct rules is an error", () => {
    const errors = validatePartnershipInput(
      mkInput({
        compensation: makePercentageCompensation(60, { basis: "net" }),
        expense_rules: [],
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    expect(errors.some((e) => e.includes("After-expenses"))).toBe(true);
  });

  it("fixed agreement with zero amount is an error", () => {
    const errors = validatePartnershipInput(
      mkInput({
        compensation: makeFixedCompensation(
          0,
          "monthly",
        ) as CompensationArrangement,
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    expect(errors.some((e) => e.includes("fixed"))).toBe(true);
  });

  it("custom agreement without description is an error", () => {
    const errors = validatePartnershipInput(
      mkInput({
        compensation: makeCustomCompensation("") as CompensationArrangement,
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    expect(errors.some((e) => e.includes("custom"))).toBe(true);
  });

  it("cash contribution without amount is an error", () => {
    const errors = validatePartnershipInput(
      mkInput({
        contribution: {
          contribution_type: "cash",
          cash_amount: 0,
          vehicle_contribution: false,
          description: null,
          contribution_date: "2026-09-01",
          notes: null,
        },
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    expect(errors.some((e) => e.includes("cash"))).toBe(true);
  });

  it("percentages not summing to 100 is an error", () => {
    const bad = {
      type: "percentage" as const,
      basis: "net" as const,
      investor_percentage: 60,
      operator_percentage: 50,
      effective_date: "2026-09-01",
      end_date: null,
      notes: null,
    };
    const errors = validatePartnershipInput(mkInput({ compensation: bad }), {
      vehicles: [baseVehicle()],
      pairings: [],
    });
    expect(errors.some((e) => e.includes("100"))).toBe(true);
  });
});

describe("Build #7 — partnership summary", () => {
  it("summarizes a percentage partnership", () => {
    const p: Partnership = {
      id: "prt_1",
      tenant_id: "tnt_connectpro",
      investor_id: "inv_1",
      vehicle_id: "veh_1",
      pairing_id: "iv_1",
      contribution_id: null,
      ownership_type: "external_owner",
      compensation: makePercentageCompensation(60, { basis: "net" }),
      expense_rules: [],
      structured: true,
      created_at: "2026-09-01",
      created_by: null,
    };
    const s = partnershipSummary(p);
    expect(s).toContain("60%");
    expect(s).toContain("external_owner");
  });
});

describe("Build #7 — legacy settlement compatibility", () => {
  it("existing 60/40 net split still calculates correctly", () => {
    const pairing = basePairing({
      compensation: makePercentageCompensation(60, { basis: "net" }),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    // net = 800; investor 60% of 800 = 480
    expect(econ.investor_payout).toBe(480);
    expect(econ.operator_retained).toBe(320);
  });

  it("existing 50/50 net split still calculates correctly", () => {
    const pairing = basePairing({
      compensation: makePercentageCompensation(50, { basis: "net" }),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    expect(econ.investor_payout).toBe(400);
    expect(econ.operator_retained).toBe(400);
  });

  it("guaranteed payout can produce negative operator result", () => {
    const pairing = basePairing({
      compensation: makeFixedCompensation(1000, "monthly"),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    expect(econ.net_performance).toBe(800);
    expect(econ.investor_payout).toBe(1000);
    expect(econ.operator_retained).toBe(-200);
  });
});

describe("Build #7 — isolation", () => {
  it("contribution does not change ownership type", () => {
    // A cash contribution with company_owned ownership is valid.
    const errors = validatePartnershipInput(
      mkInput({
        vehicle: {
          vehicle_id: "veh_1",
          ownership_type: "company_owned",
          ownership_notes: null,
          transfer_existing: false,
        },
      }),
      { vehicles: [baseVehicle()], pairings: [] },
    );
    // No error about ownership — cash can fund a company-owned vehicle.
    expect(errors.some((e) => e.includes("ownership"))).toBe(false);
  });
});
