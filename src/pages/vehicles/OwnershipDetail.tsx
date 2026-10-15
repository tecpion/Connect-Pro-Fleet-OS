// Connect Pro Fleet — vehicle ownership detail section (Build #6).
//
// Shows WHO owns the vehicle (asset fact) and HOW the owner/partner is
// compensated (business agreement on the pairing). Compensation is per
// vehicle relationship, not per investor. Sensitive payout details are gated
// behind the view_investor_financials permission by the caller (the parent
// page renders this only when appropriate).

import { Link } from "@/lib/router-compat";
import type { Vehicle } from "@/lib/types";
import type { Investor, InvestorVehicle } from "@/lib/investorTypes";
import type { OwnershipChangeRecord } from "@/lib/ownershipTypes";
import {
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import {
  ownershipTypeLabel,
  getVehicleCompensation,
  getVehicleInvestorRelationship,
} from "@/lib/ownership";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import { ExternalLink } from "lucide-react";

export function OwnershipDetail({
  vehicle,
  investors,
  investorVehicles,
  ownershipHistory,
  canViewFinancials = true,
}: {
  vehicle: Vehicle;
  investors: Investor[];
  investorVehicles: InvestorVehicle[];
  ownershipHistory: OwnershipChangeRecord[];
  canViewFinancials?: boolean;
}) {
  const pairing = getVehicleInvestorRelationship(vehicle.id, investorVehicles);
  const owner = investors.find((i) => i.id === vehicle.owner_entity_id);
  const compensation = pairing ? getVehicleCompensation(pairing) : null;

  return (
    <SectionCard title="Ownership">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <DataLabel>Type</DataLabel>
          <DataValue>{ownershipTypeLabel(vehicle)}</DataValue>
        </div>
        <div>
          <DataLabel>Owner</DataLabel>
          <DataValue>
            {owner ? (
              <Link
                to={`/investors/${owner.id}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {owner.full_name}
                <ExternalLink size={12} />
              </Link>
            ) : (
              (vehicle.owner_display_name ?? "—")
            )}
          </DataValue>
        </div>
        <div>
          <DataLabel>Relationship since</DataLabel>
          <DataValue mono>
            {vehicle.ownership_effective_date
              ? fmtDate(vehicle.ownership_effective_date)
              : "—"}
          </DataValue>
        </div>
        {vehicle.ownership_notes && (
          <div>
            <DataLabel>Notes</DataLabel>
            <DataValue>{vehicle.ownership_notes}</DataValue>
          </div>
        )}
      </dl>

      {compensation && canViewFinancials && (
        <div className="mt-5 rounded-md border border-border bg-surface-2 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Compensation
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <DataLabel>Type</DataLabel>
              <DataValue className="capitalize">{compensation.type}</DataValue>
            </div>
            {compensation.type === "percentage" && (
              <>
                <div>
                  <DataLabel>Basis</DataLabel>
                  <DataValue className="capitalize">
                    {compensation.basis}
                  </DataValue>
                </div>
                <div>
                  <DataLabel>Investor</DataLabel>
                  <DataValue mono>
                    {compensation.investor_percentage}%
                  </DataValue>
                </div>
                <div>
                  <DataLabel>Operator</DataLabel>
                  <DataValue mono>
                    {compensation.operator_percentage}%
                  </DataValue>
                </div>
              </>
            )}
            {compensation.type === "fixed" && (
              <>
                <div>
                  <DataLabel>Amount</DataLabel>
                  <DataValue mono>
                    {fmtMoneyExact(compensation.fixed_amount)}
                  </DataValue>
                </div>
                <div>
                  <DataLabel>Frequency</DataLabel>
                  <DataValue className="capitalize">
                    {compensation.fixed_frequency}
                  </DataValue>
                </div>
                <div>
                  <DataLabel>Guaranteed (not rented)</DataLabel>
                  <DataValue>
                    {compensation.guaranteed_when_not_rented ? "Yes" : "No"}
                  </DataValue>
                </div>
                <div>
                  <DataLabel>Guaranteed (downtime)</DataLabel>
                  <DataValue>
                    {compensation.guaranteed_during_downtime ? "Yes" : "No"}
                  </DataValue>
                </div>
              </>
            )}
            {compensation.type === "custom" && (
              <div className="col-span-2 sm:col-span-3">
                <DataLabel>Agreement</DataLabel>
                <DataValue>{compensation.description}</DataValue>
              </div>
            )}
          </dl>
          {compensation.type === "custom" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Custom arrangement — automated settlement calculation comes in the
              next investor build.
            </p>
          )}
        </div>
      )}

      {compensation && !canViewFinancials && (
        <p className="mt-5 rounded-md border border-dashed border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
          Compensation details restricted. You need investor financial
          permission to view payout terms.
        </p>
      )}

      {ownershipHistory.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ownership history
          </p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {ownershipHistory.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <span className="text-foreground">
                  {o.old_ownership_type ? "Changed" : "Assigned"} ·{" "}
                  <span className="capitalize">
                    {o.old_ownership_type ?? "—"} → {o.new_ownership_type}
                  </span>
                </span>
                <span className="font-mono tabular text-muted-foreground">
                  {fmtDate(o.effective_date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!pairing && vehicle.ownership_type === "company_owned" && (
        <p className="mt-4 text-xs text-muted-foreground">
          Company-owned vehicle — no investor relationship required.
        </p>
      )}
    </SectionCard>
  );
}
