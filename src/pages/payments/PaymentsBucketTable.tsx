// Connect Pro Fleet — Build #20 responsive Payments Due bucket table.
//
// Extracted from PaymentsDue.tsx (which hit the file size limit). Renders a
// single billing-obligation bucket as a responsive table: dense table on
// desktop, stacked cards on mobile. The high-frequency Payments Due screen
// never forces horizontal scrolling.

import { useStore } from "@/lib/store";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/format";
import type { PaymentRow } from "@/pages/payments/PaymentRowItem";

type Bucket = "due_today" | "due_tomorrow" | "late" | "paid_week" | "upcoming";

export function PaymentsBucketTable({
  items,
  bucket,
  onPay,
}: {
  items: PaymentRow[];
  bucket: Bucket;
  onPay: (r: PaymentRow) => void;
}) {
  const { rentals, customers, vehicles } = useStore();
  const isLate = bucket === "late";

  const columns: ResponsiveColumn<PaymentRow>[] = [
    {
      key: "customer",
      header: "Customer",
      mobilePrimary: true,
      render: (r) => {
        const rental = rentals.find((x) => x.id === r.rentalId);
        const customer = rental
          ? customers.find((c) => c.id === rental.customer_id)
          : null;
        return customer ? (
          <span className="font-medium text-foreground">
            {customer.first_name} {customer.last_name}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "vehicle",
      header: "Vehicle",
      mobileSecondary: true,
      render: (r) => {
        const rental = rentals.find((x) => x.id === r.rentalId);
        const vehicle = rental
          ? vehicles.find((v) => v.id === rental.vehicle_id)
          : null;
        return vehicle ? `${vehicle.make} ${vehicle.model}` : "—";
      },
    },
    {
      key: "agreement",
      header: "Agreement",
      mobileHidden: true,
      render: (r) => {
        const rental = rentals.find((x) => x.id === r.rentalId);
        return rental ? (
          <span className="font-mono text-xs uppercase tracking-wide text-foreground">
            {rental.agreement_number}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "amountDue",
      header: "Amount due",
      align: "right",
      mono: true,
      render: (r) =>
        bucket === "paid_week"
          ? fmtMoney(r.period.total_amount)
          : fmtMoney(r.amountDue),
    },
    {
      key: "due",
      header: "Due date",
      mono: true,
      render: (r) => {
        const d = new Date(r.period.due_at + "T00:00:00");
        const label = isNaN(d.getTime())
          ? r.period.due_at
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return (
          <span>
            {label}
            {isLate && (
              <span className="ml-1 font-mono text-status-out">
                · {r.daysLate}d late
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        bucket !== "paid_week" ? (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPay(r);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Record
          </Button>
        ) : (
          <span />
        ),
    },
  ];

  return (
    <ResponsiveTable
      columns={columns}
      rows={items}
      rowKey={(r) => r.period.id}
    />
  );
}
