// Connect Pro Fleet — damage claim detail dialog (Build #17).
// Summary, responsibility, financial (economics), evidence, insurance, repair,
// timeline, and actions. Permission-aware: financials hidden without
// damage_claims.view_financials. Sub-dialogs live in ClaimDialogs.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import type {
  DamageClaim,
  ResponsibilityStatus,
  ResponsiblePartyType,
  InsuranceClaimStatus,
} from "@/lib/damageClaimTypes";
import {
  DAMAGE_SOURCE_LABELS,
  DAMAGE_CLAIM_STATUS_LABELS,
  RESPONSIBILITY_LABELS,
  RESPONSIBLE_PARTY_LABELS,
  EVIDENCE_TYPE_LABELS,
  RECOVERY_TYPE_LABELS,
  INSURANCE_CLAIM_STATUS_LABELS,
} from "@/lib/damageClaimTypes";
import {
  RESPONSIBILITY_STATUSES,
  toneClass,
  claimStatusTone,
  severityTone,
  statusLabel,
  severityLabel,
  sourceLabel,
  responsibilityLabel,
  Field,
} from "./shared";
import {
  ChargeCustomerDialog,
  ApplyDepositDialog,
  RecordRecoveryDialog,
  AddEvidenceDialog,
  FileInsuranceDialog,
  CloseClaimDialog,
  CancelClaimDialog,
} from "./ClaimDialogs";

const RESPONSIBLE_PARTIES: ResponsiblePartyType[] = [
  "customer",
  "driver",
  "company",
  "employee",
  "third_party",
  "insurance",
  "unknown",
];
const INSURANCE_STATUSES: InsuranceClaimStatus[] = [
  "filed",
  "under_review",
  "approved",
  "partially_paid",
  "paid",
  "denied",
  "closed",
];

export function ClaimDetail({
  claim,
  onClose,
  canViewFinancials,
  canChargeCustomer,
  canApplyDeposit,
  canManageInsurance,
  canDetermineResponsibility,
  canClose,
  canCancel,
  canManageEvidence,
}: {
  claim: DamageClaim;
  onClose: () => void;
  canViewFinancials: boolean;
  canChargeCustomer: boolean;
  canApplyDeposit: boolean;
  canManageInsurance: boolean;
  canDetermineResponsibility: boolean;
  canClose: boolean;
  canCancel: boolean;
  canManageEvidence: boolean;
}) {
  const store = useStore();
  const dc = useDamageClaims();
  const [respStatus, setRespStatus] = useState<ResponsibilityStatus>(
    claim.responsibility_status,
  );
  const [respParty, setRespParty] = useState<ResponsiblePartyType | "">(
    claim.responsible_party_type ?? "",
  );
  const [respPct, setRespPct] = useState(
    claim.customer_responsibility_percent?.toString() ?? "",
  );
  const [note, setNote] = useState("");
  const [dlg, setDlg] = useState<
    | null
    | "charge"
    | "deposit"
    | "recovery"
    | "evidence"
    | "insurance"
    | "close"
    | "cancel"
  >(null);

  const evidence = dc.claimEvidence(claim.id);
  const insurance = dc.claimInsurance(claim.id);
  const recoveries = dc.claimRecoveries(claim.id);
  const events = dc.claimEvents(claim.id);
  const economics = getDamageClaimEconomics(claim, {
    transactions: store.transactions,
    expenses: store.expenses,
    recoveries: dc.damageRecoveries,
  });

  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model} · ${v.license_plate}` : "—";
  };
  const customerName = (id: string | null) =>
    id ? store.customerName(id) : "—";
  const rentalNumber = (id: string | null) => {
    if (!id) return "—";
    return store.rentals.find((x) => x.id === id)?.agreement_number ?? "—";
  };
  const staffName = (id: string | null) => (id ? store.creatorLabel(id) : "—");

  function saveResponsibility() {
    dc.setResponsibility(claim.id, {
      responsibility_status: respStatus,
      responsible_party_type: (respParty ||
        null) as ResponsiblePartyType | null,
      customer_responsibility_percent: respPct ? Number(respPct) : null,
    });
    toast.success("Responsibility updated.");
  }
  function addNote() {
    if (!note.trim()) return;
    dc.addClaimNote(claim.id, note.trim());
    setNote("");
    toast.success("Note added.");
  }
  function createTask() {
    store.createTask({
      title: `Follow up on damage claim — ${claim.claim_number}`,
      category: "damage",
      entityType: "damage_claim",
      entityId: claim.id,
      entityLabel: `${claim.claim_number} · ${vehicleLabel(claim.vehicle_id)}`,
    });
    toast.success("Task created.");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{claim.claim_number}</span>
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {DAMAGE_SOURCE_LABELS[claim.damage_source]}
            </span>
          </DialogTitle>
          <DialogDescription>
            {vehicleLabel(claim.vehicle_id)} · discovered{" "}
            {fmtDate(claim.discovered_at)}
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div
          className={`rounded-lg border border-border bg-surface p-4 status-border ${toneClass[claimStatusTone[claim.claim_status]]}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {statusLabel(claim.claim_status)}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] ${severityTone[claim.severity] === "out" ? "bg-status-out/10 text-status-out" : severityTone[claim.severity] === "maintenance" ? "bg-status-maintenance/10 text-status-maintenance" : "bg-muted text-muted-foreground"}`}
            >
              {severityLabel(claim.severity)}
            </span>
            {claim.blocks_vehicle_use && (
              <span className="rounded bg-status-out/10 px-1.5 py-0.5 text-[11px] text-status-out">
                Vehicle out of service
              </span>
            )}
            {claim.pre_existing === true && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                Pre-existing
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-foreground">{claim.description}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Customer" value={customerName(claim.customer_id)} />
            <Field label="Rental" value={rentalNumber(claim.rental_id)} mono />
            <Field
              label="Responsibility"
              value={responsibilityLabel(claim.responsibility_status)}
            />
            <Field label="Assigned" value={staffName(claim.assigned_user_id)} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canDetermineResponsibility && (
            <Button variant="outline" size="sm" onClick={saveResponsibility}>
              Save responsibility
            </Button>
          )}
          {canChargeCustomer && !claim.customer_charge_transaction_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDlg("charge")}
            >
              Charge customer
            </Button>
          )}
          {canApplyDeposit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDlg("deposit")}
            >
              Apply deposit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDlg("recovery")}
          >
            Record recovery
          </Button>
          {canManageEvidence && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDlg("evidence")}
            >
              Add evidence
            </Button>
          )}
          {canManageInsurance && !insurance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDlg("insurance")}
            >
              File insurance
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={createTask}>
            Create task
          </Button>
          {canClose && (
            <Button variant="outline" size="sm" onClick={() => setDlg("close")}>
              Close claim
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDlg("cancel")}
            >
              Cancel claim
            </Button>
          )}
          {claim.claim_status === "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                dc.reopenClaim(claim.id);
                toast.success("Claim reopened.");
              }}
            >
              Reopen
            </Button>
          )}
        </div>

        {/* Responsibility editor */}
        {canDetermineResponsibility && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Responsibility
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="resp-status">Status</Label>
                <select
                  id="resp-status"
                  value={respStatus}
                  onChange={(e) =>
                    setRespStatus(e.target.value as ResponsibilityStatus)
                  }
                  className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {RESPONSIBILITY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {responsibilityLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="resp-party">Responsible party</Label>
                <select
                  id="resp-party"
                  value={respParty}
                  onChange={(e) =>
                    setRespParty(e.target.value as ResponsiblePartyType)
                  }
                  className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">—</option>
                  {RESPONSIBLE_PARTIES.map((p) => (
                    <option key={p} value={p}>
                      {RESPONSIBLE_PARTY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="resp-pct">Customer %</Label>
                <Input
                  id="resp-pct"
                  type="number"
                  min={0}
                  max={100}
                  value={respPct}
                  onChange={(e) => setRespPct(e.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Financial economics */}
        {canViewFinancials && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Financial
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field
                label="Estimated cost"
                value={
                  economics.estimated_cost != null
                    ? fmtMoney(economics.estimated_cost)
                    : "—"
                }
                mono
              />
              <Field
                label="Actual cost"
                value={
                  economics.actual_cost != null
                    ? fmtMoney(economics.actual_cost)
                    : "Unknown"
                }
                mono
              />
              <Field
                label="Customer charged"
                value={fmtMoney(economics.customer_charged)}
                mono
              />
              <Field
                label="Customer paid"
                value={fmtMoney(economics.customer_paid)}
                mono
              />
              <Field
                label="Deposit applied"
                value={fmtMoney(economics.deposit_applied)}
                mono
              />
              <Field
                label="Insurance recovered"
                value={fmtMoney(economics.insurance_recovered)}
                mono
              />
              <Field
                label="Total recovered"
                value={fmtMoney(economics.total_recovered)}
                mono
              />
              <Field
                label="Unrecovered cost"
                value={
                  economics.unrecovered_cost != null
                    ? fmtMoney(economics.unrecovered_cost)
                    : "—"
                }
                mono
              />
              <Field
                label="Company net loss"
                value={
                  economics.company_net_loss != null
                    ? fmtMoney(economics.company_net_loss)
                    : "—"
                }
                mono
              />
            </div>
            {economics.outstanding_customer_damage_balance > 0 && (
              <p className="mt-3 text-sm text-maintenance">
                Outstanding customer damage balance:{" "}
                <span className="font-mono">
                  {fmtMoney(economics.outstanding_customer_damage_balance)}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Evidence */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Evidence
          </h3>
          {evidence.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No evidence added yet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {evidence.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {EVIDENCE_TYPE_LABELS[ev.evidence_type]}
                    </p>
                    {ev.description && (
                      <p className="text-xs text-muted-foreground">
                        {ev.description}
                      </p>
                    )}
                  </div>
                  {canManageEvidence && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        dc.voidEvidence(ev.id);
                        toast.success("Evidence voided.");
                      }}
                    >
                      Void
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insurance */}
        {insurance && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Insurance claim
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Insurer" value={insurance.insurer_name ?? "—"} />
              <Field
                label="Claim ref"
                value={insurance.claim_reference ?? "—"}
                mono
              />
              <Field
                label="Status"
                value={INSURANCE_CLAIM_STATUS_LABELS[insurance.claim_status]}
              />
              <Field
                label="Claimed"
                value={
                  insurance.claimed_amount != null
                    ? fmtMoney(insurance.claimed_amount)
                    : "—"
                }
                mono
              />
              <Field
                label="Approved"
                value={
                  insurance.approved_amount != null
                    ? fmtMoney(insurance.approved_amount)
                    : "—"
                }
                mono
              />
              <Field
                label="Paid"
                value={
                  insurance.paid_amount != null
                    ? fmtMoney(insurance.paid_amount)
                    : "—"
                }
                mono
              />
            </div>
            {canManageInsurance && (
              <div className="mt-3">
                <Label htmlFor="ins-status">Update status</Label>
                <select
                  id="ins-status"
                  value={insurance.claim_status}
                  onChange={(e) => {
                    dc.updateInsurance(insurance.id, {
                      claim_status: e.target.value as InsuranceClaimStatus,
                    });
                    toast.success("Insurance status updated.");
                  }}
                  className="mt-1 rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {INSURANCE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {INSURANCE_CLAIM_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Recoveries */}
        {recoveries.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Recoveries
            </h3>
            <div className="mt-3 space-y-2">
              {recoveries.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {RECOVERY_TYPE_LABELS[r.recovery_type]}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {fmtDate(r.date)}
                    </p>
                  </div>
                  <p className="font-mono text-sm tabular text-foreground">
                    {fmtMoney(r.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Timeline
          </h3>
          <div className="mt-3 space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex gap-3 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {fmtDateTime(ev.created_at)}
                </span>
                <span className="text-foreground">{ev.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-display text-sm font-semibold text-foreground">
            Add note
          </h3>
          <div className="mt-3 flex gap-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an internal note…"
            />
            <Button variant="outline" size="sm" onClick={addNote}>
              Add
            </Button>
          </div>
        </div>

        {/* Sub-dialogs */}
        {dlg === "charge" && (
          <ChargeCustomerDialog
            claimId={claim.id}
            onClose={() => setDlg(null)}
          />
        )}
        {dlg === "deposit" && (
          <ApplyDepositDialog claimId={claim.id} onClose={() => setDlg(null)} />
        )}
        {dlg === "recovery" && (
          <RecordRecoveryDialog
            claimId={claim.id}
            insuranceId={insurance?.id ?? null}
            onClose={() => setDlg(null)}
          />
        )}
        {dlg === "evidence" && (
          <AddEvidenceDialog claimId={claim.id} onClose={() => setDlg(null)} />
        )}
        {dlg === "insurance" && (
          <FileInsuranceDialog
            claimId={claim.id}
            onClose={() => setDlg(null)}
          />
        )}
        {dlg === "close" && (
          <CloseClaimDialog
            claimId={claim.id}
            outstandingBalance={economics.outstanding_customer_damage_balance}
            onClose={() => setDlg(null)}
            onClosed={() => {
              setDlg(null);
              onClose();
            }}
          />
        )}
        {dlg === "cancel" && (
          <CancelClaimDialog
            claimId={claim.id}
            onClose={() => setDlg(null)}
            onClosed={() => {
              setDlg(null);
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
