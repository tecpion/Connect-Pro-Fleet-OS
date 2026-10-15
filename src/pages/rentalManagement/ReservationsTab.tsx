// Connect Pro Fleet — Rental Management: Reservations tab.

import { Link } from "@/lib/router-compat";
import { StatusPill, reservationTone } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { EmptyState } from "@/components/ui-bits";
import {
  reservationStatusMeta,
  fmtMoneyExact,
  fmtDateShort,
  fmtDateTime,
  sourceMeta,
} from "@/lib/format";
import { CalendarDays } from "lucide-react";
import type { ReservationRow } from "@/lib/rentalManagementSelectors";

export function ReservationsTab({
  rows,
  navigate,
}: {
  rows: ReservationRow[];
  navigate: (path: string) => void;
}) {
  const columns: ResponsiveColumn<ReservationRow>[] = [
    {
      key: "id",
      header: "Reservation",
      mobilePrimary: true,
      render: (r) => (
        <div>
          <Link
            to={`/reservations/${r.id}`}
            className="font-mono text-xs font-medium uppercase tracking-wide text-foreground hover:text-primary"
          >
            {r.id}
          </Link>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {fmtDateTime(r.created_at)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      mobileSecondary: true,
      render: (r) => (
        <StatusPill tone={reservationTone(r.status)}>
          {reservationStatusMeta[r.status].label}
        </StatusPill>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => (
        <div>
          <Link
            to={`/reservations/${r.id}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {r.renter_name}
          </Link>
          <p className="text-xs text-muted-foreground">{r.renter_email}</p>
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      mobileHidden: true,
      render: (r) => (
        <span className="text-foreground">
          {r.vehicleName}{" "}
          <span className="font-mono text-xs text-muted-foreground">
            {r.vehiclePlate ?? ""}
          </span>
        </span>
      ),
    },
    {
      key: "pickup",
      header: "Pickup",
      mono: true,
      mobileHidden: true,
      render: (r) => fmtDateShort(r.start_date),
    },
    {
      key: "return",
      header: "Return",
      mono: true,
      render: (r) => fmtDateShort(r.end_date),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      render: (r) => (
        <div>
          <div className="font-mono tabular text-foreground">
            {fmtMoneyExact(r.amount_paid)}
          </div>
          <div className="font-mono text-xs tabular text-muted-foreground">
            of {fmtMoneyExact(r.total_price)}
          </div>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      mobileHidden: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {sourceMeta[r.source]}
        </span>
      ),
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No reservations"
        hint="Create a new reservation to block out vehicle dates and begin the rental journey."
        icon={<CalendarDays size={28} />}
      />
    );
  }

  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={(r) => navigate(`/reservations/${r.id}`)}
    />
  );
}
