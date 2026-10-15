// Connect Pro Fleet — violation detail drawer (structured case view).
//
// Sections: Overview, Rental Match, Responsibility, Financial, Evidence,
// Timeline. Match Status / Responsibility / Billing / Due State are kept
// separate. Match confirmation does NOT auto-assign financial responsibility.
// Bill Renter creates the authoritative ledger charge (no second ledger).
// Collections traceability is surfaced via the linked charge transaction.
// No authoritative domain logic changes — pure presentation + existing store
// mutations.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useViolations } from "@/lib/violationStoreProvider";
import { useViolationPolicy } from "@/lib/violationPolicyStore";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  VIOLATION_STATUS_TONE,
  VIOLATION_STATUS_LABELS,
  RESPONSIBILITY_TONE,
  RESPONSIBILITY_REASON_LABELS,
  DISPUTE_STATUS_LABELS,
  COMPANY_PAYMENT_LABELS,
  CUSTOMER_CHARGE_LABELS,
  VIOLATION_EVENT_LABELS,
  EVIDENCE_TYPE_LABELS,
} from "@/lib/violationTypes";
import {
  matchStatus,
  billingStatus,
  dueState,
  violationAttention,
  autoMatchExplanation,
} from "@/lib/violationWorkspaceAttention";
import { daysOverdue } from "@/lib/violationSelectors";
import { Field, statusLabel, typeLabel, responsibilityLabel } from "./shared";
import {
  ResponsibilityDialog,
  ChargeDialog,
  CompanyPayDialog,
  DisputeDialog,
  ReverseChargeDialog,
  WaiveDialog,
  CreateTaskDialog,
  MatchBadge,
  billingLabel,
  MatchDialog,
} from "./ViolationDialogs";

const NOW = new Date("2026-09-10T12:00:00");

export function ViolationDetail({
  violationId,
  onClose,
}: {
  violationId: string;
  onClose: () => void;
}) {
  const store = useStore();
  const vio = useViolations();
  const { violationPolicy } = useViolationPolicy();
  const v = vio.violationById(violationId);

  const role = store.roles.find(
    (r) =>
      r.name === store.staff.find((s) => s.id === store.currentStaffId)?.role,
  );
  const overrides = store.staff.find((s) => s.id === store.currentStaffId)
    ?.permission_overrides as Record<string, unknown> | null;
  const canCharge = can(role, overrides, "violations.charge_customer");
  const canCompanyPay = can(
    role,
    overrides,
    "violations.record_company_payment",
  );
  const canDispute = can(role, overrides, "violations.dispute");
  const canResolve = can(role, overrides, "violations.resolve");
  const canAssignResp = can(
    role,
    overrides,
    "violations.assign_responsibility",
  );
  const canViewFinancials = can(role, overrides, "violations.view_financials");

  const [respOpen, setRespOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [resolveConfirm, setResolveConfirm] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const vehicleLabel = (id: string) => {
    const vh = store.vehicles.find((x) => x.id === id);
    return vh ? `${vh.year} ${vh.make} ${vh.model}` : "—";
  };
  const vehiclePlate = (id: string) =>
    store.vehicles.find((x) => x.id === id)?.license_plate ?? "—";
  const staffName = (id: string | null) =>
    id ? (store.staff.find((s) => s.id === id)?.full_name ?? "—") : "—";
  const customerName = (id: string | null) =>
    id ? store.customerName(id) || "—" : "—";
  const rentalNumber = (id: string | null) => {
    if (!id) return "—";
    const r = store.rentals.find((x) => x.id === id);
    return r?.agreement_number ?? "—";
  };

  const events = useMemo(() => (v ? vio.eventsFor(v.id) : []), [v, vio]);
  const evidence = useMemo(() => (v ? vio.evidenceFor(v.id) : []), [v, vio]);

  if (!v) return null;

  const ms = matchStatus(v);
  const bs = billingStatus(v);
  const ds = dueState(v, NOW);
  const att = violationAttention(v, NOW);
  const matchExplanation = autoMatchExplanation(v);
  const penaltyPart = violationPolicy.charge_penalties_to_customer
    ? v.penalties_amount
    : 0;
  const projectedCharge = v.base_amount + penaltyPart + v.admin_fee_amount;

  // Net company impact (Vehicle Performance compatibility): company-paid minus
  // customer-collected. Derived from authoritative record fields — no second
  // calculation.
  const companyPaid = v.company_payment_status === "paid" ? v.total_amount : 0;
  const customerCharged =
    v.customer_charge_status === "charged" ? v.total_amount : 0;
  const netCompanyImpact = Math.max(0, companyPaid - customerCharged);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{v.violation_number}</span>
            <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
              {statusLabel(v.status)}
            </StatusPill>
            <MatchBadge status={ms} />
            {att.level !== "none" && (
              <StatusPill
                tone={att.level === "critical" ? "out" : "maintenance"}
              >
                {att.level === "critical" ? "Critical" : "Attention"}
              </StatusPill>
            )}
          </DialogTitle>
          <DialogDescription>
            {typeLabel(v.violation_type)} · {vehicleLabel(v.vehicle_id)} ·{" "}
            {vehiclePlate(v.vehicle_id)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Primary contextual action */}
          <div className="flex flex-wrap gap-2">
            {canCharge &&
              v.responsibility === "customer" &&
              v.rental_id &&
              v.customer_charge_status !== "charged" && (
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground"
                  onClick={() => setChargeOpen(true)}
                >
                  Bill Renter
                </Button>
              )}
            {canCharge &&
              v.customer_charge_status === "charged" &&
              bs !== "paid" && (
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground"
                  onClick={() => setChargeOpen(true)}
                >
                  Mark Paid
                </Button>
              )}
            {canCompanyPay && v.company_payment_status !== "paid" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPayOpen(true)}
              >
                Mark Company Paid
              </Button>
            )}
            {canResolve &&
              v.status !== "resolved" &&
              v.status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setResolveConfirm(true)}
                >
                  Resolve / Close
                </Button>
              )}
          </div>

          {/* Overview */}
          <Section title="Overview">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Type" value={typeLabel(v.violation_type)} />
              <Field
                label="Violation date"
                value={fmtDateTime(v.occurred_at)}
                mono
              />
              <Field
                label="Issuing authority"
                value={v.issuing_authority ?? "—"}
              />
              <Field
                label="Citation / reference"
                value={v.citation_number ?? "—"}
                mono
              />
              <Field
                label="Due date"
                value={v.due_at ? fmtDate(v.due_at) : "No due date"}
                mono
              />
              <Field
                label="Assigned staff"
                value={staffName(v.assigned_staff_id)}
              />
            </div>
            {v.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {v.description}
              </p>
            )}
          </Section>

          {/* Rental Match */}
          <Section title="Rental Match">
            <div className="flex items-center justify-between">
              <div>
                <div className="mt-1 flex items-center gap-2">
                  <MatchBadge status={ms} />
                  {v.rental_id ? (
                    <div>
                      <p className="text-sm text-foreground">
                        {customerName(v.customer_id)}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        Rental {rentalNumber(v.rental_id)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-sm text-status-out">
                      No rental match
                    </span>
                  )}
                </div>
                {matchExplanation && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {matchExplanation}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMatchOpen(true)}
              >
                Change Match
              </Button>
            </div>
          </Section>

          {/* Responsibility */}
          <Section title="Responsibility">
            <div className="flex items-center justify-between">
              <div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
                    {responsibilityLabel(v.responsibility)}
                  </StatusPill>
                  {v.responsibility_reason && (
                    <span className="text-xs text-muted-foreground">
                      {RESPONSIBILITY_REASON_LABELS[v.responsibility_reason]}
                    </span>
                  )}
                </div>
                {v.responsibility_notes && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {v.responsibility_notes}
                  </p>
                )}
                {v.dispute_status !== "not_disputed" && (
                  <p className="mt-1 text-xs text-status-out">
                    Disputed — {DISPUTE_STATUS_LABELS[v.dispute_status]}
                  </p>
                )}
              </div>
              {canAssignResp && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRespOpen(true)}
                >
                  Assign
                </Button>
              )}
            </div>
          </Section>

          {/* Financial */}
          {canViewFinancials && (
            <Section title="Financial">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field
                  label="Fine amount"
                  value={fmtMoney(v.total_amount)}
                  mono
                />
                <Field
                  label="Company paid"
                  value={companyPaid > 0 ? fmtMoney(companyPaid) : "—"}
                  mono
                />
                <Field
                  label="Customer charged"
                  value={customerCharged > 0 ? fmtMoney(customerCharged) : "—"}
                  mono
                />
                <Field label="Billing status" value={billingLabel(bs)} />
                <Field
                  label="Net company impact"
                  value={fmtMoney(netCompanyImpact)}
                  mono
                />
                <Field
                  label="Disputed amount"
                  value={
                    v.dispute_status !== "not_disputed"
                      ? fmtMoney(v.total_amount)
                      : "—"
                  }
                  mono
                />
              </div>
              {v.customer_charge_transaction_id && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Customer charge:
                  </span>
                  <button
                    onClick={() =>
                      toast.info(
                        `Charge ${v.customer_charge_transaction_id} visible in Collections.`,
                      )
                    }
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {v.customer_charge_transaction_id}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    → Collections
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* Evidence / Documents */}
          <Section title="Evidence / Documents">
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No evidence linked yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {evidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {EVIDENCE_TYPE_LABELS[e.type]}
                    </span>
                    <span className="text-foreground">
                      {e.description ?? e.file_ref ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Attention reasons */}
          {att.level !== "none" && (
            <Section title="Attention">
              <div className="flex flex-wrap gap-1.5">
                {att.reasons.map((r) => (
                  <span
                    key={r}
                    className={
                      att.level === "critical"
                        ? "rounded bg-status-out/10 px-1.5 py-0.5 text-[11px] text-status-out"
                        : "rounded bg-status-maintenance/10 px-1.5 py-0.5 text-[11px] text-status-maintenance"
                    }
                  >
                    {r}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Secondary actions */}
          <div className="flex flex-wrap gap-2">
            {canDispute && v.dispute_status === "not_disputed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDisputeOpen(true)}
              >
                Dispute
              </Button>
            )}
            {canCharge && v.customer_charge_status === "charged" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReverseOpen(true)}
              >
                Reverse charge
              </Button>
            )}
            {canResolve &&
              v.status !== "resolved" &&
              v.status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWaiveOpen(true)}
                >
                  Waive
                </Button>
              )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTaskOpen(true)}
            >
              Create Task
            </Button>
          </div>

          {/* Timeline */}
          <Section title="Timeline">
            <ul className="space-y-1.5">
              {events.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No events yet.
                </li>
              )}
              {events.map((e) => (
                <li key={e.id} className="flex gap-2 text-sm">
                  <span className="font-mono text-xs tabular text-muted-foreground">
                    {fmtDateTime(e.at)}
                  </span>
                  <span className="text-foreground">
                    {VIOLATION_EVENT_LABELS[e.type]} — {e.label}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {respOpen && (
          <ResponsibilityDialog
            current={v}
            onClose={() => setRespOpen(false)}
            onSave={(r, reason, notes) => {
              vio.assignResponsibility(v.id, r, reason, notes);
              setRespOpen(false);
              toast.success("Responsibility assigned");
            }}
          />
        )}
        {matchOpen && (
          <MatchDialog
            violation={v}
            rentals={store.rentals}
            customerName={customerName}
            onClose={() => setMatchOpen(false)}
            onConfirm={(rentalId) => {
              // Confirm match = set rental + mark decided by staff. Does NOT
              // auto-assign financial responsibility.
              vio.updateViolation(v.id, {
                rental_id: rentalId,
                customer_id:
                  store.rentals.find((r) => r.id === rentalId)?.customer_id ??
                  null,
                responsibility_decided_by: store.currentStaffId,
                responsibility_decided_at: new Date().toISOString(),
              });
              setMatchOpen(false);
              toast.success("Match confirmed");
            }}
            onUnmatch={() => {
              vio.updateViolation(v.id, {
                rental_id: null,
                customer_id: null,
                responsibility_decided_by: null,
                responsibility_decided_at: null,
              });
              setMatchOpen(false);
              toast.success("Marked unmatched");
            }}
          />
        )}
        {chargeOpen && (
          <ChargeDialog
            violation={v}
            projected={projectedCharge}
            canViewFinancials={canViewFinancials}
            onClose={() => setChargeOpen(false)}
            onConfirm={() => {
              const res = vio.chargeCustomer(v.id, {}, `${v.id}-charge`);
              if (res.ok) {
                toast.success("Customer charged");
                setChargeOpen(false);
              } else {
                toast.error(res.error ?? "Charge failed");
              }
            }}
          />
        )}
        {payOpen && (
          <CompanyPayDialog
            violation={v}
            onClose={() => setPayOpen(false)}
            onConfirm={(amount, date, method) => {
              const res = vio.recordCompanyPayment(
                v.id,
                { amount, transaction_date: date, payment_method: method },
                `${v.id}-pay`,
              );
              if (res.ok) {
                toast.success("Company payment recorded");
                setPayOpen(false);
              } else {
                toast.error(res.error ?? "Failed");
              }
            }}
          />
        )}
        {disputeOpen && (
          <DisputeDialog
            onClose={() => setDisputeOpen(false)}
            onSave={(reason, status, note) => {
              vio.openDispute(v.id, { reason, status, decision_note: note });
              setDisputeOpen(false);
              toast.success("Dispute opened");
            }}
          />
        )}
        {resolveConfirm && (
          <ConfirmDialog
            open
            onOpenChange={(o) => !o && setResolveConfirm(false)}
            title="Resolve violation"
            description="Mark this violation as resolved. Financial records are preserved."
            confirmLabel="Resolve"
            onConfirm={() => {
              vio.resolveViolation(v.id);
              setResolveConfirm(false);
              toast.success("Resolved");
            }}
          />
        )}
        {reverseOpen && (
          <ReverseChargeDialog
            onClose={() => setReverseOpen(false)}
            onConfirm={(reason) => {
              vio.reverseCustomerCharge(v.id, reason);
              setReverseOpen(false);
              toast.success("Charge reversed");
            }}
          />
        )}
        {waiveOpen && (
          <WaiveDialog
            onClose={() => setWaiveOpen(false)}
            onConfirm={(reason, note) => {
              vio.cancelViolation(v.id, note ? `${reason} — ${note}` : reason);
              setWaiveOpen(false);
              toast.success("Violation waived");
            }}
          />
        )}
        {taskOpen && (
          <CreateTaskDialog
            violationNumber={v.violation_number}
            vehicleLabel={vehicleLabel(v.vehicle_id)}
            customerName={v.customer_id ? customerName(v.customer_id) : null}
            onClose={() => setTaskOpen(false)}
            onConfirm={(title, description) => {
              store.createTask({
                title,
                description,
                category: "violation",
                entityType: "violation",
                entityId: v.id,
                entityLabel: v.violation_number,
              });
              setTaskOpen(false);
              toast.success("Task created");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
