// Connect Pro Fleet OS — Onboarding types and shared primitives.

import { cn } from "@/lib/utils";
import { ChevronRight, CheckCircle2 } from "lucide-react";

export type StepId =
  | "welcome"
  | "business"
  | "howYouRent"
  | "pricing"
  | "fleet"
  | "agreements"
  | "payments"
  | "team"
  | "tools"
  | "aiOperator"
  | "readiness";

export interface OnboardingAnswers {
  multiLocation: boolean | null;
  businessType: "owner_operated" | "multi_staff" | "multi_location" | "manage_for_others" | null;
  hasStaff: boolean | null;
  managesForOthers: boolean | null;
  rentalCadences: string[];
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  multiLocation: null,
  businessType: null,
  hasStaff: null,
  managesForOthers: null,
  rentalCadences: [],
};

export function buildSteps(a: OnboardingAnswers): StepId[] {
  const base: StepId[] = [
    "welcome",
    "business",
    "howYouRent",
    "pricing",
    "fleet",
    "agreements",
    "payments",
  ];
  if (a.hasStaff !== false) base.push("team");
  base.push("tools");
  base.push("aiOperator");
  base.push("readiness");
  return base;
}

export function StepTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon size={18} className="text-primary" />
        </div>
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function ChoiceCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-4 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50 hover:bg-surface-2",
      )}
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </button>
  );
}

export function QuickWin({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
      <CheckCircle2 size={16} className="shrink-0 text-primary" />
      <p className="text-sm font-medium text-foreground">{message}</p>
    </div>
  );
}

export function HelpFooter() {
  return (
    <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium">Need help?</span>
      <button className="underline hover:text-foreground">View Help</button>
      <span>·</span>
      <button className="underline hover:text-foreground">Contact Support</button>
    </div>
  );
}

export function ContinueButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <button
        onClick={onClick}
        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-press"
      >
        Continue <ChevronRight size={16} className="ml-1" />
      </button>
    </div>
  );
}

export function SetupRow({
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
      <ChevronRight size={16} className="ml-auto shrink-0 text-muted-foreground" />
    </button>
  );
}