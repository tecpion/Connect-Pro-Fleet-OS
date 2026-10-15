// Connect Pro Fleet — guided Investor / JV setup wizard (Build #7).
//
// Composes the 6 step components into a wizard. Submit calls the ONE atomic
// createInvestorPartnership orchestration (idempotent via requestKey). Mobile-
// first: one question group per step, sticky Back/Continue, route-line progress.

import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RouteProgress } from "@/components/RouteLine";
import { useStore } from "@/lib/store";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { can } from "@/lib/permissions";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import {
  PartnerStep,
  initialPartner,
  partnerValid,
  type PartnerState,
} from "./PartnerStep";
import {
  ContributionStep,
  initialContribution,
  contributionValid,
  type ContributionState,
} from "./ContributionStep";
import {
  VehicleStep,
  initialVehicle,
  vehicleValid,
  type VehicleState,
} from "./VehicleStep";
import {
  CompensationStep,
  ExpenseStep,
  type ExpenseRule,
} from "./CompensationExpenseSteps";
import { ReviewStep } from "./ReviewStep";
import {
  hasOwnershipConflict,
  netAgreementNeedsExpenseRules,
} from "@/lib/partnership";
import type { PartnershipInput } from "@/lib/partnershipTypes";
import type { CompensationArrangement } from "@/lib/ownershipTypes";

const STEPS = [
  "Partner",
  "Contribution",
  "Vehicle",
  "Compensation",
  "Expenses",
  "Review",
] as const;

export function PartnershipWizard({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { vehicles, staff, roles, currentStaffId } = useStore();
  const { investorVehicles, investors } = useInvestors();
  const { createInvestorPartnership } = usePartnerships();

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canCreate = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.create_partnership",
  );

  const [step, setStep] = useState(0);
  const [partner, setPartner] = useState<PartnerState>(initialPartner);
  const [contrib, setContrib] =
    useState<ContributionState>(initialContribution);
  const [vehicle, setVehicle] = useState<VehicleState>(initialVehicle);
  const [compensation, setCompensation] =
    useState<CompensationArrangement | null>(null);
  const [compError, setCompError] = useState<string | null>(null);
  const [rules, setRules] = useState<ExpenseRule[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Patch-setters that match each step's (patch: Partial<State>) => void prop.
  const patchPartner = (patch: Partial<PartnerState>) =>
    setPartner((p) => ({ ...p, ...patch }));
  const patchContrib = (patch: Partial<ContributionState>) =>
    setContrib((c) => ({ ...c, ...patch }));
  const patchVehicle = (patch: Partial<VehicleState>) =>
    setVehicle((v) => ({ ...v, ...patch }));

  const conflict = useMemo(
    () => hasOwnershipConflict(vehicle.vehicleId, investorVehicles),
    [vehicle.vehicleId, investorVehicles],
  );

  const buildInput = (): PartnershipInput => {
    const hasVehicleContrib =
      contrib.type === "vehicle" || contrib.type === "vehicle_and_cash";
    const hasCash =
      contrib.type === "cash" || contrib.type === "vehicle_and_cash";
    return {
      partner: {
        mode: partner.mode,
        existingId:
          partner.mode === "existing" ? partner.existingId : undefined,
        new:
          partner.mode === "new"
            ? {
                full_name: partner.contactName
                  ? `${partner.name} — ${partner.contactName}`
                  : partner.name,
                email: partner.email,
                phone: partner.phone,
                relationship: partner.relationship,
                joined_at: partner.joined,
              }
            : undefined,
      },
      contribution:
        contrib.type === "none"
          ? null
          : {
              contribution_type: contrib.type,
              cash_amount: hasCash ? contrib.cashAmount : null,
              vehicle_contribution: hasVehicleContrib,
              description:
                contrib.type === "other" ? contrib.description : null,
              contribution_date: contrib.date,
              notes: contrib.notes || null,
            },
      vehicle: {
        vehicle_id: vehicle.vehicleId,
        ownership_type: vehicle.ownershipType,
        ownership_notes: vehicle.ownershipNotes || null,
        transfer_existing: vehicle.transferExisting,
      },
      compensation: compensation!,
      expense_rules: rules.map((r) => ({
        id: "tmp",
        tenant_id: "tmp",
        pairing_id: "tmp",
        category: r.category,
        treatment: r.treatment,
        notes: null,
      })),
    };
  };

  const canNext = (): boolean => {
    if (step === 0) return partnerValid(partner);
    if (step === 1) return contributionValid(contrib);
    if (step === 2) return vehicleValid(vehicle, conflict);
    if (step === 3) return !!compensation && !compError;
    if (step === 4) {
      if (
        compensation?.type === "percentage" &&
        compensation.basis === "net" &&
        netAgreementNeedsExpenseRules(
          compensation,
          rules.map((r) => ({
            id: "tmp",
            tenant_id: "tmp",
            pairing_id: "tmp",
            category: r.category,
            treatment: r.treatment,
            notes: null,
          })),
        )
      )
        return false;
      return true;
    }
    return true;
  };

  const submit = () => {
    if (!canCreate) {
      toast.error("You don't have permission to create partnerships.");
      return;
    }
    setSubmitting(true);
    const requestKey = `prt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = createInvestorPartnership(buildInput(), requestKey);
    setSubmitting(false);
    if ("errors" in result) {
      toast.error(result.errors[0] ?? "Could not create partnership.");
      return;
    }
    toast.success("Partnership created.");
    onClose();
    navigate(`/investors/${result.investorId}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up an investor / JV partnership</DialogTitle>
        </DialogHeader>

        <div className="px-1">
          <RouteProgress
            value={(step + 1) / STEPS.length}
            stops={STEPS.length}
          />
          <div className="mt-2 flex flex-wrap justify-between gap-1">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={
                  i === step
                    ? "text-xs font-semibold text-primary"
                    : i < step
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-muted-foreground/50"
                }
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {step === 0 && <PartnerStep state={partner} set={patchPartner} />}
        {step === 1 && <ContributionStep state={contrib} set={patchContrib} />}
        {step === 2 && (
          <VehicleStep state={vehicle} set={patchVehicle} vehicles={vehicles} />
        )}
        {step === 3 && (
          <CompensationStep
            value={compensation}
            onChange={setCompensation}
            onError={setCompError}
          />
        )}
        {step === 4 && (
          <ExpenseStep
            rules={rules}
            setRules={setRules}
            isNet={
              compensation?.type === "percentage" &&
              compensation.basis === "net"
            }
          />
        )}
        {step === 5 && (
          <ReviewStep
            input={buildInput()}
            vehicles={vehicles}
            investors={investors}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={step === 0}
          >
            <ArrowLeft size={15} /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
              disabled={!canNext()}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Continue <ArrowRight size={15} />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={!canCreate || submitting}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <Check size={15} /> Create partnership
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
