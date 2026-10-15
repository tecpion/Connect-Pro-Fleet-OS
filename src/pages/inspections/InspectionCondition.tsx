// Connect Pro Fleet — Inspection condition checklist + damage editor.
//
// Fast condition checklist grouped by area, with quick states (Good /
// Attention / Damaged / N/A). When Attention/Damaged is selected, a damage
// detail editor opens (type, severity, note, review decision). Pure
// presentation — state is owned by the wizard.

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus } from "lucide-react";
import type {
  ConditionItem,
  ConditionState,
  DamageItem,
  DamageType,
  DamageSeverity,
  DamageReviewDecision,
} from "@/lib/inspectionWorkspaceTypes";
import {
  CONDITION_STATE_LABELS,
  DAMAGE_TYPE_LABELS,
  DAMAGE_SEVERITY_LABELS,
} from "@/lib/inspectionWorkspaceTypes";

const CONDITION_STATES: ConditionState[] = [
  "good",
  "attention",
  "damaged",
  "n/a",
];
const DAMAGE_TYPES: DamageType[] = [
  "scratch",
  "dent",
  "crack",
  "broken_glass",
  "wheel_tire",
  "interior",
  "mechanical",
  "cleanliness",
  "other",
];
const SEVERITIES: DamageSeverity[] = ["minor", "moderate", "major"];

export function ConditionChecklist({
  items,
  onSetState,
  damageItems,
  onAddDamage,
  onUpdateDamage,
  onRemoveDamage,
  comparison,
  isCheckin,
}: {
  items: ConditionItem[];
  onSetState: (key: string, state: ConditionState) => void;
  damageItems: DamageItem[];
  onAddDamage: (area: string) => void;
  onUpdateDamage: (id: string, patch: Partial<DamageItem>) => void;
  onRemoveDamage: (id: string) => void;
  comparison: { area: string; checkoutState: string; checkinState: string }[];
  isCheckin: boolean;
}) {
  const groups = Array.from(new Set(items.map((c) => c.group)));
  return (
    <div className="space-y-4">
      {comparison.length > 0 && (
        <div className="rounded-lg border border-status-out/30 bg-status-out/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-out">
            <AlertTriangle size={15} /> Potential new damage (
            {comparison.length})
          </p>
          <div className="mt-2 space-y-1">
            {comparison.map((c) => (
              <p key={c.area} className="text-xs text-muted-foreground">
                {c.area}: checkout {c.checkoutState} → check-in{" "}
                <span className="font-medium text-status-out">
                  {c.checkinState}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g}
          </p>
          <div className="space-y-1">
            {items
              .filter((c) => c.group === g)
              .map((c) => {
                const itemDamage = damageItems.filter(
                  (d) => d.area === c.label,
                );
                return (
                  <div
                    key={c.key}
                    className="rounded-md border border-border p-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {c.label}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {CONDITION_STATES.map((s) => (
                          <button
                            key={s}
                            onClick={() => onSetState(c.key, s)}
                            data-testid={`cond-${c.key}-${s}`}
                            className={cn(
                              "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                              c.state === s
                                ? s === "good"
                                  ? "bg-status-available/15 text-status-available"
                                  : s === "attention"
                                    ? "bg-status-maintenance/15 text-status-maintenance"
                                    : s === "damaged"
                                      ? "bg-status-out/15 text-status-out"
                                      : "bg-surface-2 text-muted-foreground"
                                : "text-muted-foreground hover:bg-surface-2",
                            )}
                          >
                            {CONDITION_STATE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(c.state === "attention" || c.state === "damaged") && (
                      <div className="mt-2 space-y-2">
                        {itemDamage.map((d) => (
                          <DamageItemEditor
                            key={d.id}
                            damage={d}
                            onUpdate={(patch) => onUpdateDamage(d.id, patch)}
                            onRemove={() => onRemoveDamage(d.id)}
                            isCheckin={isCheckin}
                          />
                        ))}
                        <button
                          onClick={() => onAddDamage(c.label)}
                          data-testid={`add-damage-${c.key}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Plus size={12} /> Add damage detail
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DamageItemEditor({
  damage,
  onUpdate,
  onRemove,
  isCheckin,
}: {
  damage: DamageItem;
  onUpdate: (patch: Partial<DamageItem>) => void;
  onRemove: () => void;
  isCheckin: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Type</Label>
          <Select
            value={damage.damage_type}
            onValueChange={(v) => onUpdate({ damage_type: v as DamageType })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAMAGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DAMAGE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px]">Severity</Label>
          <Select
            value={damage.severity}
            onValueChange={(v) => onUpdate({ severity: v as DamageSeverity })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DAMAGE_SEVERITY_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Input
        value={damage.note}
        onChange={(e) => onUpdate({ note: e.target.value })}
        placeholder="Note…"
        className="mt-2 h-8 text-xs"
      />
      {isCheckin && (
        <div className="mt-2">
          <Label className="text-[11px]">Review decision</Label>
          <Select
            value={damage.review_decision}
            onValueChange={(v) =>
              onUpdate({ review_decision: v as DamageReviewDecision })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Needs Review</SelectItem>
              <SelectItem value="confirmed_new">Confirm New Damage</SelectItem>
              <SelectItem value="marked_pre_existing">Pre-existing</SelectItem>
              <SelectItem value="marked_not_damage">Not Damage</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <button
        onClick={onRemove}
        className="mt-1.5 text-[11px] font-medium text-status-out hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
