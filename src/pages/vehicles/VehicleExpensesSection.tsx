// Connect Pro Fleet — Vehicle expenses section (Build #14).
// Shows direct vehicle expenses + maintenance-sourced expenses (counted once,
// not double-counted) + recent expense list. Extracted from VehicleDetail to
// keep it under the line limit.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { fmtMoney, fmtMoneyExact, fmtDate } from "@/lib/format";
import {
  getVehicleExpenses,
  getVehicleDirectExpenseTotal,
  getVehicleMaintenanceExpenseTotal,
  netExpenseTotal,
  isReversal,
} from "@/lib/expenseSelectors";
import { TENDER_METHOD_LABELS } from "@/lib/paymentMethodTypes";
import { RecordExpenseDialog } from "@/pages/expenses/RecordExpenseDialog";
import { Plus, Receipt as ReceiptIcon } from "lucide-react";

export function VehicleExpensesSection({ vehicleId }: { vehicleId: string }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewCosts = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.view_costs",
  );
  const canViewVehicleExpenses = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.view_vehicle_expenses",
  );
  const canCreate = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.create",
  );

  if (!canViewVehicleExpenses) return null;

  const vehicleExpenses = getVehicleExpenses(
    store.expenses,
    store.expenseLineItems,
    vehicleId,
  );
  const directTotal = getVehicleDirectExpenseTotal(
    store.expenses,
    store.expenseLineItems,
    vehicleId,
  );
  const maintTotal = getVehicleMaintenanceExpenseTotal(
    store.expenses,
    (woId) => store.workOrders.find((w) => w.id === woId)?.vehicle_id ?? null,
    vehicleId,
  );
  const recent = vehicleExpenses
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
    .slice(0, 6);

  return (
    <SectionCard
      title="Expenses"
      right={
        canCreate ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1" /> Record
          </Button>
        ) : undefined
      }
    >
      {canViewCosts && (
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Direct expenses" value={fmtMoney(directTotal)} />
          <Stat label="Maintenance (via WO)" value={fmtMoney(maintTotal)} />
          <Stat
            label="Total"
            value={fmtMoney(directTotal + maintTotal)}
            highlight
          />
        </div>
      )}
      {recent.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          hint="Record a fuel purchase, repair, or other vehicle cost to track spending on this vehicle."
          icon={<ReceiptIcon size={22} />}
        />
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((e) => {
            const cat = e.expense_category_id
              ? store.expenseCategories.find(
                  (c) => c.id === e.expense_category_id,
                )
              : null;
            const isRev = isReversal(e);
            return (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {e.expense_number}
                    </span>
                    {e.source === "maintenance_work_order" && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        WO
                      </span>
                    )}
                    {isRev && (
                      <span className="rounded bg-status-out/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-status-out">
                        Reversal
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-foreground">
                    {e.description}
                  </p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {fmtDate(e.transaction_date)} ·{" "}
                    {cat?.name ?? "Uncategorized"} ·{" "}
                    {TENDER_METHOD_LABELS[e.payment_method]}
                  </p>
                </div>
                {canViewCosts && (
                  <span
                    className={`font-mono text-sm tabular ${isRev ? "text-status-out" : "text-foreground"}`}
                  >
                    {isRev ? "-" : ""}
                    {fmtMoneyExact(e.amount)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <RecordExpenseDialog
        open={open}
        onOpenChange={setOpen}
        prefillVehicleId={vehicleId}
      />
    </SectionCard>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-mono text-lg tabular ${highlight ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}
