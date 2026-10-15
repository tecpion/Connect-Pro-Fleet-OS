// Connect Pro Fleet — Rental Management: Ready for Checkout tab.

import { Link } from "@/lib/router-compat";
import { StatusPill } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { EmptyState } from "@/components/ui-bits";
import { fmtMoneyExact, fmtDateShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import type { ReadyForCheckoutRow } from "@/lib/rentalManagementSelectors";

function readinessTone(
  readiness: ReadyForCheckoutRow["readiness"],
): "available" | "maintenance" | "out" | "neutral" {
  if (readiness === "ready") return "available";
  if (readiness === "vehicle_issue" || readiness === "not_ready") return "out";
  return "maintenance";
}

export function ReadyTab({
  rows,
  navigate,
}: {
  rows: ReadyForCheckoutRow[];
  navigate: (path: string) => void;
}) {
  const columns: ResponsiveColumn<ReadyForCheckoutRow>[] = [
    {
      key: "customer",
      header: "Customer",
      mobilePrimary: true,
      render: (r) => (
        <div>
          <Link
            to={`/reservations/${r.reservationId}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {r.renter_name}
          </Link>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {r.reservationId}
          </p>
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      mobileSecondary: true,
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
      key: "payment",
      header: "Payment",
      align: "right",
      mono: true,
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
      key: "deposit",
      header: "Deposit",
      align: "right",
      mono: true,
      mobileHidden: true,
      render: (r) => (
        <div>
          <div className="font-mono tabular text-foreground">
            {fmtMoneyExact(r.depositRequired - r.depositCollectDue)}
          </div>
          <div className="font-mono text-xs tabular text-muted-foreground">
            of {fmtMoneyExact(r.depositRequired)}
          </div>
        </div>
      ),
    },
    {
      key: "readiness",
      header: "Readiness",
      render: (r) => (
        <StatusPill tone={readinessTone(r.readiness)}>
          {r.readinessLabel}
        </StatusPill>
      ),
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (r) =>
        r.readiness === "ready" ? (
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={(e) => {
              e.stopPropagation();
              // Reuse the EXISTING conversion + checkout workflow.
              navigate(`/reservations/${r.reservationId}`);
            }}
          >
            <ClipboardCheck size={14} className="mr-1.5" /> Start rental
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/reservations/${r.reservationId}`);
            }}
          >
            Resolve
          </Button>
        ),
    },
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing ready for checkout"
        hint="Confirmed reservations with verification, deposit, and payment in place will appear here."
        icon={<ClipboardCheck size={28} />}
      />
    );
  }

  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.reservationId}
      onRowClick={(r) => navigate(`/reservations/${r.reservationId}`)}
    />
  );
}
