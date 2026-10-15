// Connect Pro Fleet — Receipt capture dialog (Build #45).
// Upload a receipt photo/PDF and either save as document only, link to an
// existing expense, or create a new expense via the EXISTING Expense Ledger.

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Vehicle } from "@/lib/types";
import { fmtMoneyExact } from "@/lib/format";
import { findDuplicateUpload } from "@/lib/vaultSelectors";

export function ReceiptCaptureDialog({
  vehicle,
  open,
  onOpenChange,
}: {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const store = useStore();
  const vault = useVault();
  const [fileName, setFileName] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<"save_only" | "link_existing" | "create">(
    "save_only",
  );
  const [linkExpenseId, setLinkExpenseId] = useState("");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canUpload = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.upload",
  );

  const vehicleExpenses = store.expenses.filter(
    (e) => e.vehicle_id === vehicle.id && e.status === "posted",
  );
  const duplicate = fileName
    ? findDuplicateUpload(vault.vaultDocs, vehicle.id, fileName)
    : null;

  function handleSave() {
    if (!fileName) return;
    if (mode === "create") {
      // Create an authoritative Expense Ledger entry (no duplicate logic).
      const expenseId = store.createExpense({
        description: vendor || fileName,
        amount: Number(amount) || 0,
        transaction_date: date,
        payment_method: "cash",
        vehicle_id: vehicle.id,
        receipt_required: false,
        memo: `Receipt captured from vehicle vault: ${fileName}`,
      });
      store.addExpenseReceipt({
        expense_id: expenseId,
        file_name: fileName,
        file_url: fileName,
        note: vendor ? `Vendor: ${vendor}` : null,
      });
    } else if (mode === "link_existing" && linkExpenseId) {
      store.addExpenseReceipt({
        expense_id: linkExpenseId,
        file_name: fileName,
        file_url: fileName,
        note: vendor ? `Vendor: ${vendor}` : null,
      });
    } else {
      // save_only: store as a vault document with no expense link.
      vault.createUploadedDoc({
        vehicle_id: vehicle.id,
        category: "receipt",
        title: vendor || fileName,
        file_name: fileName,
        file_url: fileName,
        vendor_name: vendor || null,
        amount: amount ? Number(amount) : null,
        expense_date: date,
        source: "uploaded",
      });
    }
    onOpenChange(false);
    setFileName("");
    setVendor("");
    setAmount("");
    setMode("save_only");
    setLinkExpenseId("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Capture Receipt</DialogTitle>
          <DialogDescription>
            Upload a receipt photo or PDF. Save it as a document only, link it
            to an existing expense, or create a new expense.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>File name / reference</Label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="receipt_0912.pdf"
            />
          </div>
          {duplicate && (
            <p className="text-xs text-status-maintenance">
              A document with this file name already exists for this vehicle (
              {duplicate.document_number}). Saving will create an additional
              record — confirm this is not a duplicate.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vendor (optional)</Label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>
            <div>
              <Label>Amount (optional)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Receipt destination</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as typeof mode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="save_only">Save Document Only</SelectItem>
                <SelectItem value="link_existing">
                  Link Existing Expense
                </SelectItem>
                <SelectItem value="create">Create Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "link_existing" && (
            <div>
              <Label>Existing expense</Label>
              <Select value={linkExpenseId} onValueChange={setLinkExpenseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select expense" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleExpenses.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.description} · {fmtMoneyExact(e.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canUpload || !fileName}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
