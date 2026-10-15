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
import { Plus, Pencil, Copy, Power } from "lucide-react";
import { fmtMoneyExact } from "@/lib/format";
import type { VehicleClass } from "@/lib/types";
import { suggestDaily, suggestWeekly } from "@/lib/vehicleClass";
import { Field, selectClass } from "./shared";

export function VehicleClassesSection() {
  const {
    vehicleClasses,
    vehicles,
    depositPolicies,
    addVehicleClass,
    updateVehicleClass,
    duplicateVehicleClass,
    logSettingsChange,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<VehicleClass | null>(
    null,
  );

  const blank: VehicleClass = {
    id: uid("cls"),
    tenant_id: TENANT_ID,
    name: "",
    description: "",
    daily_rate: 0,
    weekly_rate: 0,
    minimum_rental_duration: 1,
    minimum_rental_unit: "day",
    default_deposit_policy_id: null,
    active: true,
    display_order: vehicleClasses.length + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  };
  const [form, setForm] = useState<VehicleClass>(blank);
  // Track whether each rate was manually edited so suggestions don't clobber.
  const [manualDaily, setManualDaily] = useState(false);
  const [manualWeekly, setManualWeekly] = useState(false);
  const set = (patch: Partial<VehicleClass>) =>
    setForm((f) => ({ ...f, ...patch }));

  const openAdd = () => {
    setForm(blank);
    setManualDaily(false);
    setManualWeekly(false);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (c: VehicleClass) => {
    setForm(c);
    setManualDaily(true);
    setManualWeekly(true);
    setEditId(c.id);
    setOpen(true);
  };

  const onWeeklyChange = (weekly: number) => {
    set({ weekly_rate: weekly });
    if (!manualDaily) set({ daily_rate: suggestDaily(weekly) });
  };
  const onDailyChange = (daily: number) => {
    set({ daily_rate: daily });
    if (!manualWeekly) set({ weekly_rate: suggestWeekly(daily) });
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Enter a class name.");
      return;
    }
    if (editId) {
      const prev = vehicleClasses.find((c) => c.id === editId);
      updateVehicleClass(editId, form);
      logSettingsChange({
        action: "Vehicle class updated",
        new_value: form.name,
        old_value: prev ? `${prev.name} · $${prev.weekly_rate}/wk` : null,
      });
      toast.success("Vehicle class saved.");
    } else {
      addVehicleClass(form);
      logSettingsChange({
        action: "Vehicle class created",
        new_value: form.name,
      });
      toast.success("Vehicle class created.");
    }
    setOpen(false);
  };

  const confirmDeactivate = () => {
    if (!deactivateTarget) return;
    const count = vehicles.filter(
      (v) => v.vehicle_class_id === deactivateTarget.id,
    ).length;
    updateVehicleClass(deactivateTarget.id, { active: false });
    logSettingsChange({
      action: "Vehicle class deactivated",
      new_value: deactivateTarget.name,
      detail: count ? `${count} vehicles retain this class.` : undefined,
    });
    toast.success(
      count
        ? `${deactivateTarget.name} deactivated. ${count} vehicles retain their class.`
        : `${deactivateTarget.name} deactivated.`,
    );
    setDeactivateTarget(null);
  };

  const activeClasses = [...vehicleClasses]
    .filter((c) => c.active)
    .sort((a, b) => a.display_order - b.display_order);
  const inactiveClasses = vehicleClasses.filter((c) => !c.active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Vehicle classes seed pricing, minimum rental, and deposit defaults.
          Override any value per vehicle.
        </p>
        <Button
          onClick={openAdd}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add vehicle class
        </Button>
      </div>

      {/* Active classes — table on desktop, cards on mobile */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="hidden w-full text-sm md:table">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Daily</th>
              <th className="px-4 py-3 font-medium">Weekly</th>
              <th className="px-4 py-3 font-medium">Minimum</th>
              <th className="px-4 py-3 font-medium">Vehicles</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeClasses.map((c) => {
              const count = vehicles.filter(
                (v) => v.vehicle_class_id === c.id,
              ).length;
              return (
                <tr key={c.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono tabular text-foreground">
                    {c.daily_rate > 0
                      ? `${fmtMoneyExact(c.daily_rate)}/day`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono tabular text-foreground">
                    {c.weekly_rate > 0
                      ? `${fmtMoneyExact(c.weekly_rate)}/wk`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono tabular text-foreground">
                    {c.minimum_rental_duration} day
                    {c.minimum_rental_duration > 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 font-mono tabular text-foreground">
                    {count}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-status-available">
                      <span className="h-1.5 w-1.5 rounded-full bg-status-available" />
                      Active
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(c)}
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          duplicateVehicleClass(c.id);
                          toast.success(`${c.name} duplicated.`);
                        }}
                        aria-label={`Duplicate ${c.name}`}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeactivateTarget(c)}
                        aria-label={`Deactivate ${c.name}`}
                      >
                        <Power size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="divide-y divide-border md:hidden">
          {activeClasses.map((c) => {
            const count = vehicles.filter(
              (v) => v.vehicle_class_id === c.id,
            ).length;
            return (
              <div key={c.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeactivateTarget(c)}
                    >
                      <Power size={14} />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Daily</p>
                    <p className="font-mono tabular text-foreground">
                      {c.daily_rate > 0
                        ? `${fmtMoneyExact(c.daily_rate)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Weekly</p>
                    <p className="font-mono tabular text-foreground">
                      {c.weekly_rate > 0
                        ? `${fmtMoneyExact(c.weekly_rate)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Minimum</p>
                    <p className="font-mono tabular text-foreground">
                      {c.minimum_rental_duration}d
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {count} vehicle{count !== 1 ? "s" : ""} · Active
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {inactiveClasses.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inactive
          </p>
          <div className="space-y-2">
            {inactiveClasses.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-muted-foreground line-through">
                    {c.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Deactivated — existing vehicles retain this class.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateVehicleClass(c.id, { active: true });
                    logSettingsChange({
                      action: "Vehicle class reactivated",
                      new_value: c.name,
                    });
                    toast.success(`${c.name} reactivated.`);
                  }}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit vehicle class" : "Add vehicle class"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Class name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Luxury, Pickup Truck, Exotic"
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Weekly rate ($)"
                hint={
                  !manualWeekly && form.daily_rate > 0
                    ? `Suggested ${fmtMoneyExact(suggestWeekly(form.daily_rate))}. You can change this.`
                    : undefined
                }
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.weekly_rate}
                  onChange={(e) => {
                    setManualWeekly(true);
                    onWeeklyChange(Number(e.target.value));
                  }}
                  className="font-mono tabular"
                />
              </Field>
              <Field
                label="Daily rate ($)"
                hint={
                  !manualDaily && form.weekly_rate > 0
                    ? `Suggested ${fmtMoneyExact(suggestDaily(form.weekly_rate))}. You can change this.`
                    : undefined
                }
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.daily_rate}
                  onChange={(e) => {
                    setManualDaily(true);
                    onDailyChange(Number(e.target.value));
                  }}
                  className="font-mono tabular"
                />
              </Field>
              <Field label="Minimum rental (days)">
                <Input
                  type="number"
                  min={1}
                  value={form.minimum_rental_duration}
                  onChange={(e) =>
                    set({ minimum_rental_duration: Number(e.target.value) })
                  }
                  className="font-mono tabular"
                />
              </Field>
              <Field label="Default deposit policy">
                <select
                  value={form.default_deposit_policy_id ?? ""}
                  onChange={(e) =>
                    set({ default_deposit_policy_id: e.target.value || null })
                  }
                  className={selectClass}
                >
                  <option value="">Company default</option>
                  {depositPolicies
                    .filter((d) => d.active)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} — {fmtMoneyExact(d.amount)}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave either rate blank for daily-only or weekly-only pricing.
              Suggestions use normal currency precision and never overwrite a
              rate you've set manually.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              {editId ? "Save" : "Create class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {(() => {
              if (!deactivateTarget) return "";
              const count = vehicles.filter(
                (v) => v.vehicle_class_id === deactivateTarget.id,
              ).length;
              return count
                ? `${count} vehicle${count > 1 ? "s" : ""} currently use this class. Existing vehicles will retain their class, but it will no longer be available for new assignments.`
                : "No vehicles currently use this class. It will no longer be available for new assignments.";
            })()}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Keep active
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeactivate}
              className="bg-status-out text-white hover:bg-status-out/90"
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
