// Connect Pro Fleet — Settings > Taxes & Fees (Build #9).
// Tabs: Taxes / Fees. Manage TaxRule + FeeRule with create/edit/deactivate.
// Duplicate-rule warnings surface for taxes. Triggered fees are clearly
// marked so staff know they don't auto-post.

import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, AlertTriangle } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import {
  CHARGE_CATEGORY_LABELS,
  type ChargeCategory,
  type FeeFrequency,
  type FeeTrigger,
  type FeeRule,
  type TaxCalculationType,
  type TaxRule,
} from "@/lib/taxFeeTypes";
import { FEE_FREQUENCY_LABELS, FEE_TRIGGER_LABELS } from "@/lib/taxFeeTypes";
import { detectDuplicateTaxRules } from "@/lib/taxEngine";
import { Field, selectClass } from "./shared";

const TAXABLE_CATS: ChargeCategory[] = [
  "rental_rate",
  "addon",
  "administrative_fee",
  "delivery",
  "fuel",
  "mileage",
  "cleaning",
  "damage",
  "late_fee",
  "other",
];

export function TaxFeesSection() {
  const [tab, setTab] = useState<"taxes" | "fees">("taxes");
  const { taxRules, feeRules } = useStore();
  const dupes = detectDuplicateTaxRules(taxRules);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab("taxes")}
          className={
            tab === "taxes"
              ? "rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
              : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          Taxes
        </button>
        <button
          onClick={() => setTab("fees")}
          className={
            tab === "fees"
              ? "rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
              : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          Fees
        </button>
      </div>

      {dupes.length > 0 && tab === "taxes" && (
        <div className="flex items-start gap-2 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            {dupes.map((d, i) => (
              <p key={i}>{d.reason}</p>
            ))}
          </div>
        </div>
      )}

      {tab === "taxes" ? <TaxesTab /> : <FeesTab />}
    </div>
  );
}

function TaxesTab() {
  const { taxRules, addTaxRule, updateTaxRule, deactivateTaxRule } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const blank: TaxRule = {
    id: uid("tax"),
    tenant_id: TENANT_ID,
    name: "",
    description: "",
    calculation_type: "percentage",
    rate: 6,
    flat_amount: 0,
    taxable_categories: ["rental_rate", "addon"],
    excluded_categories: [],
    location_ids: [],
    active: true,
    effective_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    priority: taxRules.length + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  };
  const [form, setForm] = useState<TaxRule>(blank);
  const set = (patch: Partial<TaxRule>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setForm(blank);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (r: TaxRule) => {
    setForm(r);
    setEditId(r.id);
    setOpen(true);
  };

  const toggleCat = (
    cat: ChargeCategory,
    key: "taxable_categories" | "excluded_categories",
  ) => {
    setForm((f) => {
      const arr = f[key];
      return {
        ...f,
        [key]: arr.includes(cat) ? arr.filter((c) => c !== cat) : [...arr, cat],
      };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={openNew}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add tax rule
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Rate / Amount</th>
              <th className="px-3 py-2 font-medium">Applies to</th>
              <th className="px-3 py-2 font-medium">Effective</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {taxRules.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-foreground">
                  {r.name}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.calculation_type === "percentage" ? "Percentage" : "Flat"}
                </td>
                <td className="px-3 py-2 font-mono tabular text-foreground">
                  {r.calculation_type === "percentage"
                    ? `${r.rate}%`
                    : fmtMoney(r.flat_amount)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.taxable_categories
                    .map((c) => CHARGE_CATEGORY_LABELS[c])
                    .join(", ")}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {r.effective_date}
                </td>
                <td className="px-3 py-2">
                  <Switch
                    checked={r.active}
                    onCheckedChange={(v) => updateTaxRule(r.id, { active: v })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit tax rule" : "Add tax rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Tax name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="Calculation type">
              <select
                value={form.calculation_type}
                onChange={(e) =>
                  set({
                    calculation_type: e.target.value as TaxCalculationType,
                  })
                }
                className={selectClass}
              >
                <option value="percentage">Percentage</option>
                <option value="flat">Flat amount</option>
              </select>
            </Field>
            {form.calculation_type === "percentage" ? (
              <Field label="Rate (%)">
                <Input
                  type="number"
                  min={0}
                  value={form.rate}
                  onChange={(e) => set({ rate: Number(e.target.value) })}
                  className="font-mono tabular"
                />
              </Field>
            ) : (
              <Field label="Flat amount ($)">
                <Input
                  type="number"
                  min={0}
                  value={form.flat_amount}
                  onChange={(e) => set({ flat_amount: Number(e.target.value) })}
                  className="font-mono tabular"
                />
              </Field>
            )}
            <Field label="Effective date">
              <Input
                type="date"
                value={form.effective_date}
                onChange={(e) => set({ effective_date: e.target.value })}
              />
            </Field>
            <Field label="End date (optional)">
              <Input
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => set({ end_date: e.target.value || null })}
              />
            </Field>
            <Field
              label="Taxable categories"
              hint="Select which charge categories this tax applies to."
            >
              <div className="grid grid-cols-2 gap-1.5">
                {TAXABLE_CATS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.taxable_categories.includes(c)}
                      onChange={() => toggleCat(c, "taxable_categories")}
                    />
                    {CHARGE_CATEGORY_LABELS[c]}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Enter a tax name.");
                  return;
                }
                if (editId) {
                  updateTaxRule(editId, form);
                  toast.success("Tax rule updated.");
                } else {
                  addTaxRule(form);
                  toast.success("Tax rule added.");
                }
                setOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              {editId ? "Save" : "Add rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeesTab() {
  const { feeRules, addFeeRule, updateFeeRule, deactivateFeeRule } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const blank: FeeRule = {
    id: uid("fee"),
    tenant_id: TENANT_ID,
    name: "",
    description: "",
    calculation_type: "flat",
    amount: 50,
    rate: 0,
    percentage_base: [],
    frequency: "one_time",
    trigger: "rental_start",
    charge_category: "administrative_fee",
    taxable: true,
    waivable: true,
    amount_override_allowed: true,
    location_ids: [],
    include_in_vehicle_revenue: false,
    active: true,
    effective_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  };
  const [form, setForm] = useState<FeeRule>(blank);
  const set = (patch: Partial<FeeRule>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setForm(blank);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (r: FeeRule) => {
    setForm(r);
    setEditId(r.id);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={openNew}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add fee rule
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Fee</th>
              <th className="px-3 py-2 font-medium">Amount / Rate</th>
              <th className="px-3 py-2 font-medium">Frequency</th>
              <th className="px-3 py-2 font-medium">Trigger</th>
              <th className="px-3 py-2 font-medium">Taxable</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {feeRules.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{r.name}</p>
                  {r.frequency === "triggered" && (
                    <span className="text-xs text-status-maintenance">
                      Triggered — staff assesses
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono tabular text-foreground">
                  {r.calculation_type === "flat"
                    ? fmtMoney(r.amount)
                    : `${r.rate}%`}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {FEE_FREQUENCY_LABELS[r.frequency]}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {FEE_TRIGGER_LABELS[r.trigger]}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.taxable ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2">
                  <Switch
                    checked={r.active}
                    onCheckedChange={(v) => updateFeeRule(r.id, { active: v })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit fee rule" : "Add fee rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Fee name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="Calculation type">
              <select
                value={form.calculation_type}
                onChange={(e) =>
                  set({
                    calculation_type: e.target.value as "flat" | "percentage",
                  })
                }
                className={selectClass}
              >
                <option value="flat">Flat</option>
                <option value="percentage">Percentage</option>
              </select>
            </Field>
            {form.calculation_type === "flat" ? (
              <Field label="Amount ($)">
                <Input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => set({ amount: Number(e.target.value) })}
                  className="font-mono tabular"
                />
              </Field>
            ) : (
              <Field
                label="Rate (%)"
                hint="Percentage fees calculate against their configured base."
              >
                <Input
                  type="number"
                  min={0}
                  value={form.rate}
                  onChange={(e) => set({ rate: Number(e.target.value) })}
                  className="font-mono tabular"
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frequency">
                <select
                  value={form.frequency}
                  onChange={(e) =>
                    set({ frequency: e.target.value as FeeFrequency })
                  }
                  className={selectClass}
                >
                  {Object.entries(FEE_FREQUENCY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Trigger">
                <select
                  value={form.trigger}
                  onChange={(e) =>
                    set({ trigger: e.target.value as FeeTrigger })
                  }
                  className={selectClass}
                >
                  {Object.entries(FEE_TRIGGER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Charge category">
              <select
                value={form.charge_category}
                onChange={(e) =>
                  set({ charge_category: e.target.value as ChargeCategory })
                }
                className={selectClass}
              >
                {Object.entries(CHARGE_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Effective date">
              <Input
                type="date"
                value={form.effective_date}
                onChange={(e) => set({ effective_date: e.target.value })}
              />
            </Field>
            <Field label="End date (optional)">
              <Input
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => set({ end_date: e.target.value || null })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.taxable}
                  onCheckedChange={(v) => set({ taxable: v })}
                />
                Taxable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.waivable}
                  onCheckedChange={(v) => set({ waivable: v })}
                />
                Waivable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.amount_override_allowed}
                  onCheckedChange={(v) => set({ amount_override_allowed: v })}
                />
                Amount override allowed
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.include_in_vehicle_revenue}
                  onCheckedChange={(v) =>
                    set({ include_in_vehicle_revenue: v })
                  }
                />
                Include in vehicle revenue
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Enter a fee name.");
                  return;
                }
                if (editId) {
                  updateFeeRule(editId, form);
                  toast.success("Fee rule updated.");
                } else {
                  addFeeRule(form);
                  toast.success("Fee rule added.");
                }
                setOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              {editId ? "Save" : "Add rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
