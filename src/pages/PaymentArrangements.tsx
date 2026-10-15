// Connect Pro Fleet — Payment Arrangements page (Build #10 / Build #20 mobile).
//
// Operational queue of promises to pay. Filter by status (active, due today,
// late, broken, completed, cancelled) and search by customer / rental /
// arrangement ID. Shows the actual outstanding balance (ledger-derived) next to
// the promised amount so staff never confuse a promise with a payment.
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
import { fmtMoneyExact, fmtDateShort, statusToneClasses } from "@/lib/format";
import {
  ARRANGEMENT_STATUS_LABELS,
  ARRANGEMENT_STATUS_TONE,
} from "@/lib/paymentArrangementTypes";
import type { PaymentArrangement } from "@/lib/paymentArrangementTypes";
import {
  reconcileArrangement,
  getNextInstallment,
  installmentStatus,
  getPromisesDueToday,
  getBrokenArrangements,
} from "@/lib/paymentArrangements";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Handshake, CalendarClock, AlertTriangle } from "lucide-react";
import { CreateArrangementDialog } from "./arrangements/CreateArrangementDialog";

const FILTERS = [
  "all",
  "active",
  "due_today",
  "broken",
  "completed",
  "cancelled",
] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  active: "Active",
  due_today: "Due Today",
  broken: "Broken",
  completed: "Completed",
  cancelled: "Cancelled",
};

interface ArrRow {
  id: string;
  arrangement_number: string;
  customerName: string;
  customerId?: string;
  vehicleName: string;
  rentalNumber?: string;
  rentalId?: string;
  actualOutstanding: number;
  arrangement_amount: number;
  paidAmount: number;
  collectibleRemaining: number;
  needsReconciliation: boolean;
  nextDueDate: string | null;
  status: keyof typeof ARRANGEMENT_STATUS_LABELS;
}

export default function PaymentArrangements() {
  const {
    paymentArrangements,
    arrangementInstallments,
    transactions,
    rentals,
    customers,
    vehicles,
    customerName,
    installmentsForArrangement,
    rentalFinancials,
  } = useStore();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createRentalId, setCreateRentalId] = useState<string | null>(null);

  const installmentsByArr = (id: string) => installmentsForArrangement(id);
  const outstandingFor = (a: PaymentArrangement) =>
    a.rental_id ? rentalFinancials(a.rental_id).balance : 0;
  const promisesDueToday = getPromisesDueToday(
    paymentArrangements,
    installmentsByArr,
    transactions,
    outstandingFor,
  );
  const broken = getBrokenArrangements(
    paymentArrangements,
    installmentsByArr,
    transactions,
    outstandingFor,
  );

  const rows = useMemo<ArrRow[]>(() => {
    return paymentArrangements
      .map((a) => {
        const rental = rentals.find((r) => r.id === a.rental_id);
        const customer = customers.find((c) => c.id === a.customer_id);
        const vehicle = rental
          ? vehicles.find((v) => v.id === rental.vehicle_id)
          : undefined;
        const installments = installmentsByArr(a.id);
        const rentalOutstanding = outstandingFor(a);
        const rec = reconcileArrangement(
          a,
          installments,
          transactions,
          rentalOutstanding,
        );
        const next = getNextInstallment(installments, transactions);
        return {
          a,
          rental,
          customer,
          vehicle,
          rec,
          next,
          actualOutstanding: rentalOutstanding,
        };
      })
      .filter(({ a, customer, rental }) => {
        let match = true;
        if (filter === "active") match = a.status === "active";
        else if (filter === "completed") match = a.status === "completed";
        else if (filter === "cancelled") match = a.status === "cancelled";
        else if (filter === "broken") match = a.status === "broken";
        else if (filter === "due_today") {
          match =
            a.status !== "cancelled" &&
            a.status !== "completed" &&
            installmentsByArr(a.id).some(
              (ins) =>
                installmentStatus(ins, transactions, a.grace_period_days) ===
                "due_today",
            );
        }
        if (!match) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          const label = customerName(a.customer_id).toLowerCase();
          const num = a.arrangement_number.toLowerCase();
          const rnum = rental?.agreement_number.toLowerCase() ?? "";
          if (!label.includes(q) && !num.includes(q) && !rnum.includes(q))
            return false;
        }
        return true;
      })
      .map(
        ({ a, rental, customer, vehicle, rec, next, actualOutstanding }) => ({
          id: a.id,
          arrangement_number: a.arrangement_number,
          customerName: customer
            ? `${customer.first_name} ${customer.last_name}`
            : "—",
          customerId: customer?.id,
          vehicleName: vehicle ? `${vehicle.make} ${vehicle.model}` : "—",
          rentalNumber: rental?.agreement_number,
          rentalId: rental?.id,
          actualOutstanding,
          arrangement_amount: a.arrangement_amount,
          paidAmount: rec.paidAmount,
          collectibleRemaining: rec.collectibleRemaining,
          needsReconciliation: rec.needsReconciliation,
          nextDueDate: next ? next.due_date : null,
          status: a.status,
        }),
      );
  }, [
    paymentArrangements,
    rentals,
    customers,
    vehicles,
    filter,
    query,
    transactions,
    customerName,
    rentalFinancials,
  ]);

  const rentalsNeedingArrangement = rentals.filter(
    (r) =>
      r.balance_due > 0 &&
      !paymentArrangements.some(
        (a) =>
          a.rental_id === r.id &&
          a.status !== "cancelled" &&
          a.status !== "completed",
      ),
  );

  const columns: ResponsiveColumn<ArrRow>[] = [
    {
      key: "arrangement",
      header: "Arrangement",
      mobilePrimary: true,
      render: (r) => (
        <div>
          <Link
            to={`/rentals/${r.rentalId ?? ""}`}
            className="font-mono text-xs hover:text-primary"
          >
            {r.arrangement_number}
          </Link>
          {r.needsReconciliation && (
            <span className="ml-1 inline-block rounded bg-status-maintenance/15 px-1.5 py-0.5 font-mono text-[10px] tabular text-status-maintenance">
              Balance changed
            </span>
          )}
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
            className="hover:text-primary"
          >
            {r.customerName}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "rental",
      header: "Rental",
      mobileHidden: true,
      render: (r) =>
        r.rentalId ? (
          <Link
            to={`/rentals/${r.rentalId}`}
            className="font-mono text-xs hover:text-primary"
          >
            {r.rentalNumber}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      mono: true,
      render: (r) => (
        <span className="text-status-maintenance">
          {fmtMoneyExact(r.actualOutstanding)}
        </span>
      ),
    },
    {
      key: "promised",
      header: "Promised",
      align: "right",
      mono: true,
      render: (r) => fmtMoneyExact(r.arrangement_amount),
    },
    {
      key: "paid",
      header: "Paid toward",
      align: "right",
      mono: true,
      mobileHidden: true,
      render: (r) => (
        <span className="text-status-available">
          {fmtMoneyExact(r.paidAmount)}
        </span>
      ),
    },
    {
      key: "collectible",
      header: "Collectible",
      align: "right",
      mono: true,
      render: (r) => (
        <span
          className={
            r.collectibleRemaining > 0
              ? "text-status-maintenance"
              : "text-status-available"
          }
        >
          {fmtMoneyExact(r.collectibleRemaining)}
        </span>
      ),
    },
    {
      key: "next",
      header: "Next promise",
      mono: true,
      mobileHidden: true,
      render: (r) => (r.nextDueDate ? fmtDateShort(r.nextDueDate) : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusPill tone={ARRANGEMENT_STATUS_TONE[r.status]}>
          {ARRANGEMENT_STATUS_LABELS[r.status]}
        </StatusPill>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment arrangements"
        subtitle="Track promises to pay. A promise isn't a payment — the actual balance stays until money is received."
        actions={
          <Button
            onClick={() => {
              setCreateRentalId(
                rentalsNeedingArrangement[0]?.id ?? rentals[0]?.id ?? null,
              );
              setCreateOpen(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <Handshake size={16} className="mr-1.5" /> New arrangement
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={Handshake}
          label="Active"
          value={String(
            paymentArrangements.filter((a) => a.status === "active").length,
          )}
          tone="available"
        />
        <KpiTile
          icon={CalendarClock}
          label="Promises due today"
          value={String(promisesDueToday.length)}
          tone="maintenance"
        />
        <KpiTile
          icon={AlertTriangle}
          label="Broken"
          value={String(broken.length)}
          tone="out"
        />
        <KpiTile
          icon={Handshake}
          label="Total promised"
          value={fmtMoneyExact(
            paymentArrangements
              .filter(
                (a) => a.status !== "cancelled" && a.status !== "completed",
              )
              .reduce((s, a) => s + a.arrangement_amount, 0),
          )}
          tone="neutral"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, rental, or arrangement ID…"
          className="ml-auto w-full max-w-xs rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none sm:w-64"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No payment arrangements"
          hint="When a customer owes money and agrees to pay over time, record it here. The actual balance stays unchanged until money is received."
          icon={<Handshake size={28} />}
        />
      ) : (
        <SectionCard>
          <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} />
        </SectionCard>
      )}

      {createRentalId && (
        <CreateArrangementDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          rentalId={createRentalId}
        />
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Handshake;
  label: string;
  value: string;
  tone: "available" | "maintenance" | "out" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className={statusToneClasses[tone].text} />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular text-foreground">
        {value}
      </p>
    </div>
  );
}
