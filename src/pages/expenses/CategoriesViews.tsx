// Connect Pro Fleet — Expenses V1 Categories + MonthEnd + Vendors + SpendAnalytics.
// Category management (grouped, delete-safe), Month-End Expense Check,
// Vendor Spend, and "Where the Money Went" spend-by-category analytics.
// Composes the existing ledger — no duplicate financial records.

import { useMemo, useState } from "react";
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
import { Plus, Pencil, Trash2, Archive } from "lucide-react";
import { fmtMoney, fmtMoneyExact, fmtDate } from "@/lib/format";
import { uid } from "@/lib/store";
import type {
  ExpenseCategory,
  ExpenseCategoryGroup,
  ExpenseCategoryType,
  ExpenseScope,
} from "@/lib/expenseTypes";
import {
  monthEndChecklist,
  vendorSpend,
  spendByCategory,
  evaluateSpendAlerts,
  budgetVsActual,
} from "@/lib/expenseRuleSelectors";
import { EXPENSE_CATEGORY_TYPE_LABELS } from "@/lib/expenseTypes";

// ---------------------------------------------------------------------------
// Categories (enhanced with management)
// ---------------------------------------------------------------------------

export function CategoriesView() {
  const store = useStore();
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const vehicle = store.expenseCategories.filter(
      (c) =>
        (c.group ??
          (c.type !== "company_overhead" ? "vehicle" : "overhead")) ===
        "vehicle",
    );
    const overhead = store.expenseCategories.filter(
      (c) =>
        (c.group ??
          (c.type !== "company_overhead" ? "vehicle" : "overhead")) ===
        "overhead",
    );
    return { vehicle, overhead };
  }, [store.expenseCategories]);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} className="mr-1" /> Add Category
        </Button>
      </div>
      <CategoryGroup
        title="Vehicle / Fleet Expenses"
        categories={grouped.vehicle}
        store={store}
        onEdit={setEditing}
      />
      <CategoryGroup
        title="Business / Overhead Expenses"
        categories={grouped.overhead}
        store={store}
        onEdit={setEditing}
      />
      {(creating || editing) && (
        <CategoryDialog
          category={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryGroup({
  title,
  categories,
  store,
  onEdit,
}: {
  title: string;
  categories: ExpenseCategory[];
  store: ReturnType<typeof useStore>;
  onEdit: (c: ExpenseCategory) => void;
}) {
  const byParent = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_category_id);
    const children = categories.filter((c) => c.parent_category_id);
    return parents.map((p) => ({
      parent: p,
      children: children.filter((c) => c.parent_category_id === p.id),
    }));
  }, [categories]);

  return (
    <div className="rounded-md border border-border bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {title}
        </h3>
      </header>
      <ul className="divide-y divide-border">
        {byParent.map(({ parent, children }) => (
          <li key={parent.id} className="px-4 py-3">
            <CategoryRow category={parent} store={store} onEdit={onEdit} />
            {children.length > 0 && (
              <ul className="mt-2 ml-4 divide-y divide-border/60 border-l border-border/60 pl-4">
                {children.map((c) => (
                  <li key={c.id} className="py-2">
                    <CategoryRow
                      category={c}
                      store={store}
                      onEdit={onEdit}
                      indent
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryRow({
  category,
  store,
  onEdit,
  indent,
}: {
  category: ExpenseCategory;
  store: ReturnType<typeof useStore>;
  onEdit: (c: ExpenseCategory) => void;
  indent?: boolean;
}) {
  const isUsed = store.expenses.some(
    (e) => e.expense_category_id === category.id && e.status === "posted",
  );
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium text-foreground ${indent ? "" : ""}`}
          >
            {category.name}
          </span>
          <StatusPill tone={category.active ? "available" : "neutral"}>
            {category.active ? "Active" : "Inactive"}
          </StatusPill>
          {isUsed && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              In use
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {EXPENSE_CATEGORY_TYPE_LABELS[category.type]}
          {category.default_scope && ` · ${category.default_scope}`}
          {category.receipt_required_default &&
            ` · receipt ${category.receipt_required_default}`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(category)}
        >
          <Pencil size={13} />
        </Button>
        {category.active ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Archive category"
            onClick={() => {
              store.deactivateExpenseCategory(category.id);
              toast.success("Category archived.");
            }}
          >
            <Archive size={13} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              store.reactivateExpenseCategory(category.id);
              toast.success("Category reactivated.");
            }}
          >
            Reactivate
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-status-out"
          aria-label="Delete category"
          onClick={() => {
            const ok = store.deleteExpenseCategoryIfUnused(category.id);
            if (ok) toast.success("Category deleted.");
            else
              toast.error(
                "Category is used by existing expenses — archive it instead.",
              );
          }}
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

function CategoryDialog({
  category,
  onClose,
}: {
  category: ExpenseCategory | null;
  onClose: () => void;
}) {
  const store = useStore();
  const [name, setName] = useState(category?.name ?? "");
  const [group, setGroup] = useState<ExpenseCategoryGroup>(
    category?.group ?? "vehicle",
  );
  const [type, setType] = useState<ExpenseCategoryType>(
    category?.type ?? "vehicle_direct",
  );
  const [parentId, setParentId] = useState<string>(
    category?.parent_category_id ?? "none",
  );
  const [defaultScope, setDefaultScope] = useState<string>(
    category?.default_scope ?? "vehicle",
  );
  const [receiptDefault, setReceiptDefault] = useState<string>(
    category?.receipt_required_default ?? "optional",
  );
  const [recurringAllowed, setRecurringAllowed] = useState(
    category?.recurring_allowed ?? true,
  );
  const [multiVehicle, setMultiVehicle] = useState(
    category?.multi_vehicle_allowed ?? false,
  );

  const possibleParents = store.expenseCategories.filter(
    (c) =>
      c.id !== category?.id &&
      (c.group ?? "vehicle") === group &&
      !c.parent_category_id,
  );

  function save() {
    if (!name.trim()) {
      toast.error("Enter a category name.");
      return;
    }
    if (category) {
      store.updateExpenseCategory(category.id, {
        name: name.trim(),
        group,
        type,
        parent_category_id: parentId === "none" ? null : parentId,
        default_scope: defaultScope as ExpenseScope | "any",
        receipt_required_default: receiptDefault as
          "required" | "optional" | "not_required",
        recurring_allowed: recurringAllowed,
        multi_vehicle_allowed: multiVehicle,
      });
      toast.success("Category updated.");
    } else {
      store.addExpenseCategory({
        id: uid("ec"),
        tenant_id: "tnt_connectpro",
        name: name.trim(),
        type,
        group,
        parent_category_id: parentId === "none" ? null : parentId,
        active: true,
        created_at: new Date().toISOString(),
        default_scope: defaultScope as ExpenseScope | "any",
        receipt_required_default: receiptDefault as
          "required" | "optional" | "not_required",
        recurring_allowed: recurringAllowed,
        multi_vehicle_allowed: multiVehicle,
      });
      toast.success("Category created.");
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit category" : "Add category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Group</Label>
              <Select
                value={group}
                onValueChange={(v) => setGroup(v as ExpenseCategoryGroup)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehicle">Vehicle / Fleet</SelectItem>
                  <SelectItem value="overhead">Business / Overhead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as ExpenseCategoryType)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORY_TYPE_LABELS).map(
                    ([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Parent category</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {possibleParents.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Default scope</Label>
              <Select value={defaultScope} onValueChange={setDefaultScope}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="company_overhead">Overhead</SelectItem>
                  <SelectItem value="any">Any</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Receipt default</Label>
              <Select value={receiptDefault} onValueChange={setReceiptDefault}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="not_required">Not Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={recurringAllowed}
                onChange={(e) => setRecurringAllowed(e.target.checked)}
                className="h-4 w-4"
              />
              Recurring allowed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={multiVehicle}
                onChange={(e) => setMultiVehicle(e.target.checked)}
                className="h-4 w-4"
              />
              Multi-vehicle allowed
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{category ? "Save" : "Add category"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Month-End Expense Check
// ---------------------------------------------------------------------------

export function MonthEndView() {
  const store = useStore();
  const [monthKey, setMonthKey] = useState(
    new Date().toISOString().slice(0, 7),
  );

  const checklist = useMemo(() => {
    const lineItemIds = new Set(
      store.expenseLineItems.map((l) => l.expense_id),
    );
    return monthEndChecklist(
      monthKey,
      store.expenses,
      store.expenseReceipts,
      store.expenseReimbursements,
      store.receiptInbox,
      store.importedTransactions.map((t) => ({
        matched_expense_id:
          (t as { matched_expense_id?: string | null }).matched_expense_id ??
          null,
        ignored: false,
      })),
      lineItemIds,
    );
  }, [monthKey, store]);

  const items = [
    {
      label: "Missing receipts",
      value: checklist.missing_receipts,
      tone: "maintenance" as const,
    },
    {
      label: "Unallocated expenses",
      value: checklist.unallocated_expenses,
      tone: "maintenance" as const,
    },
    {
      label: "Unmatched bank transactions",
      value: checklist.unmatched_bank_transactions,
      tone: "maintenance" as const,
    },
    {
      label: "Reimbursements owed",
      value: checklist.reimbursements_owed,
      tone: "maintenance" as const,
    },
    {
      label: "Expenses awaiting review",
      value: checklist.expenses_awaiting_review,
      tone: "maintenance" as const,
    },
    {
      label: "Unmatched receipts",
      value: checklist.unmatched_receipts,
      tone: "maintenance" as const,
    },
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">
            Month-End Expense Check
          </h3>
          <p className="text-xs text-muted-foreground">
            Operational cleanup — not a formal accounting close.
          </p>
        </div>
        <input
          type="month"
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        />
      </div>
      <div
        className={`rounded-md border p-4 ${
          checklist.status === "needs_attention"
            ? "border-l-2 border-l-status-maintenance bg-status-maintenance/5"
            : "border-border bg-status-available/5"
        }`}
      >
        <p className="font-display text-sm font-semibold text-foreground">
          {checklist.status === "needs_attention"
            ? "Needs attention"
            : "Ready for review"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {checklist.status === "needs_attention"
            ? "Resolve the items below before reviewing the month."
            : "No outstanding cleanup items for this month."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={`rounded-md border p-3 ${
              item.value > 0
                ? "border-status-maintenance/30 bg-status-maintenance/5"
                : "border-border bg-surface"
            }`}
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-mono text-xl tabular text-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendor Spend
// ---------------------------------------------------------------------------

export function VendorsView() {
  const store = useStore();
  const [selected, setSelected] = useState<string | null>(null);

  const spend = useMemo(
    () =>
      vendorSpend(
        store.expenses,
        store.expenseCategories,
        (id) =>
          store.maintenanceVendors.find((v) => v.id === id)?.name ??
          "No vendor",
      ),
    [store],
  );

  if (spend.length === 0) {
    return (
      <EmptyState
        title="No vendor spend"
        hint="Vendor spend appears here once expenses are recorded with a vendor."
        icon={<span className="text-lg">$</span>}
      />
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {spend.map((v) => (
          <li
            key={v.vendor_id ?? "__none__"}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{v.vendor}</p>
              <p className="font-mono text-xs tabular text-muted-foreground">
                {fmtMoneyExact(v.spend)} · {v.transaction_count} transactions
                {v.top_category_name && ` · ${v.top_category_name}`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm tabular text-foreground">
                {fmtMoney(v.spend)}
              </p>
              {v.last_expense_date && (
                <p className="text-xs text-muted-foreground">
                  Last {fmtDate(v.last_expense_date)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {selected ? `Vendor detail: ${selected}` : ""}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Where the Money Went (spend by category)
// ---------------------------------------------------------------------------

export function SpendAnalyticsView() {
  const store = useStore();
  const [range, setRange] = useState("this_month");

  const { start, end, label } = useMemo(() => {
    const now = new Date();
    switch (range) {
      case "last_month": {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { start: s, end: e, label: "Last Month" };
      }
      case "ytd": {
        const s = new Date(now.getFullYear(), 0, 1);
        return { start: s, end: now, label: "YTD" };
      }
      case "last_12": {
        const s = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        return { start: s, end: now, label: "Last 12 Months" };
      }
      default: {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        const e = new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59,
        );
        return { start: s, end: e, label: "This Month" };
      }
    }
  }, [range]);

  const byCat = useMemo(
    () => spendByCategory(store.expenses, store.expenseCategories, start, end),
    [store, start, end],
  );

  const triggered = useMemo(
    () => evaluateSpendAlerts(store.spendAlerts, store.expenses),
    [store.spendAlerts, store.expenses],
  );

  const budgetActual = useMemo(
    () =>
      budgetVsActual(
        store.categoryBudgets,
        store.expenseCategories,
        store.expenses,
        range === "this_month" ? new Date().toISOString().slice(0, 7) : range,
      ),
    [store, range],
  );

  const vehicleSpend = byCat
    .filter((c) => c.group === "vehicle")
    .reduce((s, c) => s + c.spend, 0);
  const overheadSpend = byCat
    .filter((c) => c.group === "overhead")
    .reduce((s, c) => s + c.spend, 0);
  const total = vehicleSpend + overheadSpend;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground">
          Where the Money Went
        </h3>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="ytd">YTD</option>
          <option value="last_12">Last 12 Months</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Vehicle</p>
          <p className="mt-1 font-mono text-lg tabular text-foreground">
            {fmtMoney(vehicleSpend)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Overhead</p>
          <p className="mt-1 font-mono text-lg tabular text-foreground">
            {fmtMoney(overheadSpend)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">Total ({label})</p>
          <p className="mt-1 font-mono text-lg tabular text-foreground">
            {fmtMoney(total)}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <header className="border-b border-border px-4 py-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Spend by category
          </h4>
        </header>
        <ul className="divide-y divide-border">
          {byCat
            .filter((c) => Math.abs(c.spend) > 0.005)
            .sort((a, b) => Math.abs(b.spend) - Math.abs(a.spend))
            .map((c) => {
              const pct = total > 0 ? (c.spend / total) * 100 : 0;
              return (
                <li key={c.category?.id ?? "__none__"} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {c.category?.name ?? "Uncategorized"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.group === "vehicle" ? "Vehicle" : "Overhead"} ·{" "}
                        {c.count} txn{c.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="font-mono text-sm tabular text-foreground">
                      {fmtMoneyExact(c.spend)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        c.group === "vehicle"
                          ? "h-full bg-status-available/60"
                          : "h-full bg-status-maintenance/60"
                      }
                      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      {triggered.length > 0 && (
        <div className="rounded-md border border-status-out/30 bg-status-out/5 p-4">
          <h4 className="font-display text-sm font-semibold text-foreground">
            Spend alerts
          </h4>
          <ul className="mt-2 space-y-1">
            {triggered.map((t) => (
              <li key={t.alert.id} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {t.alert.name}
                </span>{" "}
                — {t.expenses.length} expense
                {t.expenses.length !== 1 ? "s" : ""} over{" "}
                {fmtMoney(t.alert.threshold)} (total {fmtMoney(t.total)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {budgetActual.length > 0 && (
        <div className="rounded-md border border-border bg-surface">
          <header className="border-b border-border px-4 py-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Budget vs actual
            </h4>
          </header>
          <ul className="divide-y divide-border">
            {budgetActual.map((b) => (
              <li
                key={b.category.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-foreground">
                  {b.category.name}
                </span>
                <div className="flex items-center gap-4 font-mono text-xs tabular">
                  <span className="text-muted-foreground">
                    Budget {fmtMoney(b.budget)}
                  </span>
                  <span className="text-foreground">
                    Actual {fmtMoney(b.actual)}
                  </span>
                  <span
                    className={
                      b.difference >= 0
                        ? "text-status-available"
                        : "text-status-out"
                    }
                  >
                    {b.difference >= 0 ? "+" : ""}
                    {fmtMoney(b.difference)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
