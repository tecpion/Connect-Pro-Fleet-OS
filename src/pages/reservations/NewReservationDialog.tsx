// Connect Pro Fleet — Reservation creation flow (Build #2).
//
// Flow: Customer → Location → Dates → Vehicle Class → Eligible Vehicle →
//       Rate Recommendation → Deposit → Override (optional) → Summary → Save.
//
// Reuses centralized helpers from reservationPricing.ts and vehicleClass.ts.
// Captures a pricing snapshot at save time so historical reservations never
// change when a Vehicle Class default is edited later.

import { useMemo, useState } from "react";
import { useStore, uid } from "@/lib/store";
import type { Reservation } from "@/lib/types";
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
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  getEligibleVehicles,
  getRentalDuration,
  getRateRecommendation,
  getMinimumRentalDays,
  validateMinimumRental,
  type EligibleVehicle,
} from "@/lib/reservationPricing";
import {
  resolveDeposit,
  buildReservationSnapshot,
} from "@/lib/reservationSnapshot";
import { resolveVehicleDeposit } from "@/lib/vehicleClass";
import { AlertTriangle } from "lucide-react";
import { VehicleOption } from "./VehicleOption";
import { PricingPanel, ReservationSummary } from "./PricingPanel";
import { useCompliance } from "@/lib/complianceStoreProvider";

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function NewReservationDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (r: Reservation) => void;
}) {
  const {
    vehicles,
    vehicleClasses,
    depositPolicies,
    reservations,
    rentals,
    maintenance,
    locations,
    staff,
    roles,
    currentStaffId,
    creatorLabel,
    logActivity,
  } = useStore();
  const comp = useCompliance();

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canOverridePrice = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reservations.override_price",
  );
  const canOverrideMin = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reservations.override_minimum",
  );

  const defaultLoc =
    locations.find((l) => l.is_default)?.name ?? locations[0]?.name ?? "";

  const [form, setForm] = useState({
    renter_name: "",
    renter_email: "",
    renter_phone: "",
    location: defaultLoc,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    vehicle_class_id: "",
    vehicle_id: "",
  });
  const [customPrice, setCustomPrice] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideMin, setOverrideMin] = useState(false);

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  // Build #26 — compliance blocks keyed by vehicle id so availability excludes
  // compliance-blocked vehicles. Blocks coexist with maintenance/damage blocks.
  const complianceBlocks = useMemo(() => {
    const m: Record<string, { blocked: boolean; reasons: string[] }> = {};
    for (const v of vehicles) {
      const b = comp.complianceBlocksForVehicle(v.id);
      if (b.blocked) m[v.id] = b;
    }
    return m;
  }, [comp, vehicles]);

  const eligible = useMemo<EligibleVehicle[]>(() => {
    if (!form.vehicle_class_id) return [];
    return getEligibleVehicles(vehicles, vehicleClasses, {
      classId: form.vehicle_class_id,
      location: form.location || null,
      start: form.start_date,
      end: form.end_date,
      reservations,
      rentals,
      maintenance,
      complianceBlocks,
    });
  }, [
    vehicles,
    vehicleClasses,
    form.vehicle_class_id,
    form.location,
    form.start_date,
    form.end_date,
    reservations,
    rentals,
    maintenance,
    complianceBlocks,
  ]);

  const availableVehicles = eligible.filter((v) => v.available);
  const unavailableVehicles = eligible.filter((v) => !v.available);
  const selectedVehicle =
    eligible.find((v) => v.id === form.vehicle_id) ?? null;

  const durationDays = useMemo(
    () => getRentalDuration(form.start_date, form.end_date),
    [form.start_date, form.end_date],
  );

  const minCheck = useMemo(() => {
    if (!selectedVehicle) return null;
    return validateMinimumRental(selectedVehicle, vehicleClasses, durationDays);
  }, [selectedVehicle, vehicleClasses, durationDays]);

  const recommendation = useMemo(() => {
    if (!selectedVehicle) return null;
    return getRateRecommendation(selectedVehicle.pricing, durationDays);
  }, [selectedVehicle, durationDays]);

  const deposit = useMemo(
    () =>
      selectedVehicle
        ? resolveDeposit(selectedVehicle, vehicleClasses, depositPolicies)
        : null,
    [selectedVehicle, vehicleClasses, depositPolicies],
  );

  const recommendedTotal = recommendation?.recommended_total ?? 0;
  const finalPrice = customPrice != null ? customPrice : recommendedTotal;
  const hasPricing = recommendation?.hasPricing ?? false;
  const priceMissing = !hasPricing && customPrice == null;

  const onClassChange = (classId: string) => {
    set({ vehicle_class_id: classId, vehicle_id: "" });
    setCustomPrice(null);
    setOverrideReason("");
  };
  const onLocationChange = (loc: string) =>
    set({ location: loc, vehicle_id: "" });
  const onDatesChange = (patch: Partial<typeof form>) => set(patch);
  const onVehicleChange = (vehicleId: string) => {
    set({ vehicle_id: vehicleId });
    setCustomPrice(null);
    setOverrideReason("");
  };

  const valid =
    form.renter_name &&
    form.renter_email &&
    form.start_date < form.end_date &&
    form.vehicle_class_id &&
    selectedVehicle?.available &&
    !(!!minCheck && !minCheck.ok && !overrideMin) &&
    !priceMissing &&
    (customPrice == null || customPrice >= 0) &&
    (customPrice == null ||
      (canOverridePrice && overrideReason.trim().length > 0));

  const submit = () => {
    if (!valid || !selectedVehicle || !recommendation) return;
    const snapshot = buildReservationSnapshot({
      selectedVehicle,
      recommendation,
      vehicleClasses,
      classId: form.vehicle_class_id,
      durationDays,
      customPrice,
      recommendedTotal,
      finalPrice,
      overrideReason,
      currentStaffId,
    });
    onCreate({
      id: uid("res"),
      vehicle_id: form.vehicle_id,
      renter_name: form.renter_name,
      renter_email: form.renter_email,
      renter_phone: form.renter_phone,
      start_date: form.start_date,
      end_date: form.end_date,
      status: "pending_verification",
      source: "manual",
      ghl_opportunity_id: null,
      total_price: finalPrice,
      deposit_amount: deposit?.amount ?? 0,
      deposit_status: "held",
      amount_paid: 0,
      pricing_snapshot: snapshot,
      created_at: new Date().toISOString(),
      created_by: currentStaffId,
      created_by_name: creatorLabel(currentStaffId, "manual"),
      tenant_id: "tnt_connectpro",
    });
    if (snapshot?.override_amount != null) {
      logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Rental price overridden — Recommended ${fmtMoney(recommendedTotal)} → Final ${fmtMoney(finalPrice)} · ${overrideReason.trim()}`,
        tone: "maintenance",
      });
    }
    if (overrideMin && minCheck && !minCheck.ok) {
      logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Minimum rental duration overridden — ${minCheck.minimum} day minimum waived for ${minCheck.requested}-day rental`,
        tone: "maintenance",
      });
    }
  };

  const reset = () => {
    setForm({
      renter_name: "",
      renter_email: "",
      renter_phone: "",
      location: defaultLoc,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 3 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      vehicle_class_id: "",
      vehicle_id: "",
    });
    setCustomPrice(null);
    setOverrideReason("");
    setOverrideMin(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New reservation</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customer
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Renter name</Label>
                <Input
                  value={form.renter_name}
                  onChange={(e) => set({ renter_name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.renter_phone}
                  onChange={(e) => set({ renter_phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.renter_email}
                  onChange={(e) => set({ renter_email: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Location & dates
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Location</Label>
                <select
                  value={form.location}
                  onChange={(e) => onLocationChange(e.target.value)}
                  className={selectCls}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Pickup date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    onDatesChange({ start_date: e.target.value })
                  }
                  className="mt-1 font-mono tabular"
                />
              </div>
              <div>
                <Label>Return date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => onDatesChange({ end_date: e.target.value })}
                  className="mt-1 font-mono tabular"
                />
              </div>
            </div>
            {form.start_date &&
              form.end_date &&
              form.start_date < form.end_date && (
                <p className="font-mono text-xs tabular text-muted-foreground">
                  Duration: {durationDays} day{durationDays === 1 ? "" : "s"}
                </p>
              )}
            {form.start_date >= form.end_date &&
              form.start_date &&
              form.end_date && (
                <p className="flex items-center gap-1.5 text-xs text-status-out">
                  <AlertTriangle size={13} /> Return date must be after pickup
                  date.
                </p>
              )}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vehicle class
            </h4>
            <select
              value={form.vehicle_class_id}
              onChange={(e) => onClassChange(e.target.value)}
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
                      : c.daily_rate > 0
                        ? `${fmtMoney(c.daily_rate)}/day`
                        : "rates n/a"}
                  </option>
                ))}
            </select>
          </div>

          {form.vehicle_class_id && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Eligible vehicle
              </h4>
              {availableVehicles.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-surface-2 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No{" "}
                    {vehicleClasses.find((c) => c.id === form.vehicle_class_id)
                      ?.name ?? "vehicles"}{" "}
                    available for these dates.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Change the dates, location, or pick another vehicle class.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {availableVehicles.map((v) => (
                    <VehicleOption
                      key={v.id}
                      vehicle={v}
                      selected={form.vehicle_id === v.id}
                      onSelect={() => onVehicleChange(v.id)}
                    />
                  ))}
                </div>
              )}
              {unavailableVehicles.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    {unavailableVehicles.length} unavailable in this class
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {unavailableVehicles.map((v) => (
                      <li
                        key={v.id}
                        className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-1.5 text-xs"
                      >
                        <span className="text-muted-foreground">
                          {v.year} {v.make} {v.model} · {v.license_plate}
                        </span>
                        <span className="text-status-out">
                          {v.conflictReason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {selectedVehicle && recommendation && (
            <PricingPanel
              vehicle={selectedVehicle}
              recommendation={recommendation}
              minCheck={minCheck}
              deposit={deposit}
              durationDays={durationDays}
              recommendedTotal={recommendedTotal}
              finalPrice={finalPrice}
              customPrice={customPrice}
              overrideReason={overrideReason}
              overrideMin={overrideMin}
              canOverridePrice={canOverridePrice}
              canOverrideMin={canOverrideMin}
              hasPricing={hasPricing}
              priceMissing={priceMissing}
              setCustomPrice={setCustomPrice}
              setOverrideReason={setOverrideReason}
              setOverrideMin={setOverrideMin}
            />
          )}

          {selectedVehicle && (
            <ReservationSummary
              vehicle={selectedVehicle}
              durationDays={durationDays}
              recommendedTotal={recommendedTotal}
              finalPrice={finalPrice}
              hasPricing={hasPricing}
              priceMissing={priceMissing}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Create reservation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
