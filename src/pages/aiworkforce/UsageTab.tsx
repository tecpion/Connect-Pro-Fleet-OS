// Connect Pro Fleet — Fleet Copilot Usage tab (Build #43 / #47 UX polish).
//
// Transparent customer-facing AI usage: Included Allowance, Used, Remaining,
// Overage, Spending Cap, Billing Period. Per-automation breakdown with action
// counts + drilldown by date/run. Usage alerts (50/75/90/100). Overage
// disabled → "Fleet Copilot Paused for Billable Actions". Spending-cap
// presets. Provider cost is NEVER exposed to the tenant. SaaS AI billing is
// separate from the rental operator's business Expense Ledger.

import { useState } from "react";
import { useAgentStore } from "@/lib/agentStoreProvider";
import { getAgentDefinition } from "@/lib/agentRegistry";
import { buildUsageSummary } from "@/lib/agentEntitlements";
import { TENANT_ID } from "@/lib/store/ids";
import { EmptyState, SectionCard } from "@/components/ui-bits";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { AgentId } from "@/lib/agentTypes";
import { InfoBanner, MiniMetric, SummaryKpi } from "./WorkspacePrimitives";

export function UsageTab({
  usage,
  entitlement,
  billablePaused,
  canViewUsage,
  usageRecords,
  onSetCap,
  onSetOverage,
}: {
  usage: ReturnType<
    ReturnType<typeof useAgentStore>["tenantUsageSummary"]
  > | null;
  entitlement: ReturnType<typeof useAgentStore>["entitlement"];
  billablePaused: boolean;
  canViewUsage: boolean;
  usageRecords: ReturnType<typeof useAgentStore>["usageRecords"];
  onSetCap: (cap: number | null) => void;
  onSetOverage: (enabled: boolean) => void;
}) {
  const [showDrilldown, setShowDrilldown] = useState<string | null>(null);

  if (!canViewUsage || !usage) {
    return (
      <EmptyState
        title="AI usage not available"
        hint="You don't have permission to view AI usage and billing."
        icon={<Sparkles size={22} />}
      />
    );
  }

  const summary = buildUsageSummary(entitlement, usageRecords, TENANT_ID);
  const alertPct = summary.alert_threshold;
  const period = usage.billingPeriod;

  return (
    <div className="space-y-6">
      {entitlement.is_dev && (
        <InfoBanner>
          <AlertTriangle size={14} className="mr-1.5 inline" />
          Development/demo entitlement — usage values are placeholder data, not
          live billing. Live SaaS overage charging is not connected.
        </InfoBanner>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryKpi
          label="Included Allowance"
          value={fmtMoney(usage.includedAllowance)}
          icon={<Sparkles size={16} />}
        />
        <SummaryKpi
          label="Used This Period"
          value={fmtMoney(usage.used)}
          icon={<Activity size={16} />}
        />
        <SummaryKpi
          label="Remaining"
          value={fmtMoney(usage.remaining)}
          icon={<CheckCircle2 size={16} />}
          tone="primary"
        />
        <SummaryKpi
          label="Overage"
          value={fmtMoney(usage.overage)}
          icon={<Clock size={16} />}
          tone={usage.overage > 0 ? "out" : "neutral"}
        />
      </div>

      {alertPct && (
        <InfoBanner tone={alertPct >= 100 ? "amber" : "blue"}>
          <AlertTriangle size={14} className="mr-1.5 inline" />
          You've used {alertPct}% of your monthly AI allowance.
        </InfoBanner>
      )}

      {billablePaused && (
        <InfoBanner>
          <ShieldAlert size={14} className="mr-1.5 inline" />
          Fleet Copilot Paused for Billable Actions — spending cap reached and
          overage is not enabled. Enable overage to continue billable
          automations.
        </InfoBanner>
      )}

      <SectionCard
        title="Spending cap & overage"
        icon={<ShieldAlert size={16} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Monthly Spending Cap
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-foreground">
              {entitlement.spending_cap > 0
                ? fmtMoney(entitlement.spending_cap)
                : "None"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[25, 50, 100, 250].map((preset) => (
                <button
                  key={preset}
                  onClick={() => onSetCap(preset)}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    entitlement.spending_cap === preset
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {fmtMoney(preset)}
                </button>
              ))}
              <button
                onClick={() => onSetCap(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                None
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Overage
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-foreground">
              {entitlement.overage_enabled ? "Allowed" : "Disabled"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {entitlement.overage_enabled
                ? "Usage beyond included allowance is permitted."
                : "Billable AI pauses when allowance/cap is reached."}
            </p>
            <div className="mt-2">
              <button
                onClick={() => onSetOverage(!entitlement.overage_enabled)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
              >
                {entitlement.overage_enabled
                  ? "Disable overage"
                  : "Allow overage"}
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Usage by automation" icon={<Bot size={16} />}>
        <div className="divide-y divide-border">
          {Object.entries(usage.byAgent).length === 0 && (
            <p className="px-6 py-4 text-sm text-muted-foreground">
              No usage recorded this period.
            </p>
          )}
          {Object.entries(usage.byAgent).map(([agent, amount]) => {
            const def = getAgentDefinition(agent as AgentId);
            const agentRecords = usageRecords.filter(
              (r) => r.agent_type === agent && r.billing_period === period,
            );
            const actionCount = agentRecords.length;
            return (
              <div
                key={agent}
                className="flex items-center justify-between px-6 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {def?.name ?? agent}
                  </span>
                  {actionCount > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {actionCount} action{actionCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {fmtMoney(amount)}
                  </span>
                  <button
                    onClick={() =>
                      setShowDrilldown(showDrilldown === agent ? null : agent)
                    }
                    className="text-xs text-primary hover:underline"
                  >
                    {showDrilldown === agent ? "Hide" : "Details"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {showDrilldown && (
          <div className="border-t border-border bg-surface-2/40 px-6 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Usage detail — {showDrilldown}
            </p>
            <div className="space-y-1.5">
              {usageRecords
                .filter(
                  (r) =>
                    r.agent_type === showDrilldown &&
                    r.billing_period === period,
                )
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      {fmtDateTime(r.timestamp)} · {r.run_id ?? "—"}
                    </span>
                    <span className="font-medium text-foreground">
                      {fmtMoney(r.billable_amount)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Billing period" icon={<Clock size={16} />}>
        <div className="px-6 py-4 text-sm text-muted-foreground">
          {usage.billingPeriod}
        </div>
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        AI usage charges belong to Connect Pro's subscription/billing
        infrastructure — they are separate from your rental business Expense
        Ledger. Provider cost is tracked internally and never exposed.
      </p>
    </div>
  );
}
