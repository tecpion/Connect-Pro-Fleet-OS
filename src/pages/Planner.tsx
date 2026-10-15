import { useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui-bits";
import { fmtDateShort, statusToneClasses } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

type ViewMode = "day" | "week" | "2week" | "month";

const VIEW_DAYS: Record<ViewMode, number> = {
  day: 1,
  week: 7,
  "2week": 14,
  month: 30,
};

interface Block {
  rentalId?: string;
  reservationId?: string;
  maintenanceId?: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  label: string;
  sub: string;
  tone: "available" | "maintenance" | "out" | "rented" | "neutral";
  to: string;
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export default function Planner() {
  const { vehicles, rentals, reservations, maintenance, customers } =
    useStore();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => toISO(new Date()));
  const [locationFilter, setLocationFilter] = useState<string | "all">("all");

  const days = useMemo(() => {
    const count = VIEW_DAYS[view];
    return Array.from({ length: count }, (_, i) => addDays(anchor, i));
  }, [anchor, view]);

  // Build all blocks
  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    for (const r of rentals) {
      if (r.status === "cancelled") continue;
      const customer = customers.find((c) => c.id === r.customer_id);
      const tone =
        r.status === "overdue"
          ? "out"
          : r.status === "late"
            ? "maintenance"
            : r.status === "completed"
              ? "neutral"
              : "rented";
      out.push({
        rentalId: r.id,
        vehicleId: r.vehicle_id,
        startDate: r.checkout_date ?? r.scheduled_return_date,
        endDate: r.actual_return_date ?? r.scheduled_return_date,
        label: customer
          ? `${customer.first_name} ${customer.last_name}`
          : r.agreement_number,
        sub: r.agreement_number,
        tone,
        to: `/rentals/${r.id}`,
      });
    }
    for (const r of reservations) {
      if (
        ["cancelled", "blocked_license", "completed", "active"].includes(
          r.status,
        )
      )
        continue;
      if (r.converted_to_rental_id) continue;
      const tone = r.status === "confirmed" ? "available" : "maintenance";
      out.push({
        reservationId: r.id,
        vehicleId: r.vehicle_id,
        startDate: r.start_date,
        endDate: r.end_date,
        label: r.renter_name,
        sub: r.id,
        tone,
        to: `/reservations/${r.id}`,
      });
    }
    for (const m of maintenance) {
      if (m.completed_date) continue;
      const end = addDays(m.scheduled_date, 3);
      out.push({
        maintenanceId: m.id,
        vehicleId: m.vehicle_id,
        startDate: m.scheduled_date,
        endDate: end,
        label: m.service_type,
        sub: "Maintenance",
        tone: "maintenance",
        to: `/maintenance`,
      });
    }
    // Unavailable vehicles
    for (const v of vehicles) {
      if (v.status === "out_of_service") {
        out.push({
          vehicleId: v.id,
          startDate: days[0],
          endDate: days[days.length - 1],
          label: "Out of service",
          sub: v.license_plate,
          tone: "out",
          to: `/vehicles/${v.id}`,
        });
      }
    }
    return out;
  }, [rentals, reservations, maintenance, vehicles, customers, days]);

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter(
        (v) => locationFilter === "all" || v.location === locationFilter,
      ),
    [vehicles, locationFilter],
  );

  const locations = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.location))).sort(),
    [vehicles],
  );

  // Check double booking for a click
  const isAvailable = (vehicleId: string, start: string, end: string) => {
    return !blocks.some(
      (b) =>
        b.vehicleId === vehicleId &&
        overlaps(b.startDate, b.endDate, start, end),
    );
  };

  const shift = (delta: number) => {
    setAnchor((a) => addDays(a, delta));
  };

  const todayISO = toISO(new Date());

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fleet planner"
        subtitle={`${filteredVehicles.length} vehicles · ${view === "day" ? "Day" : view === "week" ? "Week" : view === "2week" ? "2 Week" : "Month"} view`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => setAnchor(todayISO)}
              className="font-mono tabular"
            >
              Today
            </Button>
          </div>
        }
      />

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(-VIEW_DAYS[view])}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="font-mono text-sm tabular text-foreground">
            {fmtDateShort(days[0])} → {fmtDateShort(days[days.length - 1])}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shift(VIEW_DAYS[view])}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["day", "week", "2week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                view === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {v === "day"
                ? "Day"
                : v === "week"
                  ? "Week"
                  : v === "2week"
                    ? "2 Week"
                    : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="min-w-[900px]">
          {/* Header row */}
          <div
            className="grid border-b border-border bg-surface-2"
            style={{
              gridTemplateColumns: `200px repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vehicle
            </div>
            {days.map((d) => {
              const isToday = d === todayISO;
              const isWeekend =
                new Date(d + "T00:00:00").getDay() === 0 ||
                new Date(d + "T00:00:00").getDay() === 6;
              return (
                <div
                  key={d}
                  className={cn(
                    "border-l border-border px-2 py-2 text-center",
                    isWeekend && "bg-surface-2",
                  )}
                >
                  <p
                    className={cn(
                      "font-mono text-xs tabular",
                      isToday
                        ? "font-semibold text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {new Date(d + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                    })}
                  </p>
                  <p
                    className={cn(
                      "font-mono text-xs tabular",
                      isToday ? "text-primary" : "text-foreground",
                    )}
                  >
                    {new Date(d + "T00:00:00").getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Vehicle rows */}
          {filteredVehicles.map((v) => {
            const vBlocks = blocks.filter((b) => b.vehicleId === v.id);
            return (
              <div
                key={v.id}
                className="grid border-b border-border last:border-b-0"
                style={{
                  gridTemplateColumns: `200px repeat(${days.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="px-3 py-2">
                  <Link
                    to={`/vehicles/${v.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary"
                  >
                    {v.make} {v.model}
                  </Link>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {v.license_plate}
                  </p>
                </div>
                {days.map((d) => {
                  const dayBlocks = vBlocks.filter((b) =>
                    overlaps(b.startDate, b.endDate, d, d),
                  );
                  return (
                    <div
                      key={d}
                      className="group relative min-h-[44px] border-l border-border p-0.5"
                      onClick={() => {
                        if (dayBlocks.length > 0) return;
                        const available = isAvailable(v.id, d, d);
                        if (!available) {
                          toast.error(
                            "That slot is already booked — pick another date.",
                          );
                          return;
                        }
                        navigate(`/vehicles/${v.id}`);
                      }}
                    >
                      {dayBlocks.map((b, i) => (
                        <Link
                          key={`${b.rentalId ?? b.reservationId ?? b.maintenanceId}-${i}`}
                          to={b.to}
                          className={cn(
                            "mb-0.5 block truncate rounded px-1.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80",
                            statusToneClasses[b.tone].bg,
                            statusToneClasses[b.tone].text,
                          )}
                          title={`${b.label} · ${fmtDateShort(b.startDate)} → ${fmtDateShort(b.endDate)}`}
                        >
                          {b.label}
                        </Link>
                      ))}
                      {dayBlocks.length === 0 && (
                        <div className="flex h-full min-h-[44px] items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                          <Plus size={12} className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {[
          { tone: "available" as const, label: "Reserved" },
          { tone: "rented" as const, label: "Active rental" },
          { tone: "maintenance" as const, label: "Maintenance / Late" },
          { tone: "out" as const, label: "Overdue / Unavailable" },
          { tone: "neutral" as const, label: "Completed" },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                statusToneClasses[item.tone].dot,
              )}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
