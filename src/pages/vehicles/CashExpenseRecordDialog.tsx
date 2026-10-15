// Connect Pro Fleet — Cash Expense Record dialog (Build #45).
// For cash/informal payments where no vendor receipt exists. Clearly labelled
// as a generated business record, not a vendor receipt. Links to the existing
// Expense Ledger (no duplicate financial truth).

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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Vehicle } from "@/lib/types";
import type { TenderMethod } from "@/lib/paymentMethodTypes";
import { TENDER_METHODS, TENDER_METHOD_LABELS } from "@/lib/paymentMethodTypes";
import { fmtMoneyExact } from "@/lib/format";
import { expenseAmountConflict } from "@/lib/vaultSelectors";
import { openCashExpensePdf } from "@/lib/vaultPdf";

export function CashExpenseRecordDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const vault = useVault();
  const store = useStore();
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<TenderMethod>("cash");
  const [notes, setNotes] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [linkExpense, setLinkExpense] = useState(false);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canGenerate = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.generate_cash_expense",
  );
  const canSign = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.sign",
  );
  const canViewSensitive = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.view_sensitive",
  );

  function reset() {
    setVendorName("");
    setVendorPhone("");
    setAmount("");
    setDescription("");
    setNotes("");
    setLinkExpense(false);
    setCreatedId(null);
  }

  function handleCreate() {
    if (!vendorName || !amount || !date || !description) return;
    const id = vault.createCashExpenseRecord({
      vehicle_id: vehicle.id,
      vendor_name: vendorName,
      vendor_phone: vendorPhone || null,
      amount: Number(amount),
      expense_date: date,
      description,
      payment_method: paymentMethod,
      notes: notes || null,
    });
    setCreatedId(id);
  }

  function handleSign() {
    if (!createdId) return;
    const staff = store.staff.find((s) => s.id === store.currentStaffId);
    vault.signDocument(createdId, {
      role: "recorder",
      signer_name: staff?.full_name ?? "Staff",
      signature_data: `typed:${staff?.full_name ?? "Staff"}`,
    });
    if (linkExpense) {
      vault.createExpenseFromCashRecord(createdId);
    }
    onOpenChange(false);
    reset();
  }

  const created = createdId ? vault.generatedDocById(createdId) : null;
  const conflict =
    created && created.links.expense_id
      ? expenseAmountConflict(
          created,
          store.expenses.find((e) => e.id === created.links.expense_id) ?? {},
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Cash Expense Record</DialogTitle>
          <DialogDescription>
            For cash or informal payments where no vendor receipt exists. This
            is a generated business record, not a vendor receipt.
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="space-y-3">
            <div>
              <Label>Vendor / Payee</Label>
              <Input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Mike's Auto Repair"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor phone (optional)</Label>
                <Input
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                />
              </div>
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="425"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Payment method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as TenderMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENDER_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {TENDER_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description / Business purpose</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brake pad replacement — labor + parts"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mechanic does not issue receipts."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <p className="text-sm font-medium text-foreground">
                {created.document_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {vendorName} · {fmtMoneyExact(Number(amount))}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={linkExpense}
                onChange={(e) => setLinkExpense(e.target.checked)}
              />
              Create Expense Ledger entry from this record
            </label>
            {conflict && (
              <p className="text-xs text-status-out">
                Amount mismatch: record {fmtMoneyExact(conflict.generated)} vs
                ledger {fmtMoneyExact(conflict.ledger)}. Review before signing.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                openCashExpensePdf({
                  doc: created,
                  vehicle,
                  company: store.companyInfo,
                  showFullVin: canViewSensitive,
                })
              }
            >
              Preview PDF
            </Button>
          </div>
        )}

        <DialogFooter>
          {!created ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  !canGenerate || !vendorName || !amount || !description
                }
              >
                Create Record
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Save without signing
              </Button>
              <Button onClick={handleSign} disabled={!canSign}>
                Sign Now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
