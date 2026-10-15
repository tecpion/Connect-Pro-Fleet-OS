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
import { Plus } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import type { DepositPolicy } from "@/lib/types";
import { Field, selectClass } from "./shared";

export function DepositsSection() {
  const {
    depositPolicies,
    vehicleClasses,
    addDepositPolicy,
    updateDepositPolicy,
    setDefaultDepositPolicy,
    logSettingsChange,
  } = useStore();
  const [open, setOpen] = useState(false);

  const blank: DepositPolicy = {
    id: uid("dep"),
    tenant_id: TENANT_ID,
    name: "",
    amount: 0,
    description: "",
    vehicle_class_id: null,
    vehicle_type: null,
    is_default: false,
    active: true,
    created_at: new Date().toISOString(),
  };
  const [form, setForm] = useState<DepositPolicy>(blank);
  const set = (patch: Partial<DepositPolicy>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setForm(blank);
            setOpen(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add deposit policy
        </Button>
      </div>

      <div className="space-y-3">
        {depositPolicies.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display text-sm font-semibold text-foreground">
                  {d.name}
                </p>
                {d.is_default && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {d.description}
              </p>
              <p className="mt-1 font-mono text-sm tabular text-foreground">
                {fmtMoney(d.amount)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!d.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDefaultDepositPolicy(d.id);
                    logSettingsChange({
                      action: "Default deposit set",
                      new_value: d.name,
                    });
                    toast.success(`${d.name} is now the default deposit.`);
                  }}
                >
                  Set default
                </Button>
              )}
              <Switch
                checked={d.active}
                onCheckedChange={(v) =>
                  updateDepositPolicy(d.id, { active: v })
                }
              />
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add deposit policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Deposit rule name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Amount ($)">
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => set({ amount: Number(e.target.value) })}
                className="font-mono tabular"
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="Associated vehicle class (optional)">
              <select
                value={form.vehicle_class_id ?? ""}
                onChange={(e) =>
                  set({ vehicle_class_id: e.target.value || null })
                }
                className={selectClass}
              >
                <option value="">None</option>
                {vehicleClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Enter a deposit name.");
                  return;
                }
                addDepositPolicy(form);
                logSettingsChange({
                  action: "Deposit policy created",
                  new_value: form.name,
                });
                toast.success("Deposit policy added.");
                setOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Add policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
