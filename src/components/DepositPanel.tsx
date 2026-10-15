// Connect Pro Fleet — deposit panel (Build #8 / #11 cleanup).
//
// Shared operational deposit display used by Reservation Detail and Rental
// Detail. Shows required / collected / held / applied / refunded / forfeited
// + status, and exposes collection (and apply/refund/forfeit on rentals)
// actions gated by permissions. Held deposit is never shown as revenue.
//
// Build #11 cleanup — contextual task entry point ("Create Task") that pre-fills
// the deposit entity, plus surfaces any existing open system task for a
// refund-pending deposit so staff don't create duplicates. Creating a task never
// processes/refunds/applies the deposit.

import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/Status";
import { fmtMoneyExact, fmtDateTime, paymentMethodMeta } from "@/lib/format";
import {
  DEPOSIT_STATUS_LABELS,
  DEPOSIT_STATUS_TONE,
  type DepositEventType,
} from "@/lib/depositTypes";
import {
  getDepositHeldBalance,
  getDepositCollectDue,
  getDepositRefundDue,
  depositHistory,
} from "@/lib/deposit";
import { toast } from "sonner";
import { DollarSign, RotateCcw, ListTodo, ExternalLink } from "lucide-react";
import {
  CollectDialog,
  RefundDialog,
  ForfeitDialog,
  AmountDialog,
  OverrideButton,
} from "./depositDialogs";
import { CreateTaskDialog } from "@/pages/tasks/CreateTaskDialog";

const EVENT_LABELS: Record<DepositEventType, string> = {
  required: "Deposit required",
  collected: "Deposit collected",
  held: "Deposit held",
  applied: "Applied to charges",
  refund_pending: "Refund pending",
  refunded: "Deposit refunded",
  forfeited: "Deposit forfeited",
  overridden: "Requirement overridden",
  cancelled: "Deposit cancelled",
  reversed: "Action reversed",
};

export function DepositPanel({
  reservationId,
  rentalId,
}: {
  reservationId: string | null;
  rentalId: string | null;
}) {
  const {
    depositForReservation,
    depositForRental,
    depositHistory: allHistory,
    collectDeposit,
    applyDeposit,
    refundDeposit,
    forfeitDeposit,
    overrideDepositRequirement,
    reverseDepositAction,
    staff,
    roles,
    currentStaffId,
    customers,
    rentals,
    openTasksForEntity,
  } = useStore();
  const navigate = useNavigate();

  const deposit = rentalId
    ? depositForRental(rentalId)
    : reservationId
      ? depositForReservation(reservationId)
      : null;

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canCollect = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "deposits.collect",
  );
  const canApply = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "deposits.apply",
  );
  const canRefund = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "deposits.refund",
  );
  const canForfeit = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "deposits.forfeit",
  );
  const canOverride = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "rentals.override_deposit_requirement",
  );

  const [collectOpen, setCollectOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const canCreateTask = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "tasks.create",
  );

  if (!deposit) {
    return (
      <SectionCard title="Security deposit">
        <p className="text-sm text-muted-foreground">
          No deposit required for this reservation.
        </p>
      </SectionCard>
    );
  }

  const held = getDepositHeldBalance(deposit);
  const collectDue = getDepositCollectDue(deposit);
  const refundDue = getDepositRefundDue(deposit);
  const history = depositHistory(allHistory, deposit.id);

  // Build #11 cleanup — task context. Surface an existing open system task for a
  // refund-pending deposit so staff don't create duplicates.
  const rental = rentals.find((r) => r.id === deposit.rental_id);
  const customer = customers.find((c) => c.id === deposit.customer_id);
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : "Customer";
  const entityLabel = `Deposit · ${customerName}${
    rental ? ` · ${rental.agreement_number}` : ""
  }`;
  const existingTask =
    deposit.status === "refund_pending"
      ? openTasksForEntity("deposit.refund_pending", "deposit", deposit.id)[0]
      : undefined;
  const taskTitle =
    deposit.status === "refund_pending"
      ? `Process security deposit refund — ${customerName}`
      : `Follow up on security deposit — ${customerName}`;

  return (
    <SectionCard
      title="Security deposit"
      right={
        <button
          onClick={() => setHistoryOpen(true)}
          className="text-xs text-primary hover:text-primary-press"
        >
          View history
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <DataLabel>Status</DataLabel>
          <StatusPill tone={DEPOSIT_STATUS_TONE[deposit.status]}>
            {DEPOSIT_STATUS_LABELS[deposit.status]}
          </StatusPill>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <DataLabel>Required</DataLabel>
            <DataValue mono>{fmtMoneyExact(deposit.required_amount)}</DataValue>
          </div>
          <div>
            <DataLabel>Collected</DataLabel>
            <DataValue mono>
              {fmtMoneyExact(deposit.collected_amount)}
            </DataValue>
          </div>
          <div>
            <DataLabel>Held</DataLabel>
            <DataValue mono>{fmtMoneyExact(held)}</DataValue>
          </div>
          <div>
            <DataLabel>Applied to charges</DataLabel>
            <DataValue mono>{fmtMoneyExact(deposit.applied_amount)}</DataValue>
          </div>
          <div>
            <DataLabel>Refunded</DataLabel>
            <DataValue mono>{fmtMoneyExact(deposit.refunded_amount)}</DataValue>
          </div>
          <div>
            <DataLabel>Forfeited</DataLabel>
            <DataValue mono>
              {fmtMoneyExact(deposit.forfeited_amount)}
            </DataValue>
          </div>
        </dl>
        {deposit.source_snapshot.policy_name && (
          <p className="text-xs text-muted-foreground">
            Source: {deposit.source_snapshot.policy_name}
            {deposit.source_snapshot.class_name
              ? ` · ${deposit.source_snapshot.class_name} class`
              : ""}
          </p>
        )}
        {collectDue > 0 && (
          <div className="rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
            Remaining to collect: {fmtMoneyExact(collectDue)}
          </div>
        )}
        {refundDue > 0 && deposit.status !== "refund_pending" && (
          <div className="rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
            Refund owed to customer: {fmtMoneyExact(refundDue)}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {canCollect && collectDue > 0 && (
            <Button
              size="sm"
              onClick={() => setCollectOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <DollarSign size={14} className="mr-1" /> Collect deposit
            </Button>
          )}
          {canApply && held > 0 && rentalId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setApplyOpen(true)}
            >
              Apply to charges
            </Button>
          )}
          {canRefund && refundDue > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRefundOpen(true)}
            >
              Refund deposit
            </Button>
          )}
          {canForfeit && held > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setForfeitOpen(true)}
            >
              Forfeit
            </Button>
          )}
          {canOverride && collectDue > 0 && (
            <OverrideButton
              currentRequired={deposit.required_amount}
              onOverride={(amount, reason) => {
                const r = overrideDepositRequirement(deposit.id, {
                  newRequiredAmount: amount,
                  reason,
                });
                if (r.ok) toast.success("Deposit requirement overridden.");
                else toast.error(r.error ?? "Could not override.");
              }}
            />
          )}
          {/* Build #11 cleanup — contextual task entry point + existing
              system task surfacing. */}
          {existingTask && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/tasks?task=${existingTask.id}`)}
            >
              <ExternalLink size={14} className="mr-1" /> Open task ·{" "}
              {existingTask.task_number}
            </Button>
          )}
          {canCreateTask && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTaskOpen(true)}
            >
              <ListTodo size={14} className="mr-1" />{" "}
              {existingTask ? "Create another task" : "Create task"}
            </Button>
          )}
        </div>
      </div>

      {collectOpen && (
        <CollectDialog
          max={collectDue}
          onClose={() => setCollectOpen(false)}
          onSubmit={(amount, method, ref) => {
            const r = collectDeposit(
              deposit.id,
              { amount, method, reference: ref },
              `collect_${deposit.id}_${Date.now()}`,
            );
            if (r.ok) {
              toast.success(`Collected ${fmtMoneyExact(amount)}.`);
              setCollectOpen(false);
            } else toast.error(r.error ?? "Could not collect.");
          }}
        />
      )}
      {applyOpen && (
        <AmountDialog
          title="Apply deposit to charges"
          max={held}
          confirmLabel="Apply"
          onClose={() => setApplyOpen(false)}
          onSubmit={(amount, notes) => {
            const r = applyDeposit(
              deposit.id,
              { amount, notes },
              `apply_${deposit.id}_${Date.now()}`,
            );
            if (r.ok) {
              toast.success(`Applied ${fmtMoneyExact(amount)} to charges.`);
              setApplyOpen(false);
            } else toast.error(r.error ?? "Could not apply.");
          }}
        />
      )}
      {refundOpen && (
        <RefundDialog
          max={refundDue}
          onClose={() => setRefundOpen(false)}
          onSubmit={(amount, method) => {
            const r = refundDeposit(
              deposit.id,
              { amount, method },
              `refund_${deposit.id}_${Date.now()}`,
            );
            if (r.ok) {
              toast.success(`Refunded ${fmtMoneyExact(amount)}.`);
              setRefundOpen(false);
            } else toast.error(r.error ?? "Could not refund.");
          }}
        />
      )}
      {forfeitOpen && (
        <ForfeitDialog
          max={held}
          onClose={() => setForfeitOpen(false)}
          onSubmit={(amount, reason, notes) => {
            const r = forfeitDeposit(
              deposit.id,
              { amount, reason, notes },
              `forfeit_${deposit.id}_${Date.now()}`,
            );
            if (r.ok) {
              toast.success(`Forfeited ${fmtMoneyExact(amount)}.`);
              setForfeitOpen(false);
            } else toast.error(r.error ?? "Could not forfeit.");
          }}
        />
      )}
      {historyOpen && (
        <Dialog open onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Deposit history</DialogTitle>
            </DialogHeader>
            <ol className="relative space-y-3 border-l border-border pl-5">
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No deposit activity yet.
                </p>
              )}
              {history.map((e) => {
                const s = staff.find((x) => x.id === e.staff_id);
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm text-foreground">
                      {EVENT_LABELS[e.event_type]}
                      {e.amount > 0 && (
                        <span className="ml-1 font-mono tabular">
                          · {fmtMoneyExact(e.amount)}
                        </span>
                      )}
                      {e.payment_method && (
                        <span className="ml-1 text-muted-foreground">
                          ({paymentMethodMeta[e.payment_method]})
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {fmtDateTime(e.at)}
                      {s ? ` · ${s.full_name}` : ""}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </p>
                    {e.transaction_id && canApply && (
                      <button
                        onClick={() => {
                          reverseDepositAction(e.id, "Corrected by staff");
                          toast.success("Action reversed. History preserved.");
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <RotateCcw size={11} /> Reverse
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </DialogContent>
        </Dialog>
      )}
      {taskOpen && (
        <CreateTaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          preset={{
            entityType: "deposit",
            entityId: deposit.id,
            entityLabel,
            title: taskTitle,
            category: "deposit",
          }}
        />
      )}
    </SectionCard>
  );
}
