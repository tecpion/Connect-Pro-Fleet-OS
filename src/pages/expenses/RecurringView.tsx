// Connect Pro Fleet — Expenses V1 Recurring tab.
// Recurring expense templates: vehicle notes, insurance, GPS, software, rent.
// Generate a one-off expense from a template (review-first by default).

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Repeat, Zap } from "lucide-react";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import { RECURRING_FREQUENCY_LABELS } from "@/lib/expenseTypes";
import type {
  RecurringExpense,
  RecurringFrequency,
  ExpenseScope,
} from "@/lib/expenseTypes";
import { uid } from "@/lib/store";

export function RecurringView() {
  const store = useStore();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={14} className="mr-1" /> Add Recurring
        </Button>
      </div>
      {store.recurringExpenses.length === 0 ? (
        <EmptyState
          title="No recurring expenses"
          hint="Create templates for vehicle notes, insurance, GPS, software subscriptions, rent, and other repeating costs."
          icon={<Repeat size={24} />}
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {store.recurringExpenses.map((r) => {
            const cat = r.category_id
              ? store.expenseCategories.find((c) => c.id === r.category_id)
              : null;
            const veh = r.vehicle_id
              ? store.vehicles.find((v) => v.id === r.vehicle_id)
              : null;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {r.name}
                    </span>
                    <StatusPill tone={r.active ? "available" : "neutral"}>
                      {r.active ? "Active" : "Inactive"}
                    </StatusPill>
                    {r.auto_create && (
                      <span className="rounded bg-status-available/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-status-available">
                        Auto
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                    {fmtMoneyExact(r.amount)} ·{" "}
                    {RECURRING_FREQUENCY_LABELS[r.frequency]} ·{" "}
                    {cat?.name ?? "Uncategorized"}
                    {veh && ` · ${veh.make} ${veh.model}`}
                    {r.vehicle_ids &&
                      r.vehicle_ids.length > 1 &&
                      ` · split ${r.vehicle_ids.length} vehicles`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Started {fmtDate(r.start_date)}
                    {r.end_date && ` · ends ${fmtDate(r.end_date)}`}
                    {r.last_generated_at &&
                      ` · last generated ${fmtDate(r.last_generated_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const id = store.generateRecurringExpense(r.id);
                      if (id) toast.success("Expense generated from template.");
                      else
                        toast.error("Could not generate (template inactive).");
                    }}
                  >
                    <Zap size={13} className="mr-1" /> Generate
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {addOpen && <AddRecurringDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function AddRecurringDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState<string>("none");
  const [scope, setScope] = useState<string>("vehicle");
  const [vehicleId, setVehicleId] = useState<string>("none");
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [receiptRequired, setReceiptRequired] = useState(false);
  const [autoCreate, setAutoCreate] = useState(false);

  const activeCats = store.expenseCategories.filter(
    (c) => c.active && c.recurring_allowed !== false,
  );

  function submit() {
    if (!name.trim() || amount <= 0) {
      toast.error("Enter a name and amount.");
      return;
    }
    store.addRecurringExpense({
      id: uid("rec"),
      tenant_id: "tnt_connectpro",
      name: name.trim(),
      amount,
      vendor_id: null,
      category_id: categoryId === "none" ? null : categoryId,
      scope: scope as ExpenseScope,
      vehicle_id: vehicleId === "none" ? null : vehicleId,
      vehicle_ids: null,
      allocation_method: null,
      frequency,
      start_date: startDate,
      end_date: null,
      receipt_required: receiptRequired,
      auto_create: autoCreate,
      active: true,
      last_generated_at: null,
      created_at: new Date().toISOString(),
    });
    toast.success("Recurring template created.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add recurring expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="Jeep Wrangler — Chase Auto car note"
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
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as RecurringFrequency)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRING_FREQUENCY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {activeCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="company_overhead">Overhead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {store.vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.make} {v.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Start date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={receiptRequired}
                onChange={(e) => setReceiptRequired(e.target.checked)}
                className="h-4 w-4"
              />
              Receipt required
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoCreate}
                onChange={(e) => setAutoCreate(e.target.checked)}
                className="h-4 w-4"
              />
              Auto-create
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add recurring</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
