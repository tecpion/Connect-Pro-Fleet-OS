// Connect Pro Fleet — shared compensation form (Build #6 cleanup).
//
// Extracted from AddPairingDialog so both the "assign vehicle" flow and the
// "edit agreement" flow use ONE implementation of percentage/fixed/custom
// compensation editing. No duplicate compensation UI.
// (export: CompensationForm — named, used by AddPairingDialog + EditCompensationDialog)

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CompensationArrangement,
  CompensationBasis,
  CompensationFrequency,
} from "@/lib/ownershipTypes";
import {
  COMPENSATION_TYPE_LABELS,
  COMPENSATION_BASIS_LABELS,
  COMPENSATION_FREQUENCY_LABELS,
} from "@/lib/ownershipTypes";
import {
  makePercentageCompensation,
  makeFixedCompensation,
  makeCustomCompensation,
  validateCompensation,
} from "@/lib/ownership";

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Controlled compensation editor. Initializes from an optional existing
 * arrangement (for editing) and reports the current value + validity via
 * callbacks so the parent dialog can drive save/cancel.
 */
export function CompensationForm({
  initial,
  onChange,
  onError,
}: {
  initial?: CompensationArrangement | null;
  onChange: (c: CompensationArrangement) => void;
  onError: (msg: string | null) => void;
}) {
  const [compType, setCompType] = useState<CompensationArrangement["type"]>(
    initial?.type ?? "percentage",
  );
  const [investorPct, setInvestorPct] = useState(
    initial?.type === "percentage" ? initial.investor_percentage : 50,
  );
  const [basis, setBasis] = useState(
    initial?.type === "percentage" ? initial.basis : "net",
  );
  const [fixedAmount, setFixedAmount] = useState(
    initial?.type === "fixed" ? initial.fixed_amount : 500,
  );
  const [fixedFreq, setFixedFreq] = useState(
    initial?.type === "fixed" ? initial.fixed_frequency : "monthly",
  );
  const [guaranteedNotRented, setGuaranteedNotRented] = useState(
    initial?.type === "fixed" ? initial.guaranteed_when_not_rented : false,
  );
  const [guaranteedDowntime, setGuaranteedDowntime] = useState(
    initial?.type === "fixed" ? initial.guaranteed_during_downtime : false,
  );
  const [customDesc, setCustomDesc] = useState(
    initial?.type === "custom" ? initial.description : "",
  );
  const [effectiveDate, setEffectiveDate] = useState(
    initial?.effective_date ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const operatorPct = 100 - investorPct;

  const build = (): CompensationArrangement => {
    if (compType === "percentage")
      return makePercentageCompensation(investorPct, {
        basis,
        effectiveDate,
        notes: notes || undefined,
      });
    if (compType === "fixed")
      return makeFixedCompensation(fixedAmount, fixedFreq, {
        guaranteedWhenNotRented: guaranteedNotRented,
        guaranteedDuringDowntime: guaranteedDowntime,
        effectiveDate,
        notes: notes || undefined,
      });
    return makeCustomCompensation(customDesc, {
      effectiveDate,
      notes: notes || undefined,
    });
  };

  const emit = () => {
    const c = build();
    const err = validateCompensation(c);
    onError(err);
    if (!err) onChange(c);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface-2 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Compensation
        </p>
        <div>
          <Label>Type</Label>
          <select
            value={compType}
            onChange={(e) => {
              setCompType(e.target.value as CompensationArrangement["type"]);
              setTimeout(emit, 0);
            }}
            className={selectCls}
          >
            {Object.entries(COMPENSATION_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {compType === "percentage" && (
          <div className="mt-3 space-y-2">
            <Label>
              Investor share:{" "}
              <span className="font-mono tabular">{investorPct}%</span> /
              operator <span className="font-mono tabular">{operatorPct}%</span>
            </Label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={investorPct}
              onChange={(e) => {
                setInvestorPct(Number(e.target.value));
                setTimeout(emit, 0);
              }}
              className="w-full accent-primary"
            />
            <div>
              <Label>Basis</Label>
              <select
                value={basis}
                onChange={(e) => {
                  setBasis(e.target.value as CompensationBasis);
                  setTimeout(emit, 0);
                }}
                className={selectCls}
              >
                {Object.entries(COMPENSATION_BASIS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label} revenue
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {compType === "fixed" && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={fixedAmount}
                  onChange={(e) => {
                    setFixedAmount(Number(e.target.value));
                    setTimeout(emit, 0);
                  }}
                  className="mt-1 font-mono tabular"
                />
              </div>
              <div>
                <Label>Frequency</Label>
                <select
                  value={fixedFreq}
                  onChange={(e) => {
                    setFixedFreq(e.target.value as CompensationFrequency);
                    setTimeout(emit, 0);
                  }}
                  className={selectCls}
                >
                  {Object.entries(COMPENSATION_FREQUENCY_LABELS).map(
                    ([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guaranteedNotRented}
                onChange={(e) => {
                  setGuaranteedNotRented(e.target.checked);
                  setTimeout(emit, 0);
                }}
                className="accent-primary"
              />
              Guaranteed when not rented
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guaranteedDowntime}
                onChange={(e) => {
                  setGuaranteedDowntime(e.target.checked);
                  setTimeout(emit, 0);
                }}
                className="accent-primary"
              />
              Guaranteed during downtime
            </label>
          </div>
        )}

        {compType === "custom" && (
          <div className="mt-3">
            <Label>Agreement description</Label>
            <textarea
              value={customDesc}
              onChange={(e) => {
                setCustomDesc(e.target.value);
                setTimeout(emit, 0);
              }}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              rows={3}
              placeholder='e.g. "$350/week while rented, $200/week while down for maintenance longer than 7 days."'
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Custom arrangement — automated settlement calculation comes in the
              next investor build.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Effective date</Label>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(e) => {
              setEffectiveDate(e.target.value);
              setTimeout(emit, 0);
            }}
            className="mt-1 font-mono tabular"
          />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setTimeout(emit, 0);
            }}
            className="mt-1"
            placeholder="Reason / context for this agreement"
          />
        </div>
      </div>
    </div>
  );
}
