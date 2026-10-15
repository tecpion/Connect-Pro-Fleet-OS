// Connect Pro Fleet — Finance workspace (Build #43).
//
// Consolidates the previously separate Expenses and Banking experiences into
// ONE unified Finance workspace with top-level tabs:
//   Overview · Expenses · Banking · Reconciliation
//
// This is an INFORMATION ARCHITECTURE / UX consolidation ONLY. The underlying
// expense ledger, bank transaction store, statement store, reconciliation
// engine, receipt logic, and reimbursement logic are UNCHANGED — the existing
// Expenses and Banking components are embedded (not rewritten). No second
// ledger, no duplicate selectors, no duplicate financial truth.
//
// Tab + subtab selection is URL-addressable:
//   /finance?tab=expenses&subtab=receipts
//   /finance?tab=banking&subtab=inbox
//   /finance?tab=reconciliation
// This supports refresh / bookmark / back navigation. Legacy /expenses and
// /banking routes redirect here (see App.tsx), preserving deep-link query
// params (txn=, expense=, tab=).
//
// Permissions: a user with only expenses.view sees Expenses + a permission-
// safe Overview; a user with only banking.view sees Banking + Reconciliation +
// a permission-safe Overview. Profitability and Investor & Partner Management
// remain separate sidebar pages — NOT folded into Finance.

import { useEffect } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import Expenses from "@/pages/Expenses";
import Banking from "@/pages/Banking";
import { FinanceOverview } from "./finance/FinanceOverview";
import { ReconciliationView } from "./finance/ReconciliationView";
import { GlobalDocumentsView } from "./finance/GlobalDocumentsView";

type TopTab =
  "overview" | "expenses" | "banking" | "reconciliation" | "documents";

const VALID_TABS: TopTab[] = [
  "overview",
  "expenses",
  "banking",
  "reconciliation",
  "documents",
];

function isTopTab(v: string | null): v is TopTab {
  return !!v && (VALID_TABS as string[]).includes(v);
}

export default function Finance() {
  const store = useStore();
  const [params, setParams] = useSearchParams();

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;

  const canViewExpenses = can(roleObj, overrides, "expenses.view");
  const canViewCosts = can(roleObj, overrides, "expenses.view_costs");
  const canViewOverhead = can(
    roleObj,
    overrides,
    "expenses.view_company_overhead",
  );
  const canViewBanking = can(roleObj, overrides, "banking.view");
  const canViewBalances = can(roleObj, overrides, "banking.view_balances");
  const canReconcile = can(roleObj, overrides, "banking.reconcile_statement");

  // Derive the active top tab from the URL. Fall back to the first permitted
  // tab when the URL value is missing or the viewer lacks permission for it.
  const rawTab = params.get("tab");
  const canViewDocs = can(roleObj, overrides, "documents.view");
  const permitted: TopTab[] = [
    "overview",
    ...(canViewExpenses ? (["expenses"] as TopTab[]) : []),
    ...(canViewBanking ? (["banking", "reconciliation"] as TopTab[]) : []),
    ...(canViewDocs ? (["documents"] as TopTab[]) : []),
  ];
  const tab: TopTab =
    isTopTab(rawTab) && permitted.includes(rawTab) ? rawTab : permitted[0];

  // Keep the URL in sync with the active tab (adds ?tab= when missing / invalid).
  useEffect(() => {
    if (rawTab !== tab) {
      const next = new URLSearchParams(params);
      next.set("tab", tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const subtab = params.get("subtab") ?? undefined;

  function setTab(next: TopTab) {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    // Clear subtab when switching top tabs — subtabs are scoped per top tab.
    p.delete("subtab");
    setParams(p, { replace: false });
  }

  function setSubtab(next: string) {
    const p = new URLSearchParams(params);
    p.set("subtab", next);
    setParams(p, { replace: false });
  }

  if (!canViewExpenses && !canViewBanking && !canViewDocs) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
        <EmptyState
          title="Finance restricted"
          hint="You don't have permission to view expense, banking, or document data."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            Finance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track business spending, bank activity, reconciliation, receipts,
            and financial attention items in one place.
          </p>
        </div>
      </header>

      {/* Top-level tab bar — scrollable on mobile (segmented control). */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TopTab)}>
        <TabsList className="flex w-full max-w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canViewExpenses && (
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          )}
          {canViewBanking && <TabsTrigger value="banking">Banking</TabsTrigger>}
          {canViewBanking && (
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          )}
          {canViewDocs && (
            <TabsTrigger value="documents">Documents</TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div className={cn(tab === "overview" && "pt-1")}>
        {tab === "overview" && (
          <FinanceOverview
            canViewExpenses={canViewExpenses}
            canViewBanking={canViewBanking}
            canViewCosts={canViewCosts}
            canViewBalances={canViewBalances}
            canViewOverhead={canViewOverhead}
          />
        )}

        {tab === "expenses" && canViewExpenses && (
          <Expenses embedded subtab={subtab} onSubtabChange={setSubtab} />
        )}

        {tab === "banking" && canViewBanking && (
          <Banking embedded subtab={subtab} onSubtabChange={setSubtab} />
        )}

        {tab === "reconciliation" && canViewBanking && (
          <ReconciliationView
            store={store}
            canReconcile={canReconcile}
            canViewBalances={canViewBalances}
          />
        )}

        {tab === "documents" && canViewDocs && <GlobalDocumentsView />}
      </div>
    </div>
  );
}
