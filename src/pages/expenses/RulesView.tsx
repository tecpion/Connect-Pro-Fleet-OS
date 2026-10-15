// Connect Pro Fleet — Expenses V1 Rules tab.
// Transaction categorization rules: merchant/description/amount/account
// conditions, Suggest vs Auto Apply modes, require-vehicle-selection, and
// rule management. Deleting a rule never changes previously categorized
// transactions.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/Status";
import { EmptyState } from "@/components/ui-bits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { uid } from "@/lib/store";
import type {
  ExpenseRule,
  RuleConditionField,
  RuleConditionOp,
  RuleMode,
  ExpenseScope,
} from "@/lib/expenseTypes";

const FIELD_LABELS: Record<RuleConditionField, string> = {
  merchant_equals: "Merchant equals",
  merchant_contains: "Merchant contains",
  description_contains: "Description contains",
  amount_equals: "Amount equals",
  amount_min: "Amount min",
  amount_max: "Amount max",
  account_id: "Bank / card account",
  transaction_type: "Transaction type",
};

const OP_LABELS: Record<RuleConditionOp, string> = {
  equals: "Equals",
  contains: "Contains",
  range: "Range",
  gte: "≥",
  lte: "≤",
};

export function RulesView() {
  const store = useStore();
  const [editing, setEditing] = useState<ExpenseRule | null>(null);
  const [creating, setCreating] = useState(false);

  const rules = store.expenseRules;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} className="mr-1" /> Add Rule
        </Button>
      </div>
      {rules.length === 0 ? (
        <EmptyState
          title="No expense rules"
          hint="Rules auto-suggest or apply categorization to future matching transactions."
          icon={<Plus size={24} />}
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {rules.map((r) => {
            const cat = r.action.category_id
              ? store.expenseCategories.find(
                  (c) => c.id === r.action.category_id,
                )
              : null;
            return (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {r.name}
                      </span>
                      <StatusPill tone={r.active ? "available" : "neutral"}>
                        {r.active ? "Active" : "Disabled"}
                      </StatusPill>
                      <StatusPill
                        tone={
                          r.mode === "auto_apply" ? "rented" : "maintenance"
                        }
                      >
                        {r.mode === "auto_apply" ? "Auto Apply" : "Suggest"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 font-mono text-xs tabular text-muted-foreground">
                      {r.conditions
                        .map(
                          (c) =>
                            `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} ${c.value}`,
                        )
                        .join("  ·  ")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      → {cat?.name ?? "No category"}
                      {r.action.require_vehicle_selection &&
                        " · require vehicle"}
                      {r.action.vehicle_id &&
                        ` · ${store.vehicles.find((v) => v.id === r.action.vehicle_id)?.make ?? ""}`}
                      {r.action.multi_vehicle_ids &&
                        r.action.multi_vehicle_ids.length > 0 &&
                        ` · split ${r.action.multi_vehicle_ids.length} vehicles`}
                      {" · used "}
                      {r.times_used}×
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditing(r)}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Duplicate rule"
                      onClick={() => {
                        const copy: ExpenseRule = {
                          ...r,
                          id: uid("rule"),
                          name: `${r.name} (copy)`,
                          times_used: 0,
                          last_matched_at: null,
                          created_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        };
                        store.addExpenseRule(copy);
                        toast.success("Rule duplicated.");
                      }}
                    >
                      <Copy size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-status-out"
                      aria-label="Delete rule"
                      onClick={() => {
                        store.deleteExpenseRule(r.id);
                        toast.success(
                          "Rule deleted. Past transactions unchanged.",
                        );
                      }}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(creating || editing) && (
        <RuleDialog
          rule={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RuleDialog({
  rule,
  onClose,
}: {
  rule: ExpenseRule | null;
  onClose: () => void;
}) {
  const store = useStore();
  const [name, setName] = useState(rule?.name ?? "");
  const [field, setField] = useState<RuleConditionField>("merchant_contains");
  const [value, setValue] = useState<string | number>(
    rule?.conditions[0]?.value ?? "",
  );
  const [mode, setMode] = useState<RuleMode>(rule?.mode ?? "suggest");
  const [categoryId, setCategoryId] = useState<string>(
    rule?.action.category_id ?? "none",
  );
  const [scope, setScope] = useState<string>(rule?.action.scope ?? "vehicle");
  const [vehicleId, setVehicleId] = useState<string>(
    rule?.action.vehicle_id ?? "none",
  );
  const [requireVehicle, setRequireVehicle] = useState<boolean>(
    rule?.action.require_vehicle_selection ?? false,
  );
  const [multiVehicle, setMultiVehicle] = useState<boolean>(
    (rule?.action.multi_vehicle_ids?.length ?? 0) > 0,
  );
  const [allocation, setAllocation] = useState<string>(
    rule?.action.allocation_method ?? "none",
  );
  const [receipt, setReceipt] = useState<string>(
    rule?.action.receipt_required ?? "optional",
  );
  const [notes, setNotes] = useState(rule?.action.notes ?? "");

  const activeCats = store.expenseCategories.filter((c) => c.active);

  function save() {
    if (!name.trim() || !String(value).trim()) {
      toast.error("Enter a rule name and match value.");
      return;
    }
    const op: RuleConditionOp =
      field === "amount_min"
        ? "gte"
        : field === "amount_max"
          ? "lte"
          : field === "amount_equals"
            ? "equals"
            : field.includes("contains")
              ? "contains"
              : "equals";
    const condition = {
      field,
      op,
      value: field.startsWith("amount") ? Number(value) : value,
    };
    const action = {
      category_id: categoryId === "none" ? null : categoryId,
      scope: scope as ExpenseScope | "any",
      vehicle_id: vehicleId === "none" ? null : vehicleId,
      require_vehicle_selection: requireVehicle,
      multi_vehicle_ids: multiVehicle
        ? store.vehicles.slice(0, 3).map((v) => v.id)
        : null,
      allocation_method: (allocation === "none" ? null : allocation) as
        "equal_split" | "custom" | null,
      receipt_required: receipt as
        "required" | "optional" | "not_required" | null,
      review_state: "recorded" as const,
      notes: notes.trim() || null,
    };
    if (rule) {
      store.updateExpenseRule(rule.id, {
        name: name.trim(),
        conditions: [condition],
        mode,
        action,
      });
      toast.success("Rule updated.");
    } else {
      store.addExpenseRule({
        id: uid("rule"),
        tenant_id: "tnt_connectpro",
        name: name.trim(),
        conditions: [condition],
        action,
        mode,
        active: true,
        times_used: 0,
        last_matched_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      toast.success("Rule created.");
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "Add rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Rule name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Match condition</Label>
              <Select
                value={field}
                onValueChange={(v) => setField(v as RuleConditionField)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as RuleMode)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggest">Suggest Only</SelectItem>
                  <SelectItem value="auto_apply">Auto Apply</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {activeCats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="company_overhead">Overhead</SelectItem>
                  <SelectItem value="any">Any</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Specific vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {store.vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={requireVehicle}
                onChange={(e) => setRequireVehicle(e.target.checked)}
                className="h-4 w-4"
              />
              Require vehicle selection
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={multiVehicle}
                onChange={(e) => setMultiVehicle(e.target.checked)}
                className="h-4 w-4"
              />
              Multi-vehicle split
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Allocation</Label>
              <Select value={allocation} onValueChange={setAllocation}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  <SelectItem value="equal_split">Equal Split</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Receipt</Label>
              <Select value={receipt} onValueChange={setReceipt}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="not_required">Not Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{rule ? "Save rule" : "Add rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
