// Connect Pro Fleet — Reservation pricing summary card (Build #2).
//
// Shown on the Reservation Detail page. Prefers the pricing snapshot captured
// at booking (historical integrity) and falls back to current effective
// pricing for legacy reservations created before Build #2.

import { useStore } from "@/lib/store";
import type { Reservation } from "@/lib/types";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { fmtMoneyExact, fmtMoney, daysBetween } from "@/lib/format";

export function PricingSummaryCard({ res }: { res: Reservation }) {
  const { vehicles, vehicleClasses } = useStore();
  const snap = res.pricing_snapshot;
  const vehicle = vehicles.find((v) => v.id === res.vehicle_id);

  const dailyRate = snap?.daily_rate ?? vehicle?.daily_rate ?? 0;
  const weeklyRate = snap?.weekly_rate ?? vehicle?.weekly_rate ?? 0;
  const className =
    snap?.vehicle_class_name ??
    vehicleClasses.find((c) => c.id === vehicle?.vehicle_class_id)?.name ??
    "—";
  const duration =
    snap?.duration_days ?? daysBetween(res.start_date, res.end_date);
  const recommended = snap?.recommended_total ?? res.total_price;
  const overridden = snap?.override_amount != null;
  const finalPrice = res.total_price;

  return (
    <SectionCard title="Pricing summary">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div>
          <DataLabel>Vehicle class</DataLabel>
          <DataValue>{className}</DataValue>
        </div>
        <div>
          <DataLabel>Duration</DataLabel>
          <DataValue mono>
            {duration} day{duration === 1 ? "" : "s"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Daily rate</DataLabel>
          <DataValue mono>
            {dailyRate > 0 ? fmtMoneyExact(dailyRate) : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Weekly rate</DataLabel>
          <DataValue mono>
            {weeklyRate > 0 ? fmtMoneyExact(weeklyRate) : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Recommended</DataLabel>
          <DataValue mono className="text-muted-foreground">
            {fmtMoneyExact(recommended)}
          </DataValue>
        </div>
        <div>
          <DataLabel>Final rental price</DataLabel>
          <DataValue mono className="font-semibold text-primary">
            {fmtMoneyExact(finalPrice)}
          </DataValue>
        </div>
      </dl>

      {overridden && (
        <div className="mt-3 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
          <p>
            Custom price override —{" "}
            <span className="font-mono tabular">
              {snap?.override_amount && snap.override_amount < 0 ? "-" : "+"}
              {fmtMoney(Math.abs(snap?.override_amount ?? 0))}
            </span>{" "}
            from recommended.
          </p>
          {snap?.override_reason && (
            <p className="mt-0.5 text-foreground">
              Reason: {snap.override_reason}
            </p>
          )}
        </div>
      )}

      {snap && (
        <p className="mt-2 text-xs text-muted-foreground">
          Pricing captured at booking — unaffected by later class rate changes.
        </p>
      )}
    </SectionCard>
  );
}
