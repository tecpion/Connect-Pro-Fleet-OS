// Connect Pro Fleet — V1 settlement detail dialog.
// Shows the transparent settlement breakdown, review warnings, lifecycle
// actions (review, approve, record payout, reopen, void), and statement PDF.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import {
  SETTLEMENT_STATUS_LABELS,
  PARTNER_PAYMENT_PREFERENCE_LABELS,
  type PartnerPaymentPreference,
  type SettlementV1,
} from "@/lib/investorWorkspaceTypes";
import {
  evaluateSettlementReview,
  hasSettlementBlocker,
  isSettlementLocked,
  type SettlementReviewContext,
} from "@/lib/investorWorkspaceSelectors";
import { useInvestorWorkspace } from "@/lib/investorWorkspaceStore";
import { SettlementStatusPill } from "./WorkspacePrimitives";
import { AlertTriangle, Lock, CheckCircle2, DollarSign } from "lucide-react";

export function SettlementDetailDialog({
  settlement,
  investorName,
  vehicleLabel,
  onClose,
}: {
  settlement: SettlementV1 | null;
  investorName: string;
  vehicleLabel: string;
  onClose: () => void;
}) {
  const ws = useInvestorWorkspace();
  const [reopenReason, setReopenReason] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [payoutMethod, setPayoutMethod] =
    useState<PartnerPaymentPreference>("ach");
  const [payoutDate, setPayoutDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [payoutRef, setPayoutRef] = useState("");

  if (!settlement) return null;

  const locked = isSettlementLocked(settlement);
  const reviewCtx: SettlementReviewContext = {
    unallocatedExpenses: 0,
    expensesAwaitingReview: 0,
    unresolvedDamageRecovery: false,
    agreementAmbiguity: false,
    missingAgreementVersion: false,
    invalidShareTotal:
      settlement.company_share_pct + settlement.partner_share_pct !== 100,
    overlappingAgreement: false,
    missingSettlementInputs: false,
  };
  const warnings = evaluateSettlementReview(reviewCtx);
  const blocker = hasSettlementBlocker(warnings);

  const handleApprove = () => {
    const result = ws.approveSettlement(settlement.id, reviewCtx);
    if (result.errors.length > 0) {
      toast.error(result.errors[0]);
    } else {
      toast.success("Settlement approved and locked.");
    }
  };

  const handleRecordPayout = () => {
    const result = ws.recordPayout(settlement.id, {
      paid_date: payoutDate,
      payment_method: payoutMethod,
      payment_reference: payoutRef || null,
    });
    if (result.errors.length > 0) {
      toast.error(result.errors[0]);
    } else {
      toast.success("Payout recorded.");
      onClose();
    }
  };

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      toast.error("A reopen reason is required.");
      return;
    }
    const result = ws.reopenSettlement(settlement.id, reopenReason);
    if (result.errors.length > 0) {
      toast.error(result.errors[0]);
    } else {
      toast.success("Settlement reopened.");
      setReopenReason("");
    }
  };

  const handleVoid = () => {
    if (!voidReason.trim()) {
      toast.error("A void reason is required.");
      return;
    }
    const result = ws.voidSettlement(settlement.id, voidReason);
    if (result.errors.length > 0) {
      toast.error(result.errors[0]);
    } else {
      toast.success("Settlement voided.");
      onClose();
    }
  };

  return (
    <Dialog open={!!settlement} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Settlement {settlement.settlement_number}
            {locked && <Lock size={14} className="text-muted-foreground" />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Partner
              </p>
              <p className="font-medium text-foreground">{investorName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Vehicle
              </p>
              <p className="font-medium text-foreground">{vehicleLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Period
              </p>
              <p className="font-mono tabular text-foreground">
                {fmtDate(settlement.period_start)} →{" "}
                {fmtDate(settlement.period_end)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <SettlementStatusPill status={settlement.status} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Agreement version
              </p>
              <p className="font-mono tabular text-foreground">
                v{settlement.agreement_version}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Share
              </p>
              <p className="font-mono tabular text-foreground">
                {settlement.company_share_pct}% / {settlement.partner_share_pct}
                %
              </p>
            </div>
          </div>

          {/* Transparent breakdown */}
          <div className="rounded-lg border border-border bg-surface-2/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Settlement breakdown
            </p>
            <div className="space-y-1.5 text-sm">
              <BreakdownRow
                label="Gross Revenue Generated"
                value={fmtMoneyExact(settlement.gross_revenue)}
              />
              <BreakdownRow
                label="− Included Vehicle Expenses"
                value={`-${fmtMoneyExact(settlement.included_expenses)}`}
              />
              <BreakdownRow
                label="± Recoveries / Adjustments"
                value={fmtMoneyExact(settlement.recoveries_adjustments)}
              />
              <div className="border-t border-border pt-1.5">
                <BreakdownRow
                  label="= Net Vehicle Contribution"
                  value={fmtMoneyExact(settlement.net_vehicle_contribution)}
                  bold
                />
              </div>
              <BreakdownRow
                label={`× Partner Share (${settlement.partner_share_pct}%)`}
                value=""
              />
              {settlement.manual_adjustments !== 0 && (
                <BreakdownRow
                  label="± Manual Adjustments"
                  value={fmtMoneyExact(settlement.manual_adjustments)}
                />
              )}
              <div className="border-t border-border pt-1.5">
                <BreakdownRow
                  label="Final Partner Payout"
                  value={fmtMoneyExact(settlement.final_partner_payout)}
                  bold
                  highlight
                />
              </div>
              <BreakdownRow
                label="Company Retained"
                value={fmtMoneyExact(settlement.company_retained)}
                bold
              />
            </div>
          </div>

          {/* Review warnings */}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Review checks
              </p>
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <AlertTriangle
                      size={13}
                      className={
                        w.severity === "blocker"
                          ? "mt-0.5 text-status-out"
                          : "mt-0.5 text-status-maintenance"
                      }
                    />
                    <span className="text-foreground">
                      <strong>{w.reason}</strong>
                      {w.detail && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {w.detail}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Payment info if paid */}
          {settlement.status === "paid" && settlement.paid_date && (
            <div className="rounded-lg border border-border bg-surface-2/40 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Payment recorded
              </p>
              <p className="mt-1 font-mono tabular text-foreground">
                {fmtDate(settlement.paid_date)} ·{" "}
                {settlement.payment_method
                  ? PARTNER_PAYMENT_PREFERENCE_LABELS[settlement.payment_method]
                  : "—"}
                {settlement.payment_reference
                  ? ` · ${settlement.payment_reference}`
                  : ""}
              </p>
            </div>
          )}

          {/* Reopen info */}
          {settlement.reopened_reason && (
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              Reopened: {settlement.reopened_reason} ·{" "}
              {settlement.reopened_at ? fmtDate(settlement.reopened_at) : ""}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {settlement.status === "calculated" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  ws.sendSettlementToReview(settlement.id);
                  toast.success("Sent to review.");
                }}
              >
                Send to Review
              </Button>
            )}
            {(settlement.status === "needs_review" ||
              settlement.status === "calculated") &&
              !blocker && (
                <Button size="sm" onClick={handleApprove}>
                  <CheckCircle2 size={14} /> Approve
                </Button>
              )}
            {settlement.status === "approved" && (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs">Payment method</Label>
                  <Select
                    value={payoutMethod}
                    onValueChange={(v) =>
                      setPayoutMethod(v as PartnerPaymentPreference)
                    }
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PARTNER_PAYMENT_PREFERENCE_LABELS).map(
                        ([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">
                            {v}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Paid date</Label>
                  <Input
                    type="date"
                    value={payoutDate}
                    onChange={(e) => setPayoutDate(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Reference</Label>
                  <Input
                    value={payoutRef}
                    onChange={(e) => setPayoutRef(e.target.value)}
                    placeholder="optional"
                    className="h-8 w-36 text-xs"
                  />
                </div>
                <Button size="sm" onClick={handleRecordPayout}>
                  <DollarSign size={14} /> Record Payout
                </Button>
              </div>
            )}
            {locked && settlement.status !== "voided" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Reopen reason</Label>
                  <Textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Why is this settlement being reopened?"
                    className="min-h-[40px] text-xs"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={handleReopen}>
                  Reopen
                </Button>
              </div>
            )}
            {settlement.status !== "voided" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Void reason</Label>
                  <Input
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Why is this settlement being voided?"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={handleVoid}
                >
                  Void
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BreakdownRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          bold ? "font-semibold text-foreground" : "text-muted-foreground"
        }
      >
        {label}
      </span>
      {value && (
        <span
          className={`font-mono tabular ${
            highlight ? "font-semibold text-primary" : "text-foreground"
          }`}
        >
          {value}
        </span>
      )}
    </div>
  );
}
