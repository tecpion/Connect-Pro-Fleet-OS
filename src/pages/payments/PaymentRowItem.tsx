// Connect Pro Fleet — Payments Due table row (Build #4 / Build #10 cleanup).
// Extracted from PaymentsDue.tsx (which exceeds the file size limit). Renders a
// single billing-obligation row with customer/vehicle/agreement, frequency,
// amounts, status, and per-row actions. Uses the authoritative allocation.
//
// Build #10 cleanup — arrangement context: when an active arrangement exists,
// shows the PROMISED context (promised today / next promise / broken) alongside
// the ACTUAL outstanding. The actual outstanding remains primary; a promise is
// never shown as "paid" or "amount due".

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import type { PaymentObligation } from "@/lib/billingSelectors";
import { BILLING_FREQUENCY_SHORT } from "@/lib/billingTypes";
import { StatusPill } from "@/components/Status";
import {
  fmtMoney,
  fmtMoneyExact,
  fmtDateShort,
  statusToneClasses,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DollarSign,
  Bell,
  Link2,
  Phone,
  Mail,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ListTodo,
} from "lucide-react";
import {
  installmentStatus,
  reconcileArrangement,
  getNextInstallment,
} from "@/lib/paymentArrangements";

type Bucket = "due_today" | "due_tomorrow" | "late" | "paid_week" | "upcoming";

export interface PaymentRow extends PaymentObligation {
  bucket: Bucket;
}

export function PaymentRowItem({
  r,
  onPay,
  onApplyLate,
  onWaiveLate,
}: {
  r: PaymentRow;
  onPay: (r: PaymentRow) => void;
  onApplyLate: (rentalId: string) => void;
  onWaiveLate: (rentalId: string) => void;
}) {
  const {
    rentals,
    customers,
    vehicles,
    activeArrangementForRental,
    installmentsForArrangement,
    transactions,
    rentalFinancials,
    createTask,
  } = useStore();
  const rental = rentals.find((x) => x.id === r.rentalId);
  if (!rental) return null;
  const customer = customers.find((c) => c.id === rental.customer_id);
  const vehicle = vehicles.find((v) => v.id === rental.vehicle_id);
  const arrangement = activeArrangementForRental(rental.id);
  const b = r.bucket;
  const tone =
    b === "late" ? "out" : b === "paid_week" ? "available" : "maintenance";

  // Arrangement promise context (Build #10 cleanup). The actual outstanding
  // (r.amountDue) remains primary; this is operational promise tracking only.
  let promiseContext: {
    label: string;
    tone: "available" | "maintenance" | "out";
  } | null = null;
  if (arrangement) {
    const installments = installmentsForArrangement(arrangement.id);
    const rentalOutstanding = rentalFinancials(rental.id).balance;
    const rec = reconcileArrangement(
      arrangement,
      installments,
      transactions,
      rentalOutstanding,
    );
    const next = getNextInstallment(installments, transactions);
    if (arrangement.status === "broken") {
      const missed = installments.find(
        (ins) =>
          installmentStatus(
            ins,
            transactions,
            arrangement.grace_period_days,
          ) === "missed",
      );
      promiseContext = {
        label: `Arrangement broken · ${fmtMoneyExact(missed?.amount_due ?? 0)} promise missed`,
        tone: "out",
      };
    } else if (rec.effectivelyResolved) {
      promiseContext = {
        label: "Arrangement resolved by credits",
        tone: "available",
      };
    } else {
      // Is a promise due today?
      const dueToday = installments.some(
        (ins) =>
          installmentStatus(
            ins,
            transactions,
            arrangement.grace_period_days,
          ) === "due_today",
      );
      if (dueToday && next) {
        promiseContext = {
          label: `Arrangement active · ${fmtMoneyExact(next.amount_due)} promised today`,
          tone: "maintenance",
        };
      } else if (next) {
        promiseContext = {
          label: `Next promise: ${fmtMoneyExact(next.amount_due)} ${fmtDateShort(next.due_date)}`,
          tone: "maintenance",
        };
      } else {
        promiseContext = {
          label: "Arrangement active",
          tone: "maintenance",
        };
      }
    }
  }

  return (
    <tr key={r.period.id} className="hover:bg-surface-2">
      <td
        className={cn(
          "status-border border-l-2 px-2 py-2.5",
          statusToneClasses[tone].border,
        )}
      >
        {customer ? (
          <Link
            to={`/customers/${customer.id}`}
            className="font-medium text-foreground hover:text-primary"
          >
            {customer.first_name} {customer.last_name}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2.5 text-muted-foreground">
        {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
      </td>
      <td className="px-2 py-2.5">
        <Link
          to={`/rentals/${rental.id}`}
          className="font-mono text-xs uppercase tracking-wide text-foreground hover:text-primary"
        >
          {rental.agreement_number}
        </Link>
      </td>
      <td className="px-2 py-2.5">
        <span className="font-mono text-xs tabular text-muted-foreground">
          {BILLING_FREQUENCY_SHORT[r.period.billing_frequency]}
        </span>
      </td>
      <td className="px-2 py-2.5 text-right font-mono tabular text-muted-foreground">
        {fmtMoneyExact(r.period.total_amount)}
      </td>
      <td className="px-2 py-2.5 font-mono tabular text-muted-foreground">
        {fmtDateShort(r.period.due_at)}
      </td>
      <td className="px-2 py-2.5 text-right font-mono tabular text-foreground">
        {b === "paid_week"
          ? fmtMoneyExact(r.period.total_amount)
          : fmtMoneyExact(r.amountDue)}
      </td>
      {b === "late" && (
        <td className="px-2 py-2.5 text-right font-mono tabular text-status-out">
          {r.daysLate}
        </td>
      )}
      <td className="px-2 py-2.5">
        <div className="flex flex-col items-start gap-1">
          <StatusPill tone={tone}>
            {b === "paid_week"
              ? "Paid"
              : b === "late"
                ? rental.late_fee_applied
                  ? "Late + fee"
                  : "Late"
                : b === "due_today"
                  ? "Due today"
                  : b === "due_tomorrow"
                    ? "Due tomorrow"
                    : "Upcoming"}
          </StatusPill>
          {promiseContext && (
            <Link
              to="/payment-arrangements"
              className={cn(
                "font-mono text-[10px] tabular hover:underline",
                promiseContext.tone === "out" && "text-status-out",
                promiseContext.tone === "maintenance" && "text-primary",
                promiseContext.tone === "available" && "text-status-available",
              )}
              title="Payment arrangement"
            >
              {promiseContext.label}
            </Link>
          )}
        </div>
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center justify-end gap-1">
          <Link
            to={`/rentals/${rental.id}`}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
            title="Open rental"
          >
            <ExternalLink size={15} />
          </Link>
          {b !== "paid_week" && (
            <IconBtn
              icon={DollarSign}
              label="Record payment"
              onClick={() => onPay(r)}
              primary
            />
          )}
          {b !== "paid_week" && (
            <IconBtn
              icon={Bell}
              label="Send reminder"
              onClick={() =>
                toast.success(
                  `Payment reminder sent to ${customer?.first_name ?? "customer"}.`,
                )
              }
            />
          )}
          {b !== "paid_week" && (
            <IconBtn
              icon={Link2}
              label="Send payment link"
              onClick={() => toast.success("Payment link sent.")}
            />
          )}
          {b === "late" && !rental.late_fee_applied && (
            <IconBtn
              icon={AlertTriangle}
              label="Apply late fee"
              onClick={() => onApplyLate(rental.id)}
            />
          )}
          {b === "late" && rental.late_fee_applied && (
            <IconBtn
              icon={CheckCircle2}
              label="Waive late fee"
              onClick={() => onWaiveLate(rental.id)}
            />
          )}
          {b !== "paid_week" && (
            <IconBtn
              icon={ListTodo}
              label="Create follow-up task"
              onClick={() => {
                createTask({
                  title: `Follow up on payment — ${customer ? `${customer.first_name} ${customer.last_name}` : "customer"}`,
                  category: "payment_collection",
                  priority: b === "late" ? "high" : "normal",
                  entityType: "rental",
                  entityId: rental.id,
                  entityLabel: `${rental.agreement_number}${customer ? ` · ${customer.first_name} ${customer.last_name}` : ""}`,
                });
                toast.success("Follow-up task created.");
              }}
            />
          )}
          {customer && (
            <>
              <a
                href={`tel:${customer.phone}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
                title="Call"
              >
                <Phone size={15} />
              </a>
              <a
                href={`mailto:${customer.email}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
                title="Email"
              >
                <Mail size={15} />
              </a>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: typeof DollarSign;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary-press"
          : "text-muted-foreground hover:bg-surface-2 hover:text-primary",
      )}
    >
      <Icon size={15} />
    </button>
  );
}
