// Connect Pro Fleet — Damage Claims page (Build #17).
// List + KPIs + filters + detail dialog + create dialog. Permission-aware.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  CLAIM_STATUSES,
  toneClass,
  claimStatusTone,
  statusLabel,
  sourceLabel,
} from "./damageClaims/shared";
import { CreateClaimDialog } from "./damageClaims/CreateClaimDialog";
import { ClaimDetail } from "./damageClaims/ClaimDetail";

type Tab = "open" | "under_review" | "repair" | "recovery" | "closed" | "all";

export default function DamageClaims() {
  const store = useStore();
  const dc = useDamageClaims();
  const [tab, setTab] = useState<Tab>("open");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const role = store.roles.find(
    (r) =>
      r.name === store.staff.find((s) => s.id === store.currentStaffId)?.role,
  );
  const overrides = store.staff.find((s) => s.id === store.currentStaffId)
    ?.permission_overrides as Record<string, unknown> | null;
  const canView = can(role, overrides, "damage_claims.view");
  const canCreate = can(role, overrides, "damage_claims.create");
  const canViewFinancials = can(
    role,
    overrides,
    "damage_claims.view_financials",
  );
  const canChargeCustomer = can(
    role,
    overrides,
    "damage_claims.charge_customer",
  );
  const canApplyDeposit = can(role, overrides, "damage_claims.apply_deposit");
  const canManageInsurance = can(
    role,
    overrides,
    "damage_claims.manage_insurance",
  );
  const canDetermineResp = can(
    role,
    overrides,
    "damage_claims.determine_responsibility",
  );
  const canClose = can(role, overrides, "damage_claims.close");
  const canCancel = can(role, overrides, "damage_claims.cancel");
  const canManageEvidence = can(
    role,
    overrides,
    "damage_claims.manage_evidence",
  );

  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown vehicle";
  };
  const customerName = (id: string | null) =>
    id ? store.customerName(id) : "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dc.damageClaims
      .filter((c) => {
        if (tab === "all") return true;
        if (tab === "open")
          return ["open", "customer_responsible"].includes(c.claim_status);
        if (tab === "under_review") return c.claim_status === "under_review";
        if (tab === "repair")
          return ["repair_in_progress"].includes(c.claim_status);
        if (tab === "recovery")
          return ["recovery_pending", "insurance_pending"].includes(
            c.claim_status,
          );
        if (tab === "closed")
          return ["resolved", "closed", "cancelled"].includes(c.claim_status);
        return true;
      })
      .filter((c) => {
        if (!q) return true;
        return (
          c.claim_number.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          vehicleLabel(c.vehicle_id).toLowerCase().includes(q) ||
          customerName(c.customer_id).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.discovered_at < b.discovered_at ? 1 : -1));
  }, [dc.damageClaims, tab, search, vehicleLabel, customerName]);

  const openCount = dc.damageClaims.filter((c) =>
    ["open", "under_review", "customer_responsible"].includes(c.claim_status),
  ).length;
  const reviewCount = dc.damageClaims.filter(
    (c) => c.claim_status === "under_review",
  ).length;
  const repairCount = dc.damageClaims.filter(
    (c) => c.claim_status === "repair_in_progress",
  ).length;
  const recoveryCount = dc.damageClaims.filter((c) =>
    ["recovery_pending", "insurance_pending"].includes(c.claim_status),
  ).length;

  const activeClaim = dc.damageClaims.find((c) => c.id === detail) ?? null;

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Damage claims"
          subtitle="Track damage incidents, responsibility, and recovery."
        />
        <EmptyState
          title="Damage claims restricted"
          hint="You don't have permission to view damage claims."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Damage claims"
        subtitle="Track damage from discovery through responsibility, repair, and recovery — without a second financial system."
        actions={
          canCreate && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Create claim
            </Button>
          )
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open claims" value={String(openCount)} />
        <Kpi label="Awaiting review" value={String(reviewCount)} />
        <Kpi label="Repair in progress" value={String(repairCount)} />
        <Kpi label="Recovery pending" value={String(recoveryCount)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(
          [
            { key: "open", label: `Open (${openCount})` },
            { key: "under_review", label: `Under review (${reviewCount})` },
            { key: "repair", label: `Repair (${repairCount})` },
            { key: "recovery", label: `Recovery (${recoveryCount})` },
            { key: "closed", label: "Resolved / closed" },
            { key: "all", label: "All" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setDetail(null);
            }}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search claims, vehicles, customers…"
          className="max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No damage claims"
          hint="Create a claim to track a damage incident from discovery through recovery."
          action={
            canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                Create claim
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((claim) => {
            const economics = getDamageClaimEconomics(claim, {
              transactions: store.transactions,
              expenses: store.expenses,
              recoveries: dc.damageRecoveries,
            });
            return (
              <button
                key={claim.id}
                onClick={() => setDetail(claim.id)}
                className={cn(
                  "status-border w-full rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2",
                  toneClass[claimStatusTone[claim.claim_status]],
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-foreground">
                        {claim.claim_number}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {statusLabel(claim.claim_status)}
                      </span>
                      {claim.blocks_vehicle_use && (
                        <span className="rounded bg-status-out/10 px-1.5 py-0.5 text-[11px] text-status-out">
                          Out of service
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {claim.description}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {vehicleLabel(claim.vehicle_id)} ·{" "}
                      {fmtDate(claim.discovered_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    {canViewFinancials && economics.estimated_cost != null && (
                      <p className="font-mono text-sm tabular text-foreground">
                        est {fmtMoney(economics.estimated_cost)}
                      </p>
                    )}
                    {canViewFinancials && economics.actual_cost != null && (
                      <p className="font-mono text-xs text-muted-foreground">
                        actual {fmtMoney(economics.actual_cost)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeClaim && (
        <ClaimDetail
          claim={activeClaim}
          onClose={() => setDetail(null)}
          canViewFinancials={canViewFinancials}
          canChargeCustomer={canChargeCustomer}
          canApplyDeposit={canApplyDeposit}
          canManageInsurance={canManageInsurance}
          canDetermineResponsibility={canDetermineResp}
          canClose={canClose}
          canCancel={canCancel}
          canManageEvidence={canManageEvidence}
        />
      )}

      {createOpen && (
        <CreateClaimDialog
          vehicles={store.vehicles}
          rentals={store.rentals}
          staff={store.staff}
          onClose={() => setCreateOpen(false)}
          onSave={(input) => {
            dc.createClaim(input);
            toast.success("Damage claim created.");
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular text-foreground">
        {value}
      </p>
    </div>
  );
}
