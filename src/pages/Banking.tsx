// Connect Pro Fleet — Banking & Reconciliation page (Build #15).
// Import bank/card statements, review imported transactions, match them to
// existing Fleet payments/expenses, mark transfers, create missing expenses,
// and reconcile statements. Imported activity has ZERO financial effect until
// matched or used to create a transaction. Cost/balance data is permission-
// gated (banking.view_balances). Mobile uses stacked cards.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui-bits";
import {
  fmtMoney,
  fmtMoneyExact,
  fmtDate,
  statusToneClasses,
} from "@/lib/format";
import {
  getUnreviewedTransactions,
  getMatchedTransactions,
  getSuggestedTransactions,
  getUnmatchedMoneyIn,
  getUnmatchedMoneyOut,
  getAccountUnreviewedCount,
  getAccountLastImportedBalance,
  calculateStatementClosing,
  getStatementDifference,
  deriveStatementStatus,
  getStatementTransactions,
} from "@/lib/reconciliationSelectors";
import {
  REVIEW_STATUS_LABELS,
  MATCH_STATUS_LABELS,
  FINANCIAL_ACCOUNT_TYPE_LABELS,
  STATEMENT_RECON_STATUS_LABELS,
  type FinancialAccount,
} from "@/lib/bankingTypes";
import {
  Plus,
  Upload,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ImportCsvDialog } from "./banking/ImportCsvDialog";
import { TransactionInbox } from "./banking/TransactionInbox";
import { AccountsView } from "./banking/AccountsView";
import { StatementsView } from "./banking/StatementsView";

export interface BankingProps {
  /** Controlled sub-tab value (inbox/matched/statements/accounts). When
   *  provided the workspace is embedded inside Finance: header hidden and the
   *  active sub-tab is parent-driven (URL-addressable). */
  subtab?: string;
  onSubtabChange?: (subtab: string) => void;
  embedded?: boolean;
}

export default function Banking({
  subtab,
  onSubtabChange,
  embedded = false,
}: BankingProps = {}) {
  const store = useStore();
  const [internalTab, setInternalTab] = useState("inbox");
  const tab = subtab ?? internalTab;
  const setTab = (next: string) => {
    if (onSubtabChange) onSubtabChange(next);
    else setInternalTab(next);
  };
  const [importOpen, setImportOpen] = useState(false);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canView = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.view",
  );
  const canViewBalances = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.view_balances",
  );
  const canImport = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.import",
  );
  const canMatch = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.match",
  );
  const canCreateExpense = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.create_expense",
  );
  const canMarkTransfer = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.mark_transfer",
  );
  const canReconcile = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "banking.reconcile_statement",
  );

  const txns = store.importedTransactions;
  const unreviewed = useMemo(() => getUnreviewedTransactions(txns), [txns]);
  const matched = useMemo(() => getMatchedTransactions(txns), [txns]);
  const suggested = useMemo(() => getSuggestedTransactions(txns), [txns]);
  const unmatchedIn = useMemo(() => getUnmatchedMoneyIn(txns), [txns]);
  const unmatchedOut = useMemo(() => getUnmatchedMoneyOut(txns), [txns]);
  const needsAttention = store.statements.filter(
    (s) => deriveStatementStatus(s, txns) === "needs_attention",
  );

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <EmptyState
          title="Banking restricted"
          hint="You don't have permission to view banking & reconciliation data."
        />
      </div>
    );
  }

  return (
    <div
      className={
        embedded ? "space-y-5" : "mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8"
      }
    >
      {!embedded && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">
              Banking & Reconciliation
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Import statements, match transactions to Fleet records, and
              reconcile accounts. Imported activity isn't revenue or expense
              until matched.
            </p>
          </div>
          {canImport && (
            <Button onClick={() => setImportOpen(true)}>
              <Upload size={16} className="mr-1" /> Import statement
            </Button>
          )}
        </header>
      )}
      {embedded && canImport && (
        <div className="flex justify-end">
          <Button onClick={() => setImportOpen(true)}>
            <Upload size={16} className="mr-1" /> Import statement
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Needs Review"
          value={String(unreviewed.length)}
          tone={unreviewed.length > 0 ? "maintenance" : "neutral"}
        />
        <Kpi
          label="Suggested Matches"
          value={String(suggested.length)}
          tone={suggested.length > 0 ? "neutral" : "neutral"}
        />
        <Kpi
          label="Unmatched In"
          value={
            canViewBalances
              ? fmtMoney(unmatchedIn.reduce((s, t) => s + t.amount, 0))
              : "—"
          }
        />
        <Kpi
          label="Unmatched Out"
          value={
            canViewBalances
              ? fmtMoney(unmatchedOut.reduce((s, t) => s + t.amount, 0))
              : "—"
          }
        />
        <Kpi
          label="Statements Need Attention"
          value={String(needsAttention.length)}
          tone={needsAttention.length > 0 ? "out" : "neutral"}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="matched">Matched</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        {tab === "inbox" && (
          <TransactionInbox
            txns={txns}
            store={store}
            canMatch={canMatch}
            canCreateExpense={canCreateExpense}
            canMarkTransfer={canMarkTransfer}
            canViewBalances={canViewBalances}
          />
        )}
        {tab === "matched" && (
          <TransactionInbox
            txns={matched}
            store={store}
            canMatch={canMatch}
            canCreateExpense={canCreateExpense}
            canMarkTransfer={canMarkTransfer}
            canViewBalances={canViewBalances}
            readOnly
          />
        )}
        {tab === "statements" && (
          <StatementsView
            store={store}
            canReconcile={canReconcile}
            canViewBalances={canViewBalances}
          />
        )}
        {tab === "accounts" && (
          <AccountsView store={store} canViewBalances={canViewBalances} />
        )}
      </Tabs>

      <ImportCsvDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

export function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "maintenance" | "out" | "neutral";
}) {
  return (
    <div
      className={`rounded-md border border-border bg-surface p-3 ${tone === "maintenance" ? statusToneClasses.maintenance.border : tone === "out" ? statusToneClasses.out.border : ""} border-l-2`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl tabular text-foreground">{value}</p>
    </div>
  );
}
