// Connect Pro Fleet — Telematics Trips tab (V1).
//
// Trip-to-rental matching derives from vehicle + time window + rental
// possession dates (selectTripRentalLink). No Rental records are created or
// altered. Filters: Today / Yesterday / Last 7 Days / Custom range / Vehicle /
// Rental. Org-scoped.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import {
  selectTelematicsTrips,
  type TelematicsTripRow,
} from "@/lib/telematicsSelectors";
import { useLiveClock } from "@/lib/useLiveClock";
import { fmtDateTime, fmtDateOnly } from "@/lib/format";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { Route as TripIcon } from "lucide-react";
import { TelemetryValue } from "./TelematicsPrimitives";

type RangeKey = "today" | "yesterday" | "last7" | "custom";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "custom", label: "Custom" },
];

function rangeBounds(
  key: RangeKey,
  customStart: string,
  customEnd: string,
  now: Date,
) {
  if (key === "custom") {
    const start = customStart ? new Date(customStart + "T00:00:00Z") : null;
    const end = customEnd ? new Date(customEnd + "T23:59:59Z") : null;
    return { start, end };
  }
  const end = now;
  const start = new Date(now);
  if (key === "today") start.setHours(0, 0, 0, 0);
  else if (key === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
  } else if (key === "last7") {
    start.setDate(start.getDate() - 7);
  }
  return { start, end };
}

export function TripsTab({
  initialVehicleId,
}: {
  initialVehicleId?: string | null;
}) {
  const { vehicles, rentals, customers } = useStore();
  const t = useTelematics();
  const now = useLiveClock();
  const [range, setRange] = useState<RangeKey>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<string>(
    initialVehicleId ?? "all",
  );
  const [rentalOnly, setRentalOnly] = useState(false);

  const { start, end } = rangeBounds(range, customStart, customEnd, now);

  const trips = useMemo(
    () =>
      selectTelematicsTrips({ vehicles, rentals, customers }, t, {
        start: start ?? undefined,
        end: end ?? undefined,
        vehicleId: vehicleFilter === "all" ? undefined : vehicleFilter,
        rentalOnly,
      }),
    [vehicles, rentals, customers, t, start, end, vehicleFilter, rentalOnly],
  );

  const vehicleOptions = useMemo(
    () => vehicles.filter((v) => t.devices.some((d) => d.vehicle_id === v.id)),
    [vehicles, t.devices],
  );

  return (
    <SectionCard
      title="Trips"
      icon={<TripIcon size={16} className="text-primary" />}
      data-testid="telematics-trips"
    >
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={
                "rounded px-2.5 py-1 text-xs font-medium transition " +
                (range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-xs"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-xs"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Vehicle</span>
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="all">All vehicles</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vin ?? v.id} · {v.year} {v.make} {v.model}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={rentalOnly}
              onChange={(e) => setRentalOnly(e.target.checked)}
            />
            <span className="text-muted-foreground">
              Linked to a rental only
            </span>
          </label>
        </div>
      </div>

      {trips.length === 0 ? (
        <EmptyState
          title="No trips in this range"
          hint="Trips are derived from device movement data."
          icon={<TripIcon size={24} />}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Vehicle</th>
                <th className="py-2 pr-3 font-medium">Renter / Rental</th>
                <th className="py-2 pr-3 font-medium">Start</th>
                <th className="py-2 pr-3 font-medium">End</th>
                <th className="py-2 pr-3 font-medium">Route</th>
                <th className="py-2 pr-3 font-medium">Distance</th>
                <th className="py-2 pr-3 font-medium">Max speed</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((tr) => (
                <tr key={tr.id} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    <Link
                      to={`/vehicles/${tr.vehicle_id}`}
                      className="font-medium text-primary hover:text-primary-press"
                    >
                      {tr.vehicle_label}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {tr.plate}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    {tr.rental_id ? (
                      <>
                        <div>{tr.renter_name}</div>
                        <Link
                          to={`/rentals/${tr.rental_id}`}
                          className="text-xs text-primary hover:text-primary-press"
                        >
                          {tr.rental_number}
                        </Link>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{fmtDateOnly(tr.started_at)}</td>
                  <td className="py-2 pr-3">{fmtDateOnly(tr.ended_at)}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {tr.start_location} → {tr.end_location}
                  </td>
                  <td className="py-2 pr-3">
                    <TelemetryValue value={tr.distance} suffix="mi" />
                  </td>
                  <td className="py-2 pr-3">
                    <TelemetryValue value={tr.max_speed} suffix="mph" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {trips.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {trips.length} trip{trips.length === 1 ? "" : "s"} · matched to
          rentals via vehicle + time window + possession dates.
        </p>
      )}
    </SectionCard>
  );
}
