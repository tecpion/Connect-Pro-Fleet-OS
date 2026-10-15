// Connect Pro Fleet — Rental Management: Returns tab.

import { Link } from "@/lib/router-compat";
import { StatusPill, rentalTone } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { EmptyState } from "@/components/ui-bits";
import { rentalStatusMeta, fmtMoneyExact, fmtDateShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import type { ReturnRow } from "@/lib/rentalManagementSelectors";

export function ReturnsTab({
  rows,
  navigate,
}: {
  rows: ReturnRow[];
  navigate: (path: string) => void;
}) {
  const columns: ResponsiveColumn<ReturnRow>[] = [
    {
      key: "agreement",
      header: "Rental",
      mobilePrimary: true,
      render: (r) => (
        <Link
          to={`/rentals/${r.id}`}
          className="font-mono text-xs font-medium uppercase tracking-wide text-foreground hover:text-primary"
        >
          {r.agreement_number}
        </Link>
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
      key: "scheduled",
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
      header: "Return status",
      render: (r) => (
        <StatusPill tone={rentalTone(r.status)}>
          {rentalStatusMeta[r.status].label}
        </StatusPill>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            // Reuse the EXISTING return workflow.
            navigate(`/return/${r.id}`);
          }}
        >
          <RotateCcw size={14} className="mr-1.5" /> Process return
        </Button>
      ),
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No returns due"
        hint="Rentals scheduled for return today, pending, or overdue will appear here."
        icon={<RotateCcw size={28} />}
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
