import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { getPaymentObligations } from "@/lib/billingSelectors";
import {
  installmentStatus,
  reconcileArrangement,
} from "@/lib/paymentArrangements";
import { type BillingFrequency } from "@/lib/billingTypes";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { statusToneClasses, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { PaymentsBucketTable } from "@/pages/payments/PaymentsBucketTable";
import { toast } from "sonner";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { type PaymentRow } from "@/pages/payments/PaymentRowItem";

type Bucket = "due_today" | "due_tomorrow" | "late" | "paid_week" | "upcoming";

const BUCKETS: {
  key: Bucket;
  label: string;
  tone: "available" | "maintenance" | "out" | "neutral";
}[] = [
  { key: "due_today", label: "Due Today", tone: "maintenance" },
  { key: "due_tomorrow", label: "Due Tomorrow", tone: "maintenance" },
  { key: "late", label: "Late", tone: "out" },
  { key: "paid_week", label: "Paid This Week", tone: "available" },
  { key: "upcoming", label: "Upcoming", tone: "neutral" },
];

const FREQ_FILTERS: { key: BillingFrequency | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upfront", label: "Upfront" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Biweekly" },
  { key: "custom", label: "Custom" },
];

type ArrFilter =
  | "all"
  | "no_arrangement"
  | "arrangement_active"
  | "promise_due_today"
  | "broken";

const ARR_FILTERS: { key: ArrFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "no_arrangement", label: "No Arrangement" },
  { key: "arrangement_active", label: "Arrangement Active" },
  { key: "promise_due_today", label: "Promise Due Today" },
  { key: "broken", label: "Broken Arrangement" },
];

const DAY = 86_400_000;

export default function PaymentsDue() {
  const {
    rentals,
    transactions,
    recordRentalPayment,
    activeArrangementForRental,
    installmentsForArrangement,
    rentalFinancials,
    companyInfo,
  } = useStore();
  const { billingPeriods, rentalAllocation, processRentalBilling } =
    useBilling();
  const tz = companyInfo.timezone;

  useEffect(() => {
    processRentalBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [freqFilter, setFreqFilter] = useState<BillingFrequency | "all">("all");
  const [arrFilter, setArrFilter] = useState<ArrFilter>("all");
  // Deep-link highlight: when a ?bucket= query param is present (e.g. from the
  // Dashboard "Collected this week" / "Outstanding" drilldowns), the matching
  // bucket section is highlighted so the user lands on the right view.
  const [searchParams] = useSearchParams();
  const highlightBucket = searchParams.get("bucket");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const obligations = useMemo(
    () => getPaymentObligations(rentals, billingPeriods, transactions, tz),
    [rentals, billingPeriods, transactions, tz],
  );

  const rows = useMemo<PaymentRow[]>(() => {
    const out: PaymentRow[] = [];
    for (const o of obligations) {
      const p = o.period;
      const alloc = rentalAllocation(o.rentalId);
      const a = alloc.allocations.get(p.id);
      const balance = a?.balance ?? p.total_amount;
      const paid = a?.paid ?? 0;
      if (p.status === "cancelled" || p.status === "waived") continue;
      if (freqFilter !== "all" && p.billing_frequency !== freqFilter) continue;
      // Arrangement filter (Build #10 cleanup).
      if (arrFilter !== "all") {
        const arrangement = activeArrangementForRental(o.rentalId);
        if (arrFilter === "no_arrangement") {
          if (arrangement) continue;
        } else {
          if (!arrangement) continue;
          const installments = installmentsForArrangement(arrangement.id);
          const rentalOutstanding = rentalFinancials(o.rentalId).balance;
          const rec = reconcileArrangement(
            arrangement,
            installments,
            transactions,
            rentalOutstanding,
          );
          if (arrFilter === "arrangement_active") {
            if (arrangement.status !== "active" || rec.effectivelyResolved)
              continue;
          } else if (arrFilter === "promise_due_today") {
            const dueToday = installments.some(
              (ins) =>
                installmentStatus(
                  ins,
                  transactions,
                  arrangement.grace_period_days,
                ) === "due_today",
            );
            if (!dueToday || rec.effectivelyResolved) continue;
          } else if (arrFilter === "broken") {
            if (arrangement.status !== "broken") continue;
          }
        }
      }
      let bucket: Bucket;
      if (balance <= 0) bucket = "paid_week";
      else {
        const due = new Date(p.due_at + "T00:00:00");
        const diff = Math.round((due.getTime() - today.getTime()) / DAY);
        if (diff < 0) bucket = "late";
        else if (diff === 0) bucket = "due_today";
        else if (diff === 1) bucket = "due_tomorrow";
        else bucket = "upcoming";
      }
      out.push({ ...o, amountDue: balance, paid, bucket });
    }
    return out;
  }, [
    obligations,
    rentalAllocation,
    freqFilter,
    arrFilter,
    today,
    activeArrangementForRental,
    installmentsForArrangement,
    rentalFinancials,
    transactions,
  ]);

  const bucketed = useMemo(() => {
    const map: Record<Bucket, PaymentRow[]> = {
      due_today: [],
      due_tomorrow: [],
      late: [],
      paid_week: [],
      upcoming: [],
    };
    for (const r of rows) map[r.bucket].push(r);
    return map;
  }, [rows]);

  const dueTodayTotal = bucketed.due_today.reduce((s, r) => s + r.amountDue, 0);
  const lateTotal = bucketed.late.reduce((s, r) => s + r.amountDue, 0);
  const paidWeekTotal = bucketed.paid_week.reduce(
    (s, r) => s + r.period.total_amount,
    0,
  );

  const openPay = (r: PaymentRow) => {
    setPayAmount(r.amountDue);
    setPayOpen(r.rentalId);
  };
  const confirmPay = (r: {
    amount: number;
    tender: import("@/lib/paymentMethodTypes").TenderMethod;
    processor: import("@/lib/paymentMethodTypes").PaymentProcessor | null;
    reference: string;
  }) => {
    if (!payOpen || r.amount <= 0) return;
    recordRentalPayment(payOpen, r.amount, r.tender, {
      processor: r.processor,
      reference: r.reference,
    });
    toast.success(`Recorded ${fmtMoney(r.amount)}.`);
    setPayOpen(null);
    setPayAmount(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments due"
        subtitle="Track what's due, what's late, and what's collected across your rentals — daily, weekly, biweekly, or upfront."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={CalendarClock}
          label="Due today"
          value={fmtMoney(dueTodayTotal)}
          sub={`${bucketed.due_today.length} rentals`}
          tone="maintenance"
        />
        <KpiTile
          icon={AlertTriangle}
          label="Late"
          value={fmtMoney(lateTotal)}
          sub={`${bucketed.late.length} rentals`}
          tone="out"
        />
        <KpiTile
          icon={CheckCircle2}
          label="Paid this week"
          value={fmtMoney(paidWeekTotal)}
          sub={`${bucketed.paid_week.length} rentals`}
          tone="available"
        />
        <KpiTile
          icon={Wallet}
          label="Outstanding"
          value={fmtMoney(dueTodayTotal + lateTotal)}
          sub="due + late"
          tone="maintenance"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Frequency:
        </span>
        {FREQ_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFreqFilter(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              freqFilter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Arrangement:
        </span>
        {ARR_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setArrFilter(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              arrFilter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No billing obligations yet"
          hint="Rental billing periods appear here automatically once a rental is active. Convert a reservation into a rental to begin."
          icon={<CalendarClock size={28} />}
        />
      ) : (
        BUCKETS.map((b) => {
          const items = bucketed[b.key];
          if (items.length === 0) return null;
          const highlighted = highlightBucket === b.key;
          return (
            <SectionCard
              key={b.key}
              title={`${b.label} (${items.length})`}
              className={cn(
                highlighted &&
                  "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
              )}
              right={
                <span className="font-mono text-sm tabular text-muted-foreground">
                  {fmtMoney(
                    items.reduce(
                      (s, r) =>
                        s +
                        (b.key === "paid_week"
                          ? r.period.total_amount
                          : r.amountDue),
                      0,
                    ),
                  )}
                </span>
              }
            >
              <PaymentsBucketTable
                items={items}
                bucket={b.key}
                onPay={openPay}
              />
            </SectionCard>
          );
        })
      )}

      <RecordPaymentDialog
        open={!!payOpen}
        onOpenChange={(o) => !o && setPayOpen(null)}
        balanceDue={payAmount}
        defaultAmount={payAmount}
        onSubmit={confirmPay}
      />
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  sub: string;
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
      <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
        {sub}
      </p>
    </div>
  );
}
