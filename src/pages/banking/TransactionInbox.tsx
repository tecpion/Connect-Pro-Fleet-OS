// Connect Pro Fleet — transaction inbox (Build #42).
//
// Match-first banking workflow. An imported bank transaction is EVIDENCE of
// money movement — NOT revenue or expense until matched or converted. The
// primary action is "Review Transaction", which opens the ReviewTransactionSheet
// exposing the appropriate actions (match existing, create new, transfer, ignore).
//
// States are transparent: Needs Review, Suggested Match, Matched, Transfer,
// Ignored, Duplicate Suspected. Fast-filter chips + search narrow the list.
// Duplicate-suspected transactions are flagged across ALL imports.

import { useMemo, useState } from "react";
import type { FleetStore } from "@/lib/store/storeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui-bits";
import { MoreActionsMenu } from "@/components/MoreActionsMenu";
import { fmtMoneyExact, fmtDate, statusToneClasses } from "@/lib/format";
import {
  REVIEW_STATUS_LABELS,
  MATCH_STATUS_LABELS,
  type ImportedTransaction,
} from "@/lib/bankingTypes";
import { detectDuplicateTransactions } from "@/lib/bankingAttention";
import { transactionAttentionReasons } from "./ReviewTransactionSheet";
import type { TransactionAttentionReason } from "./ReviewTransactionSheet";
import {
  applyInboxFilter,
  searchImportedTransactions,
  INBOX_FILTER_LABELS,
  type InboxFilter,
} from "@/lib/bankingReviewSelectors";
import { ReviewTransactionSheet } from "./ReviewTransactionSheet";
import { toast } from "sonner";
import { Search, Eye, AlertTriangle, Link2 } from "lucide-react";

export function TransactionInbox({
  txns,
  store,
  canMatch,
  canCreateExpense,
  canMarkTransfer,
  canViewBalances,
  readOnly = false,
}: {
  txns: ImportedTransaction[];
  store: FleetStore;
  canMatch: boolean;
  canCreateExpense: boolean;
  canMarkTransfer: boolean;
  canViewBalances: boolean;
  readOnly?: boolean;
}) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [reviewTxnId, setReviewTxnId] = useState<string | null>(null);

  // Duplicate suspects across ALL imported transactions (not just the
  // filtered view) so the chip count is accurate.
  const dupTxnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of detectDuplicateTransactions(store.importedTransactions)) {
      ids.add(d.existing.id);
      ids.add(d.candidate.id);
    }
    return ids;
  }, [store.importedTransactions]);

  const filtered = useMemo(() => {
    const searched = searchImportedTransactions(txns, search);
    return applyInboxFilter(searched, filter, dupTxnIds);
  }, [txns, search, filter, dupTxnIds]);

  if (store.importedTransactions.length === 0) {
    return (
      <EmptyState
        title="No imported transactions"
        hint="Import a CSV statement to start reconciling. Imported activity isn't revenue or expense until matched."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter + search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(INBOX_FILTER_LABELS) as InboxFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground"
              }`}
            >
              {INBOX_FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchant, amount, ref…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No transactions match"
          hint="Try a different filter or search term."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <TransactionCard
              key={t.id}
              txn={t}
              store={store}
              canMatch={canMatch}
              canViewBalances={canViewBalances}
              readOnly={readOnly}
              isDuplicateSuspect={dupTxnIds.has(t.id)}
              onReview={() => setReviewTxnId(t.id)}
            />
          ))}
        </div>
      )}

      {/* Review Transaction sheet */}
      {reviewTxnId && (
        <ReviewTransactionSheet
          txnId={reviewTxnId}
          store={store}
          canMatch={canMatch}
          canCreateExpense={canCreateExpense}
          canMarkTransfer={canMarkTransfer}
          canViewBalances={canViewBalances}
          onClose={() => setReviewTxnId(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction card
// ---------------------------------------------------------------------------

function TransactionCard({
  txn,
  store,
  canMatch,
  canViewBalances,
  readOnly,
  isDuplicateSuspect,
  onReview,
}: {
  txn: ImportedTransaction;
  store: FleetStore;
  canMatch: boolean;
  canViewBalances: boolean;
  readOnly: boolean;
  isDuplicateSuspect: boolean;
  onReview: () => void;
}) {
  const account = store.financialAccountById(txn.financial_account_id);
  const matches = store.matchesForImport(txn.id);
  const isMatched =
    txn.match_status === "matched" || txn.match_status === "split_matched";
  const isIgnored = txn.review_status === "ignored";
  const isTransfer = txn.transfer_status === "transfer";

  const reasons = transactionAttentionReasons(txn, matches.length > 0);

  const tone = isIgnored
    ? statusToneClasses.neutral
    : isTransfer
      ? statusToneClasses.rented
      : isMatched
        ? statusToneClasses.available
        : txn.direction === "money_in"
          ? statusToneClasses.available
          : statusToneClasses.maintenance;

  return (
    <div
      className={`rounded-md border border-border bg-surface p-4 ${tone.border} border-l-2`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              {txn.description}
            </p>
            {isDuplicateSuspect && !isMatched && !isIgnored && (
              <span className="inline-flex items-center gap-1 rounded-full bg-status-out/10 px-2 py-0.5 text-xs font-medium text-status-out">
                <AlertTriangle size={11} /> Duplicate Suspected
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {fmtDate(txn.transaction_date)} · {account?.name ?? "—"} ·{" "}
            {txn.direction === "money_in" ? "IN" : "OUT"}
          </p>
        </div>
        <div className="text-right">
          <p
            className={`font-mono text-lg tabular ${txn.direction === "money_in" ? "text-status-available" : "text-foreground"}`}
          >
            {txn.direction === "money_in" ? "+" : "−"}
            {canViewBalances ? fmtMoneyExact(txn.amount) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {MATCH_STATUS_LABELS[txn.match_status]} ·{" "}
            {REVIEW_STATUS_LABELS[txn.review_status]}
          </p>
        </div>
      </div>

      {/* Attention reasons */}
      {!readOnly && reasons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <AttentionPill key={r} reason={r} />
          ))}
        </div>
      )}

      {/* Existing matches */}
      {matches.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-md bg-muted/30 p-2">
          {matches.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-muted-foreground">
                Matched to {m.target_type.replace("_", " ")} ·{" "}
                <span className="font-mono tabular text-foreground">
                  {canViewBalances ? fmtMoneyExact(m.allocated_amount) : "—"}
                </span>
              </span>
              {!readOnly && canMatch && (
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

      {/* Primary action */}
      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onReview}>
            <Eye size={13} className="mr-1" /> Review Transaction
          </Button>
          {isMatched && (
            <MoreActionsMenu
              items={[
                {
                  key: "open",
                  label: "Open Matched Record",
                  icon: Link2,
                  onSelect: () => toast.info("Opening matched record…"),
                },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AttentionPill({ reason }: { reason: TransactionAttentionReason }) {
  const labels: Record<TransactionAttentionReason, string> = {
    unreviewed: "Needs Review",
    suggested_match: "Suggested Match",
    duplicate_suspected: "Duplicate Suspected",
    unmatched_money_in: "Unmatched In",
    unmatched_money_out: "Unmatched Out",
    missing_match: "No Match",
  };
  const toneClass: Record<TransactionAttentionReason, string> = {
    unreviewed: "bg-status-maintenance/10 text-status-maintenance",
    suggested_match: "bg-primary/10 text-primary",
    duplicate_suspected: "bg-status-out/10 text-status-out",
    unmatched_money_in: "bg-status-available/10 text-status-available",
    unmatched_money_out: "bg-status-maintenance/10 text-status-maintenance",
    missing_match: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[reason]}`}
    >
      {labels[reason]}
    </span>
  );
}
