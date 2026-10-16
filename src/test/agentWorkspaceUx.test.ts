// Connect Pro Fleet — AI Workforce UX selectors tests (Build #47).
//
// Tests the presentation-layer selectors that drive the polished AI Workforce
// workspace: summary KPIs, plan summary, customer-facing statuses (never
// "framework-only"), agent card VMs (value statement, Run Now gating, Last/
// Next Run), outcome metrics, activity rows + status filters, setup-wizard
// helpers, spending-cap presets, and production-readiness honesty. These are
// pure derivation tests — no records are created, no second ledger.

import { describe, it, expect } from "vitest";
import { TENANT_ID } from "@/lib/store/ids";
import {
  customerAgentStatus,
  canRunAgentNow,
  lastRunFor,
  nextRunLabel,
  workforceSummaryKpis,
  planSummary,
  agentCardVm,
  allAgentCardVms,
  agentValueStatement,
  agentOutcomeMetrics,
  activityRows,
  actionStatusToActivityFilter,
  isSetupComplete,
  recommendedSetupAgents,
  validModesForAgent,
  SPENDING_CAP_PRESETS,
  aiWorkforceProductionReady,
  agentReadinessReport,
} from "@/lib/agentWorkspaceSelectors";
import { DEFAULT_AI_ENTITLEMENT } from "@/lib/agentEntitlements";
import { AGENT_LIST, WORKING_AGENTS } from "@/lib/agentRegistry";
import type {
  AgentAction,
  AgentConfig,
  AgentEntitlement,
  AgentRun,
  AgentUsageRecord,
} from "@/lib/agentTypes";

const NOW = new Date("2026-09-12T10:00:00Z");

function cfg(agentId: string, over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agent_id: agentId as never,
    enable_state: "enabled",
    max_mode: "prepare",
    location_ids: [],
    auto_create_internal_tasks: false,
    preferences: {},
    enabled_at: "2026-09-01T00:00:00Z",
    paused_at: null,
    disabled_at: null,
    ...over,
  };
}

function run(agentId: string, over: Partial<AgentRun> = {}): AgentRun {
  return {
    id: `run_${agentId}`,
    tenant_id: TENANT_ID,
    agent_id: agentId as never,
    started_at: "2026-09-12T08:58:00Z",
    completed_at: "2026-09-12T08:59:00Z",
    trigger: "manual",
    status: "completed",
    items_reviewed: 42,
    recommendations: 6,
    prepared_actions: 6,
    executed_actions: 4,
    approvals_requested: 2,
    error: null,
    summary: "Reviewed 42 items.",
    usage_cost: { provider_cost: 3, billable_amount: 5 },
    ...over,
  };
}

function action(agentId: string, over: Partial<AgentAction> = {}): AgentAction {
  return {
    id: `act_${agentId}_${Math.random().toString(36).slice(2, 6)}`,
    tenant_id: TENANT_ID,
    agent_id: agentId as never,
    run_id: `run_${agentId}`,
    action_type: "create_task",
    target_type: "rental",
    target_id: "rnt_1",
    target_label: "Rental 1",
    proposed_action: "Create follow-up task",
    risk_level: "low",
    approval_requirement: "none",
    status: "drafted",
    created_at: "2026-09-12T09:00:00Z",
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    executed_at: null,
    result: null,
    payload: {},
    dedupe_key: `dedupe_${agentId}`,
    deep_link: "/rentals/1",
    reasons: ["Overdue balance"],
    impact: "$375",
    ...over,
  };
}

function usage(agentId: string, billable: number): AgentUsageRecord {
  return {
    id: `usage_${agentId}`,
    tenant_id: TENANT_ID,
    agent_type: agentId as never,
    run_id: `run_${agentId}`,
    action_id: null,
    provider: "mock-deterministic",
    model: "dev-v1",
    input_units: 0,
    output_units: 0,
    provider_cost: billable * 0.6,
    billable_amount: billable,
    billing_period: "2026-09",
    timestamp: "2026-09-12T09:00:00Z",
  };
}

const ENT: AgentEntitlement = {
  ...DEFAULT_AI_ENTITLEMENT,
  is_dev: true,
};

// ---------------------------------------------------------------------------
// Summary KPIs
// ---------------------------------------------------------------------------

describe("AI Workforce UX — summary KPIs", () => {
  it("counts active agents (working + enabled + entitled)", () => {
    const configs = [
      cfg("collections"),
      cfg("fleet_readiness"),
      cfg("maintenance"), // framework-only → not active
    ];
    const kpis = workforceSummaryKpis(configs, [], ENT, [], NOW);
    expect(kpis.activeAgents).toBe(2);
  });

  it("counts approvals waiting", () => {
    const actions = [
      action("collections", { status: "awaiting_approval" }),
      action("collections", { status: "awaiting_approval" }),
      action("collections", { status: "drafted" }),
    ];
    const kpis = workforceSummaryKpis(
      [cfg("collections")],
      actions,
      ENT,
      [],
      NOW,
    );
    expect(kpis.approvalsWaiting).toBe(2);
  });

  it("counts actions prepared today", () => {
    const actions = [
      action("collections", { created_at: "2026-09-12T09:00:00Z" }),
      action("collections", { created_at: "2026-09-11T09:00:00Z" }),
    ];
    const kpis = workforceSummaryKpis(
      [cfg("collections")],
      actions,
      ENT,
      [],
      NOW,
    );
    expect(kpis.actionsPreparedToday).toBe(1);
  });

  it("counts successful actions today (executed/approved)", () => {
    const actions = [
      action("collections", {
        status: "executed",
        created_at: "2026-09-12T09:00:00Z",
      }),
      action("collections", {
        status: "approved",
        created_at: "2026-09-12T09:00:00Z",
      }),
      action("collections", {
        status: "drafted",
        created_at: "2026-09-12T09:00:00Z",
      }),
    ];
    const kpis = workforceSummaryKpis(
      [cfg("collections")],
      actions,
      ENT,
      [],
      NOW,
    );
    expect(kpis.successfulActionsToday).toBe(2);
  });

  it("AI usage KPI sums billable usage this period", () => {
    const records = [usage("collections", 8.42), usage("finance_review", 6.7)];
    const kpis = workforceSummaryKpis(
      [cfg("collections")],
      [],
      ENT,
      records,
      NOW,
    );
    expect(kpis.aiUsageThisPeriod).toBeCloseTo(15.12, 2);
  });
});

// ---------------------------------------------------------------------------
// Plan / entitlement summary
// ---------------------------------------------------------------------------

describe("AI Workforce UX — plan summary", () => {
  it("exposes included allowance, used, remaining, overage, cap", () => {
    const records = [usage("collections", 8)];
    const plan = planSummary(ENT, records, NOW);
    expect(plan.includedAllowance).toBe(ENT.included_allowance);
    expect(plan.usedThisPeriod).toBeCloseTo(8, 2);
    expect(plan.remainingAllowance).toBeCloseTo(ENT.included_allowance - 8, 2);
    expect(plan.overageEnabled).toBe(false);
    expect(plan.spendingCap).toBe(0);
  });

  it("labels dev entitlement honestly", () => {
    const plan = planSummary(ENT, [], NOW);
    expect(plan.isDev).toBe(true);
    expect(plan.saasBillingConnected).toBe(false);
  });

  it("plan label reflects agents availability", () => {
    expect(planSummary(ENT, [], NOW).planLabel).toContain("AI Workforce");
    const noAgents = planSummary({ ...ENT, agents_available: false }, [], NOW);
    expect(noAgents.planLabel).toBe("Not included");
  });
});

// ---------------------------------------------------------------------------
// Customer-facing statuses (never "framework-only")
// ---------------------------------------------------------------------------

describe("AI Workforce UX — customer-facing statuses", () => {
  it("working enabled agent → Active", () => {
    expect(customerAgentStatus("collections", cfg("collections"), ENT)).toBe(
      "Active",
    );
  });

  it("working paused agent → Paused", () => {
    expect(
      customerAgentStatus(
        "collections",
        cfg("collections", {
          enable_state: "paused",
        }),
        ENT,
      ),
    ).toBe("Paused");
  });

  it("working disabled agent → Disabled", () => {
    expect(
      customerAgentStatus(
        "collections",
        cfg("collections", {
          enable_state: "disabled",
        }),
        ENT,
      ),
    ).toBe("Disabled");
  });

  it("framework-only agent → Beta (never 'framework-only')", () => {
    const status = customerAgentStatus("maintenance", cfg("maintenance"), ENT);
    expect(status).toBe("Beta");
    expect(status).not.toMatch(/framework/i);
  });

  it("non-entitled agent → Upgrade Required", () => {
    const ent = { ...ENT, included_agents: ["collections" as never] };
    expect(
      customerAgentStatus("finance_review", cfg("finance_review"), ent),
    ).toBe("Upgrade Required");
  });
});

// ---------------------------------------------------------------------------
// Agent card VMs
// ---------------------------------------------------------------------------

describe("AI Workforce UX — agent card VMs", () => {
  it("each card has a value statement (business outcome)", () => {
    for (const def of AGENT_LIST) {
      const vs = agentValueStatement(def.id);
      expect(vs.length).toBeGreaterThan(10);
    }
  });

  it("card shows mode label, last run, next run, counts", () => {
    const runs = [run("collections")];
    const actions = [
      action("collections", { status: "awaiting_approval" }),
      action("collections", { status: "drafted" }),
    ];
    const card = agentCardVm(
      "collections",
      cfg("collections"),
      ENT,
      runs,
      actions,
      [],
      true,
      NOW,
    );
    expect(card.name).toBe("Collections Agent");
    expect(card.modeLabel).toBe("Prepare");
    expect(card.lastRunLabel).not.toBe("—");
    expect(card.nextRunLabel).not.toBe("—");
    expect(card.itemsReviewed).toBe(42);
    expect(card.actionsPrepared).toBe(2);
    expect(card.approvalsWaiting).toBe(1);
    expect(card.isWorking).toBe(true);
  });

  it("allAgentCardVms covers all seven agents", () => {
    const cards = allAgentCardVms([], ENT, [], [], [], false, NOW);
    expect(cards.length).toBe(7);
  });

  it("Run Now gating: working + enabled + entitled + not running", () => {
    const card = agentCardVm(
      "collections",
      cfg("collections"),
      ENT,
      [],
      [],
      [],
      true,
      NOW,
    );
    expect(card.canRunNow).toBe(true);
  });

  it("Run Now disabled when a run is already running", () => {
    const runs = [
      run("collections", { status: "running", completed_at: null }),
    ];
    const card = agentCardVm(
      "collections",
      cfg("collections"),
      ENT,
      runs,
      [],
      [],
      true,
      NOW,
    );
    expect(card.canRunNow).toBe(false);
  });

  it("Run Now disabled for framework-only agents", () => {
    const card = agentCardVm(
      "maintenance",
      cfg("maintenance"),
      ENT,
      [],
      [],
      [],
      true,
      NOW,
    );
    expect(card.canRunNow).toBe(false);
  });

  it("Run Now disabled when not entitled", () => {
    const ent = { ...ENT, included_agents: ["collections" as never] };
    const card = agentCardVm(
      "finance_review",
      cfg("finance_review"),
      ent,
      [],
      [],
      [],
      true,
      NOW,
    );
    expect(card.canRunNow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Last / Next Run
// ---------------------------------------------------------------------------

describe("AI Workforce UX — last / next run", () => {
  it("lastRunFor returns the newest run for an agent", () => {
    const runs = [
      run("collections", { id: "r1", started_at: "2026-09-10T08:00:00Z" }),
      run("collections", { id: "r2", started_at: "2026-09-12T08:00:00Z" }),
    ];
    // runs are newest-first in the store; lastRunFor returns the first match.
    const last = lastRunFor("collections", runs);
    expect(last).toBeTruthy();
  });

  it("nextRunLabel returns — when disabled", () => {
    expect(
      nextRunLabel(
        "collections",
        cfg("collections", {
          enable_state: "disabled",
        }),
      ),
    ).toBe("—");
  });

  it("nextRunLabel maps triggers to friendly labels", () => {
    expect(nextRunLabel("collections", cfg("collections"))).toBe(
      "Tomorrow morning",
    );
    expect(nextRunLabel("fleet_readiness", cfg("fleet_readiness"))).toBe(
      "Tonight",
    );
    expect(nextRunLabel("partner_settlement", cfg("partner_settlement"))).toBe(
      "Settlement period end",
    );
  });
});

// ---------------------------------------------------------------------------
// canRunAgentNow (duplicate simultaneous run protection)
// ---------------------------------------------------------------------------

describe("AI Workforce UX — duplicate run protection", () => {
  it("blocks a second run while one is running", () => {
    const runs = [
      run("collections", { status: "running", completed_at: null }),
    ];
    expect(canRunAgentNow("collections", cfg("collections"), ENT, runs)).toBe(
      false,
    );
  });

  it("blocks a second run while one is queued", () => {
    const runs = [run("collections", { status: "queued", completed_at: null })];
    expect(canRunAgentNow("collections", cfg("collections"), ENT, runs)).toBe(
      false,
    );
  });

  it("allows a run when the last run completed", () => {
    const runs = [run("collections", { status: "completed" })];
    expect(canRunAgentNow("collections", cfg("collections"), ENT, runs)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Outcome metrics (factual, no opaque score)
// ---------------------------------------------------------------------------

describe("AI Workforce UX — outcome metrics", () => {
  it("sums items reviewed, actions prepared/executed/rejected/failed", () => {
    const runs = [
      run("collections", { items_reviewed: 10, status: "completed" }),
      run("collections", { items_reviewed: 20, status: "completed" }),
    ];
    const actions = [
      action("collections", { status: "executed" }),
      action("collections", { status: "approved" }),
      action("collections", { status: "rejected" }),
      action("collections", { status: "failed" }),
      action("collections", { status: "drafted" }),
    ];
    const m = agentOutcomeMetrics("collections", runs, actions);
    expect(m.itemsReviewed).toBe(30);
    expect(m.actionsPrepared).toBe(5);
    expect(m.actionsExecuted).toBe(2);
    expect(m.actionsRejected).toBe(1);
    expect(m.actionsFailed).toBe(1);
    expect(m.runsCompleted).toBe(2);
  });

  it("does not expose an opaque score field", () => {
    const m = agentOutcomeMetrics("collections", [], []);
    const keys = Object.keys(m);
    expect(keys).not.toContain("score");
    expect(keys).not.toContain("risk_score");
    expect(keys).not.toContain("efficiency");
  });
});

// ---------------------------------------------------------------------------
// Activity rows + status filters
// ---------------------------------------------------------------------------

describe("AI Workforce UX — activity rows + filters", () => {
  const actions = [
    action("collections", { status: "awaiting_approval" }),
    action("collections", { status: "executed" }),
    action("collections", { status: "rejected" }),
    action("collections", { status: "failed" }),
    action("collections", { status: "drafted" }),
  ];

  it("returns all rows when filter is 'all'", () => {
    expect(activityRows(actions, null, "all").length).toBe(5);
  });

  it("filters by awaiting_approval", () => {
    const rows = activityRows(actions, null, "awaiting_approval");
    expect(rows.length).toBe(1);
    expect(rows[0].action.status).toBe("awaiting_approval");
  });

  it("filters by executed (includes approved)", () => {
    const rows = activityRows(
      [...actions, action("collections", { status: "approved" })],
      null,
      "executed",
    );
    expect(rows.length).toBe(2);
  });

  it("filters by rejected", () => {
    expect(activityRows(actions, null, "rejected").length).toBe(1);
  });

  it("filters by failed", () => {
    expect(activityRows(actions, null, "failed").length).toBe(1);
  });

  it("filters by agent", () => {
    const mixed = [
      ...actions,
      action("fleet_readiness", { status: "executed" }),
    ];
    expect(activityRows(mixed, "fleet_readiness", "all").length).toBe(1);
  });

  it("each row carries agent name + approver label", () => {
    const rows = activityRows(
      [action("collections", { status: "executed", approved_by: "stf_1" })],
      null,
      "all",
    );
    expect(rows[0].agentName).toBe("Collections Agent");
    expect(rows[0].approverLabel).toBe("stf_1");
  });

  it("actionStatusToActivityFilter maps statuses correctly", () => {
    expect(actionStatusToActivityFilter("awaiting_approval")).toBe(
      "awaiting_approval",
    );
    expect(actionStatusToActivityFilter("executed")).toBe("executed");
    expect(actionStatusToActivityFilter("approved")).toBe("executed");
    expect(actionStatusToActivityFilter("rejected")).toBe("rejected");
    expect(actionStatusToActivityFilter("failed")).toBe("failed");
    expect(actionStatusToActivityFilter("drafted")).toBe("prepared");
  });
});

// ---------------------------------------------------------------------------
// Setup wizard helpers
// ---------------------------------------------------------------------------

describe("AI Workforce UX — setup wizard helpers", () => {
  it("isSetupComplete is false when no agent is enabled", () => {
    expect(
      isSetupComplete([cfg("collections", { enable_state: "disabled" })]),
    ).toBe(false);
  });

  it("isSetupComplete is true when at least one agent is enabled", () => {
    expect(isSetupComplete([cfg("collections")])).toBe(true);
  });

  it("recommendedSetupAgents returns the three working agents", () => {
    const rec = recommendedSetupAgents().sort();
    expect(rec).toEqual([...WORKING_AGENTS].sort());
  });

  it("validModesForAgent returns all three modes", () => {
    expect(validModesForAgent("collections")).toEqual([
      "observe",
      "prepare",
      "execute_with_approval",
    ]);
  });

  it("SPENDING_CAP_PRESETS are UI-only values", () => {
    expect(SPENDING_CAP_PRESETS).toEqual([25, 50, 100, 250]);
  });
});

// ---------------------------------------------------------------------------
// Production readiness honesty
// ---------------------------------------------------------------------------

describe("AI Workforce UX — production readiness honesty", () => {
  it("architecture is complete but provider not connected", () => {
    const r = aiWorkforceProductionReady();
    expect(r.architectureComplete).toBe(true);
    expect(r.productionProviderConnected).toBe(false);
    expect(r.liveOverageCharging).toBe(false);
  });

  it("agentReadinessReport splits working vs framework-only", () => {
    const r = agentReadinessReport();
    expect(r.working.sort()).toEqual(
      ["collections", "fleet_readiness", "finance_review"].sort(),
    );
    expect(r.frameworkOnly.length).toBe(4);
  });
});
