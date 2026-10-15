// Connect Pro Fleet — Record Expense dialog (Build #14).
// Fast expense entry: amount, date, category, vehicle/overhead/work order,
// vendor, payment method, paid by, receipt, notes. Supports split line items
// and petty-cash-linked cash expenses. Reimbursement auto-created when an
// individual (employee/owner) pays.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { TenderMethod } from "@/lib/paymentMethodTypes";
import { TENDER_METHODS, TENDER_METHOD_LABELS } from "@/lib/paymentMethodTypes";
import type { PaidByType } from "@/lib/expenseTypes";
import { PAID_BY_LABELS } from "@/lib/expenseTypes";
import { fmtMoneyExact } from "@/lib/format";

export function RecordExpenseDialog({
  open,
  onOpenChange,
  prefillVehicleId,
  prefillWorkOrderId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillVehicleId?: string | null;
  prefillWorkOrderId?: string | null;
}) {
  const {
    expenseCategories,
    vehicles,
    maintenanceVendors,
    cashAccounts,
    createExpense,
  } = useStore();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>(prefillVehicleId ?? "");
  const [vendorId, setVendorId] = useState<string>("");
  const [method, setMethod] = useState<TenderMethod>("credit_card");
  const [paidBy, setPaidBy] = useState<PaidByType>("company");
  const [memo, setMemo] = useState("");
  const [receiptRequired, setReceiptRequired] = useState(true);
  const [cashAccountId, setCashAccountId] = useState<string>("");
  const [useSplit, setUseSplit] = useState(false);
  const [splits, setSplits] = useState<
    { vehicleId: string; amount: number; description: string }[]
  >([{ vehicleId: "", amount: 0, description: "" }]);

  const activeCats = expenseCategories.filter((c) => c.active);
  const splitTotal = splits.reduce((s, x) => s + (x.amount || 0), 0);
  const splitValid = Math.abs(splitTotal - amount) < 0.005;

  function reset() {
    setDescription("");
    setAmount(0);
    setDate(new Date().toISOString().slice(0, 10));
    setCategoryId("");
    setVehicleId(prefillVehicleId ?? "");
    setVendorId("");
    setMethod("credit_card");
    setPaidBy("company");
    setMemo("");
    setReceiptRequired(true);
    setCashAccountId("");
    setUseSplit(false);
    setSplits([{ vehicleId: "", amount: 0, description: "" }]);
  }

  function submit() {
    if (!description.trim() || amount <= 0) {
      toast.error("Enter a description and amount.");
      return;
    }
    if (useSplit && !splitValid) {
      toast.error("Split line items must sum to the expense amount.");
      return;
    }
    const cat = categoryId || null;
    const lineItems = useSplit
      ? splits
          .filter((s) => s.amount > 0)
          .map((s) => ({
            description: s.description || description,
            category_id: cat,
            amount: s.amount,
            vehicle_id: s.vehicleId || null,
            work_order_id: null,
            notes: null,
          }))
      : undefined;
    createExpense({
      description: description.trim(),
      amount,
      transaction_date: date,
      expense_category_id: cat,
      vendor_id: vendorId || null,
      payment_method: method,
      paid_by_type: paidBy,
      paid_by_user_id: paidBy === "company" ? null : null,
      vehicle_id: useSplit ? null : vehicleId || null,
      maintenance_work_order_id: prefillWorkOrderId ?? null,
      receipt_required: receiptRequired,
      memo: memo.trim() || null,
      line_items: lineItems,
      cash_account_id: method === "cash" ? cashAccountId || null : null,
      create_reimbursement: paidBy !== "company",
    });
    toast.success("Expense recorded.");
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this for?"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount ($)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount || ""}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="">— None —</option>
              {activeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {!useSplit && (
            <div>
              <Label>Vehicle / scope</Label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">Company overhead (no vehicle)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} · {v.license_plate}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label>Vendor</Label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="">— None —</option>
              {maintenanceVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment method</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as TenderMethod)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                {TENDER_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {TENDER_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Paid by</Label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value as PaidByType)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                {Object.entries(PAID_BY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {method === "cash" && cashAccounts.length > 0 && (
            <div>
              <Label>Petty cash account</Label>
              <select
                value={cashAccountId}
                onChange={(e) => setCashAccountId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">— None —</option>
                {cashAccounts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {paidBy !== "company" && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              A reimbursement will be recorded (owed) — paying it later does not
              create a second expense.
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              id="split"
              type="checkbox"
              checked={useSplit}
              onChange={(e) => setUseSplit(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="split" className="cursor-pointer text-sm">
              Split across vehicles / overhead
            </Label>
          </div>
          {useSplit && (
            <div className="space-y-3 rounded-md border border-border p-3">
              {splits.map((s, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-md border border-border bg-surface-2 p-2"
                >
                  <div>
                    <Label className="text-xs">Vehicle</Label>
                    <select
                      value={s.vehicleId}
                      onChange={(e) => {
                        const next = [...splits];
                        next[i] = { ...s, vehicleId: e.target.value };
                        setSplits(next);
                      }}
                      className="mt-0.5 h-9 w-full rounded-md border border-border bg-surface px-2 text-xs"
                    >
                      <option value="">Overhead</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.make} {v.model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-28">
                      <Label className="text-xs">Amount</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={s.amount || ""}
                        onChange={(e) => {
                          const next = [...splits];
                          next[i] = { ...s, amount: Number(e.target.value) };
                          setSplits(next);
                        }}
                        className="mt-0.5 h-9 font-mono tabular text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Note</Label>
                      <Input
                        value={s.description}
                        onChange={(e) => {
                          const next = [...splits];
                          next[i] = { ...s, description: e.target.value };
                          setSplits(next);
                        }}
                        className="mt-0.5 h-9 text-xs"
                      />
                    </div>
                    {splits.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Remove split line"
                        onClick={() =>
                          setSplits(splits.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSplits([
                      ...splits,
                      { vehicleId: "", amount: 0, description: "" },
                    ])
                  }
                >
                  <Plus size={14} className="mr-1" /> Add line
                </Button>
                <span
                  className={
                    splitValid
                      ? "font-mono text-xs text-status-available"
                      : "font-mono text-xs text-status-out"
                  }
                >
                  {fmtMoneyExact(splitTotal)} / {fmtMoneyExact(amount)}
                </span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              id="rr"
              type="checkbox"
              checked={receiptRequired}
              onChange={(e) => setReceiptRequired(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="rr" className="cursor-pointer text-sm">
              Receipt required
            </Label>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Record expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
