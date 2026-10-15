// Connect Pro Fleet — Rental Management: Active Rentals tab.

import { Link } from "@/lib/router-compat";
import { StatusPill, rentalTone } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { EmptyState } from "@/components/ui-bits";
import {
  rentalStatusMeta,
  fmtMoneyExact,
  fmtDateShort,
  fmtDateTime,
} from "@/lib/format";
import { Car } from "lucide-react";
import type { ActiveRentalRow } from "@/lib/rentalManagementSelectors";

export function ActiveTab({
  rows,
  navigate,
}: {
  rows: ActiveRentalRow[];
  navigate: (path: string) => void;
}) {
  const columns: ResponsiveColumn<ActiveRentalRow>[] = [
    {
      key: "agreement",
      header: "Rental",
      mobilePrimary: true,
      render: (r) => (
        <div>
          <Link
            to={`/rentals/${r.id}`}
            className="font-mono text-xs font-medium uppercase tracking-wide text-foreground hover:text-primary"
          >
            {r.agreement_number}
          </Link>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {fmtDateTime(r.created_at)}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      mobileSecondary: true,
      render: (r) =>
        r.customerId ? (
          <Link
            to={`/customers/${r.customerId}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {r.customerName}
          </Link>
        ) : (
          <span className="text-muted-foreground">{r.customerName}</span>
        ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      mobileHidden: true,
      render: (r) =>
        r.vehicleId ? (
          <Link
            to={`/vehicles/${r.vehicleId}`}
            className="text-foreground hover:text-primary"
          >
            {r.vehicleName}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "checkout",
      header: "Checkout",
      mono: true,
      mobileHidden: true,
      render: (r) => (r.checkout ? fmtDateShort(r.checkout) : "—"),
    },
    {
      key: "return",
      header: "Scheduled return",
      mono: true,
      render: (r) => fmtDateShort(r.scheduledReturn),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      mono: true,
      render: (r) => (
        <div className="font-mono tabular text-foreground">
          {fmtMoneyExact(r.balance)}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusPill tone={rentalTone(r.status)}>
          {rentalStatusMeta[r.status].label}
        </StatusPill>
      ),
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No active rentals"
        hint="Rentals currently out with customers will appear here. Start one from a confirmed reservation."
        icon={<Car size={28} />}
      />
    );
  }

  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={(r) => navigate(`/rentals/${r.id}`)}
    />
  );
}
