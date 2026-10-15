// Connect Pro Fleet — accounts view (Build #15).
// List financial accounts with last imported balance, unreviewed count, and
// account management (add/deactivate). Balances are permission-gated.

import { useState } from "react";
import type { FleetStore } from "@/lib/store/storeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui-bits";
import { fmtMoney, fmtDate, statusToneClasses } from "@/lib/format";
import {
  getAccountUnreviewedCount,
  getAccountLastImportedBalance,
  getAccountTransactions,
} from "@/lib/reconciliationSelectors";
import {
  FINANCIAL_ACCOUNT_TYPE_LABELS,
  type FinancialAccountType,
} from "@/lib/bankingTypes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function AccountsView({
  store,
  canViewBalances,
}: {
  store: FleetStore;
  canViewBalances: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const accounts = store.financialAccounts;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} className="mr-1" /> Add account
        </Button>
      </div>
      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts"
          hint="Add a bank or card account to start importing statements."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              store={store}
              canViewBalances={canViewBalances}
            />
          ))}
        </div>
      )}
      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        store={store}
      />
    </div>
  );
}

function AccountCard({
  account,
  store,
  canViewBalances,
}: {
  account: import("@/lib/bankingTypes").FinancialAccount;
  store: FleetStore;
  canViewBalances: boolean;
}) {
  const unreviewed = getAccountUnreviewedCount(
    account.id,
    store.importedTransactions,
  );
  const lastBal = getAccountLastImportedBalance(account, store.statements);
  const recent = getAccountTransactions(
    account.id,
    store.importedTransactions,
  ).slice(0, 3);

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {account.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {FINANCIAL_ACCOUNT_TYPE_LABELS[account.account_type]}
            {account.last_four ? ` · ••••${account.last_four}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${account.active ? "bg-available/10 text-available" : "bg-muted text-muted-foreground"}`}
        >
          {account.active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Last imported balance</p>
          <p className="font-mono tabular text-foreground">
            {canViewBalances
              ? lastBal.balance != null
                ? `${fmtMoney(lastBal.balance)}`
                : "—"
              : "Restricted"}
          </p>
          {lastBal.date && (
            <p className="text-muted-foreground">{fmtDate(lastBal.date)}</p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">Unreviewed</p>
          <p
            className={`font-mono tabular ${unreviewed > 0 ? "text-maintenance" : "text-foreground"}`}
          >
            {unreviewed}
          </p>
        </div>
      </div>
      {recent.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-2">
          {recent.map((t) => (
            <div key={t.id} className="flex justify-between text-xs">
              <span className="truncate text-muted-foreground">
                {t.description}
              </span>
              <span className="font-mono tabular text-foreground">
                {canViewBalances ? fmtMoney(t.amount) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddAccountDialog({
  open,
  onOpenChange,
  store,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  store: FleetStore;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FinancialAccountType>("bank_checking");
  const [institution, setInstitution] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [opening, setOpening] = useState("");

  function submit() {
    if (!name.trim()) {
      toast.error("Account name is required.");
      return;
    }
    store.createFinancialAccount({
      name: name.trim(),
      account_type: type,
      institution_name: institution.trim() || null,
      last_four: lastFour.trim() || null,
      opening_balance: opening ? Number(opening) : null,
    });
    toast.success("Account added.");
    setName("");
    setInstitution("");
    setLastFour("");
    setOpening("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add financial account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Account name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chase Business Checking"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Account type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FinancialAccountType)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {(
                Object.keys(
                  FINANCIAL_ACCOUNT_TYPE_LABELS,
                ) as FinancialAccountType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {FINANCIAL_ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Institution (optional)</Label>
            <Input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Chase"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Last four (optional)</Label>
              <Input
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value)}
                maxLength={4}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label>Opening balance</Label>
              <Input
                type="number"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
