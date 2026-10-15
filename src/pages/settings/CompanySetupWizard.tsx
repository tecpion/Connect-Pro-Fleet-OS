// Connect Pro Fleet — Company setup wizard shell (Build #23).
// Progress + navigation; step bodies live in CompanySetupWizardSteps.

import { useState } from "react";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  COMPANY_POLICY_PRESETS,
  type PresetKey,
} from "@/lib/companyPolicyDefaults";
import {
  WizardCompanyStep,
  WizardRentalModelStep,
  WizardPaymentsStep,
  WizardDepositsStep,
  WizardReturnsStep,
  WizardMileageFuelStep,
  WizardDriverInsuranceStep,
  WizardReservationsStep,
  WizardFeesStep,
  WizardReviewStep,
} from "./CompanySetupWizardSteps";

const STEPS = [
  "Company",
  "Rental Model",
  "Payments",
  "Deposits",
  "Returns",
  "Mileage & Fuel",
  "Driver & Insurance",
  "Reservations",
  "Fees",
  "Review",
] as const;

export function CompanySetupWizard({ onClose }: { onClose: () => void }) {
  const { companyPolicies, updateCompanyPolicies, applyPreset } =
    useCompanyPolicies();
  const { companyInfo, updateCompanyInfo, logSettingsChange } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(companyPolicies);
  const [info, setInfo] = useState(companyInfo);
  const [preset, setPreset] = useState<PresetKey | null>(null);

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));
  const setInfoField = (patch: Partial<typeof info>) =>
    setInfo((i) => ({ ...i, ...patch }));

  const applyPresetChoice = (key: string) => {
    const p = COMPANY_POLICY_PRESETS.find((x) => x.key === key);
    if (!p) return;
    setPreset(key as PresetKey);
    setForm((f) => ({ ...f, ...p.patch }));
    toast.success(`Applied "${p.label}" preset.`);
  };

  const finish = () => {
    updateCompanyPolicies(form);
    updateCompanyInfo(info);
    if (preset) {
      const p = COMPANY_POLICY_PRESETS.find((x) => x.key === preset)!;
      applyPreset(p.patch, p.label);
    }
    logSettingsChange({
      action: "Company setup wizard completed",
      detail: `Preset: ${preset ?? "custom"}. Steps completed: ${step + 1}/${STEPS.length}.`,
    });
    toast.success(
      "Company setup complete. You can refine policies anytime in Settings.",
    );
    onClose();
  };

  const completed = step + 1;
  const pct = Math.round((completed / STEPS.length) * 100);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Company Setup — {STEPS[step]}
          </h2>
          <span className="text-sm text-muted-foreground">
            {completed} of {STEPS.length} complete
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <WizardCompanyStep
          form={form}
          set={set}
          info={info}
          setInfo={setInfoField}
          preset={preset}
          onPreset={applyPresetChoice}
        />
      )}
      {step === 1 && <WizardRentalModelStep form={form} set={set} />}
      {step === 2 && <WizardPaymentsStep form={form} set={set} />}
      {step === 3 && <WizardDepositsStep form={form} set={set} />}
      {step === 4 && <WizardReturnsStep form={form} set={set} />}
      {step === 5 && <WizardMileageFuelStep form={form} set={set} />}
      {step === 6 && <WizardDriverInsuranceStep form={form} set={set} />}
      {step === 7 && <WizardReservationsStep form={form} set={set} />}
      {step === 8 && <WizardFeesStep />}
      {step === 9 && <WizardReviewStep form={form} preset={preset} />}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
        >
          {step === 0 ? "Skip for now" : "Back"}
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Finish later
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={finish}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Finish setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
