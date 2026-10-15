// Connect Pro Fleet — wizard steps 4 (compensation) + 5 (expenses) (Build #7).
// Compensation reuses the shared CompensationForm (ONE implementation).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompensationForm } from "../CompensationForm";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_TREATMENT_LABELS,
} from "@/lib/partnershipTypes";
import type { ExpenseCategory, ExpenseTreatment } from "@/lib/partnershipTypes";
import type { CompensationArrangement } from "@/lib/ownershipTypes";
import { StepShell, selectCls } from "./StepShell";

export function CompensationStep({
  value,
  onChange,
  onError,
}: {
  value: CompensationArrangement | null;
  onChange: (c: CompensationArrangement) => void;
  onError: (m: string | null) => void;
}) {
  return (
    <StepShell
      heading="How does this partner get paid?"
      supporting="This is the partner's payout — it has nothing to do with the customer's rental billing schedule."
    >
      <CompensationForm onChange={onChange} onError={onError} />
    </StepShell>
  );
}

export interface ExpenseRule {
  category: ExpenseCategory;
  treatment: ExpenseTreatment;
}

export function ExpenseStep({
  rules,
  setRules,
  isNet,
}: {
  rules: ExpenseRule[];
  setRules: (r: ExpenseRule[]) => void;
  isNet: boolean;
}) {
  const [cat, setCat] = useState<ExpenseCategory>("maintenance");
  const [treat, setTreat] = useState<ExpenseTreatment>("deduct_before_split");

  const CATEGORIES: ExpenseCategory[] = [
    "maintenance",
    "repairs",
    "parts",
    "labor",
    "tires",
    "brakes",
    "oil_service",
    "towing",
    "registration",
    "insurance",
    "gps",
    "detailing",
    "recovery",
    "taxes_fees",
    "other",
  ];

  return (
    <StepShell
      heading="How should expenses work for this vehicle?"
      supporting="Two identical splits can pay out very differently depending on expenses. Define which costs are deducted before the split."
    >
      {isNet && (
        <p className="rounded-md border border-status-maintenance/40 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
          After-expenses (net) agreements require at least one expense deducted
          before the split.
        </p>
      )}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value as ExpenseCategory)}
            className={selectCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={treat}
            onChange={(e) => setTreat(e.target.value as ExpenseTreatment)}
            className={selectCls}
          >
            {(Object.keys(EXPENSE_TREATMENT_LABELS) as ExpenseTreatment[]).map(
              (t) => (
                <option key={t} value={t}>
                  {EXPENSE_TREATMENT_LABELS[t]}
                </option>
              ),
            )}
          </select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRules([...rules, { category: cat, treatment: treat }])
          }
        >
          Add expense rule
        </Button>

        {rules.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rules.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between px-3 py-2 text-xs"
              >
                <span className="text-foreground">
                  {EXPENSE_CATEGORY_LABELS[r.category]} ·{" "}
                  <span className="text-muted-foreground">
                    {EXPENSE_TREATMENT_LABELS[r.treatment]}
                  </span>
                </span>
                <button
                  onClick={() => setRules(rules.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove rule"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </StepShell>
  );
}
