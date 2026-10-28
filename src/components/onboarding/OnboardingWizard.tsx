// Connect Pro Fleet OS — Onboarding wizard shell + dashboard setup checklist.
//
// UI/UX only. This is a guided shell that routes the user into existing
// settings/workflows. It does NOT create a second data path, bypass
// permissions, or write directly to the database. Onboarding progress is
// tracked in component state; durable persistence of onboarding progress
// remains a backend dependency.

import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { Button } from "@/components/ui/button";
import { Sparkles, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  type OnboardingAnswers,
  type StepId,
  EMPTY_ANSWERS,
  buildSteps,
} from "./onboardingPrimitives";
import {
  WelcomeStep,
  BusinessStep,
  HowYouRentStep,
  PricingStep,
} from "./onboardingSteps1";
import {
  FleetStep,
  AgreementsStep,
  PaymentsStep,
  TeamStep,
  ToolsStep,
  AiOperatorStep,
  ReadinessStep,
} from "./onboardingSteps2";

export function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { companyInfo, vehicles, staff } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [stepIdx, setStepIdx] = useState(0);

  const steps = useMemo(() => buildSteps(answers), [answers]);
  const current = steps[stepIdx] as StepId;
  const pct = Math.round(((stepIdx + 1) / steps.length) * 100);

  const goNext = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  const finish = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <span className="font-display text-sm font-semibold text-foreground">
                Setup Progress
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{pct}% complete</span>
            <span>
              Step {stepIdx + 1} of {steps.length}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="px-5 py-6 sm:px-6">
          {current === "welcome" && (
            <WelcomeStep onStart={goNext} onSkip={finish} />
          )}
          {current === "business" && (
            <BusinessStep
              answers={answers}
              setAnswers={setAnswers}
              companyInfo={companyInfo}
              onNext={goNext}
            />
          )}
          {current === "howYouRent" && (
            <HowYouRentStep answers={answers} setAnswers={setAnswers} onNext={goNext} />
          )}
          {current === "pricing" && (
            <PricingStep navigate={navigate} onNext={goNext} />
          )}
          {current === "fleet" && (
            <FleetStep vehicles={vehicles} navigate={navigate} onNext={goNext} />
          )}
          {current === "agreements" && (
            <AgreementsStep navigate={navigate} onNext={goNext} />
          )}
          {current === "payments" && (
            <PaymentsStep navigate={navigate} onNext={goNext} />
          )}
          {current === "team" && (
            <TeamStep
              staff={staff}
              answers={answers}
              setAnswers={setAnswers}
              navigate={navigate}
              onNext={goNext}
            />
          )}
          {current === "tools" && <ToolsStep navigate={navigate} onNext={goNext} />}
          {current === "aiOperator" && (
            <AiOperatorStep navigate={navigate} onNext={goNext} />
          )}
          {current === "readiness" && (
            <ReadinessStep
              answers={answers}
              companyInfo={companyInfo}
              vehicles={vehicles}
              staff={staff}
              navigate={navigate}
              onFinish={finish}
            />
          )}
        </div>

        {current !== "welcome" && current !== "readiness" && (
          <div className="flex items-center justify-between border-t border-border px-5 py-4 sm:px-6">
            <Button variant="outline" size="sm" onClick={goBack}>
              <ChevronLeft size={16} className="mr-1" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Save &amp; Exit
              </Button>
              <Button
                size="sm"
                onClick={goNext}
                className="bg-primary text-primary-foreground"
              >
                Continue <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SetupChecklistCard({ onContinue }: { onContinue: () => void }) {
  const { vehicles, staff, companyInfo } = useStore();
  const { companyPolicies } = useCompanyPolicies();

  const checks = [
    { label: "Business Profile", done: !!companyInfo.legal_name },
    {
      label: "Rental Model",
      done: companyPolicies.rental_model.enabled_cadences.length > 0,
    },
    { label: "At Least One Vehicle", done: vehicles.length > 0 },
    { label: "Deposit Policy", done: companyPolicies.deposit.default_amount > 0 },
    { label: "Team", done: staff.length > 0 },
    { label: "Payment Methods", done: false },
    { label: "Rental Agreement", done: false },
    { label: "Connect CRM", done: false },
  ];
  const doneCount = checks.filter((c) => c.done).length;
  const allDone = doneCount === checks.length;
  const pct = Math.round((doneCount / checks.length) * 100);

  if (allDone) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            Finish Setting Up Connect Pro
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {doneCount} of {checks.length} essential steps complete
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onContinue}>
          Continue Setup
        </Button>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {checks
          .filter((c) => !c.done)
          .slice(0, 3)
          .map((c) => (
            <span key={c.label}>• {c.label}</span>
          ))}
      </div>
    </div>
  );
}