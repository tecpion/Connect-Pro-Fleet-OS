// Connect Pro Fleet — Expenses V1 Receipts tab.
// Receipt Inbox: capture receipts before knowing the owning transaction, group
// by month, match to existing expenses/transactions, or create a new expense.
// Reuses the existing ExpenseReceipt as the single source of truth — no
// duplicate file copies.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/Status";
import { EmptyState } from "@/components/ui-bits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Upload, FileText, Link2, Plus } from "lucide-react";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import { RECEIPT_INBOX_STATE_LABELS } from "@/lib/expenseTypes";
import type { ReceiptInboxItem, ReceiptInboxState } from "@/lib/expenseTypes";
import type { TenderMethod } from "@/lib/paymentMethodTypes";
import { TENDER_METHODS, TENDER_METHOD_LABELS } from "@/lib/paymentMethodTypes";

function stateTone(s: ReceiptInboxState) {
  return s === "matched" || s === "attached"
    ? "available"
    : s === "unmatched"
      ? "maintenance"
      : s === "missing_info"
        ? "out"
        : "neutral";
}

export function ReceiptsView() {
  const store = useStore();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [matchItem, setMatchItem] = useState<ReceiptInboxItem | null>(null);
  const [createItem, setCreateItem] = useState<ReceiptInboxItem | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const months = useMemo(() => {
    const set = new Set(store.receiptInbox.map((i) => i.month_key));
    return Array.from(set).sort().reverse();
  }, [store.receiptInbox]);

  const filtered = store.receiptInbox.filter((i) =>
    monthFilter === "all" ? true : i.month_key === monthFilter,
  );

  const grouped = useMemo(() => {
    const map = new Map<string, ReceiptInboxItem[]>();
    for (const i of filtered) {
      const arr = map.get(i.month_key) ?? [];
      arr.push(i);
      map.set(i.month_key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCaptureOpen(true)}
          >
            <Upload size={14} className="mr-1" /> Upload Receipt
          </Button>
          <Button size="sm" onClick={() => setCaptureOpen(true)}>
            <Camera size={14} className="mr-1" /> Take Photo
          </Button>
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title="No receipts in the inbox"
          hint="Capture or upload receipts here before you know which transaction they belong to. Office staff will match them later."
          icon={<FileText size={24} />}
        />
      ) : (
        grouped.map(([month, items]) => {
          const matched = items.filter(
            (i) => i.state === "matched" || i.state === "attached",
          ).length;
          const unmatched = items.filter((i) => i.state === "unmatched").length;
          const needsReview = items.filter(
            (i) => i.state === "missing_info" || i.state === "needs_review",
          ).length;
          return (
            <div
              key={month}
              className="rounded-md border border-border bg-surface"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  {new Date(month + "-01T00:00:00").toLocaleDateString(
                    "en-US",
                    {
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{items.length} total</span>
                  <span className="text-status-available">
                    {matched} matched
                  </span>
                  <span className="text-status-maintenance">
                    {unmatched} unmatched
                  </span>
                  {needsReview > 0 && (
                    <span className="text-status-out">
                      {needsReview} need review
                    </span>
                  )}
                </div>
              </header>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {item.file_name}
                        </span>
                        <StatusPill tone={stateTone(item.state)}>
                          {RECEIPT_INBOX_STATE_LABELS[item.state]}
                        </StatusPill>
                      </div>
                      <p className="font-mono text-xs tabular text-muted-foreground">
                        {fmtDate(item.captured_at)} ·{" "}
                        {item.merchant ?? "No merchant"}
                        {item.amount != null &&
                          ` · ${fmtMoneyExact(item.amount)}`}
                      </p>
                      {item.note && (
                        <p className="mt-0.5 text-xs italic text-muted-foreground">
                          “{item.note}”
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {item.state !== "matched" &&
                        item.state !== "attached" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMatchItem(item)}
                            >
                              <Link2 size={13} className="mr-1" /> Match
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setCreateItem(item)}
                            >
                              <Plus size={13} className="mr-1" /> New Expense
                            </Button>
                          </>
                        )}
                      {item.state === "matched" && item.matched_expense_id && (
                        <span className="font-mono text-xs tabular text-status-available">
                          →{" "}
                          {store.expenses.find(
                            (e) => e.id === item.matched_expense_id,
                          )?.expense_number ?? "linked"}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}

      {captureOpen && <CaptureDialog onClose={() => setCaptureOpen(false)} />}
      {matchItem && (
        <MatchDialog item={matchItem} onClose={() => setMatchItem(null)} />
      )}
      {createItem && (
        <CreateFromReceiptDialog
          item={createItem}
          onClose={() => setCreateItem(null)}
        />
      )}
    </div>
  );
}

function CaptureDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [fileName, setFileName] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [amount, setAmount] = useState<string>("");
  const [merchant, setMerchant] = useState("");
  const [vehicleId, setVehicleId] = useState<string>("none");
  const [note, setNote] = useState("");
  const [unsure, setUnsure] = useState(true);

  function submit() {
    if (!fileName.trim()) {
      toast.error("Enter a file name or take a photo.");
      return;
    }
    store.addReceiptInboxItem({
      file_name: fileName.trim(),
      file_url: fileUrl.trim() || `/receipts/${fileName.trim()}`,
      mime_type: mimeType,
      amount: amount ? Number(amount) : null,
      merchant: merchant.trim() || null,
      vehicle_id: vehicleId === "none" ? null : vehicleId,
      note: unsure
        ? "I'm not sure which transaction this belongs to."
        : note.trim() || null,
    });
    toast.success("Receipt added to inbox.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Capture receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>File name</Label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="autozone-receipt.jpg"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <select
                value={mimeType}
                onChange={(e) => setMimeType(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="image/jpeg">Image (JPEG)</option>
                <option value="image/png">Image (PNG)</option>
                <option value="application/pdf">PDF</option>
              </select>
            </div>
            <div>
              <Label>Amount (if known)</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Merchant (if known)</Label>
            <Input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Vehicle (if known)</Label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="none">— Unknown —</option>
              {store.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unsure}
              onChange={(e) => setUnsure(e.target.checked)}
              className="h-4 w-4"
            />
            I'm not sure which transaction this belongs to
          </label>
          {!unsure && (
            <div>
              <Label>Note</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add to inbox</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchDialog({
  item,
  onClose,
}: {
  item: ReceiptInboxItem;
  onClose: () => void;
}) {
  const store = useStore();
  const [expenseId, setExpenseId] = useState<string>("none");

  function submit() {
    if (expenseId === "none") {
      toast.error("Select an expense to match.");
      return;
    }
    store.matchReceiptToExpense(item.id, expenseId);
    toast.success("Receipt matched to expense.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Match receipt</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Link “{item.file_name}” to an existing expense. The receipt file is
          attached once — no duplicate copy.
        </p>
        <div>
          <Label>Match to expense</Label>
          <select
            value={expenseId}
            onChange={(e) => setExpenseId(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="none">— Select —</option>
            {store.expenses
              .filter((e) => e.status === "posted")
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.expense_number} — {e.description} (
                  {fmtMoneyExact(e.amount)})
                </option>
              ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Match</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateFromReceiptDialog({
  item,
  onClose,
}: {
  item: ReceiptInboxItem;
  onClose: () => void;
}) {
  const store = useStore();
  const [description, setDescription] = useState(
    item.merchant ?? item.file_name,
  );
  const [amount, setAmount] = useState(item.amount ?? 0);
  const [date, setDate] = useState(item.captured_at.slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>("none");
  const [vehicleId, setVehicleId] = useState<string>(item.vehicle_id ?? "none");
  const [method, setMethod] = useState<TenderMethod>("credit_card");

  function submit() {
    if (!description.trim() || amount <= 0) {
      toast.error("Enter a description and amount.");
      return;
    }
    store.createExpenseFromReceipt(item.id, {
      description: description.trim(),
      amount,
      transaction_date: date,
      expense_category_id: categoryId === "none" ? null : categoryId,
      vehicle_id: vehicleId === "none" ? null : vehicleId,
      payment_method: method,
    });
    toast.success("Expense created from receipt.");
    onClose();
  }

  const activeCats = store.expenseCategories.filter((c) => c.active);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create expense from receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
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
              <option value="none">— None —</option>
              {activeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Vehicle</Label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
            >
              <option value="none">Overhead (no vehicle)</option>
              {store.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Create expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
