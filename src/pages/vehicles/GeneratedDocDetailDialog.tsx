// Connect Pro Fleet — Generated document detail dialog (Build #45).
// View a vault document's metadata, signatures, history; sign, void/reissue,
// open PDF, link to expense. Signed records cannot be silently overwritten.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useVault } from "@/lib/vaultStoreProvider";
import { can } from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import type { Vehicle } from "@/lib/types";
import type { VaultDocument } from "@/lib/vaultTypes";
import {
  VAULT_DOC_STATUS_LABELS,
  VAULT_DOC_STATUS_TONE,
} from "@/lib/vaultTypes";
import { StatusPill } from "@/components/Status";
import { openCashExpensePdf } from "@/lib/vaultPdf";
import { openPurchasePdf } from "@/lib/vaultPurchasePdf";
import { VaultStatusBadge } from "./VaultPrimitives";

export function GeneratedDocDetailDialog({
  doc,
  vehicle,
  open,
  onOpenChange,
}: {
  doc: VaultDocument | null;
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const vault = useVault();
  const store = useStore();
  const [voidReason, setVoidReason] = useState("");
  const [showVoid, setShowVoid] = useState(false);

  if (!doc) return null;
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const perms = currentStaff?.permission_overrides ?? null;
  const canSign = can(roleObj, perms, "documents.sign");
  const canVoid = can(roleObj, perms, "documents.void_reissue");
  const canViewSensitive = can(roleObj, perms, "documents.view_sensitive");

  const events = vault.eventsFor(doc.id);

  function openPdf() {
    if (!doc) return;
    const opts = {
      doc,
      vehicle,
      company: store.companyInfo,
      showFullVin: canViewSensitive,
    };
    if (doc.kind === "cash_expense_record") openCashExpensePdf(opts);
    else openPurchasePdf(opts);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono">{doc.document_number}</DialogTitle>
          <DialogDescription>
            v{doc.version} ·{" "}
            <StatusPill tone={VAULT_DOC_STATUS_TONE[doc.status]}>
              {VAULT_DOC_STATUS_LABELS[doc.status]}
            </StatusPill>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {doc.kind === "cash_expense_record" && (
            <>
              <Row label="Vendor">{doc.vendor_name ?? "—"}</Row>
              <Row label="Amount">
                {doc.amount != null ? fmtMoneyExact(doc.amount) : "—"}
              </Row>
              <Row label="Date">
                {doc.expense_date ? fmtDate(doc.expense_date) : "—"}
              </Row>
              <Row label="Description">{doc.description ?? "—"}</Row>
              <Row label="Payment Method">{doc.payment_method ?? "—"}</Row>
              {doc.links.expense_id && (
                <Row label="Linked Expense">
                  <span className="font-mono text-status-available">
                    {doc.links.expense_id}
                  </span>
                </Row>
              )}
            </>
          )}
          {(doc.kind === "bill_of_sale" || doc.kind === "purchase_record") && (
            <>
              <Row label="Seller">{doc.seller_name ?? "—"}</Row>
              <Row label="Purchase Price">
                {doc.purchase_price != null
                  ? fmtMoneyExact(doc.purchase_price)
                  : "—"}
              </Row>
              <Row label="Purchase Date">
                {doc.purchase_date ? fmtDate(doc.purchase_date) : "—"}
              </Row>
              {doc.source_platform && (
                <Row label="Source">{doc.source_platform}</Row>
              )}
              {doc.is_internal && (
                <p className="text-xs text-status-maintenance">
                  Internal record — seller did not sign.
                </p>
              )}
            </>
          )}
          {doc.kind === "uploaded" && (
            <>
              <Row label="File">{doc.file_name ?? "—"}</Row>
              {doc.vendor_name && <Row label="Vendor">{doc.vendor_name}</Row>}
              {doc.amount != null && (
                <Row label="Amount">{fmtMoneyExact(doc.amount)}</Row>
              )}
            </>
          )}

          {doc.signatures.length > 0 && (
            <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Signatures
              </p>
              {doc.signatures.map((s) => (
                <p key={s.role} className="text-xs text-foreground">
                  {s.role}: {s.signer_name} · {fmtDate(s.signed_at)}
                </p>
              ))}
            </div>
          )}

          {doc.void_reason && (
            <p className="text-xs text-status-out">Voided: {doc.void_reason}</p>
          )}

          {events.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                History
              </p>
              {events.slice(0, 8).map((e) => (
                <p key={e.id} className="text-xs text-muted-foreground">
                  {e.at.slice(0, 10)} — {e.label}
                </p>
              ))}
            </div>
          )}

          {showVoid && (
            <div className="mt-3 space-y-2">
              <Label>Void reason</Label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Amount entered incorrectly"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openPdf}>
            Open PDF
          </Button>
          {doc.kind !== "uploaded" &&
            doc.status !== "active" &&
            doc.status !== "voided" &&
            doc.status !== "archived" &&
            canSign && (
              <Button
                size="sm"
                onClick={() =>
                  vault.signDocument(doc.id, {
                    role:
                      doc.kind === "bill_of_sale" && !doc.is_internal
                        ? "buyer"
                        : "recorder",
                    signer_name: currentStaff?.full_name ?? "Staff",
                    signature_data: `typed:${currentStaff?.full_name ?? "Staff"}`,
                  })
                }
              >
                Sign
              </Button>
            )}
          {doc.status !== "voided" &&
            doc.status !== "archived" &&
            canVoid &&
            (showVoid ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={!voidReason}
                onClick={() => {
                  vault.voidDocument(doc.id, voidReason);
                  setVoidReason("");
                  setShowVoid(false);
                  onOpenChange(false);
                }}
              >
                Confirm Void
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowVoid(true)}
              >
                Void / Reissue
              </Button>
            ))}
          {doc.status === "voided" && canVoid && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                vault.reissueDocument(doc.id, "Corrected reissue");
                onOpenChange(false);
              }}
            >
              Reissue (new version)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

export { VaultStatusBadge };
