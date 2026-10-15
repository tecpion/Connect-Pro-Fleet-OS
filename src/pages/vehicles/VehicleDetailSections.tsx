// Connect Pro Fleet — VehicleDetail secondary sections (Build #14).
// Extracted from VehicleDetail.tsx to keep it under the line limit: documents,
// reservation history, and the Stat/Legend helpers. The expenses section lives
// in VehicleExpensesSection.tsx.

import { Link } from "@/lib/router-compat";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  fmtMoneyExact,
  fmtDateShort,
  reservationStatusMeta,
} from "@/lib/format";
import type { Reservation } from "@/lib/types";
import type { VehicleFile } from "@/lib/vehicleFileTypes";
import { Car, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

function reservationTone(
  s: string,
): "available" | "maintenance" | "out" | "rented" | "neutral" {
  return (
    reservationStatusMeta[s as keyof typeof reservationStatusMeta]?.tone ??
    "neutral"
  );
}

export function VehicleDocuments({ docs }: { docs: VehicleFile[] }) {
  return (
    <SectionCard title="Documents & files">
      {docs.length === 0 ? (
        <EmptyState
          title="No documents attached"
          hint="Upload registration, insurance, title, or inspection reports to keep everything in one place."
          icon={<FileText size={24} />}
        />
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((doc) => (
            <li
              key={doc.url}
              className="flex items-center justify-between gap-2 py-3"
            >
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-sm text-foreground hover:text-primary"
              >
                <FileText
                  size={15}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate font-medium">{doc.name}</span>
                <span className="shrink-0 font-mono text-xs tabular text-muted-foreground">
                  {(doc.size / 1024).toFixed(0)} KB
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function VehicleReservationHistory({
  reservations,
}: {
  reservations: Reservation[];
}) {
  return (
    <SectionCard title="Reservation history">
      {reservations.length === 0 ? (
        <EmptyState
          title="No reservations yet"
          hint="Bookings for this vehicle will appear here once confirmed."
          icon={<Car size={24} />}
        />
      ) : (
        <ul className="divide-y divide-border">
          {reservations.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <Link
                to={`/reservations/${r.id}`}
                className="font-medium text-foreground hover:text-primary"
              >
                {r.renter_name}
              </Link>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm tabular text-muted-foreground">
                  {fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}
                </span>
                <span className="font-mono text-sm tabular text-foreground">
                  {fmtMoneyExact(r.total_price)}
                </span>
                <StatusPill
                  tone={
                    reservationStatusMeta[r.status].tone === "neutral"
                      ? "neutral"
                      : reservationTone(r.status)
                  }
                >
                  {reservationStatusMeta[r.status].label}
                </StatusPill>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface-2 p-3",
        highlight && "border-primary/30",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", color)} />{" "}
      {label}
    </span>
  );
}
