// Connect Pro Fleet — AI Agent Platform domain tests (Build #46).
//
// Pure tests over the agent domain layer: registry, types/risk classification,
// permissions/allowlist, schema validation, entitlements/usage metering,
// provider abstraction, and the deterministic run engine. Verifies the core
// safety invariants: agents operate through an allowlist, high-risk actions
// always require approval, the provider is honestly mock, and usage metering
// separates provider cost (internal) from billable amount (tenant-facing).

import { describe, it, expect } from "vitest";
import {
  AGENT_REGISTRY,
  AGENT_LIST,
  ALL_AGENT_TYPES,
  WORKING_AGENTS,
  FRAMEWORK_ONLY_AGENTS,
  getAgentDefinition,
  isActionAllowed,
} from "@/lib/agentRegistry";
import {
  HIGH_RISK_ACTION_TYPES,
  actionRequiresApproval,
  actionRisk,
  type AgentActionType,
  type AgentId,
  type AgentMode,
  type AgentRunStatus,
  type AgentActionStatus,
} from "@/lib/agentTypes";
import {
  AGENT_PERMISSION_SCOPE,
  AGENT_ACTION_ALLOWLIST,
  agentCanPerform,
  isAutoExecutable,
} from "@/lib/agentPermissions";
import {
  validateProposedAction,
  resolveRiskAndApproval,
  canBatchApprove,
} from "@/lib/agentSchema";
import {
  DEFAULT_AI_ENTITLEMENT,
  isAgentEntitled,
  currentBillingPeriod,
  periodUsage,
  periodUsageByAgent,
  buildUsageSummary,
  shouldPauseBillableAI,
} from "@/lib/agentEntitlements";
import {
  MOCK_AI_PROVIDER,
  getAIProvider,
  setActiveAiProvider,
  isProductionAiConnected,
  PRODUCTION_AI_CONNECTED,
} from "@/lib/agentProvider";
import {
  executeAgentRunSync,
  agentActionDedupeKey,
  type AgentActionProposal,
} from "@/lib/agentRunEngine";
import {
  isTaskCreatingAction,
  TASK_CREATING_ACTIONS,
} from "@/lib/agentActionExecution";
import type { AIUsageRecord } from "@/lib/agentTypes";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("AI Agent — registry", () => {
  it("registers all seven first-party agents", () => {
    const expected: AgentId[] = [
      "collections",
      "fleet_readiness",
      "rental_operations",
      "maintenance",
      "finance_review",
      "compliance",
      "partner_settlement",
    ];
    expect(ALL_AGENT_TYPES.sort()).toEqual([...expected].sort());
    expect(AGENT_LIST.length).toBe(7);
  });

  it("each agent has a goal, data access, allowlist, and cannot_perform list", () => {
    for (const def of AGENT_LIST) {
      expect(def.goal.length).toBeGreaterThan(0);
      expect(def.data_access.length).toBeGreaterThan(0);
      expect(def.can_prepare.length).toBeGreaterThan(0);
      expect(def.cannot_perform.length).toBeGreaterThan(0);
      expect(def.default_mode).toMatch(/observe|prepare|execute_with_approval/);
    }
  });

  it("Collections Agent is registered with correct capabilities", () => {
    const c = getAgentDefinition("collections");
    expect(c.name).toBe("Collections Agent");
    expect(c.v1_working).toBe(true);
    expect(c.can_prepare).toContain("create_task");
    expect(c.can_prepare).toContain("prepare_message");
    expect(c.approval_actions).toContain("send_external_message");
    expect(c.cannot_perform).toContain("Charge customer cards");
    expect(c.cannot_perform).toContain("Apply deposits");
    expect(c.cannot_perform).toContain("Issue refunds");
  });

  it("Fleet Readiness Agent is registered with correct capabilities", () => {
    const f = getAgentDefinition("fleet_readiness");
    expect(f.name).toBe("Fleet Readiness Agent");
    expect(f.v1_working).toBe(true);
    expect(f.approval_actions).toBeDefined();
    expect(f.approval_actions).toContain("vehicle_reassignment");
    expect(f.cannot_perform).toContain(
      "Alter reservation vehicle assignment automatically",
    );
  });

  it("Rental Operations Agent is registered (framework-only)", () => {
    const r = getAgentDefinition("rental_operations");
    expect(r.name).toBe("Rental Operations Agent");
    expect(r.v1_working).toBe(false);
    expect(r.approval_actions).toContain("change_rental_terms");
  });

  it("Maintenance Agent is registered (framework-only)", () => {
    const m = getAgentDefinition("maintenance");
    expect(m.name).toBe("Maintenance Agent");
    expect(m.v1_working).toBe(false);
    expect(m.cannot_perform).toContain("Approve repair spending");
  });

  it("Finance Review Agent is registered with correct capabilities", () => {
    const f = getAgentDefinition("finance_review");
    expect(f.name).toBe("Finance Review Agent");
    expect(f.v1_working).toBe(true);
    expect(f.can_prepare).toContain("prepare_classification");
    expect(f.can_prepare).toContain("prepare_bank_match");
    expect(f.can_prepare).toContain("flag_duplicate");
    expect(f.can_prepare).toContain("month_end_review");
    expect(f.cannot_perform).toContain("Reverse expenses");
    expect(f.cannot_perform).toContain("Classify deposits as revenue");
  });

  it("Compliance Agent is registered (framework-only)", () => {
    const c = getAgentDefinition("compliance");
    expect(c.name).toBe("Compliance Agent");
    expect(c.v1_working).toBe(false);
    expect(c.approval_actions).toContain("compliance_override");
  });

  it("Partner Settlement Agent is registered (framework-only)", () => {
    const p = getAgentDefinition("partner_settlement");
    expect(p.name).toBe("Partner Settlement Agent");
    expect(p.v1_working).toBe(false);
    expect(p.can_prepare).toContain("prepare_settlement");
    expect(p.approval_actions).toContain("approve_settlement");
    expect(p.approval_actions).toContain("record_payout");
    expect(p.cannot_perform).toContain("Alter historical agreement terms");
  });

  it("working vs framework-only split is correct", () => {
    expect(WORKING_AGENTS.sort()).toEqual(
      ["collections", "fleet_readiness", "finance_review"].sort(),
    );
    expect(FRAMEWORK_ONLY_AGENTS.sort()).toEqual(
      [
        "rental_operations",
        "maintenance",
        "compliance",
        "partner_settlement",
      ].sort(),
    );
  });

  it("isActionAllowed returns true for prepare and approval actions", () => {
    expect(isActionAllowed("collections", "create_task")).toBe(true);
    expect(isActionAllowed("collections", "send_external_message")).toBe(true);
    expect(isActionAllowed("collections", "approve_settlement")).toBe(false);
    expect(isActionAllowed("finance_review", "flag_duplicate")).toBe(true);
    expect(isActionAllowed("finance_review", "send_external_message")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Risk classification + approval enforcement
// ---------------------------------------------------------------------------

describe("AI Agent — risk + approval enforcement", () => {
  it("high-risk action types are correctly classified", () => {
    const high: AgentActionType[] = [
      "send_external_message",
      "vehicle_reassignment",
      "approve_settlement",
      "record_payout",
      "compliance_override",
      "change_rental_terms",
    ];
    for (const t of high) {
      expect(HIGH_RISK_ACTION_TYPES.has(t)).toBe(true);
      expect(actionRequiresApproval(t)).toBe(true);
      expect(actionRisk(t)).toBe("high");
    }
  });

  it("low-risk action types do not require approval", () => {
    const low: AgentActionType[] = [
      "create_task",
      "prepare_message",
      "create_attention_item",
      "readiness_recommendation",
      "prepare_classification",
      "prepare_bank_match",
      "flag_duplicate",
      "month_end_review",
      "prepare_settlement",
      "prepare_statement",
    ];
    for (const t of low) {
      expect(HIGH_RISK_ACTION_TYPES.has(t)).toBe(false);
      expect(actionRequiresApproval(t)).toBe(false);
      expect(actionRisk(t)).toBe("low");
    }
  });

  it("resolveRiskAndApproval gates high-risk actions", () => {
    expect(resolveRiskAndApproval("send_external_message")).toEqual({
      risk: "high",
      approval_requirement: "required",
    });
    expect(resolveRiskAndApproval("approve_settlement")).toEqual({
      risk: "high",
      approval_requirement: "required",
    });
    expect(resolveRiskAndApproval("create_task")).toEqual({
      risk: "low",
      approval_requirement: "none",
    });
  });
});

// ---------------------------------------------------------------------------
// Permissions / allowlist
// ---------------------------------------------------------------------------

describe("AI Agent — permissions + allowlist", () => {
  it("each agent has a bounded permission scope (not full tenant access)", () => {
    for (const id of ALL_AGENT_TYPES) {
      const scope = AGENT_PERMISSION_SCOPE[id];
      expect(scope.length).toBeGreaterThan(0);
      // No agent gets every permission — they are scoped to their responsibility.
      expect(scope.length).toBeLessThan(50);
    }
  });

  it("Collections Agent scope is read-scoped to collections domain", () => {
    const scope = AGENT_PERMISSION_SCOPE.collections;
    expect(scope).toContain("payments.view");
    expect(scope).toContain("payment_arrangements.view");
    expect(scope).toContain("customers.view");
    expect(scope).toContain("rentals.view");
    // Does NOT get banking or investor access.
    expect(scope).not.toContain("banking.view");
    expect(scope).not.toContain("investors.view_financials");
  });

  it("Finance Agent scope includes expenses + banking but not investor payouts", () => {
    const scope = AGENT_PERMISSION_SCOPE.finance_review;
    expect(scope).toContain("expenses.view");
    expect(scope).toContain("banking.view");
    expect(scope).toContain("banking.review");
    expect(scope).not.toContain("investors.view_financials");
  });

  it("agentCanPerform respects the allowlist", () => {
    expect(agentCanPerform("collections", "create_task")).toBe(true);
    expect(agentCanPerform("collections", "prepare_message")).toBe(true);
    expect(agentCanPerform("collections", "approve_settlement")).toBe(false);
    expect(agentCanPerform("collections", "record_payout")).toBe(false);
    expect(agentCanPerform("finance_review", "flag_duplicate")).toBe(true);
    expect(agentCanPerform("finance_review", "send_external_message")).toBe(
      false,
    );
  });

  it("no agent has arbitrary_update_database in its allowlist", () => {
    for (const id of ALL_AGENT_TYPES) {
      const allow = AGENT_ACTION_ALLOWLIST[id];
      expect(allow).not.toContain("arbitrary_update_database" as never);
    }
  });

  it("isAutoExecutable returns false for high-risk actions", () => {
    expect(isAutoExecutable("send_external_message")).toBe(false);
    expect(isAutoExecutable("approve_settlement")).toBe(false);
    expect(isAutoExecutable("record_payout")).toBe(false);
    expect(isAutoExecutable("compliance_override")).toBe(false);
  });

  it("isAutoExecutable returns true for low-risk actions", () => {
    expect(isAutoExecutable("create_task")).toBe(true);
    expect(isAutoExecutable("prepare_classification")).toBe(true);
    expect(isAutoExecutable("flag_duplicate")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("AI Agent — schema validation", () => {
  it("validates a well-formed proposed action", () => {
    const result = validateProposedAction("collections", {
      action_type: "create_task",
      target_entity_type: "rental",
      target_entity_id: "rnt_1",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an action not in the agent allowlist", () => {
    const result = validateProposedAction("collections", {
      action_type: "approve_settlement",
      target_entity_type: "agreement",
      target_entity_id: "agr_1",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /allowlist/.test(e))).toBe(true);
  });

  it("rejects a non-object proposed action", () => {
    const result = validateProposedAction("collections", null);
    expect(result.valid).toBe(false);
  });

  it("rejects missing target_entity_id", () => {
    const result = validateProposedAction("collections", {
      action_type: "create_task",
      target_entity_type: "rental",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /target_entity_id/.test(e))).toBe(true);
  });

  it("canBatchApprove allows only low-risk actions", () => {
    expect(canBatchApprove(["create_task", "prepare_message"])).toBe(true);
    expect(canBatchApprove(["create_task", "send_external_message"])).toBe(
      false,
    );
    expect(canBatchApprove(["approve_settlement"])).toBe(false);
    expect(canBatchApprove(["record_payout", "change_rental_terms"])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Entitlements + usage metering
// ---------------------------------------------------------------------------

describe("AI Agent — entitlements + usage metering", () => {
  it("default entitlement is dev-labeled with agents available", () => {
    expect(DEFAULT_AI_ENTITLEMENT.is_dev).toBe(true);
    expect(DEFAULT_AI_ENTITLEMENT.agents_available).toBe(true);
    expect(DEFAULT_AI_ENTITLEMENT.copilot_available).toBe(true);
    expect(DEFAULT_AI_ENTITLEMENT.included_allowance).toBeGreaterThan(0);
    expect(DEFAULT_AI_ENTITLEMENT.overage_enabled).toBe(false);
  });

  it("isAgentEntitled respects agents_available flag", () => {
    const ent = { ...DEFAULT_AI_ENTITLEMENT, agents_available: false };
    expect(isAgentEntitled(ent, "collections")).toBe(false);
    expect(isAgentEntitled(DEFAULT_AI_ENTITLEMENT, "collections")).toBe(true);
  });

  it("isAgentEntitled respects included_agents list", () => {
    const ent = {
      ...DEFAULT_AI_ENTITLEMENT,
      included_agents: ["collections" as AgentId],
    };
    expect(isAgentEntitled(ent, "collections")).toBe(true);
    expect(isAgentEntitled(ent, "finance_review")).toBe(false);
  });

  it("currentBillingPeriod returns YYYY-MM", () => {
    const bp = currentBillingPeriod(new Date("2026-09-12T10:00:00Z"));
    expect(bp).toMatch(/^\d{4}-\d{2}$/);
  });

  function makeUsage(
    tenant: string,
    period: string,
    agent: AgentId | "copilot",
    billable: number,
    providerCost = billable * 0.7,
  ): AIUsageRecord {
    return {
      id: `usage_${agent}_${period}`,
      tenant_id: tenant,
      agent_type: agent,
      run_id: null,
      action_id: null,
      provider: "mock-deterministic",
      model: "dev-v1",
      input_units: 0,
      output_units: 0,
      provider_cost: providerCost,
      billable_amount: billable,
      billing_period: period,
      timestamp: "2026-09-12T10:00:00Z",
    };
  }

  it("periodUsage sums billable amounts for a tenant+period", () => {
    const records = [
      makeUsage("tnt_a", "2026-09", "collections", 8.42),
      makeUsage("tnt_a", "2026-09", "finance_review", 6.7),
      makeUsage("tnt_b", "2026-09", "collections", 5),
      makeUsage("tnt_a", "2026-08", "collections", 3),
    ];
    expect(periodUsage(records, "tnt_a", "2026-09")).toBeCloseTo(15.12, 2);
    expect(periodUsage(records, "tnt_b", "2026-09")).toBeCloseTo(5, 2);
    expect(periodUsage(records, "tnt_a", "2026-08")).toBeCloseTo(3, 2);
  });

  it("periodUsageByAgent groups by agent", () => {
    const records = [
      makeUsage("tnt_a", "2026-09", "collections", 8),
      makeUsage("tnt_a", "2026-09", "collections", 2),
      makeUsage("tnt_a", "2026-09", "finance_review", 6),
    ];
    const by = periodUsageByAgent(records, "tnt_a", "2026-09");
    const coll = by.find((b) => b.agent_type === "collections");
    const fin = by.find((b) => b.agent_type === "finance_review");
    expect(coll?.billable_amount).toBeCloseTo(10, 2);
    expect(fin?.billable_amount).toBeCloseTo(6, 2);
  });

  it("buildUsageSummary hides provider cost from tenant-facing summary", () => {
    const records = [makeUsage("tnt_a", "2026-09", "collections", 8.42, 6)];
    const summary = buildUsageSummary(
      { ...DEFAULT_AI_ENTITLEMENT, included_allowance: 25 },
      records,
      "tnt_a",
      new Date("2026-09-12T10:00:00Z"),
    );
    expect(summary.used).toBeCloseTo(8.42, 2);
    expect(summary.included_allowance).toBe(25);
    expect(summary.remaining).toBeCloseTo(16.58, 2);
    expect(summary.overage).toBe(0);
    expect(summary.cap_reached).toBe(false);
    // The summary object must NOT carry provider_cost.
    const keys = Object.keys(summary);
    expect(keys).not.toContain("provider_cost");
    expect(keys).not.toContain("totalProviderCost");
  });

  it("buildUsageSummary computes overage only when overage_enabled", () => {
    const records = [makeUsage("tnt_a", "2026-09", "collections", 30, 20)];
    const ent = { ...DEFAULT_AI_ENTITLEMENT, included_allowance: 25 };
    // Overage disabled → overage is 0 even though used > allowance.
    const s1 = buildUsageSummary(ent, records, "tnt_a", new Date("2026-09-12"));
    expect(s1.overage).toBe(0);
    // Overage enabled → overage is 5.
    const s2 = buildUsageSummary(
      { ...ent, overage_enabled: true },
      records,
      "tnt_a",
      new Date("2026-09-12"),
    );
    expect(s2.overage).toBeCloseTo(5, 2);
  });

  it("buildUsageSummary alert thresholds (50/75/90/100)", () => {
    const ent = { ...DEFAULT_AI_ENTITLEMENT, included_allowance: 100 };
    const mk = (used: number) =>
      buildUsageSummary(
        ent,
        [makeUsage("tnt_a", "2026-09", "collections", used)],
        "tnt_a",
        new Date("2026-09-12"),
      );
    expect(mk(40).alert_threshold).toBeNull();
    expect(mk(50).alert_threshold).toBe(50);
    expect(mk(75).alert_threshold).toBe(75);
    expect(mk(90).alert_threshold).toBe(90);
    expect(mk(100).alert_threshold).toBe(100);
  });

  it("shouldPauseBillableAI pauses when cap reached and overage not enabled", () => {
    const ent = {
      ...DEFAULT_AI_ENTITLEMENT,
      spending_cap: 50,
      overage_enabled: false,
    };
    const records = [makeUsage("tnt_a", "2026-09", "collections", 55, 40)];
    const summary = buildUsageSummary(
      ent,
      records,
      "tnt_a",
      new Date("2026-09-12"),
    );
    expect(shouldPauseBillableAI(ent, summary)).toBe(true);
  });

  it("shouldPauseBillableAI does not pause when overage is enabled", () => {
    const ent = {
      ...DEFAULT_AI_ENTITLEMENT,
      spending_cap: 50,
      overage_enabled: true,
    };
    const records = [makeUsage("tnt_a", "2026-09", "collections", 55, 40)];
    const summary = buildUsageSummary(
      ent,
      records,
      "tnt_a",
      new Date("2026-09-12"),
    );
    expect(shouldPauseBillableAI(ent, summary)).toBe(false);
  });

  it("shouldPauseBillableAI pauses when allowance exhausted and no overage", () => {
    const ent = {
      ...DEFAULT_AI_ENTITLEMENT,
      included_allowance: 25,
      spending_cap: 0,
      overage_enabled: false,
    };
    const records = [makeUsage("tnt_a", "2026-09", "collections", 30, 20)];
    const summary = buildUsageSummary(
      ent,
      records,
      "tnt_a",
      new Date("2026-09-12"),
    );
    expect(shouldPauseBillableAI(ent, summary)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

describe("AI Agent — provider abstraction", () => {
  it("mock provider is honestly labeled as not available", () => {
    expect(MOCK_AI_PROVIDER.available).toBe(false);
    expect(MOCK_AI_PROVIDER.id).toBe("mock-deterministic");
    expect(/not connected/i.test(MOCK_AI_PROVIDER.label)).toBe(true);
  });

  it("isProductionAiConnected returns false in V1", () => {
    expect(isProductionAiConnected()).toBe(false);
    expect(PRODUCTION_AI_CONNECTED).toBe(false);
  });

  it("getAIProvider returns the mock by default", () => {
    expect(getAIProvider().id).toBe("mock-deterministic");
  });

  it("setActiveAiProvider can swap the provider (future production wiring)", () => {
    const original = getAIProvider();
    const fake = {
      ...MOCK_AI_PROVIDER,
      id: "test-prod",
      available: true,
      label: "Test production provider",
    };
    setActiveAiProvider(fake);
    expect(getAIProvider().id).toBe("test-prod");
    expect(isProductionAiConnected()).toBe(true);
    // Restore.
    setActiveAiProvider(original);
    expect(isProductionAiConnected()).toBe(false);
  });

  it("mock provider generateStructured returns context passthrough + zero usage", async () => {
    const res = await MOCK_AI_PROVIDER.generateStructured({
      agent_id: "collections",
      task: "test",
      context: { structured_output: { hello: "world" } },
    });
    expect(res.structured_output).toEqual({ hello: "world" });
    expect(res.usage.provider_cost).toBe(0);
    expect(res.usage.billable_amount).toBe(0);
    expect(res.usage.provider).toBe("mock-deterministic");
  });
});

// ---------------------------------------------------------------------------
// Run engine (deterministic)
// ---------------------------------------------------------------------------

describe("AI Agent — run engine (deterministic)", () => {
  // We need a store to run agents. Use the same test harness pattern as other
  // tests: render a hook with StoreProvider and pass the store to the engine.
  // For pure domain tests we construct a minimal stub.

  function makeProposal(
    over: Partial<AgentActionProposal> = {},
  ): AgentActionProposal {
    return {
      action_type: "create_task",
      target_type: "rental",
      target_id: "rnt_1",
      target_label: "Rental 1",
      proposed_action: "Create task",
      risk_level: "low",
      reasons: ["reason"],
      impact: null,
      payload: {},
      deep_link: null,
      occurrence: "occ-1",
      ...over,
    };
  }

  it("agentActionDedupeKey is stable for same agent+action+target+occurrence", () => {
    const p = makeProposal();
    const k1 = agentActionDedupeKey("collections", p);
    const k2 = agentActionDedupeKey("collections", p);
    expect(k1).toBe(k2);
    expect(k1).toBe("collections:create_task:rnt_1:occ-1");
  });

  it("agentActionDedupeKey differs for different occurrence", () => {
    const p1 = makeProposal({ occurrence: "day-1" });
    const p2 = makeProposal({ occurrence: "day-2" });
    expect(agentActionDedupeKey("collections", p1)).not.toBe(
      agentActionDedupeKey("collections", p2),
    );
  });

  it("agentActionDedupeKey differs for different agent", () => {
    const p = makeProposal();
    expect(agentActionDedupeKey("collections", p)).not.toBe(
      agentActionDedupeKey("fleet_readiness", p),
    );
  });
});

// ---------------------------------------------------------------------------
// Task-creating action classification
// ---------------------------------------------------------------------------

describe("AI Agent — task-creating action classification", () => {
  it("task-creating actions are correctly identified", () => {
    expect(isTaskCreatingAction("create_task")).toBe(true);
    expect(isTaskCreatingAction("readiness_task")).toBe(true);
    expect(isTaskCreatingAction("service_task")).toBe(true);
    expect(isTaskCreatingAction("renewal_task")).toBe(true);
    expect(isTaskCreatingAction("missing_document_task")).toBe(true);
    expect(isTaskCreatingAction("create_attention_item")).toBe(true);
  });

  it("non-task-creating actions are correctly identified", () => {
    expect(isTaskCreatingAction("prepare_message")).toBe(false);
    expect(isTaskCreatingAction("send_external_message")).toBe(false);
    expect(isTaskCreatingAction("prepare_classification")).toBe(false);
    expect(isTaskCreatingAction("flag_duplicate")).toBe(false);
    expect(isTaskCreatingAction("approve_settlement")).toBe(false);
  });

  it("TASK_CREATING_ACTIONS is a bounded set (no arbitrary mutation)", () => {
    expect(TASK_CREATING_ACTIONS.size).toBeLessThan(10);
    expect(
      TASK_CREATING_ACTIONS.has("arbitrary_update_database" as never),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status type coverage (compile-time safety)
// ---------------------------------------------------------------------------

describe("AI Agent — status enums", () => {
  it("AgentRunStatus covers all lifecycle states", () => {
    const statuses: AgentRunStatus[] = [
      "queued",
      "running",
      "completed",
      "needs_approval",
      "partially_completed",
      "failed",
      "cancelled",
    ];
    expect(statuses.length).toBe(7);
  });

  it("AgentActionStatus covers all action states", () => {
    const statuses: AgentActionStatus[] = [
      "suggested",
      "drafted",
      "awaiting_approval",
      "approved",
      "executed",
      "rejected",
      "failed",
      "cancelled",
    ];
    expect(statuses.length).toBe(8);
  });

  it("AgentMode covers observe / prepare / execute_with_approval", () => {
    const modes: AgentMode[] = ["observe", "prepare", "execute_with_approval"];
    expect(modes.length).toBe(3);
  });
});
