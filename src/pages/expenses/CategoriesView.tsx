// Connect Pro Fleet — Expenses V1 Categories tab.
// Tenant-customizable category library organized under Vehicle / Overhead
// groups with parent-child hierarchy. Delete-safe (unused only), archive for
// used categories. No chart of accounts.

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
import { Plus, Pencil, Archive, Trash2, RotateCcw } from "lucide-react";
import { uid } from "@/lib/store";
import type {
  ExpenseCategory,
  ExpenseCategoryGroup,
  ExpenseCategoryType,
  ExpenseScope,
} from "@/lib/expenseTypes";

const TYPES: ExpenseCategoryType[] = [
  "vehicle_direct",
  "company_overhead",
  "maintenance",
  "other",
];

export function CategoriesView() {
  const store = useStore();
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const vehicleCats = store.expenseCategories.filter(
    (c) =>
      (c.group ?? (c.type === "company_overhead" ? "overhead" : "vehicle")) ===
      "vehicle",
  );
  const overheadCats = store.expenseCategories.filter(
    (c) =>
      (c.group ?? (c.type === "company_overhead" ? "overhead" : "vehicle")) ===
      "overhead",
  );

  return (
    <div className="mt-4 space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={14} className="mr-1" /> Add Category
        </Button>
      </div>

      <CategoryGroup
        title="Vehicle / Fleet Expenses"
        categories={vehicleCats}
        all={store.expenseCategories}
        onEdit={setEditing}
      />
      <CategoryGroup
        title="Business / Overhead Expenses"
        categories={overheadCats}
        all={store.expenseCategories}
        onEdit={setEditing}
      />

      {(creating || editing) && (
        <CategoryDialog
          category={editing}
          all={store.expenseCategories}
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
  all,
  onEdit,
}: {
  title: string;
  categories: ExpenseCategory[];
  all: ExpenseCategory[];
  onEdit: (c: ExpenseCategory) => void;
}) {
  const roots = categories.filter((c) => !c.parent_category_id);
  if (roots.length === 0)
    return (
      <EmptyState
        title={`No ${title.toLowerCase()}`}
        hint="Add a category to start organizing spending."
      />
    );
  return (
    <div className="rounded-md border border-border bg-surface">
      <header className="border-b border-border px-4 py-2.5">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {title}
        </h3>
      </header>
      <ul className="divide-y divide-border">
        {roots.map((c) => {
          const children = all.filter((x) => x.parent_category_id === c.id);
          return (
            <li key={c.id} className="px-4 py-2.5">
              <CategoryRow c={c} onEdit={onEdit} />
              {children.length > 0 && (
                <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
                  {children.map((ch) => (
                    <li key={ch.id}>
                      <CategoryRow c={ch} onEdit={onEdit} nested />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CategoryRow({
  c,
  onEdit,
  nested,
}: {
  c: ExpenseCategory;
  onEdit: (c: ExpenseCategory) => void;
  nested?: boolean;
}) {
  const store = useStore();
  const used = store.expenses.some(
    (e) => e.expense_category_id === c.id && e.status === "posted",
  );
  return (
    <div
      className={`flex items-center justify-between gap-2 ${nested ? "py-1" : "py-0.5"}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground">{c.name}</span>
        {used && (
          <span className="text-[10px] uppercase text-muted-foreground">
            in use
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <StatusPill tone={c.active ? "available" : "neutral"}>
          {c.active ? "Active" : "Archived"}
        </StatusPill>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(c)}
        >
          <Pencil size={13} />
        </Button>
        {c.active ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Archive category"
            onClick={() => {
              store.archiveExpenseCategory(c.id);
              toast.success("Category archived.");
            }}
          >
            <Archive size={13} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Reactivate category"
            onClick={() => {
              store.reactivateExpenseCategory(c.id);
              toast.success("Category reactivated.");
            }}
          >
            <RotateCcw size={13} />
          </Button>
        )}
        {!used && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-status-out"
            aria-label="Delete unused category"
            onClick={() => {
              const ok = store.deleteExpenseCategoryIfUnused(c.id);
              if (ok) toast.success("Category deleted.");
              else toast.error("Category is in use — archive instead.");
            }}
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

function CategoryDialog({
  category,
  all,
  onClose,
}: {
  category: ExpenseCategory | null;
  all: ExpenseCategory[];
  onClose: () => void;
}) {
  const store = useStore();
  const [name, setName] = useState(category?.name ?? "");
  const [group, setGroup] = useState<ExpenseCategoryGroup>(
    category?.group ??
      (category?.type === "company_overhead" ? "overhead" : "vehicle"),
  );
  const [type, setType] = useState<ExpenseCategoryType>(
    category?.type ?? "vehicle_direct",
  );
  const [parentId, setParentId] = useState<string>(
    category?.parent_category_id ?? "none",
  );
  const [scope, setScope] = useState<string>(category?.default_scope ?? "any");
  const [receipt, setReceipt] = useState<string>(
    category?.receipt_required_default ?? "optional",
  );
  const [recurring, setRecurring] = useState<boolean>(
    category?.recurring_allowed ?? true,
  );
  const [multiVehicle, setMultiVehicle] = useState<boolean>(
    category?.multi_vehicle_allowed ?? false,
  );

  const possibleParents = all.filter(
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
    const patch: Partial<ExpenseCategory> = {
      name: name.trim(),
      group,
      type,
      parent_category_id: parentId === "none" ? null : parentId,
      default_scope: scope as ExpenseScope | "any",
      receipt_required_default: receipt as
        "required" | "optional" | "not_required",
      recurring_allowed: recurring,
      multi_vehicle_allowed: multiVehicle,
    };
    if (category) {
      store.updateExpenseCategory(category.id, patch);
      toast.success("Category updated.");
    } else {
      store.addExpenseCategory({
        id: uid("ec"),
        tenant_id: "tnt_connectpro",
        name: name.trim(),
        type,
        parent_category_id: parentId === "none" ? null : parentId,
        active: true,
        created_at: new Date().toISOString(),
        group,
        default_scope: scope as ExpenseScope | "any",
        receipt_required_default: receipt as
          "required" | "optional" | "not_required",
        recurring_allowed: recurring,
        multi_vehicle_allowed: multiVehicle,
      });
      toast.success("Category added.");
    }
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit category" : "Add category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category name</Label>
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
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="overhead">Overhead</SelectItem>
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
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace("_", " ")}
                    </SelectItem>
                  ))}
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
                {possibleParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Default scope</Label>
              <Select value={scope} onValueChange={setScope}>
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
              <Label>Receipt requirement</Label>
              <Select value={receipt} onValueChange={setReceipt}>
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
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
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
              Multi-vehicle
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
