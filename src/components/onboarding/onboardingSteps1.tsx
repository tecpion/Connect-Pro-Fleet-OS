// Connect Pro Fleet OS — Onboarding step components (part 1).

import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Car,
  CreditCard,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  type OnboardingAnswers,
  StepTitle,
  ChoiceCard,
  QuickWin,
  HelpFooter,
  ContinueButton,
} from "./onboardingPrimitives";

type CompanyInfo = {
  legal_name: string;
  dba: string;
  timezone: string;
};

type Navigate = ReturnType<typeof useNavigate>;

export function WelcomeStep({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles size={26} className="text-primary" />
      </div>
      <h2 className="font-display text-2xl font-semibold text-foreground">
        Welcome to Connect Pro Fleet OS
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Let's get your rental business ready to operate. We'll guide you through
        the essentials first. You can finish advanced setup later.
      </p>
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <Button
          size="lg"
          onClick={onStart}
          className="bg-primary text-primary-foreground"
        >
          Start Setup
        </Button>
        <Button size="lg" variant="ghost" onClick={onSkip}>
          I'll finish this later
        </Button>
      </div>
      <HelpFooter />
    </div>
  );
}

export function BusinessStep({
  answers,
  setAnswers,
  companyInfo,
  onNext,
}: {
  answers: OnboardingAnswers;
  setAnswers: React.Dispatch<React.SetStateAction<OnboardingAnswers>>;
  companyInfo: CompanyInfo;
  onNext: () => void;
}) {
  const hasData =
    companyInfo.legal_name &&
    companyInfo.legal_name !== "Connect Pro Fleet Holdings LLC";
  return (
    <div>
      <StepTitle
        icon={Building2}
        title="Tell us about your rental business"
        subtitle="Your business profile appears on agreements, receipts, and customer communications."
      />
      <div className="space-y-3">
        <ChoiceCard
          label="Yes, I operate from more than one location"
          selected={answers.multiLocation === true}
          onClick={() => setAnswers((a) => ({ ...a, multiLocation: true }))}
        />
        <ChoiceCard
          label="No, single location for now"
          description="You can add more locations later in Settings."
          selected={answers.multiLocation === false}
          onClick={() => setAnswers((a) => ({ ...a, multiLocation: false }))}
        />
      </div>
      {hasData && <QuickWin message="Your business profile is ready." />}
      <div className="mt-5 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        <p>
          You can edit your business name, address, timezone, and contact
          details anytime in{" "}
          <span className="font-medium text-foreground">
            Settings → Company
          </span>
          .
        </p>
      </div>
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function HowYouRentStep({
  answers,
  setAnswers,
  onNext,
}: {
  answers: OnboardingAnswers;
  setAnswers: React.Dispatch<React.SetStateAction<OnboardingAnswers>>;
  onNext: () => void;
}) {
  const cadences = [
    { id: "daily", label: "Daily" },
    { id: "multi_day", label: "2–3 day minimum" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly / Long-Term" },
    { id: "custom", label: "Custom rental periods" },
  ];
  const toggle = (id: string) =>
    setAnswers((a) => ({
      ...a,
      rentalCadences: a.rentalCadences.includes(id)
        ? a.rentalCadences.filter((x) => x !== id)
        : [...a.rentalCadences, id],
    }));

  const bizTypes = [
    {
      id: "owner_operated",
      label: "Owner-operated fleet",
      desc: "It's just me running the business.",
    },
    {
      id: "multi_staff",
      label: "Multiple staff members",
      desc: "I have a team helping run operations.",
    },
    {
      id: "multi_location",
      label: "Multiple locations",
      desc: "We operate across several locations.",
    },
    {
      id: "manage_for_others",
      label: "Manage vehicles for other owners/investors",
      desc: "We manage fleet for partners or investors.",
    },
  ];

  return (
    <div>
      <StepTitle
        icon={Car}
        title="How does your business rent vehicles?"
        subtitle="Select all rental models that apply. You're not locked into one type."
      />
      <p className="mb-2 text-sm font-medium text-foreground">Rental models</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cadences.map((c) => (
          <ChoiceCard
            key={c.id}
            label={c.label}
            selected={answers.rentalCadences.includes(c.id)}
            onClick={() => toggle(c.id)}
          />
        ))}
      </div>
      <p className="mb-2 mt-5 text-sm font-medium text-foreground">
        What type of rental business best describes you?
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bizTypes.map((t) => (
          <ChoiceCard
            key={t.id}
            label={t.label}
            description={t.desc}
            selected={answers.businessType === t.id}
            onClick={() =>
              setAnswers((a) => ({
                ...a,
                businessType: t.id as OnboardingAnswers["businessType"],
                hasStaff:
                  t.id === "multi_staff" || t.id === "multi_location"
                    ? true
                    : a.hasStaff,
                managesForOthers: t.id === "manage_for_others",
              }))
            }
          />
        ))}
      </div>
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function PricingStep({
  navigate,
  onNext,
}: {
  navigate: Navigate;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle
        icon={CreditCard}
        title="Set up your basic rental rules"
        subtitle="Vehicle classes, rates, deposits, and policies. We'll take you to the right settings page."
      />
      <div className="space-y-2.5">
        <RowLink
          icon={Car}
          label="Vehicle Classes & Rates"
          hint="Daily, weekly, monthly rates per class"
          onClick={() => navigate("/settings?section=pricing")}
        />
        <RowLink
          icon={CreditCard}
          label="Deposits"
          hint="Deposit amount and refund policy"
          onClick={() => navigate("/settings?section=deposits")}
        />
        <RowLink
          icon={CreditCard}
          label="Rental Policies"
          hint="Mileage, fuel, late fees, pickup/return"
          onClick={() => navigate("/settings?section=rentalPolicies")}
        />
      </div>
      <QuickWin message="Connect Pro can now use these rates during rental setup." />
      <p className="mt-4 text-xs text-muted-foreground">
        These are your starting settings. You can change them later. Existing
        rentals keep the policies and rates that applied when they were created.
      </p>
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

function RowLink({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: any;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:border-primary/50 hover:bg-surface-2"
    >
      <Icon size={18} className="shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <ChevronRight
        size={16}
        className="ml-auto shrink-0 text-muted-foreground"
      />
    </button>
  );
}
