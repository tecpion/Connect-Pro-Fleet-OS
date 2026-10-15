// Connect Pro Fleet — Reservation pricing panel + summary (Build #2).
//
// Renders the rate recommendation, minimum-rental warning, price override,
// deposit resolution, and final summary for the reservation creation flow.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/format";
import { AlertTriangle } from "lucide-react";
import type { EligibleVehicle } from "@/lib/reservationPricing";
import type { RateRecommendation } from "@/lib/reservationPricing";
import type { ResolvedDeposit } from "@/lib/vehicleClass";

interface MinCheck {
  ok: boolean;
  minimum: number;
  requested: number;
  message: string;
}

export function PricingPanel({
  vehicle,
  recommendation,
  minCheck,
  deposit,
  durationDays,
  recommendedTotal,
  finalPrice,
  customPrice,
  overrideReason,
  overrideMin,
  canOverridePrice,
  canOverrideMin,
  hasPricing,
  priceMissing,
  setCustomPrice,
  setOverrideReason,
  setOverrideMin,
}: {
  vehicle: EligibleVehicle;
  recommendation: RateRecommendation | null;
  minCheck: MinCheck | null;
  deposit: ResolvedDeposit | null;
  durationDays: number;
  recommendedTotal: number;
  finalPrice: number;
  customPrice: number | null;
  overrideReason: string;
  overrideMin: boolean;
  canOverridePrice: boolean;
  canOverrideMin: boolean;
  hasPricing: boolean;
  priceMissing: boolean;
  setCustomPrice: (v: number | null) => void;
  setOverrideReason: (v: string) => void;
  setOverrideMin: (v: boolean) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Pricing
      </h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Daily rate</p>
          <p className="font-mono tabular text-foreground">
            {vehicle.pricing.daily_rate > 0
              ? fmtMoneyExact(vehicle.pricing.daily_rate)
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Weekly rate</p>
          <p className="font-mono tabular text-foreground">
            {vehicle.pricing.weekly_rate > 0
              ? fmtMoneyExact(vehicle.pricing.weekly_rate)
              : "—"}
          </p>
        </div>
      </div>

      {hasPricing && recommendation ? (
        <div className="mt-3 flex items-end justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Recommended</p>
            <p className="font-mono text-lg font-semibold tabular text-foreground">
              {fmtMoneyExact(recommendedTotal)}
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            {recommendation.explanation}
          </p>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-status-maintenance">
          <AlertTriangle size={13} /> No weekly or daily rate is configured for
          this vehicle.
        </p>
      )}

      {minCheck && !minCheck.ok && (
        <div className="mt-3 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
          <p className="flex items-center gap-1.5">
            <AlertTriangle size={13} /> {minCheck.message}
          </p>
          {canOverrideMin && (
            <label className="mt-2 flex items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={overrideMin}
                onChange={(e) => setOverrideMin(e.target.checked)}
              />
              Override minimum (audited)
            </label>
          )}
        </div>
      )}

      {hasPricing && canOverridePrice && (
        <div className="mt-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={customPrice != null}
              onChange={(e) =>
                setCustomPrice(e.target.checked ? recommendedTotal : null)
              }
            />
            Override recommended price
          </label>
          {customPrice != null && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label>Final rental price ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customPrice}
                  onChange={(e) =>
                    setCustomPrice(Math.max(0, Number(e.target.value)))
                  }
                  className="mt-1 font-mono tabular"
                />
              </div>
              <div>
                <Label>Reason (required)</Label>
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. 30-day loyalty discount"
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {deposit && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Security deposit</p>
            <p className="font-mono tabular text-foreground">
              {fmtMoneyExact(deposit.amount)}
            </p>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            {deposit.source === "override"
              ? "Vehicle override"
              : deposit.source === "class"
                ? `${deposit.className} class`
                : (deposit.policyName ?? "Company default")}
          </p>
        </div>
      )}
    </div>
  );
}

export function ReservationSummary({
  vehicle,
  durationDays,
  recommendedTotal,
  finalPrice,
  hasPricing,
  priceMissing,
}: {
  vehicle: EligibleVehicle;
  durationDays: number;
  recommendedTotal: number;
  finalPrice: number;
  hasPricing: boolean;
  priceMissing: boolean;
}) {
  if (!hasPricing || priceMissing) return null;
  return (
    <div className="rounded-md border border-border p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Summary
      </h4>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Vehicle</dt>
          <dd className="font-medium text-foreground">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-mono tabular text-foreground">
            {durationDays} day{durationDays === 1 ? "" : "s"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Recommended</dt>
          <dd className="font-mono tabular text-muted-foreground">
            {fmtMoneyExact(recommendedTotal)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1.5">
          <dt className="font-medium text-foreground">Final rental price</dt>
          <dd className="font-mono text-base font-semibold tabular text-primary">
            {fmtMoneyExact(finalPrice)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
