import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { StatusDot, StatusPill } from "@/components/Status";
import { fmtMoney, fmtDateShort, statusToneClasses } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowRight,
  Bell,
  DollarSign,
  Phone,
  CheckCircle2,
  Sparkles,
  Car,
  CalendarDays,
  CalendarClock,
  Wallet,
} from "lucide-react";
import type { Reservation, RentalAgreement } from "@/lib/types";
import type { PaymentObligation } from "@/lib/billingSelectors";

type Tone = "available" | "maintenance" | "out" | "rented" | "neutral";

// KPI accent categories — each maps to a colored icon tile + subtle accent wash.
export type KpiAccent = "teal" | "indigo" | "green" | "red" | "blue" | "orange";

const KPI_ACCENT: Record<
  KpiAccent,
  { tile: string; text: string; ring: string; wash: string }
> = {
  teal: {
    tile: "bg-kpi-teal/10 text-kpi-teal",
    text: "text-kpi-teal",
    ring: "group-hover:border-kpi-teal/40",
    wash: "linear-gradient(180deg, hsl(var(--kpi-teal) / 0.1) 0%, transparent 40%)",
  },
  indigo: {
    tile: "bg-kpi-indigo/10 text-kpi-indigo",
    text: "text-kpi-indigo",
    ring: "group-hover:border-kpi-indigo/40",
    wash: "linear-gradient(180deg, hsl(var(--kpi-indigo) / 0.1) 0%, transparent 40%)",
  },
  green: {
    tile: "bg-kpi-green/10 text-kpi-green",
    text: "text-kpi-green",
    ring: "group-hover:border-kpi-green/40",
    wash: "linear-gradient(180deg, hsl(var(--kpi-green) / 0.1) 0%, transparent 40%)",
  },
  red: {
    tile: "bg-kpi-red/10 text-kpi-red",
    text: "text-kpi-red",
    ring: "group-hover:border-kpi-red/40",
    wash: "linear-gradient(180deg, hsl(var(--kpi-red) / 0.1) 0%, transparent 40%)",
  },
  blue: {
    tile: "bg-kpi-blue/10 text-kpi-blue",
    text: "text-kpi-blue",
    ring: "group-hover:border-kpi-blue/40",
    wash: "linear-gradient(180deg, hsl(var(--kpi-blue) / 0.1) 0%, transparent 40%)",
  },
  orange: {
    tile: "bg-kpi-orange/10 text-kpi-orange",
    text: "text-kpi-orange",
    ring: "group-hover:border-kpi-orange/40",
    wash: "linear-gradient(180deg, hsl(var(--kpi-orange) / 0.1) 0%, transparent 40%)",
  },
};

/** A tiny decorative progress arc (0..1). Used for Fleet Utilization KPI. */
function MicroArc({ value, accent }: { value: number; accent: KpiAccent }) {
  const a = KPI_ACCENT[accent];
  const v = Math.max(0, Math.min(1, value));
  const r = 9;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - v);
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-9 w-9 shrink-0", a.text)}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="3"
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 12 12)"
        style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
      />
    </svg>
  );
}

/** A compact sparkline for KPI micro-trend (non-negative values). */
function Sparkline({
  values,
  accent,
}: {
  values: number[];
  accent: KpiAccent;
}) {
  if (!values.length) return null;
  const a = KPI_ACCENT[accent];
  const w = 64;
  const h = 22;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values.map((val, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - ((val - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M ${pts.join(" L ")}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-[22px] w-16 shrink-0", a.text)}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  secondary,
  hint,
  icon,
  tone,
  accent,
  to,
  askCopilotQuery,
  onAskCopilot,
  spark,
}: {
  label: string;
  value: string;
  secondary?: string;
  hint?: string;
  icon: React.ReactNode;
  tone: Tone;
  accent?: KpiAccent;
  to: string;
  /** Optional Copilot explanation query for this KPI (Build #37). */
  askCopilotQuery?: string;
  /** Called when the user clicks "Explain this". */
  onAskCopilot?: (query: string) => void;
  /** Optional micro-visual: sparkline values (non-negative) for KPI cards. */
  spark?: number[];
}) {
  const t = statusToneClasses[tone];
  const a = accent ? KPI_ACCENT[accent] : null;
  // Utilization value parsed from the "NN%" display string.
  const utilPct = accent === "teal" ? parseFloat(value) : 0;
  return (
    <Link
      to={to}
      className={cn(
        "kpi-surface kpi-wash group relative flex flex-col justify-between overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5",
        a?.ring,
      )}
      style={
        a ? ({ "--kpi-wash-color": a.wash } as React.CSSProperties) : undefined
      }
    >
      {/* Top subtle color edge bar */}
      <div
        className="absolute inset-x-0 top-0 h-1 transition-opacity group-hover:h-1.5"
        style={{
          background: accent
            ? `hsl(var(--kpi-${accent}))`
            : "hsl(var(--primary))",
        }}
      />
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold tracking-tight text-muted-foreground">
            {label}
          </p>
          {a ? (
            <span
              className={cn(
                "kpi-icon-tile shrink-0 shadow-sm transition-transform group-hover:scale-110",
                a.tile,
              )}
            >
              {icon}
            </span>
          ) : (
            <span className={cn("shrink-0", t.text)}>{icon}</span>
          )}
        </div>
        <div className="mt-3.5 flex items-baseline justify-between gap-2">
          <p className="font-mono text-[34px] font-bold leading-none tracking-tight tabular text-foreground">
            {value}
          </p>
          {spark && accent ? (
            <Sparkline values={spark} accent={accent} />
          ) : utilPct > 0 && a ? (
            <MicroArc value={utilPct / 100} accent={accent ?? "blue"} />
          ) : null}
        </div>
        {secondary && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: accent
                  ? `hsl(var(--kpi-${accent}))`
                  : "hsl(var(--primary))",
              }}
            />
            <p
              className={cn(
                "font-mono text-xs font-semibold tabular",
                a ? a.text : t.text,
              )}
            >
              {secondary}
            </p>
          </div>
        )}
        {hint && (
          <p className="mt-1.5 text-[13px] text-muted-foreground/85">{hint}</p>
        )}
      </div>
      {askCopilotQuery && onAskCopilot && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAskCopilot(askCopilotQuery);
          }}
          className="mt-3.5 inline-flex w-fit items-center gap-1 rounded-md border border-border/80 bg-surface-2/60 px-2.5 py-1 text-[12px] font-semibold text-primary opacity-0 shadow-xs transition-all group-hover:opacity-100 hover:bg-surface-2 focus:opacity-100"
          aria-label={`Ask Copilot to explain ${label}`}
        >
          <Sparkles className="h-3 w-3" />
          Explain this
        </button>
      )}
    </Link>
  );
}

export function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const t = statusToneClasses[tone];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-surface p-4 shadow-xs transition-all hover:border-border hover:shadow-sm">
      <span className={cn("absolute inset-x-0 top-0 h-1", t.dot)} aria-hidden />
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("h-2 w-2 rounded-full", t.dot)} />
      </div>
      <p className="mt-2.5 font-mono text-[26px] font-bold tracking-tight tabular text-foreground">
        {value}
      </p>
    </div>
  );
}

export function SegBar({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone: Tone;
}) {
  const pct = total ? (value / total) * 100 : 0;
  if (pct <= 0) return null;
  return (
    <div
      className={cn("h-full rounded-full", statusToneClasses[tone].dot)}
      style={{ width: `${pct}%` }}
      title={`${value}`}
    />
  );
}

export function FleetStatusRow({
  label,
  count,
  tone,
  to,
}: {
  label: string;
  count: number;
  tone: Tone;
  to: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center justify-between rounded-lg border border-border/70 bg-surface px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-surface-2/60"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <StatusDot tone={tone} />
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular text-foreground">
          {count}
        </span>
      </Link>
    </li>
  );
}

export function RowEmpty({
  title,
  hint,
  action,
  icon,
  tone = "blue",
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "teal" | "blue" | "neutral";
}) {
  const Icon = icon ?? <Car className="h-6 w-6" />;
  return (
    <div className="dot-grid flex flex-col items-center justify-center rounded-xl py-10 text-center">
      <div className="empty-disc mb-3.5" data-tone={tone}>
        {Icon}
      </div>
      <p className="font-display text-[15px] font-semibold text-foreground">
        {title}
      </p>
      <p className="mt-1.5 max-w-xs text-[13px] text-muted-foreground">
        {hint}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PickupsTab({
  pickups,
}: {
  pickups: {
    reservation: Reservation | null;
    rental: RentalAgreement | null;
  }[];
}) {
  const { vehicles } = useStore();
  if (pickups.length === 0)
    return (
      <RowEmpty
        title="No pickups today"
        hint="No confirmed reservations are scheduled for pickup today."
        icon={<CalendarDays className="h-6 w-6" />}
        action={
          <Link
            to="/rental-management"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-press"
          >
            View Rental Management <ArrowRight size={14} />
          </Link>
        }
      />
    );
  return (
    <ul className="divide-y divide-border/70">
      {pickups.map((p, i) => {
        const res = p.reservation;
        const rental = p.rental;
        const vehicleId = res?.vehicle_id ?? rental?.vehicle_id ?? "";
        const v = vehicles.find((x) => x.id === vehicleId);
        const customerName = res?.renter_name ?? "";
        const time = res?.start_date ?? "";
        return (
          <li
            key={i}
            className="status-border border-l-2 border-l-status-maintenance flex flex-wrap items-center justify-between gap-2 py-3 pl-3"
          >
            <div>
              <p className="font-medium text-foreground">
                {customerName || "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {v ? `${v.make} ${v.model} · ${v.license_plate}` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm tabular text-muted-foreground">
                {time}
              </span>
              <StatusPill tone="maintenance">Confirmed</StatusPill>
              <Link
                to={res ? `/reservations/${res.id}` : `/rentals/${rental?.id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-press"
              >
                Open <ArrowRight size={13} />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ReturnsTab({ returns }: { returns: RentalAgreement[] }) {
  const { vehicles, customers } = useStore();
  if (returns.length === 0)
    return (
      <RowEmpty
        title="No returns today"
        hint="No vehicles are currently scheduled to return today."
        icon={<CalendarClock className="h-6 w-6" />}
        action={
          <Link
            to="/rental-management"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-press"
          >
            View Rental Management <ArrowRight size={14} />
          </Link>
        }
      />
    );
  return (
    <ul className="divide-y divide-border/70">
      {returns.map((r) => {
        const v = vehicles.find((x) => x.id === r.vehicle_id);
        const c = customers.find((x) => x.id === r.customer_id);
        return (
          <li
            key={r.id}
            className="status-border border-l-2 border-l-status-maintenance flex flex-wrap items-center justify-between gap-2 py-3 pl-3"
          >
            <div>
              <p className="font-medium text-foreground">
                {c ? `${c.first_name} ${c.last_name}` : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {v ? `${v.make} ${v.model} · ${v.license_plate}` : "—"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm tabular text-muted-foreground">
                {r.scheduled_return_time ?? "17:00"}
              </span>
              <StatusPill tone="maintenance">Expected today</StatusPill>
              <Link
                to={`/rentals/${r.id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-press"
              >
                Open rental <ArrowRight size={13} />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PaymentsTab({
  dueToday,
  onRecord,
}: {
  dueToday: PaymentObligation[];
  onRecord: (rentalId: string, amount: number) => void;
}) {
  const { customers, vehicles, rentals } = useStore();
  if (dueToday.length === 0)
    return (
      <RowEmpty
        title="No payments due today"
        hint="No rentals have a billing obligation due today."
      />
    );
  return (
    <ul className="divide-y divide-border/70">
      {dueToday.map((ob) => {
        const rental = rentals.find((r) => r.id === ob.rentalId);
        if (!rental) return null;
        const v = vehicles.find((x) => x.id === rental.vehicle_id);
        const c = customers.find((x) => x.id === rental.customer_id);
        return (
          <li
            key={ob.period.id}
            className="status-border border-l-2 border-l-status-maintenance flex flex-wrap items-center justify-between gap-2 py-3 pl-3"
          >
            <div>
              <p className="font-medium text-foreground">
                {c ? `${c.first_name} ${c.last_name}` : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {v ? `${v.make} ${v.model}` : "—"} ·{" "}
                <span className="font-mono tabular">
                  {fmtMoney(ob.period.total_amount)}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold tabular text-status-maintenance">
                {fmtMoney(ob.amountDue)} due today
              </span>
              <button
                onClick={() => onRecord(rental.id, ob.amountDue)}
                title="Record payment"
                className="rounded-md bg-primary p-1.5 text-primary-foreground hover:bg-primary-press"
              >
                <DollarSign size={15} />
              </button>
              <button
                onClick={() => toast.success("Payment reminder sent.")}
                title="Send reminder"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
              >
                <Bell size={15} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OverdueTab({ overdue }: { overdue: RentalAgreement[] }) {
  const { customers, vehicles } = useStore();
  if (overdue.length === 0)
    return (
      <RowEmpty
        title="No overdue rentals"
        hint="All active rentals are within their scheduled return window."
      />
    );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <ul className="divide-y divide-border/70">
      {overdue.map((r) => {
        const v = vehicles.find((x) => x.id === r.vehicle_id);
        const c = customers.find((x) => x.id === r.customer_id);
        const due = new Date(
          (r.scheduled_return_date ?? r.next_payment_due ?? "") + "T00:00:00",
        );
        const days = isNaN(due.getTime())
          ? 0
          : Math.round((today.getTime() - due.getTime()) / 86_400_000);
        return (
          <li
            key={r.id}
            className="status-border border-l-2 border-l-status-out flex flex-wrap items-center justify-between gap-2 py-3 pl-3"
          >
            <div>
              <p className="font-medium text-foreground">
                {c ? `${c.first_name} ${c.last_name}` : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {v ? `${v.make} ${v.model}` : "—"} · expected{" "}
                {r.scheduled_return_date
                  ? fmtDateShort(r.scheduled_return_date)
                  : "—"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold tabular text-status-out">
                {days} {days === 1 ? "day" : "days"} overdue
              </span>
              <span className="font-mono text-xs tabular text-muted-foreground">
                Bal {fmtMoney(r.balance_due)}
              </span>
              <Link
                to={`/rentals/${r.id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-press"
              >
                Open rental <ArrowRight size={13} />
              </Link>
              {c && (
                <a
                  href={`tel:${c.phone}`}
                  title="Contact customer"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-primary"
                >
                  <Phone size={15} />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NeedsAttention({
  items,
}: {
  items: {
    key: string;
    title: string;
    detail: string;
    tone: Tone;
    to: string;
    cta: string;
  }[];
}) {
  if (items.length === 0) {
    return (
      <div className="dot-grid flex flex-col items-center justify-center rounded-xl py-12 text-center">
        <div className="empty-disc mb-3.5" data-tone="teal">
          <CheckCircle2 size={24} />
        </div>
        <p className="font-display text-[15px] font-semibold text-foreground">
          You're all caught up
        </p>
        <p className="mt-1.5 max-w-xs text-[13px] text-muted-foreground">
          No urgent fleet issues require attention right now.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const t = statusToneClasses[item.tone];
        return (
          <li key={item.key}>
            <Link
              to={item.to}
              className={cn(
                "status-border group/item rounded-xl py-3 pl-3.5 pr-2 transition-all hover:bg-surface-2/60 hover:shadow-xs",
                t.border,
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <StatusDot tone={item.tone} className="mt-1.5" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[13px] font-medium text-primary transition-transform group-hover/item:translate-x-0.5">
                  {item.cta}
                  <ArrowRight size={13} />
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
