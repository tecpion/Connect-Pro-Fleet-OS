// Connect Pro Fleet — vehicle availability calendar (extracted from
// VehicleDetail to keep that file under the line limit).

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface CalReservation {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
}
interface CalMaintenance {
  id: string;
  scheduled_date: string;
  completed_date: string | null;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function AvailabilityCalendar({
  reservations,
  maintenance,
  monthOffset,
}: {
  reservations: CalReservation[];
  maintenance: CalMaintenance[];
  monthOffset: number;
}) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cellDates = useMemo(() => {
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month, startWeekday, daysInMonth]);

  const dayStatus = (
    date: Date,
  ): "available" | "rented" | "maintenance" | "out" | null => {
    const iso = date.toISOString().slice(0, 10);
    const res = reservations.find(
      (r) => iso >= r.start_date && iso <= r.end_date,
    );
    if (res) return res.status === "cancelled" ? null : "rented";
    const mnt = maintenance.find(
      (m) =>
        !m.completed_date &&
        iso >= m.scheduled_date &&
        iso <= addDays(m.scheduled_date, 3),
    );
    if (mnt) return "maintenance";
    return "available";
  };

  const colorMap: Record<string, string> = {
    available: "bg-status-available/15 text-foreground",
    rented: "bg-status-rented/20 text-foreground",
    maintenance: "bg-status-maintenance/25 text-foreground",
    out: "bg-status-out/20 text-foreground",
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-foreground">
          {base.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cellDates.map((date, i) => {
          if (!date) return <div key={i} className="aspect-square" />;
          const iso = date.toISOString().slice(0, 10);
          const status = dayStatus(date);
          const isToday = iso === today.toISOString().slice(0, 10);
          return (
            <div
              key={i}
              className={cn(
                "flex aspect-square items-center justify-center rounded-sm border text-xs font-mono tabular",
                status
                  ? colorMap[status]
                  : "bg-surface-2 text-muted-foreground",
                isToday && "border-primary ring-1 ring-primary",
              )}
              title={status ? status : "Available"}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
