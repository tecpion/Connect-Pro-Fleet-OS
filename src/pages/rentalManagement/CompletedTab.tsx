// Connect Pro Fleet — Rental Management: Completed tab.

import { Link } from "@/lib/router-compat";
import { StatusPill } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { EmptyState } from "@/components/ui-bits";
import { fmtMoneyExact, fmtDateShort } from "@/lib/format";
import { FileText, CheckCircle2 } from "lucide-react";
import type { CompletedRentalRow } from "@/lib/rentalManagementSelectors";

export function CompletedTab({
  rows,
  navigate,
}: {
  rows: CompletedRentalRow[];
  navigate: (path: string) => void;
}) {
  const columns: ResponsiveColumn<CompletedRentalRow>[] = [
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
            {r.actualReturn ? fmtDateShort(r.actualReturn) : "—"}
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
      header: "Start",
      mono: true,
      mobileHidden: true,
      render: (r) => (r.checkout ? fmtDateShort(r.checkout) : "—"),
    },
    {
      key: "return",
      header: "Return",
      mono: true,
      render: (r) => (r.actualReturn ? fmtDateShort(r.actualReturn) : "—"),
    },
    {
      key: "amount",
      header: "Final amount",
      align: "right",
      mono: true,
      render: (r) => (
        <div className="font-mono tabular text-foreground">
          {fmtMoneyExact(r.finalAmount)}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: () => (
        <StatusPill tone="neutral">
          <CheckCircle2 size={12} /> Completed
        </StatusPill>
      ),
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No completed rentals"
        hint="Finished rental history will appear here once returns are processed."
        icon={<FileText size={28} />}
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
