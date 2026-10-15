// Connect Pro Fleet — Vehicle Vault UI primitives (Build #45).
// Status badges, document row, and the Add Document menu trigger.

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import {
  VAULT_DOC_STATUS_LABELS,
  VAULT_DOC_STATUS_TONE,
  VAULT_DOC_CATEGORY_LABELS,
  type VaultDocument,
} from "@/lib/vaultTypes";
import { FileText, ReceiptText, FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";

export function VaultStatusBadge({ doc }: { doc: VaultDocument }) {
  return (
    <StatusPill tone={VAULT_DOC_STATUS_TONE[doc.status]}>
      {VAULT_DOC_STATUS_LABELS[doc.status]}
    </StatusPill>
  );
}

export function VaultDocIcon({ doc }: { doc: VaultDocument }) {
  if (doc.kind === "cash_expense_record")
    return <ReceiptText size={15} className="shrink-0 text-muted-foreground" />;
  if (doc.kind === "bill_of_sale" || doc.kind === "purchase_record")
    return (
      <FileSignature size={15} className="shrink-0 text-muted-foreground" />
    );
  return <FileText size={15} className="shrink-0 text-muted-foreground" />;
}

export function VaultDocRow({
  doc,
  onClick,
}: {
  doc: VaultDocument;
  onClick?: () => void;
}) {
  return (
    <li
      className="flex items-center justify-between gap-2 py-3"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex min-w-0 items-center gap-2">
        <VaultDocIcon doc={doc} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {doc.title}
          </p>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {doc.document_number} · {VAULT_DOC_CATEGORY_LABELS[doc.category]}
            {doc.vendor_name ? ` · ${doc.vendor_name}` : ""}
            {doc.seller_name ? ` · ${doc.seller_name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {doc.amount != null && (
          <span className="font-mono text-sm tabular text-foreground">
            {fmtMoneyExact(doc.amount)}
          </span>
        )}
        {doc.purchase_price != null && (
          <span className="font-mono text-sm tabular text-foreground">
            {fmtMoneyExact(doc.purchase_price)}
          </span>
        )}
        <span className="font-mono text-xs tabular text-muted-foreground">
          {fmtDate(doc.expense_date ?? doc.purchase_date ?? doc.created_at)}
        </span>
        <VaultStatusBadge doc={doc} />
      </div>
    </li>
  );
}

/** Compact summary strip for the Vehicle Digital Twin (spec §60). */
export function VaultSummaryStrip({
  total,
  purchaseDocs,
  expenseSupport,
  complianceDocs,
  needsAttention,
}: {
  total: number;
  purchaseDocs: number;
  expenseSupport: number;
  complianceDocs: number;
  needsAttention: number;
}) {
  const cells = [
    { label: "Total Documents", value: total },
    { label: "Purchase Docs", value: purchaseDocs },
    { label: "Expense Support", value: expenseSupport },
    { label: "Compliance Docs", value: complianceDocs },
    {
      label: "Needs Attention",
      value: needsAttention,
      tone: needsAttention > 0 ? "maintenance" : "neutral",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cells.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-border bg-surface p-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {c.label}
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-sm font-semibold tabular",
              c.tone === "maintenance"
                ? "text-status-maintenance"
                : "text-foreground",
            )}
          >
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export { Button };
