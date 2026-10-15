// Connect Pro Fleet — Review Transaction sheet (Build #42).
//
// The primary review flow for an imported bank transaction. An imported
// transaction is EVIDENCE of money movement — NOT revenue or expense until
// matched or converted. This sheet exposes the appropriate actions:
//
//   Money OUT: Match Existing Expense · Create New Expense · Transfer · Ignore
//   Money IN:  Match Customer Payment · Match Deposit · Transfer · Ignore
//
// Before Create New Expense, duplicate protection runs. Expense-rule
// suggestions assist classification but NEVER silently create an expense.
// Receipt-inbox and transfer-pair suggestions are surfaced when available.
// Reviewed vs Matched vs Reconciled are kept distinct.

import { useMemo, useState } from "react";
import type { FleetStore } from "@/lib/store/storeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fmtMoneyExact,
  fmtDate,
  fmtDateShort,
  statusToneClasses,
} from "@/lib/format";
import {
  REVIEW_STATUS_LABELS,
  MATCH_STATUS_LABELS,
  type ImportedTransaction,
  type ReconciliationTargetType,
} from "@/lib/bankingTypes";
import {
  suggestPaymentMatches,
  suggestExpenseMatches,
  type MatchCandidate,
} from "@/lib/reconciliationRules";
import {
  detectDuplicateTransactions,
  suggestReceiptMatches,
  suggestTransferPairs,
  transactionAttentionReasons,
  type TransactionAttentionReason,
} from "@/lib/bankingAttention";
import { isCollectionPayment } from "@/lib/collectionSelectors";
import {
  matchExpenseRule,
  resolveRuleAction,
} from "@/lib/expenseRuleSelectors";
import type { RuleMatchResult } from "@/lib/expenseTypes";
import {
  findDuplicateExpenses,
  ruleCandidateFromTxn,
  searchExpenses,
  searchPayments,
  type ManualSearchResult,
} from "@/lib/bankingReviewSelectors";
import { toast } from "sonner";
import {
  Check,
  X,
  ArrowLeftRight,
  FilePlus,
  EyeOff,
  Search,
  AlertTriangle,
  Link2,
  Receipt as ReceiptIcon,
} from "lucide-react";

export function ReviewTransactionSheet({
  txnId,
  store,
  canMatch,
  canCreateExpense,
  canMarkTransfer,
  canViewBalances,
  onClose,
}: {
  txnId: string;
  store: FleetStore;
  canMatch: boolean;
  canCreateExpense: boolean;
  canMarkTransfer: boolean;
  canViewBalances: boolean;
  onClose: () => void;
}) {
  const txn = store.importedTransactionById(txnId);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateAnyway, setShowCreateAnyway] = useState(false);

  const account = txn
    ? store.financialAccountById(txn.financial_account_id)
    : undefined;
  const matches = txn ? store.matchesForImport(txn.id) : [];
  const isMatched =
    txn?.match_status === "matched" || txn?.match_status === "split_matched";

  // Suggested matches (deterministic).
  const candidates = useMemo<MatchCandidate[]>(() => {
    if (!txn) return [];
    const customerName = (id: string) => store.customerName(id);
    const vendorName = (id: string | null) =>
      id ? (store.maintenanceVendors.find((v) => v.id === id)?.name ?? "") : "";
    return txn.direction === "money_in"
      ? suggestPaymentMatches(txn, store.transactions, customerName)
      : suggestExpenseMatches(txn, store.expenses, vendorName);
  }, [txn, store]);

  // Expense-rule suggestion (assists classification, never auto-creates).
  const ruleResult = useMemo<RuleMatchResult>(() => {
    if (!txn) return { matched: false };
    const candidate = ruleCandidateFromTxn(txn);
    return candidate
      ? matchExpenseRule(store.expenseRules, candidate)
      : { matched: false };
  }, [txn, store.expenseRules]);
  const ruleAction =
    ruleResult.matched && "ruleId" in ruleResult
      ? resolveRuleAction(store.expenseRules, ruleResult.ruleId)
      : undefined;

  // Duplicate protection: check for likely duplicate expenses before Create New.
  const duplicateExpenses = useMemo(() => {
    if (!txn) return [];
    return findDuplicateExpenses(txn, store.expenses);
  }, [txn, store.expenses]);

  // Receipt-inbox suggestions.
  const receiptSuggestions = useMemo(() => {
    if (!txn) return [];
    return suggestReceiptMatches(txn, store.receiptInbox);
  }, [txn, store.receiptInbox]);

  // Transfer pair suggestions.
  const transferPairs = useMemo(
    () => suggestTransferPairs(store.importedTransactions),
    [store.importedTransactions],
  );
  const pairForTxn = txn
    ? transferPairs.find(
        (p) => p.out_txn.id === txn.id || p.in_txn.id === txn.id,
      )
    : undefined;

  // Manual search results.
  const manualResults = useMemo<ManualSearchResult[]>(() => {
    if (!txn || !searchQuery.trim()) return [];
    return txn.direction === "money_in"
      ? searchPayments(
          searchQuery,
          txn,
          store.transactions,
          (id) => store.customerName(id),
          isCollectionPayment,
        )
      : searchExpenses(searchQuery, txn, store.expenses);
  }, [searchQuery, txn, store]);

  if (!txn) return null;

  function confirmMatch(
    target_type: ReconciliationTargetType,
    target_id: string,
    amount: number,
  ) {
    store.confirmMatch({
      importedTransactionId: txn!.id,
      target_type,
      target_id,
      allocated_amount: amount,
    });
    toast.success("Match confirmed. No duplicate record created.");
    onClose();
  }

  function ignore(reason?: string) {
    store.ignoreTransaction(txn!.id, reason);
    toast.success("Transaction ignored. Original record retained.");
    onClose();
  }

  function markTransfer(counterpartId?: string) {
    const otherAccounts = store.financialAccounts.filter(
      (a) => a.id !== txn!.financial_account_id,
    );
    if (otherAccounts.length === 0) {
      toast.error("Need at least one other account to mark a transfer.");
      return;
    }
    store.markTransfer({
      importedTransactionId: txn!.id,
      counterpartAccountId: counterpartId ?? otherAccounts[0].id,
      counterpartImportedId: pairForTxn
        ? pairForTxn.out_txn.id === txn!.id
          ? pairForTxn.in_txn.id
          : pairForTxn.out_txn.id
        : null,
    });
    toast.success("Marked as transfer. Not counted as income or expense.");
    onClose();
  }

  function createExpense() {
    const cat = store.expenseCategories.find((c) => c.active);
    const id = store.createExpenseFromImport({
      importedTransactionId: txn!.id,
      description: txn!.description,
      expense_category_id: ruleAction?.action.category_id ?? cat?.id ?? null,
      vehicle_id: ruleAction?.action.vehicle_id ?? null,
      receipt_required: ruleAction?.action.receipt_required === "required",
    });
    if (id) toast.success("Expense created and matched to this transaction.");
    else toast.error("Could not create expense.");
    onClose();
  }

  const tone =
    txn.direction === "money_in"
      ? statusToneClasses.available
      : statusToneClasses.maintenance;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border border-border bg-surface shadow-xl sm:rounded-xl">
        {/* Header */}
        <div className={`border-b border-border p-4 ${tone.border} border-l-4`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {txn.description}
              </p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {fmtDate(txn.transaction_date)} · {account?.name ?? "—"} ·{" "}
                {txn.direction === "money_in" ? "MONEY IN" : "MONEY OUT"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p
                className={`font-mono text-lg tabular ${txn.direction === "money_in" ? "text-status-available" : "text-foreground"}`}
              >
                {txn.direction === "money_in" ? "+" : "−"}
                {canViewBalances ? fmtMoneyExact(txn.amount) : "—"}
              </p>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Imported activity is evidence of money movement — not revenue or
            expense until matched or converted.
          </p>
        </div>

        <div className="space-y-4 p-4">
          {/* Already matched */}
          {isMatched && (
            <div className="rounded-md border border-status-available/30 bg-status-available/5 p-3">
              <p className="text-sm font-medium text-status-available">
                Already Matched
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                This transaction is linked to an authoritative record. Matching
                it again would create a duplicate.
              </p>
              {matches.map((m) => (
                <div
                  key={m.id}
                  className="mt-2 flex items-center justify-between text-xs"
                >
                  <span>
                    {m.target_type.replace("_", " ")} ·{" "}
                    <span className="font-mono tabular">
                      {canViewBalances
                        ? fmtMoneyExact(m.allocated_amount)
                        : "—"}
                    </span>
                  </span>
                  {canMatch && (
                    <button
                      onClick={() => {
                        store.unmatch(m.id);
                        toast.success("Match removed.");
                      }}
                      className="text-status-out hover:underline"
                    >
                      Unmatch
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Suggested matches */}
          {!isMatched && candidates.length > 0 && (
            <Section title="Suggested Matches" icon={<Link2 size={14} />}>
              {candidates.map((c) => (
                <CandidateRow
                  key={`${c.target_type}-${c.target_id}`}
                  label={c.label}
                  sublabel={`${c.sublabel} · ${c.confidence} match`}
                  canMatch={canMatch}
                  onMatch={() =>
                    confirmMatch(c.target_type, c.target_id, c.allocated_amount)
                  }
                />
              ))}
            </Section>
          )}

          {/* Expense-rule suggestion */}
          {!isMatched && ruleResult.matched && ruleAction && (
            <Section title="Rule Suggestion" icon={<Search size={14} />}>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                <p className="font-medium text-foreground">
                  Categorized by Rule: {ruleAction.name}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Category:{" "}
                  {store.expenseCategories.find(
                    (c) => c.id === ruleAction.action.category_id,
                  )?.name ?? "—"}
                  {ruleAction.action.vehicle_id
                    ? " · Vehicle-scoped"
                    : " · Overhead"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  A rule suggestion assists classification — it does not create
                  an expense. Use Create New Expense to apply it.
                </p>
              </div>
            </Section>
          )}

          {/* Duplicate protection */}
          {!isMatched && duplicateExpenses.length > 0 && (
            <Section
              title="Possible Existing Expense"
              icon={<AlertTriangle size={14} />}
              tone="out"
            >
              <p className="text-xs text-muted-foreground">
                An existing expense matches this transaction's amount and date.
                Matching it avoids a duplicate.
              </p>
              {duplicateExpenses.map(({ expense: e, signals }) => (
                <CandidateRow
                  key={e.id}
                  label={`${e.expense_number} — ${e.description}`}
                  sublabel={`$${e.amount.toFixed(2)} · ${fmtDateShort(e.transaction_date)} · ${signals.join(", ")}`}
                  canMatch={canMatch}
                  matchLabel="Match Existing"
                  onMatch={() => confirmMatch("expense", e.id, txn.amount)}
                />
              ))}
            </Section>
          )}

          {/* Receipt suggestion */}
          {!isMatched && receiptSuggestions.length > 0 && (
            <Section
              title="Possible Receipt Match"
              icon={<ReceiptIcon size={14} />}
            >
              {receiptSuggestions.slice(0, 3).map((r) => (
                <div
                  key={r.receipt_inbox_id}
                  className="flex items-center justify-between rounded-md border border-border bg-surface-2/40 p-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {r.file_name}
                    </p>
                    <p className="text-muted-foreground">
                      {r.signals.join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {/* Transfer pair suggestion */}
          {!isMatched && pairForTxn && (
            <Section
              title="Possible Transfer Match"
              icon={<ArrowLeftRight size={14} />}
            >
              <div className="rounded-md border border-border bg-surface-2/40 p-2 text-xs">
                <p className="font-medium text-foreground">
                  A counterpart transaction on another account matches this
                  amount.
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {pairForTxn.signals.join(" · ")}
                </p>
                {canMarkTransfer && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() =>
                      markTransfer(
                        pairForTxn.out_txn.id === txn.id
                          ? pairForTxn.in_txn.financial_account_id
                          : pairForTxn.out_txn.financial_account_id,
                      )
                    }
                  >
                    <ArrowLeftRight size={13} className="mr-1" /> Link as
                    Transfer Pair
                  </Button>
                )}
              </div>
            </Section>
          )}

          {/* Manual search */}
          {!isMatched && (
            <Section
              title="Search Existing Records"
              icon={<Search size={14} />}
            >
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Amount, merchant, expense #, customer…"
                className="h-8 text-sm"
                autoFocus
              />
              {manualResults.map((r) => (
                <CandidateRow
                  key={`${r.target_type}-${r.target_id}`}
                  label={r.label}
                  sublabel={r.sublabel}
                  canMatch={canMatch}
                  onMatch={() =>
                    confirmMatch(
                      r.target_type as ReconciliationTargetType,
                      r.target_id,
                      r.allocated_amount,
                    )
                  }
                />
              ))}
              {searchQuery.trim() && manualResults.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No matching records found.
                </p>
              )}
            </Section>
          )}

          {/* Actions */}
          {!isMatched && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {canCreateExpense && txn.direction === "money_out" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (duplicateExpenses.length > 0 && !showCreateAnyway) {
                      setShowCreateAnyway(true);
                      toast.warning(
                        "Possible duplicate detected. Confirm to create anyway.",
                      );
                    } else {
                      createExpense();
                    }
                  }}
                >
                  <FilePlus size={13} className="mr-1" />{" "}
                  {showCreateAnyway && duplicateExpenses.length > 0
                    ? "Create Anyway"
                    : "Create New Expense"}
                </Button>
              )}
              {canMarkTransfer && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markTransfer()}
                >
                  <ArrowLeftRight size={13} className="mr-1" /> Transfer
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => ignore()}>
                <EyeOff size={13} className="mr-1" /> Ignore
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateRow({
  label,
  sublabel,
  canMatch,
  matchLabel = "Match",
  onMatch,
}: {
  label: string;
  sublabel: string;
  canMatch: boolean;
  matchLabel?: string;
  onMatch: () => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-surface-2/40 p-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{label}</p>
        <p className="font-mono text-xs text-muted-foreground">{sublabel}</p>
      </div>
      {canMatch && (
        <Button size="sm" variant="outline" onClick={onMatch}>
          <Check size={13} className="mr-1" /> {matchLabel}
        </Button>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "out";
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${tone === "out" ? "text-status-out" : "text-foreground"}`}
      >
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

// Re-export for the inbox card's attention pills.
export { transactionAttentionReasons };
export type { TransactionAttentionReason };
