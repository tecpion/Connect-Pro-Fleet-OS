// Connect Pro Fleet — Payment Arrangement panel (Build #10 / cleanup).
//
// Reusable panel showing an active arrangement's promise schedule + paid/remaining
// state. Used on Rental Detail and Customer Profile. A promise is NOT a payment —
// this panel never shows promise amounts as collected revenue.
//
// Build #10 cleanup — reconciliation: distinguishes the SCHEDULED promise
// remaining (historical) from the COLLECTIBLE remaining (what can still be
// collected against the current actual outstanding). When the actual balance
// dropped via a credit/deposit application (not a payment), shows a "Balance
// changed" notice so staff don't try to collect debt that no longer exists.
//
// Build #11 cleanup — contextual task entry point: "Create Follow-Up Task" that
// pre-fills the arrangement entity, plus surfaces any existing open system task
// for a broken arrangement so staff don't create duplicates. Creating a task
// never changes the arrangement's financial state.

import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { fmtMoneyExact, fmtDateShort, statusToneClasses } from "@/lib/format";
import {
  ARRANGEMENT_STATUS_LABELS,
  ARRANGEMENT_STATUS_TONE,
  INSTALLMENT_STATUS_LABELS,
  INSTALLMENT_STATUS_TONE,
} from "@/lib/paymentArrangementTypes";
import {
  installmentPaidAmount,
  installmentStatus,
  reconcileArrangement,
  getNextInstallment,
} from "@/lib/paymentArrangements";
import { cn } from "@/lib/utils";
import { Handshake, AlertCircle, ListTodo, ExternalLink } from "lucide-react";
import { CreateTaskDialog } from "@/pages/tasks/CreateTaskDialog";

export function ArrangementPanel({
  arrangementId,
  compact,
}: {
  arrangementId: string;
  compact?: boolean;
}) {
  const {
    paymentArrangements,
    transactions,
    installmentsForArrangement,
    arrangementEventLog,
    rentals,
    rentalFinancials,
    customers,
    staff,
    roles,
    currentStaffId,
    openTasksForEntity,
  } = useStore();
  const navigate = useNavigate();
  const [taskOpen, setTaskOpen] = useState(false);

  const a = paymentArrangements.find((x) => x.id === arrangementId);
  if (!a) return null;
  const installments = installmentsForArrangement(arrangementId);
  const next = getNextInstallment(installments, transactions);
  const events = arrangementEventLog(arrangementId);
  const tone = ARRANGEMENT_STATUS_TONE[a.status];

  // Authoritative actual outstanding for the rental (ledger-derived). The
  // arrangement covers debt up to its original snapshot; new charges added
  // afterward are "outside the arrangement".
  const rental = rentals.find((r) => r.id === a.rental_id);
  const rentalOutstanding = rental ? rentalFinancials(a.rental_id!).balance : 0;
  const rec = reconcileArrangement(
    a,
    installments,
    transactions,
    rentalOutstanding,
  );

  // Build #11 cleanup — task context.
  const customer = customers.find((c) => c.id === a.customer_id);
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : "Customer";
  const entityLabel = `${a.arrangement_number} · ${customerName}`;
  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canCreateTask = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "tasks.create",
  );
  // Surface an existing open system task for a broken arrangement so staff
  // don't create duplicate manual follow-ups.
  const existingTask =
    a.status === "broken"
      ? openTasksForEntity(
          "payment_arrangement.broken",
          "payment_arrangement",
          arrangementId,
        )[0]
      : undefined;
  // If the arrangement is effectively resolved (no collectible debt), don't
  // suggest a collection follow-up by default.
  const suggestCollection =
    !rec.effectivelyResolved && rec.collectibleRemaining > 0;

  return (
    <SectionCard
      title="Payment arrangement"
      right={
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs tabular text-muted-foreground">
            {a.arrangement_number}
          </span>
          <StatusPill tone={tone}>
            {ARRANGEMENT_STATUS_LABELS[a.status]}
          </StatusPill>
        </span>
      }
    >
      <div className="space-y-4 p-4">
        <div className="flex items-start gap-2.5">
          <Handshake size={16} className="mt-0.5 text-primary" />
          <div>
            <p className="text-sm text-foreground">{a.terms_summary}</p>
            {a.reason && (
              <p className="mt-0.5 text-xs text-muted-foreground">{a.reason}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Arrangement"
            value={fmtMoneyExact(a.arrangement_amount)}
          />
          <Stat
            label="Paid toward"
            value={fmtMoneyExact(rec.paidAmount)}
            tone="available"
          />
          <Stat
            label="Promised remaining"
            value={fmtMoneyExact(rec.scheduledRemaining)}
            tone={rec.scheduledRemaining > 0 ? "maintenance" : "available"}
          />
          <Stat
            label="Next promise"
            value={next ? fmtDateShort(next.due_date) : "—"}
          />
        </div>

        {/* Reconciliation row — only when the actual balance differs from the
            scheduled promise. Shows collectible remaining + resolved-by-credits. */}
        {rec.needsReconciliation && (
          <div
            className={cn(
              "status-border border-l-2 rounded-r-md border border-border bg-surface-2 px-3 py-2.5",
              statusToneClasses["maintenance"].border,
            )}
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                size={15}
                className="mt-0.5 text-status-maintenance"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Balance changed
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtMoneyExact(rec.scheduledRemaining)} remains in scheduled
                  promises, but the customer's current outstanding balance is{" "}
                  {fmtMoneyExact(rec.currentOutstanding)}.
                  {rec.resolvedByCredits > 0 &&
                    ` ${fmtMoneyExact(rec.resolvedByCredits)} was resolved by credits — not a customer payment.`}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <MiniStat
                    label="Collectible remaining"
                    value={fmtMoneyExact(rec.collectibleRemaining)}
                    tone={
                      rec.collectibleRemaining > 0 ? "maintenance" : "available"
                    }
                  />
                  <MiniStat
                    label="Resolved by credits"
                    value={fmtMoneyExact(rec.resolvedByCredits)}
                  />
                  {rec.additionalOutsideArrangement > 0 && (
                    <MiniStat
                      label="Outside arrangement"
                      value={fmtMoneyExact(rec.additionalOutsideArrangement)}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Effectively resolved (debt gone via credits, not payments) */}
        {rec.effectivelyResolved && a.status !== "completed" && (
          <div className="status-border border-l-2 rounded-r-md border border-border bg-surface-2 px-3 py-2.5">
            <p className="text-sm text-foreground">
              No collectible debt remains
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The covered balance was resolved
              {rec.paidAmount > 0
                ? ` — ${fmtMoneyExact(rec.paidAmount)} via customer payments, ${fmtMoneyExact(rec.resolvedByCredits)} via credits.`
                : ` via ${fmtMoneyExact(rec.resolvedByCredits)} in credits. No further collection needed.`}
            </p>
          </div>
        )}

        {/* Build #11 cleanup — contextual task entry point + existing system
            task surfacing. Creating a task never changes the arrangement's
            financial state. */}
        {(canCreateTask || existingTask) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {existingTask ? (
              <button
                onClick={() => navigate(`/tasks?task=${existingTask.id}`)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
              >
                <ExternalLink size={13} /> Open task ·{" "}
                {existingTask.task_number}
              </button>
            ) : null}
            {canCreateTask && (
              <button
                onClick={() => setTaskOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-press"
              >
                <ListTodo size={13} />{" "}
                {existingTask ? "Create another task" : "Create follow-up task"}
              </button>
            )}
          </div>
        )}

        {!compact && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Installments
            </p>
            <div className="space-y-1.5">
              {installments.map((ins) => {
                const insPaid = installmentPaidAmount(ins, transactions);
                const status = installmentStatus(
                  ins,
                  transactions,
                  a.grace_period_days,
                );
                const insTone = INSTALLMENT_STATUS_TONE[status];
                return (
                  <div
                    key={ins.id}
                    className={cn(
                      "status-border border-l-2 flex items-center justify-between rounded-r-md border border-border bg-surface-2 px-3 py-2",
                      statusToneClasses[insTone].border,
                    )}
                  >
                    <div>
                      <p className="text-sm text-foreground">
                        Installment {ins.sequence} ·{" "}
                        <span className="font-mono tabular">
                          {fmtMoneyExact(ins.amount_due)}
                        </span>
                      </p>
                      <p className="font-mono text-xs tabular text-muted-foreground">
                        Due {fmtDateShort(ins.due_date)}
                        {insPaid > 0 && ` · Paid ${fmtMoneyExact(insPaid)}`}
                      </p>
                    </div>
                    <StatusPill tone={insTone}>
                      {INSTALLMENT_STATUS_LABELS[status]}
                    </StatusPill>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!compact && events.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Timeline
            </p>
            <ol className="relative space-y-2 border-l border-border pl-4">
              {events.slice(0, 6).map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
                  <p className="text-sm text-foreground">{e.label}</p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {fmtDateShort(e.at.slice(0, 10))}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {taskOpen && (
        <CreateTaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          preset={{
            entityType: "payment_arrangement",
            entityId: arrangementId,
            entityLabel,
            title: suggestCollection
              ? `Follow up on payment arrangement — ${customerName}`
              : `Follow up on arrangement — ${customerName}`,
            category: "payment_arrangement",
          }}
        />
      )}
    </SectionCard>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "available" | "maintenance";
}) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-sm font-semibold tabular text-foreground",
          tone === "available" && "text-status-available",
          tone === "maintenance" && "text-status-maintenance",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "available" | "maintenance";
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-xs font-semibold tabular text-foreground",
          tone === "available" && "text-status-available",
          tone === "maintenance" && "text-status-maintenance",
        )}
      >
        {value}
      </p>
    </div>
  );
}
