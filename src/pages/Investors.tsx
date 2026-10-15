import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { useInvestors } from "@/lib/investorStore";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { RouteLine } from "@/components/RouteLine";
import { StatusPill } from "@/components/Status";
import { fmtMoney, fmtDate } from "@/lib/format";
import { compensationTypeLabel } from "@/lib/ownership";
import { PartnershipWizard } from "./investors/wizard/PartnershipWizard";
import { Plus, Users, Mail, Phone } from "lucide-react";

export default function Investors() {
  const { investors, investorVehicles, settlements } = useInvestors();
  const { vehicles, staff, roles, currentStaffId } = useStore();
  const [showWizard, setShowWizard] = useState(false);

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canViewFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.view_financials",
  );
  const canCreate = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.create_partnership",
  );

  const vehicleLabel = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "—";
  };

  // Total investor payouts across all settlements.
  const totalPayout = settlements.reduce(
    (s, x) => s + x.investor_payout_amount,
    0,
  );
  const pendingPayouts = settlements.filter(
    (s) => s.payout_status === "pending",
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Investors"
        subtitle="Staff-managed investor and JV vehicle assignments, costs, and settlement statements."
        actions={
          canCreate ? (
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-press focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Plus size={16} />
              Add investor / JV partner
            </button>
          ) : undefined
        }
      />

      {/* Route-line flourish — signature element on investor statements */}
      <div className="rounded-lg border border-border bg-surface px-6 py-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-foreground">
            Connect Pro Fleet · Investor overview
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {investors.length} investors · {investorVehicles.length} vehicle
            pairings
          </p>
        </div>
        <div className="mt-3 text-primary">
          <RouteLine animated width={2} />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active investors
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular text-foreground">
            {investors.filter((i) => i.status === "active").length}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total payouts
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular text-foreground">
            {canViewFinancials ? fmtMoney(totalPayout) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending settlements
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular text-foreground">
            {pendingPayouts}
          </p>
        </div>
      </div>

      <SectionCard title="Investors">
        {investors.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="No investors yet"
            hint="Set up an investor / JV partnership to assign vehicles, splits, and compensation."
            action={
              canCreate ? (
                <button
                  onClick={() => setShowWizard(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary-press"
                >
                  <Plus size={15} />
                  Add investor / JV partner
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto lg:block">
            <table className="hidden w-full text-sm lg:table">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Investor</th>
                  <th className="px-3 py-2 font-medium">Relationship</th>
                  <th className="px-3 py-2 font-medium">Vehicles</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Payouts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {investors.map((inv) => {
                  const pairings = investorVehicles.filter(
                    (iv) => iv.investor_id === inv.id && iv.active,
                  );
                  const invSettlements = settlements.filter(
                    (s) => s.investor_id === inv.id,
                  );
                  const payout = invSettlements.reduce(
                    (s, x) => s + x.investor_payout_amount,
                    0,
                  );
                  return (
                    <tr key={inv.id} className="hover:bg-surface-2">
                      <td className="px-3 py-3">
                        <Link
                          to={`/investors/${inv.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {inv.full_name}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {inv.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail size={11} /> {inv.email}
                            </span>
                          )}
                          {inv.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone size={11} /> {inv.phone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 capitalize text-foreground">
                        {inv.relationship}
                      </td>
                      <td className="px-3 py-3">
                        {pairings.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {pairings.map((iv) => (
                              <li
                                key={iv.id}
                                className="font-mono text-xs tabular text-muted-foreground"
                              >
                                {vehicleLabel(iv.vehicle_id)}
                                {canViewFinancials
                                  ? ` · ${compensationTypeLabel(iv)}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular text-muted-foreground">
                        {fmtDate(inv.joined_at)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          tone={
                            inv.status === "active" ? "available" : "neutral"
                          }
                        >
                          {inv.status === "active" ? "Active" : "Exited"}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular text-foreground">
                        {canViewFinancials ? fmtMoney(payout) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Mobile cards */}
            <div className="space-y-2.5 lg:hidden">
              {investors.map((inv) => {
                const pairings = investorVehicles.filter(
                  (iv) => iv.investor_id === inv.id && iv.active,
                );
                const invSettlements = settlements.filter(
                  (s) => s.investor_id === inv.id,
                );
                const payout = invSettlements.reduce(
                  (s, x) => s + x.investor_payout_amount,
                  0,
                );
                return (
                  <Link
                    key={inv.id}
                    to={`/investors/${inv.id}`}
                    className="block rounded-lg border border-border bg-surface p-3 hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {inv.full_name}
                        </p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {inv.relationship} · joined {fmtDate(inv.joined_at)}
                        </p>
                      </div>
                      <StatusPill
                        tone={inv.status === "active" ? "available" : "neutral"}
                      >
                        {inv.status === "active" ? "Active" : "Exited"}
                      </StatusPill>
                    </div>
                    {pairings.length > 0 && (
                      <p className="mt-1.5 font-mono text-xs tabular text-muted-foreground">
                        {pairings.length} vehicle
                        {pairings.length === 1 ? "" : "s"}
                        {canViewFinancials
                          ? ` · ${compensationTypeLabel(pairings[0])}`
                          : ""}
                      </p>
                    )}
                    {canViewFinancials && (
                      <p className="mt-1 font-mono text-sm tabular text-foreground">
                        {fmtMoney(payout)} payouts
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {showWizard && <PartnershipWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
