// Connect Pro Fleet — Copilot shared helpers (Build #29).
// Small pure helpers used across the deterministic query handlers.

import type {
  CopilotAnswer,
  CopilotConfidenceType,
  CopilotIntent,
  CopilotViewerPermissions,
} from "./copilotTypes";

/** Build the common base of an answer (timestamps, permission flag, caveats). */
export function baseAnswer(
  intent: CopilotIntent,
  asOf: Date,
  perms: CopilotViewerPermissions,
  confidence: CopilotConfidenceType = "derived",
): Pick<
  CopilotAnswer,
  | "intent"
  | "answer_type"
  | "summary"
  | "facts"
  | "items"
  | "sources"
  | "suggested_actions"
  | "caveats"
  | "generated_at"
  | "as_of"
  | "permission_filtered"
  | "confidence_type"
> {
  return {
    intent,
    answer_type: "summary",
    summary: "",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: [],
    generated_at: new Date().toISOString(),
    as_of: asOf.toISOString(),
    permission_filtered:
      !perms.canViewFinancials ||
      !perms.canViewProfitability ||
      !perms.canViewSensitiveDocs ||
      !perms.canViewBanking,
    confidence_type: confidence,
  };
}

/** Simple pluralize: "1 item" / "3 items". */
export function plural(
  n: number,
  singular: string,
  pluralForm?: string,
): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/** Format a money amount for display (caller has already permission-gated). */
export function formatMoney(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Gate a financial amount — null when the viewer lacks permission. */
export function gateAmount(
  amount: number | null | undefined,
  perms: CopilotViewerPermissions,
): number | null {
  if (amount == null) return null;
  return perms.canViewFinancials ? amount : null;
}

/** Render an internal status enum as customer-facing Title Case prose so the
 *  user never sees raw snake_case (e.g. "out_of_service" → "Out of Service").
 *  Pass-through for already-human values. */
export function humanizeStatus(status: string | null | undefined): string {
  if (!status) return "—";
  // Already human (Title Case with spaces) — pass through.
  if (!status.includes("_") && !status.includes("-")) return status;
  return status.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A stable message id. */
let _seq = 0;
export function nextMessageId(prefix = "msg"): string {
  _seq += 1;
  return `${prefix}_${Date.now()}_${_seq}`;
}

/** Reset the id sequence (tests). */
export function _resetMessageIdSeq(): void {
  _seq = 0;
}
