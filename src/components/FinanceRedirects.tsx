// Connect Pro Fleet — legacy finance route redirects.
//
// Preserves bookmarks/back-compat: /expenses and /banking now live inside the
// unified /finance workspace. These redirects carry over the query string and
// translate legacy tab params into the new Finance tab/subtab scheme so deep
// links (e.g. /banking?txn=…, /expenses?expense=…) keep working.

import { useLocation, Navigate } from "@/lib/router-compat";

function buildTarget(tab: "expenses" | "banking", search: string): string {
  const sp = new URLSearchParams(search);
  // Legacy /banking?tab=statements → /finance?tab=banking&subtab=statements.
  const legacyTab = sp.get("tab");
  const out = new URLSearchParams();
  out.set("tab", tab);
  if (tab === "banking" && legacyTab && legacyTab !== "inbox") {
    out.set("subtab", legacyTab);
  }
  // Carry forward deep-link identifiers (txn=, expense=, …).
  for (const key of ["txn", "expense", "subtab"]) {
    const v = sp.get(key);
    if (v) out.set(key, v);
  }
  return `/finance?${out.toString()}`;
}

export function ExpensesRedirect() {
  const { search } = useLocation();
  return <Navigate to={buildTarget("expenses", search)} replace />;
}

export function BankingRedirect() {
  const { search } = useLocation();
  return <Navigate to={buildTarget("banking", search)} replace />;
}
