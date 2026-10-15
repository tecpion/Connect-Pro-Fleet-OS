// Connect Pro Fleet — Customer 360 Overview + Timeline sections (Build #27).
//
// Composes the customer360Selectors into a compact overview: summary strip,
// active rental, needs-attention list, and the unified timeline. Money is
// permission-gated (spec §8, §15). No fake risk labels (spec §17).

import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import { AskCopilotButton } from "@/components/copilot/AskCopilotButton";
import {
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { UnifiedTimeline } from "@/components/UnifiedTimeline";
import { CustomerBadge } from "@/components/EntityBadges";
import { useEntitySources } from "@/lib/useEntitySources";
import {
  getCustomer360Summary,
  getCustomerAttentionItems,
  getCustomerRelationshipStatus,
} from "@/lib/customer360Selectors";
import { getCustomerTimeline } from "@/lib/timelineComposer";
import { CUSTOMER_TIMELINE_CATEGORIES } from "@/lib/timelineTypes";
import {
  COMPLIANCE_STATUS_LABELS,
  COMPLIANCE_STATUS_TONE,
} from "@/lib/complianceTypes";
import { fmtMoney, fmtDate, fmtDateShort } from "@/lib/format";
import { useCustomerNotes } from "@/lib/customerNoteStore";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Customer360Overview({ customerId }: { customerId: string }) {
  const { customer360Sources, timelineSources, canSeeMoney } =
    useEntitySources();
  const summary = useMemo(
    () => getCustomer360Summary(customerId, customer360Sources),
    [customerId, customer360Sources],
  );
  const attention = useMemo(
    () => getCustomerAttentionItems(customerId, customer360Sources),
    [customerId, customer360Sources],
  );
  const timeline = useMemo(
    () => getCustomerTimeline(customerId, timelineSources),
    [customerId, timelineSources],
  );
  const notes = useCustomerNotes();
  const pinned = notes.getPinnedNotes(customerId);
  const hasFutureReservations = customer360Sources.store.reservations.some(
    (r) =>
      r.customer_id === customerId &&
      ["confirmed", "pending_verification"].includes(r.status),
  );
  const relationship = getCustomerRelationshipStatus(
    summary,
    hasFutureReservations,
  );
  const customer = customer360Sources.store.customers.find(
    (c) => c.id === customerId,
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <AskCopilotButton
          customerId={customerId}
          label={
            customer
              ? `${customer.first_name} ${customer.last_name}`
              : customerId
          }
        />
      </div>
      {/* Summary strip (spec §12) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Current Rental"
          value={
            summary.activeRental ? summary.activeRental.agreementNumber : "None"
          }
        />
        <SummaryCard
          label="Outstanding Balance"
          value={canSeeMoney ? fmtMoney(summary.outstandingBalance) : "—"}
          tone={summary.outstandingBalance > 0 ? "maintenance" : "neutral"}
          mono
        />
        <SummaryCard
          label="Next Payment Due"
          value={
            canSeeMoney && summary.nextPaymentDue
              ? fmtDateShort(summary.nextPaymentDue)
              : "—"
          }
          mono
        />
        <SummaryCard
          label="Deposit Held"
          value={canSeeMoney ? fmtMoney(summary.currentDepositHeld) : "—"}
          mono
        />
        <SummaryCard
          label="Open Issues"
          value={String(
            summary.openDamageClaims +
              summary.openViolations +
              summary.overdueTasks,
          )}
          tone={
            summary.openDamageClaims + summary.openViolations > 0
              ? "maintenance"
              : "neutral"
          }
          mono
        />
      </div>

      {/* Badges (spec §11) */}
      <div className="flex flex-wrap gap-2">
        {summary.activeRental && <CustomerBadge kind="active_rental" />}
        {canSeeMoney && summary.outstandingBalance > 0 && (
          <CustomerBadge kind="balance_due" />
        )}
        {summary.complianceStatus !== "compliant" &&
          summary.complianceStatus !== "unknown" && (
            <CustomerBadge kind="compliance" />
          )}
        {summary.openDamageClaims > 0 && <CustomerBadge kind="open_damage" />}
        {summary.openViolations > 0 && <CustomerBadge kind="open_violation" />}
        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
          {relationship.replace("_", " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Active rental (spec §14) */}
          <SectionCard title="Current Rental">
            {summary.activeRental ? (
              <ActiveRentalDetail
                customerId={customerId}
                sources={customer360Sources}
                canSeeMoney={canSeeMoney}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No active rental.</p>
            )}
          </SectionCard>

          {/* Needs attention (spec §68) */}
          <SectionCard title="Needs Attention">
            {attention.length === 0 ? (
              <EmptyState
                title="Nothing needs attention"
                hint="This customer has no outstanding compliance, balance, or task issues."
                icon={<CheckCircle2 size={22} />}
              />
            ) : (
              <ul className="space-y-2">
                {attention.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <AlertTriangle
                      size={14}
                      className={
                        a.severity === "critical"
                          ? "text-status-out"
                          : "text-status-maintenance"
                      }
                    />
                    <span className="text-foreground">{a.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Pinned notes (spec §27) */}
          {pinned.length > 0 && (
            <SectionCard title="Pinned Notes">
              <ul className="space-y-2">
                {pinned.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                  >
                    {n.text}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        <div className="space-y-6">
          {/* Compliance status (spec §23) */}
          <SectionCard title="Compliance">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <DataLabel>Overall</DataLabel>
                <StatusPill
                  tone={
                    COMPLIANCE_STATUS_TONE[summary.complianceStatus] ??
                    "neutral"
                  }
                >
                  {COMPLIANCE_STATUS_LABELS[summary.complianceStatus]}
                </StatusPill>
              </div>
              <div className="flex items-center justify-between">
                <DataLabel>Account Owner</DataLabel>
                <DataValue>{summary.accountOwner ?? "Unassigned"}</DataValue>
              </div>
              <div className="flex items-center justify-between">
                <DataLabel>Customer Since</DataLabel>
                <DataValue mono>
                  {customer ? fmtDate(customer.created_at) : "—"}
                </DataValue>
              </div>
              <div className="flex items-center justify-between">
                <DataLabel>Last Activity</DataLabel>
                <DataValue mono>
                  {summary.lastActivityAt
                    ? fmtDateShort(summary.lastActivityAt)
                    : "—"}
                </DataValue>
              </div>
            </div>
          </SectionCard>

          {/* Payment behavior (spec §17) */}
          {canSeeMoney && (
            <SectionCard title="Payment Behavior">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total rentals</dt>
                  <dd className="font-mono tabular">{summary.totalRentals}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Lifetime rental days
                  </dt>
                  <dd className="font-mono tabular">
                    {summary.lifetimeRentalDays}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Overdue amount</dt>
                  <dd className="font-mono tabular">
                    {fmtMoney(summary.overdueAmount)}
                  </dd>
                </div>
              </dl>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Timeline (spec §28) */}
      <SectionCard title="Timeline">
        <UnifiedTimeline
          events={timeline}
          categories={CUSTOMER_TIMELINE_CATEGORIES}
          canSeeMoney={canSeeMoney}
        />
      </SectionCard>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "maintenance";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          mono && "font-mono tabular",
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

function ActiveRentalDetail({
  customerId,
  sources,
  canSeeMoney,
}: {
  customerId: string;
  sources: import("@/lib/customer360Selectors").Customer360Sources;
  canSeeMoney: boolean;
}) {
  const rental = sources.store.rentals.find(
    (r) => r.customer_id === customerId && r.status === "active",
  );
  if (!rental) return null;
  const vehicle = sources.store.vehicles.find(
    (v) => v.id === rental.vehicle_id,
  );
  return (
    <div className="space-y-2">
      <Link
        to={`/rentals/${rental.id}`}
        className="font-mono text-sm font-medium text-primary hover:underline"
      >
        {rental.agreement_number}
      </Link>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <DataLabel>Vehicle</DataLabel>
          <DataValue>
            {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Started</DataLabel>
          <DataValue mono>
            {rental.checkout_date ? fmtDateShort(rental.checkout_date) : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Scheduled Return</DataLabel>
          <DataValue mono>
            {fmtDateShort(rental.scheduled_return_date)}
          </DataValue>
        </div>
        <div>
          <DataLabel>Cadence</DataLabel>
          <DataValue className="capitalize">{rental.rate_type}</DataValue>
        </div>
        {canSeeMoney && (
          <div>
            <DataLabel>Balance Due</DataLabel>
            <DataValue mono>{fmtMoney(rental.balance_due)}</DataValue>
          </div>
        )}
      </dl>
    </div>
  );
}
