import { useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import {
  PageHeader,
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { RouteLine } from "@/components/RouteLine";
import { StatusPill } from "@/components/Status";
import { fmtDate, fmtMoneyExact } from "@/lib/format";
import { contributionSummary } from "@/lib/partnership";
import { openSettlementStatement } from "@/lib/investorSettlementPdf";
import { AddPairingDialog } from "./investors/AddPairingDialog";
import { EditCompensationDialog } from "./investors/EditCompensationDialog";
import { GenerateSettlementDialog } from "./investors/GenerateSettlementDialog";
import {
  AddOperatingCostDialog,
  AddRepairCostDialog,
} from "./investors/CostDialogs";
import { InvestorVehicleCard } from "./investors/InvestorVehicleCard";
import { ArrowLeft, Plus, Car } from "lucide-react";
import { toast } from "sonner";

export default function InvestorDetail() {
  const { id } = useParams();
  const {
    investors,
    investorVehicles,
    vehicleOperatingCosts,
    vehicleRepairCosts,
    settlements,
    addInvestorVehicle,
    removeInvestorVehicle,
    updatePairingCompensation,
    addVehicleOperatingCost,
    removeVehicleOperatingCost,
    addVehicleRepairCost,
    removeVehicleRepairCost,
    generateSettlement,
    markSettlementPaid,
  } = useInvestors();
  const { contributionsForInvestor } = usePartnerships();
  const { vehicles, transactions, companyInfo, staff, roles, currentStaffId } =
    useStore();
  const investorContributions = id ? contributionsForInvestor(id) : [];

  const investor = investors.find((i) => i.id === id);

  const [showPairing, setShowPairing] = useState(false);
  const [genForVehicle, setGenForVehicle] = useState<string | null>(null);
  const [costForVehicle, setCostForVehicle] = useState<{
    vehicleId: string;
    kind: "operating" | "repair";
  } | null>(null);
  const [editPairing, setEditPairing] = useState<string | null>(null);

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canViewFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.view_financials",
  );
  const canManageAgreements = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.manage_agreements",
  );
  const canGenerateSettlements = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.generate_settlements",
  );
  const canFinalizeSettlements = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.finalize_settlements",
  );

  if (!investor) {
    return (
      <div className="space-y-6">
        <Link
          to="/investors"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} /> Back to investors
        </Link>
        <EmptyState
          title="Investor not found"
          hint="This investor may have been removed."
        />
      </div>
    );
  }

  const pairings = investorVehicles.filter(
    (iv) => iv.investor_id === investor.id,
  );
  const takenVehicleIds = pairings.map((p) => p.vehicle_id);
  const invSettlements = settlements
    .filter((s) => s.investor_id === investor.id)
    .sort((a, b) => (a.period_start < b.period_start ? 1 : -1));

  const vehicle = (vid: string) => vehicles.find((v) => v.id === vid);
  const vehicleLabel = (vid: string) => {
    const v = vehicle(vid);
    return v ? `${v.year} ${v.make} ${v.model}` : "—";
  };

  const handleGenerate =
    (vid: string) =>
    (input: {
      periodStart: string;
      periodEnd: string;
      operatorFeePct: number;
    }) => {
      const settlement = generateSettlement({
        investorId: investor.id,
        vehicleId: vid,
        ...input,
        transactions,
      });
      if (settlement) {
        toast.success("Settlement generated.");
        setGenForVehicle(null);
        openStatement(settlement, vid);
      } else {
        toast.error("No active pairing found for that vehicle.");
      }
    };

  const openStatement = (s: (typeof settlements)[number], vid: string) => {
    const pairing = pairings.find((p) => p.vehicle_id === vid);
    const v = vehicle(vid);
    if (!pairing || !v) return;
    openSettlementStatement({
      investor,
      vehicle: v,
      pairing,
      settlement: s,
      operatingCosts: vehicleOperatingCosts.filter((c) => c.vehicle_id === vid),
      repairCosts: vehicleRepairCosts.filter((c) => c.vehicle_id === vid),
      company: companyInfo,
    });
  };

  const editingPairing = editPairing
    ? (pairings.find((p) => p.id === editPairing) ?? null)
    : null;

  return (
    <div className="space-y-8">
      <Link
        to="/investors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Back to investors
      </Link>

      <PageHeader
        title={investor.full_name}
        subtitle={
          <span className="capitalize">
            {investor.relationship} investor · joined{" "}
            {fmtDate(investor.joined_at)}
          </span>
        }
        actions={
          <StatusPill
            tone={investor.status === "active" ? "available" : "neutral"}
          >
            {investor.status === "active" ? "Active" : "Exited"}
          </StatusPill>
        }
      />

      <div className="rounded-lg border border-border bg-surface px-6 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <DataLabel>Email</DataLabel>
            <DataValue>{investor.email || "—"}</DataValue>
          </div>
          <div>
            <DataLabel>Phone</DataLabel>
            <DataValue>{investor.phone || "—"}</DataValue>
          </div>
          <div>
            <DataLabel>Joined</DataLabel>
            <DataValue mono>{fmtDate(investor.joined_at)}</DataValue>
          </div>
          <div>
            <DataLabel>Status</DataLabel>
            <DataValue className="capitalize">{investor.status}</DataValue>
          </div>
        </dl>
        <div className="mt-4 text-primary/70">
          <RouteLine width={1.5} />
        </div>
      </div>

      <SectionCard
        title="Assigned vehicles"
        right={
          <button
            onClick={() => setShowPairing(true)}
            disabled={
              vehicles.filter((v) => !takenVehicleIds.includes(v.id)).length ===
              0
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-press disabled:opacity-40"
          >
            <Plus size={14} /> Assign vehicle
          </button>
        }
      >
        {pairings.length === 0 ? (
          <EmptyState
            icon={<Car size={28} />}
            title="No vehicles assigned"
            hint="Assign a vehicle to this investor and set their revenue split."
          />
        ) : (
          <div className="space-y-4">
            {pairings.map((iv) => (
              <InvestorVehicleCard
                key={iv.id}
                iv={iv}
                vehicle={vehicle(iv.vehicle_id)}
                vocs={vehicleOperatingCosts.filter(
                  (c) => c.vehicle_id === iv.vehicle_id,
                )}
                vrcs={vehicleRepairCosts.filter(
                  (c) => c.vehicle_id === iv.vehicle_id,
                )}
                vehSettlements={invSettlements.filter(
                  (s) => s.vehicle_id === iv.vehicle_id,
                )}
                canViewFinancials={canViewFinancials}
                canManageAgreements={canManageAgreements}
                canGenerateSettlements={canGenerateSettlements}
                canFinalizeSettlements={canFinalizeSettlements}
                onRemovePairing={() => removeInvestorVehicle(iv.id)}
                onAddCost={(kind) =>
                  setCostForVehicle({ vehicleId: iv.vehicle_id, kind })
                }
                onRemoveOperatingCost={removeVehicleOperatingCost}
                onRemoveRepairCost={removeVehicleRepairCost}
                onGenerateSettlement={() => setGenForVehicle(iv.vehicle_id)}
                onOpenStatement={(s) => openStatement(s, iv.vehicle_id)}
                onMarkSettlementPaid={(sid) => {
                  markSettlementPaid(
                    sid,
                    new Date().toISOString().slice(0, 10),
                  );
                  toast.success("Settlement marked paid.");
                }}
                onEditAgreement={() => setEditPairing(iv.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Contributions — agreement metadata, not rental revenue */}
      <SectionCard title="Contributions">
        {investorContributions.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No contributions recorded for this partner.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {investorContributions.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <span className="text-foreground">
                  {contributionSummary(c)}
                  {c.vehicle_id && (
                    <span className="ml-1 text-muted-foreground">
                      · {vehicleLabel(c.vehicle_id)}
                    </span>
                  )}
                </span>
                <span className="font-mono tabular text-muted-foreground">
                  {fmtDate(c.contribution_date)}
                  {c.cash_amount ? ` · ${fmtMoneyExact(c.cash_amount)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {showPairing && (
        <AddPairingDialog
          investorId={investor.id}
          vehicles={vehicles}
          takenVehicleIds={takenVehicleIds}
          onClose={() => setShowPairing(false)}
          onSave={(iv) => {
            addInvestorVehicle(iv);
            setShowPairing(false);
            toast.success("Vehicle assigned.");
          }}
        />
      )}

      {editingPairing && (
        <EditCompensationDialog
          pairing={editingPairing}
          vehicleLabel={vehicleLabel(editingPairing.vehicle_id)}
          onClose={() => setEditPairing(null)}
          onSave={(compensation) => {
            updatePairingCompensation(editingPairing.id, compensation);
            setEditPairing(null);
            toast.success(
              "Agreement updated. Future periods use the new terms.",
            );
          }}
        />
      )}

      {genForVehicle && (
        <GenerateSettlementDialog
          vehicleLabel={vehicleLabel(genForVehicle)}
          onClose={() => setGenForVehicle(null)}
          onGenerate={handleGenerate(genForVehicle)}
        />
      )}

      {costForVehicle?.kind === "operating" && (
        <AddOperatingCostDialog
          vehicleId={costForVehicle.vehicleId}
          onClose={() => setCostForVehicle(null)}
          onSave={(c) => {
            addVehicleOperatingCost(c);
            setCostForVehicle(null);
          }}
        />
      )}
      {costForVehicle?.kind === "repair" && (
        <AddRepairCostDialog
          vehicleId={costForVehicle.vehicleId}
          onClose={() => setCostForVehicle(null)}
          onSave={(c) => {
            addVehicleRepairCost(c);
            setCostForVehicle(null);
          }}
        />
      )}
    </div>
  );
}
