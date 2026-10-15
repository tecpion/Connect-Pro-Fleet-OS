// Connect Pro Fleet — investor vehicle pairing card (Build #6 cleanup).
// Extracted from InvestorDetail so the detail page stays under the line limit
// and the per-vehicle agreement editing lives in one focused component.

import type {
  InvestorVehicle,
  Settlement,
  VehicleOperatingCost,
  VehicleRepairCost,
} from "@/lib/investorTypes";
import type { Vehicle } from "@/lib/types";
import { StatusPill } from "@/components/Status";
import { fmtMoney, fmtMoneyExact, fmtDate } from "@/lib/format";
import { compensationTypeLabel } from "@/lib/ownership";
import {
  Trash2,
  FileDown,
  CheckCircle2,
  Plus,
  Receipt,
  Pencil,
} from "lucide-react";

const costTypeLabel: Record<string, string> = {
  insurance: "Insurance",
  gps_tracker: "GPS Tracker",
  maintenance: "Maintenance",
  other: "Other",
};

export function InvestorVehicleCard({
  iv,
  vehicle,
  vocs,
  vrcs,
  vehSettlements,
  canViewFinancials,
  canManageAgreements,
  canGenerateSettlements,
  canFinalizeSettlements,
  onRemovePairing,
  onAddCost,
  onRemoveOperatingCost,
  onRemoveRepairCost,
  onGenerateSettlement,
  onOpenStatement,
  onMarkSettlementPaid,
  onEditAgreement,
}: {
  iv: InvestorVehicle;
  vehicle: Vehicle | undefined;
  vocs: VehicleOperatingCost[];
  vrcs: VehicleRepairCost[];
  vehSettlements: Settlement[];
  canViewFinancials: boolean;
  canManageAgreements: boolean;
  canGenerateSettlements: boolean;
  canFinalizeSettlements: boolean;
  onRemovePairing: () => void;
  onAddCost: (kind: "operating" | "repair") => void;
  onRemoveOperatingCost: (id: string) => void;
  onRemoveRepairCost: (id: string) => void;
  onGenerateSettlement: () => void;
  onOpenStatement: (s: Settlement) => void;
  onMarkSettlementPaid: (id: string) => void;
  onEditAgreement: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-semibold text-foreground">
            {vehicle
              ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
              : "Unknown vehicle"}
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {vehicle?.license_plate ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canViewFinancials && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Compensation
              </p>
              <p className="font-mono text-sm tabular text-foreground">
                {compensationTypeLabel(iv)}
              </p>
            </div>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
            {iv.ownership_type}
          </span>
          {canManageAgreements && (
            <button
              onClick={onEditAgreement}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-2"
              aria-label="Manage agreement"
            >
              <Pencil size={12} /> Manage
            </button>
          )}
          <button
            onClick={onRemovePairing}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove vehicle assignment"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Operating + repair costs */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Operating costs
            </p>
            <button
              onClick={() => onAddCost("operating")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {vocs.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No recurring costs.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {vocs.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="text-foreground">
                    {costTypeLabel[c.cost_type]} ·{" "}
                    <span className="text-muted-foreground">
                      {c.responsibility === "operator_pays"
                        ? "operator"
                        : "investor"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular text-foreground">
                      {fmtMoneyExact(c.monthly_amount)}/mo
                    </span>
                    <button
                      onClick={() => onRemoveOperatingCost(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove cost"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Repair costs
            </p>
            <button
              onClick={() => onAddCost("repair")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {vrcs.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No repair costs logged.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs">
              {vrcs.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="text-foreground">
                    {c.description} ·{" "}
                    <span className="text-muted-foreground">
                      {fmtDate(c.incurred_date)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular text-foreground">
                      {fmtMoneyExact(c.amount)}
                    </span>
                    <button
                      onClick={() => onRemoveRepairCost(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove repair"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Settlements */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Receipt size={13} /> Settlements
          </p>
          {canGenerateSettlements && (
            <button
              onClick={onGenerateSettlement}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus size={12} /> Generate settlement
            </button>
          )}
        </div>
        {vehSettlements.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No settlements generated yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {vehSettlements.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-mono tabular text-foreground">
                    {fmtDate(s.period_start)} → {fmtDate(s.period_end)}
                  </p>
                  {canViewFinancials && (
                    <p className="text-muted-foreground">
                      Gross {fmtMoney(s.gross_revenue)} · payout{" "}
                      <span className="font-mono tabular text-foreground">
                        {fmtMoneyExact(s.investor_payout_amount)}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill
                    tone={
                      s.payout_status === "paid" ? "available" : "maintenance"
                    }
                  >
                    {s.payout_status === "paid" ? "Paid" : "Pending"}
                  </StatusPill>
                  <button
                    onClick={() => onOpenStatement(s)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface-2"
                  >
                    <FileDown size={12} /> Statement
                  </button>
                  {s.payout_status === "pending" && canFinalizeSettlements && (
                    <button
                      onClick={() => onMarkSettlementPaid(s.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-press"
                    >
                      <CheckCircle2 size={12} /> Mark paid
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
