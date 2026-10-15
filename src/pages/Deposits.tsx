// Connect Pro Fleet — Deposits page (Build #8 / Build #20 mobile polish).
//
// Operational deposit queue: filter by status (needs collection, held,
// refund pending, etc.) and search by customer / rental / vehicle. Surfaces
// refund-pending and uncollected deposits for staff attention without
// cluttering Payments Due (which is rental billing, not deposit money).
// Mobile renders stacked cards instead of a wide table.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { fmtMoneyExact, fmtDateShort } from "@/lib/format";
import { DEPOSIT_STATUS_LABELS, DEPOSIT_STATUS_TONE } from "@/lib/depositTypes";
import {
  getDepositHeldBalance,
  getDepositCollectDue,
  getDepositRefundDue,
} from "@/lib/deposit";
import { cn } from "@/lib/utils";

const FILTERS = [
  "all",
  "needs_collection",
  "held",
  "partially_applied",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "forfeited",
] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  needs_collection: "Needs collection",
  held: "Held",
  partially_applied: "Partially applied",
  refund_pending: "Refund pending",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  forfeited: "Forfeited",
};

interface DepositRow {
  id: string;
  customerId: string;
  customerName: string;
  rentalId?: string;
  rentalNumber?: string;
  reservationId: string;
  vehicleName: string;
  required: number;
  held: number;
  refundDue: number;
  status: keyof typeof DEPOSIT_STATUS_LABELS;
  updatedAt: string;
}

export default function Deposits() {
  const { rentalDeposits, rentals, customers, vehicles, customerName } =
    useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo<DepositRow[]>(() => {
    return rentalDeposits
      .map((d) => {
        const rental = rentals.find(
          (r) => r.id === d.rental_id || r.reservation_id === d.reservation_id,
        );
        const customer = customers.find((c) => c.id === d.customer_id);
        const vehicle = vehicles.find((v) => v.id === d.vehicle_id);
        return {
          d,
          rental,
          customer,
          vehicle,
          held: getDepositHeldBalance(d),
          collectDue: getDepositCollectDue(d),
          refundDue: getDepositRefundDue(d),
        };
      })
      .filter(
        ({ d, customer, rental, vehicle, held, collectDue, refundDue }) => {
          let match = true;
          if (filter === "needs_collection")
            match = collectDue > 0 && d.status !== "cancelled";
          else if (filter === "held") match = d.status === "held";
          else if (filter === "partially_applied")
            match = d.status === "partially_applied";
          else if (filter === "refund_pending")
            match = d.status === "refund_pending";
          else if (filter === "partially_refunded")
            match = d.status === "partially_refunded";
          else if (filter === "refunded") match = d.status === "refunded";
          else if (filter === "forfeited") match = d.status === "forfeited";
          if (!match) return false;
          if (query.trim()) {
            const q = query.toLowerCase();
            const label = customerName(d.customer_id).toLowerCase();
            const rentalNum = rental?.agreement_number.toLowerCase() ?? "";
            const veh = vehicle
              ? `${vehicle.make} ${vehicle.model} ${vehicle.license_plate}`.toLowerCase()
              : "";
            return (
              label.includes(q) || rentalNum.includes(q) || veh.includes(q)
            );
          }
          return true;
        },
      )
      .sort((a, b) => (a.d.updated_at < b.d.updated_at ? 1 : -1))
      .map(({ d, rental, vehicle, held, refundDue }) => ({
        id: d.id,
        customerId: d.customer_id,
        customerName: customerName(d.customer_id),
        rentalId: rental?.id,
        rentalNumber: rental?.agreement_number,
        reservationId: d.reservation_id,
        vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : "—",
        required: d.required_amount,
        held,
        refundDue,
        status: d.status,
        updatedAt: d.updated_at,
      }));
  }, [
    rentalDeposits,
    rentals,
    customers,
    vehicles,
    filter,
    query,
    customerName,
  ]);

  const totals = useMemo(() => {
    let held = 0;
    let refundDue = 0;
    let collectDue = 0;
    for (const d of rentalDeposits) {
      held += getDepositHeldBalance(d);
      refundDue += getDepositRefundDue(d);
      collectDue += getDepositCollectDue(d);
    }
    return { held, refundDue, collectDue };
  }, [rentalDeposits]);

  const columns: ResponsiveColumn<DepositRow>[] = [
    {
      key: "customer",
      header: "Customer",
      mobilePrimary: true,
      render: (r) => (
        <Link to={`/customers/${r.customerId}`} className="hover:text-primary">
          {r.customerName}
        </Link>
      ),
    },
    {
      key: "rental",
      header: "Rental",
      mobileSecondary: true,
      render: (r) =>
        r.rentalId ? (
          <Link
            to={`/rentals/${r.rentalId}`}
            className="font-mono text-xs hover:text-primary"
          >
            {r.rentalNumber}
          </Link>
        ) : (
          <Link
            to={`/reservations/${r.reservationId}`}
            className="font-mono text-xs hover:text-primary"
          >
            {r.reservationId}
          </Link>
        ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      mobileHidden: true,
      render: (r) => r.vehicleName,
    },
    {
      key: "required",
      header: "Required",
      align: "right",
      mono: true,
      render: (r) => fmtMoneyExact(r.required),
    },
    {
      key: "held",
      header: "Held",
      align: "right",
      mono: true,
      render: (r) => fmtMoneyExact(r.held),
    },
    {
      key: "refundDue",
      header: "Refund due",
      align: "right",
      mono: true,
      render: (r) => (
        <span className="text-status-maintenance">
          {fmtMoneyExact(r.refundDue)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusPill tone={DEPOSIT_STATUS_TONE[r.status]}>
          {DEPOSIT_STATUS_LABELS[r.status]}
        </StatusPill>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      mono: true,
      mobileHidden: true,
      render: (r) => fmtDateShort(r.updatedAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposits"
        subtitle="Track held security deposits across reservations and rentals."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Held" value={fmtMoneyExact(totals.held)} />
        <SummaryCard
          label="Refund owed"
          value={fmtMoneyExact(totals.refundDue)}
          tone="maintenance"
        />
        <SummaryCard
          label="Uncollected"
          value={fmtMoneyExact(totals.collectDue)}
          tone="maintenance"
        />
      </div>

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-2",
                )}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, rental, vehicle..."
            className="w-full max-w-xs rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <EmptyState
              title="No deposits match"
              hint="Try a different filter or search term."
            />
          ) : (
            <ResponsiveTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "maintenance";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular",
          tone === "maintenance"
            ? "text-status-maintenance"
            : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
