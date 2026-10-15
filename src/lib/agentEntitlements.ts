// Connect Pro Fleet — AI entitlements + usage metering helpers (Build #AI).
//
// SaaS billing separation: AI usage charges belong to Connect Pro's
// subscription/billing infrastructure, NOT the rental operator's business
// Expense Ledger. The tenant sees only the customer billable amount; the
// internal provider cost (what Connect Pro pays the AI vendor) is tracked
// internally and NEVER exposed to the tenant.
//
// V1 builds the entitlement architecture, usage ledger, allowance/overage
// calculation, and UI. Live SaaS overage charging (actually charging a card)
// is NOT connected — there is no production billing integration yet. We do
// NOT fake card charging.

import type {
  AIEntitlement,
  AITenantUsageSummary,
  AIUsageRecord,
  AgentType,
  UsageAlertThreshold,
} from "./agentTypes";
import { ALL_AGENT_TYPES } from "./agentRegistry";

/** Default V1 entitlement. Clearly labeled as dev/demo — not final marketing.
 *  Agents are opt-in; the included allowance is a placeholder dev value. */
export const DEFAULT_AI_ENTITLEMENT: AIEntitlement = {
  copilot_available: true,
  agents_available: true,
  included_agents: ALL_AGENT_TYPES,
  agents_addon_available: true,
  included_allowance: 25,
  overage_available: true,
  overage_enabled: false,
  spending_cap: 0,
  // V1: no live SaaS overage billing connected (we do NOT fake card charging).
  saas_billing_connected: false,
  is_dev: true,
};

/** Whether a specific agent type is permitted by the entitlement. */
export function isAgentEntitled(ent: AIEntitlement, type: AgentType): boolean {
  if (!ent.agents_available) return false;
  return ent.included_agents.includes(type);
}

/** Current billing period key (YYYY-MM in V1; aligns with tenant billing period
 *  when billing infrastructure exists). */
export function currentBillingPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Sum billable usage for a billing period (tenant-facing; provider cost
 *  intentionally excluded). */
export function periodUsage(
  records: AIUsageRecord[],
  tenantId: string,
  period: string,
): number {
  return records
    .filter((r) => r.tenant_id === tenantId && r.billing_period === period)
    .reduce((sum, r) => sum + r.billable_amount, 0);
}

/** Per-agent billable usage for a period. */
export function periodUsageByAgent(
  records: AIUsageRecord[],
  tenantId: string,
  period: string,
): { agent_type: AgentType | "copilot"; billable_amount: number }[] {
  const map = new Map<AgentType | "copilot", number>();
  for (const r of records) {
    if (r.tenant_id !== tenantId || r.billing_period !== period) continue;
    map.set(r.agent_type, (map.get(r.agent_type) ?? 0) + r.billable_amount);
  }
  return Array.from(map.entries()).map(([agent_type, billable_amount]) => ({
    agent_type,
    billable_amount,
  }));
}

/** Build the tenant-facing usage summary. Provider cost is NEVER included. */
export function buildUsageSummary(
  ent: AIEntitlement,
  records: AIUsageRecord[],
  tenantId: string,
  now: Date = new Date(),
): AITenantUsageSummary {
  const period = currentBillingPeriod(now);
  const used = periodUsage(records, tenantId, period);
  const included = ent.included_allowance;
  const overage = used > included ? used - included : 0;
  const remaining = Math.max(0, included - used);
  const cap = ent.spending_cap;
  const cap_reached = cap > 0 && used >= cap;

  // Highest alert threshold crossed (50/75/90/100).
  let alert_threshold: UsageAlertThreshold | null = null;
  if (included > 0) {
    const pct = (used / included) * 100;
    if (pct >= 100) alert_threshold = 100;
    else if (pct >= 90) alert_threshold = 90;
    else if (pct >= 75) alert_threshold = 75;
    else if (pct >= 50) alert_threshold = 50;
  }

  return {
    billing_period: period,
    included_allowance: included,
    used,
    remaining,
    overage: ent.overage_enabled ? overage : 0,
    by_agent: periodUsageByAgent(records, tenantId, period),
    cap_reached,
    alert_threshold,
    is_dev: ent.is_dev,
  };
}

/** Whether billable AI should be paused (cap reached and overage not enabled,
 *  or no allowance at all). Agents pause billable AI rather than silently
 *  charging overage the tenant has not accepted. */
export function shouldPauseBillableAI(
  ent: AIEntitlement,
  summary: AITenantUsageSummary,
): boolean {
  if (ent.spending_cap > 0 && summary.used >= ent.spending_cap) {
    // Cap reached: pause unless overage explicitly enabled.
    return !ent.overage_enabled;
  }
  if (
    ent.included_allowance > 0 &&
    summary.used >= ent.included_allowance &&
    !ent.overage_enabled
  ) {
    return true;
  }
  return false;
}
