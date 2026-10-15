// Connect Pro Fleet — Vehicle picker option card (Build #2).

import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import type { EligibleVehicle } from "@/lib/reservationPricing";
import { Check, Car } from "lucide-react";

export function VehicleOption({
  vehicle,
  selected,
  onSelect,
}: {
  vehicle: EligibleVehicle;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-surface hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-surface-2 text-muted-foreground",
          )}
        >
          {selected ? <Check size={16} /> : <Car size={16} />}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {vehicle.license_plate} · {vehicle.location}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm tabular text-foreground">
          {vehicle.pricing.weekly_rate > 0
            ? `${fmtMoney(vehicle.pricing.weekly_rate)}/wk`
            : vehicle.pricing.daily_rate > 0
              ? `${fmtMoney(vehicle.pricing.daily_rate)}/day`
              : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          {vehicle.pricing.source === "override" ? "Custom rate" : "Class rate"}
        </p>
      </div>
    </button>
  );
}
