import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import type {
  Vehicle,
  VehicleStatus,
  VehicleType,
  VehicleFile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { decodeVin } from "@/lib/vin";
import { toast } from "sonner";
import { vehicleStatusMeta, fmtMoney } from "@/lib/format";
import { VehicleFileUploads } from "./VehicleFileUploads";
import { OwnershipSection } from "./OwnershipSection";

const VEHICLE_TYPE_OPTIONS: VehicleType[] = ["car", "suv", "van", "truck"];
export const DEFAULT_LOCATIONS = [
  "Miami Downtown",
  "Miami Airport",
  "Fort Lauderdale Yard",
  "Orlando Hub",
];
const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function VehicleForm({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: Vehicle) => void;
  onUpdate: (id: string, patch: Partial<Vehicle>) => void;
}) {
  const blank: Vehicle = {
    id: uid("veh"),
    vin: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    license_plate: "",
    status: "available",
    location: DEFAULT_LOCATIONS[0],
    vehicle_type: "car",
    vehicle_class_id: null,
    pricing_override: false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: 0,
    weekly_rate: 0,
    deposit_amount: 0,
    images: [],
    documents: [],
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_price: 0,
    current_mileage: 0,
    insurance_policy_number: "",
    insurance_expiry: "",
    registration_expiry: "",
    tenant_id: TENANT_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Build #6 — default ownership. Every active fleet vehicle has an ownership
    // type; company_owned requires no investor.
    ownership_type: "company_owned",
    owner_entity_id: null,
    owner_display_name: null,
    ownership_notes: null,
    ownership_effective_date: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState<Vehicle>(blank);
  const [decoding, setDecoding] = useState(false);
  const { vehicleClasses, depositPolicies } = useStore();
  const set = (patch: Partial<Vehicle>) => setForm((f) => ({ ...f, ...patch }));

  const runDecode = async () => {
    if (form.vin.length !== 17) {
      toast.error("Enter a 17-character VIN to look up.");
      return;
    }
    setDecoding(true);
    const res = await decodeVin(form.vin);
    setDecoding(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    set({
      make: res.make ?? form.make,
      model: res.model ?? form.model,
      year: res.year ?? form.year,
    });
    toast.success("VIN decoded — make, model, and year filled in.");
  };

  const onClassChange = (classId: string | null) => {
    const cls = vehicleClasses.find((c) => c.id === classId);
    set({
      vehicle_class_id: classId,
      pricing_override: false,
      deposit_override: false,
      min_rental_days_override: null,
      ...(cls
        ? {
            daily_rate: cls.daily_rate,
            weekly_rate: cls.weekly_rate,
            deposit_amount:
              depositPolicies.find(
                (d) => d.id === cls.default_deposit_policy_id && d.active,
              )?.amount ??
              depositPolicies.find((d) => d.is_default && d.active)?.amount ??
              0,
          }
        : {}),
    });
  };

  const valid =
    form.make && form.model && form.license_plate && form.vin.length === 17;
  const inheritedMin =
    vehicleClasses.find((c) => c.id === form.vehicle_class_id)
      ?.minimum_rental_duration ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add vehicle</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <Label>VIN</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={form.vin}
                onChange={(e) => set({ vin: e.target.value.toUpperCase() })}
                placeholder="17-character VIN"
                className="font-mono tabular"
                maxLength={17}
              />
              <Button
                type="button"
                variant="outline"
                onClick={runDecode}
                disabled={decoding}
              >
                {decoding ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Decode"
                )}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Look up make, model, and year from the VIN.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Make</Label>
              <Input
                value={form.make}
                onChange={(e) => set({ make: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Model</Label>
              <Input
                value={form.model}
                onChange={(e) => set({ model: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                value={form.year}
                onChange={(e) => set({ year: Number(e.target.value) })}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>License plate</Label>
              <Input
                value={form.license_plate}
                onChange={(e) =>
                  set({ license_plate: e.target.value.toUpperCase() })
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) =>
                  set({ status: e.target.value as VehicleStatus })
                }
                className={selectCls}
              >
                {(
                  [
                    "available",
                    "rented",
                    "maintenance",
                    "out_of_service",
                  ] as VehicleStatus[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {vehicleStatusMeta[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Type</Label>
              <select
                value={form.vehicle_type}
                onChange={(e) =>
                  set({ vehicle_type: e.target.value as VehicleType })
                }
                className={selectCls}
              >
                {VEHICLE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <Label>Location / Yard</Label>
              <select
                value={form.location}
                onChange={(e) => set({ location: e.target.value })}
                className={selectCls}
              >
                {DEFAULT_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Current mileage</Label>
              <Input
                type="number"
                value={form.current_mileage}
                onChange={(e) =>
                  set({ current_mileage: Number(e.target.value) })
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Purchase date</Label>
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(e) => set({ purchase_date: e.target.value })}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Purchase price ($)</Label>
              <Input
                type="number"
                value={form.purchase_price}
                onChange={(e) =>
                  set({ purchase_price: Number(e.target.value) })
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Insurance policy #</Label>
              <Input
                value={form.insurance_policy_number}
                onChange={(e) =>
                  set({ insurance_policy_number: e.target.value })
                }
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Insurance expiry</Label>
              <Input
                type="date"
                value={form.insurance_expiry}
                onChange={(e) => set({ insurance_expiry: e.target.value })}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Registration expiry</Label>
              <Input
                type="date"
                value={form.registration_expiry}
                onChange={(e) => set({ registration_expiry: e.target.value })}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>

          {/* Vehicle class & pricing */}
          <div className="rounded-md border border-border bg-surface-2 p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vehicle class & pricing
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Vehicle class</Label>
                <select
                  value={form.vehicle_class_id ?? ""}
                  onChange={(e) => onClassChange(e.target.value || null)}
                  className={selectCls}
                >
                  <option value="">— Select a class —</option>
                  {vehicleClasses
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} —{" "}
                        {c.weekly_rate > 0
                          ? `${fmtMoney(c.weekly_rate)}/wk`
                          : "weekly n/a"}
                      </option>
                    ))}
                </select>
                {form.vehicle_class_id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.pricing_override
                      ? "Custom vehicle rate — class defaults overridden."
                      : "Rates inherited from class. Edit a field to set a custom rate."}
                  </p>
                )}
              </div>
              <div>
                <Label>Daily rate ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.daily_rate}
                  onChange={(e) =>
                    set({
                      daily_rate: Number(e.target.value),
                      pricing_override: true,
                    })
                  }
                  className="mt-1 font-mono tabular"
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Weekly rate ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.weekly_rate}
                  onChange={(e) =>
                    set({
                      weekly_rate: Number(e.target.value),
                      pricing_override: true,
                    })
                  }
                  className="mt-1 font-mono tabular"
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Minimum rental (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.min_rental_days_override ?? inheritedMin}
                  onChange={(e) =>
                    set({ min_rental_days_override: Number(e.target.value) })
                  }
                  className="mt-1 font-mono tabular"
                  placeholder="Inherited from class"
                />
                {form.vehicle_class_id && !form.min_rental_days_override && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inherited from class
                  </p>
                )}
              </div>
              <div>
                <Label>Security deposit policy</Label>
                <select
                  value={form.deposit_amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__custom") return;
                    set({ deposit_amount: Number(v), deposit_override: true });
                  }}
                  className={selectCls}
                >
                  {depositPolicies.map((d) => (
                    <option key={d.id} value={d.amount}>
                      {d.name} — {fmtMoney(d.amount)}
                    </option>
                  ))}
                  <option value="__custom">Custom amount (enter below)</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label>Deposit amount ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.deposit_amount}
                  onChange={(e) =>
                    set({
                      deposit_amount: Number(e.target.value),
                      deposit_override: true,
                    })
                  }
                  className="mt-1 font-mono tabular"
                  placeholder="0"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Select a vehicle class to inherit rates, minimum rental, and
              deposit. Override any value per vehicle — the class itself stays
              unchanged.
            </p>
          </div>

          <OwnershipSection form={form} set={set} />

          <VehicleFileUploads
            images={form.images}
            documents={form.documents}
            onChange={(patch) => set(patch as Partial<Vehicle>)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => onSubmit(form)}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add to fleet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
