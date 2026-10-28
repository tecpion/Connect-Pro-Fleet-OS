// Connect Pro Fleet — First-login onboarding state (UI/UX only).
//
// This is a guided onboarding experience. It does NOT create its own data
// path — every action routes through the same existing store methods a user
// would use manually. Progress is tracked in component state (and optionally
// localStorage) so it survives reloads without a new backend table.
//
// No Supabase schema, RLS, auth, billing, or financial logic lives here.

import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";

export type OnboardingStepId =
  | "welcome"
  | "business"
  | "how-you-rent"
  | "pricing-policies"
  | "fleet"
  | "agreements"
  | "payments"
  | "team"
  | "tools"
  | "ai-operator"
  | "readiness";

export interface OnboardingAnswers {
  multipleLocations: boolean | null;
  managesForOthers: boolean | null;
  hasStaff: boolean | null;
  rentalCadences: string[];
  paymentMethods: string[];
}

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  multipleLocations: null,
  managesForOthers: null,
  hasStaff: null,
  rentalCadences: [],
  paymentMethods: [],
};

const STORAGE_KEY = "cpf_onboarding_v1";

interface OnboardingPersist {
  completed: boolean;
  skipped: boolean;
  stepIndex: number;
  answers: OnboardingAnswers;
}

function loadPersist(): OnboardingPersist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingPersist;
  } catch {
    return null;
  }
}

function savePersist(p: OnboardingPersist) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // ignore quota errors
  }
}

export interface OnboardingState {
  active: boolean;
  completed: boolean;
  skipped: boolean;
  stepIndex: number;
  answers: OnboardingAnswers;
  start: () => void;
  skip: () => void;
  exit: () => void;
  next: () => void;
  back: () => void;
  goTo: (step: OnboardingStepId) => void;
  setAnswers: (patch: Partial<OnboardingAnswers>) => void;
}

export function useOnboarding(): OnboardingState {
  const [persist, setPersist] = useState<OnboardingPersist | null>(() =>
    loadPersist(),
  );

  useEffect(() => {
    if (persist) savePersist(persist);
  }, [persist]);

  const start = useCallback(() => {
    setPersist({
      completed: false,
      skipped: false,
      stepIndex: 0,
      answers: DEFAULT_ANSWERS,
    });
  }, []);

  const skip = useCallback(() => {
    setPersist((p) => ({
      ...(p ?? {
        completed: false,
        skipped: false,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      }),
      skipped: true,
      active: false,
    } as OnboardingPersist));
    // Mark skipped so the wizard closes but the dashboard checklist remains.
    setPersist((p) => ({
      ...(p ?? {
        completed: false,
        skipped: true,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      }),
      skipped: true,
    }));
  }, []);

  const exit = useCallback(() => {
    setPersist((p) => ({
      ...(p ?? {
        completed: false,
        skipped: false,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      }),
      skipped: true,
    }));
  }, []);

  const next = useCallback(() => {
    setPersist((p) => {
      const base = p ?? {
        completed: false,
        skipped: false,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      };
      return { ...base, stepIndex: base.stepIndex + 1 };
    });
  }, []);

  const back = useCallback(() => {
    setPersist((p) => {
      const base = p ?? {
        completed: false,
        skipped: false,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      };
      return {
        ...base,
        stepIndex: Math.max(0, base.stepIndex - 1),
      };
    });
  }, []);

  const goTo = useCallback((step: OnboardingStepId) => {
    const order: OnboardingStepId[] = [
      "welcome",
      "business",
      "how-you-rent",
      "pricing-policies",
      "fleet",
      "agreements",
      "payments",
      "team",
      "tools",
      "ai-operator",
      "readiness",
    ];
    const idx = order.indexOf(step);
    setPersist((p) => {
      const base = p ?? {
        completed: false,
        skipped: false,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      };
      return { ...base, stepIndex: idx >= 0 ? idx : base.stepIndex };
    });
  }, []);

  const setAnswers = useCallback((patch: Partial<OnboardingAnswers>) => {
    setPersist((p) => {
      const base = p ?? {
        completed: false,
        skipped: false,
        stepIndex: 0,
        answers: DEFAULT_ANSWERS,
      };
      return {
        ...base,
        answers: { ...base.answers, ...patch },
      };
    });
  }, []);

  const active = !persist?.completed && !persist?.skipped;

  return {
    active,
    completed: persist?.completed ?? false,
    skipped: persist?.skipped ?? false,
    stepIndex: persist?.stepIndex ?? 0,
    answers: persist?.answers ?? DEFAULT_ANSWERS,
    start,
    skip,
    exit,
    next,
    back,
    goTo,
    setAnswers,
  };
}

// ---------------------------------------------------------------------------
// Setup checklist — derives completion from REAL store state, never demo data.
// ---------------------------------------------------------------------------

export interface SetupChecklistItem {
  id: string;
  label: string;
  done: boolean;
  optional: boolean;
  route?: string;
}

export function useSetupChecklist(): SetupChecklistItem[] {
  const store = useStore();
  const { companyPolicies } = useCompanyPolicies();

  return [
    {
      id: "business",
      label: "Business profile",
      done: Boolean(store.companyInfo?.legal_name),
      optional: false,
      route: "/settings",
    },
    {
      id: "rental-model",
      label: "Rental model",
      done:
        (companyPolicies.rental_model?.enabled_cadences?.length ?? 0) > 0,
      optional: false,
      route: "/settings",
    },
    {
      id: "pricing",
      label: "Pricing & vehicle classes",
      done: store.vehicleClasses.length > 0,
      optional: false,
      route: "/settings",
    },
    {
      id: "fleet",
      label: "At least one vehicle",
      done: store.vehicles.length > 0,
      optional: false,
      route: "/vehicles",
    },
    {
      id: "deposit",
      label: "Deposit policy",
      done: store.depositPolicies.length > 0,
      optional: false,
      route: "/settings",
    },
    {
      id: "agreement",
      label: "Rental agreement",
      done: store.agreementTemplates.length > 0,
      optional: false,
      route: "/settings",
    },
    {
      id: "payments",
      label: "Payment methods",
      done:
        (companyPolicies.payment?.payment_cutoff_time?.trim().length ?? 0) > 0,
      optional: false,
      route: "/settings",
    },
    {
      id: "team",
      label: "Team",
      done: store.staff.length > 0,
      optional: true,
      route: "/staff",
    },
    {
      id: "crm",
      label: "Connect Pro CRM",
      done: false, // UI-only until integration backend is connected
      optional: true,
      route: "/integrations",
    },
    {
      id: "ai",
      label: "AI Operator",
      done: false, // UI-only until AI backend is connected
      optional: true,
      route: "/ai-workforce",
    },
  ];
}

export function useSetupProgress() {
  const items = useSetupChecklist();
  const essential = items.filter((i) => !i.optional);
  const completed = essential.filter((i) => i.done).length;
  const total = essential.length;
  const remaining = essential.filter((i) => !i.done);
  return {
    items,
    essential,
    completed,
    total,
    remaining,
    allDone: completed === total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}