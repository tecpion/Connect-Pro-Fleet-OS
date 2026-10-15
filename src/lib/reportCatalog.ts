// Connect Pro Fleet — Build #18 report catalog.
//
// Centralized metadata for every report in the Reports Center. Each entry
// carries the category, title, description, route, and the permission(s)
// required to view it. The Reports Center renders cards from this catalog,
// hiding any report the current user cannot access (no financial hints leak
// through descriptions for locked reports).

export type ReportCategory =
  "overview" | "revenue" | "fleet" | "accounting" | "operations" | "partners";

export interface ReportDef {
  id: string;
  category: ReportCategory;
  title: string;
  description: string;
  /** Route (may include query params for pre-applied filters). */
  route: string;
  /** Required permission keys (ALL must be true). */
  permissions: string[];
  /** Hide entirely when unauthorized (default true). */
  hideWhenUnauthorized?: boolean;
}

export const REPORT_CATALOG: ReportDef[] = [
  // OVERVIEW ---------------------------------------------------------------
  {
    id: "executive-summary",
    category: "overview",
    title: "Executive Summary",
    description:
      "Owner's operating console: financial snapshot, profitability, fleet utilization, business health score, money left on the table, and operational load. Includes health formula version for reproducibility.",
    route: "/executive",
    permissions: ["dashboard.view"],
  },
  {
    id: "management-summary",
    category: "overview",
    title: "Management Summary",
    description:
      "Executive snapshot: revenue, collections, fleet, maintenance, damage, and accounting quality for the period.",
    route: "/reports/management-summary",
    permissions: ["reports.view_management_summary"],
  },
  {
    id: "daily-operating",
    category: "overview",
    title: "Daily Operating Report",
    description:
      "Today's pickups, returns, payments due, overdue rentals, broken arrangements, and items needing action.",
    route: "/reports/daily-operating",
    permissions: ["reports.view_operations"],
  },
  {
    id: "weekly-operating",
    category: "overview",
    title: "Weekly Operating Report",
    description:
      "Weekly review of rentals, collections, maintenance, damage, and task completion.",
    route: "/reports/weekly-operating",
    permissions: ["reports.view_operations"],
  },

  // REVENUE & COLLECTIONS --------------------------------------------------
  {
    id: "revenue-summary",
    category: "revenue",
    title: "Revenue Summary",
    description:
      "Base rental, late fees, eligible fees, damage charges, and forfeitures — taxes shown separately.",
    route: "/reports/revenue-summary",
    permissions: ["reports.view_revenue"],
  },
  {
    id: "collections",
    category: "revenue",
    title: "Collections",
    description:
      "Actual payments collected, by tender method and processor, with averages and counts.",
    route: "/reports/collections",
    permissions: ["reports.view_collections"],
  },
  {
    id: "outstanding-balances",
    category: "revenue",
    title: "Outstanding Balances",
    description:
      "Customers and rentals with open obligations, aging buckets, and arrangement context.",
    route: "/reports/outstanding-balances",
    permissions: ["reports.view_collections"],
  },
  {
    id: "payment-arrangements",
    category: "revenue",
    title: "Payment Arrangements",
    description:
      "Active, broken, and resolved arrangements — collectible vs scheduled remaining.",
    route: "/reports/payment-arrangements",
    permissions: ["reports.view_collections"],
  },
  {
    id: "late-fees",
    category: "revenue",
    title: "Late Fees",
    description:
      "Late fees assessed, paid, outstanding, and waived by date and customer.",
    route: "/reports/late-fees",
    permissions: ["reports.view_collections"],
  },

  // FLEET ------------------------------------------------------------------
  {
    id: "vehicle-performance",
    category: "fleet",
    title: "Vehicle Performance",
    description:
      "Per-vehicle revenue, expenses, profit, utilization, and company economic share.",
    route: "/reports/vehicle-performance",
    permissions: ["reports.view_fleet_reports"],
  },
  {
    id: "maintenance",
    category: "fleet",
    title: "Maintenance",
    description:
      "Work-order counts, downtime, spend by vehicle and vendor, and overdue service.",
    route: "/reports/maintenance",
    permissions: ["reports.view_fleet_reports"],
  },
  {
    id: "damage-claims",
    category: "fleet",
    title: "Damage Claims",
    description:
      "Open claims, recovery pending, actual cost, recoveries, and net damage loss.",
    route: "/reports/damage-claims",
    permissions: ["reports.view_fleet_reports"],
  },

  // ACCOUNTING -------------------------------------------------------------
  {
    id: "expenses",
    category: "accounting",
    title: "Expenses",
    description:
      "Total spend by category, vendor, vehicle, and payment method — overhead and acquisition separate.",
    route: "/reports/expenses",
    permissions: ["reports.view_accounting"],
  },
  {
    id: "missing-receipts",
    category: "accounting",
    title: "Missing Receipts",
    description:
      "Expenses requiring a receipt that do not have one, with age and reimbursement status.",
    route: "/reports/missing-receipts",
    permissions: ["reports.view_accounting"],
  },
  {
    id: "reimbursements",
    category: "accounting",
    title: "Reimbursements",
    description:
      "Owed, approved, and paid reimbursements by employee — never double-counted as expense.",
    route: "/reports/reimbursements",
    permissions: ["reports.view_accounting"],
  },
  {
    id: "banking-reconciliation",
    category: "accounting",
    title: "Banking & Reconciliation",
    description:
      "Account status, unreviewed transactions, suggested matches, and statements needing attention.",
    route: "/reports/banking-reconciliation",
    permissions: ["banking.view"],
  },
  {
    id: "deposits",
    category: "accounting",
    title: "Security Deposits",
    description:
      "Held liability, collected, applied, refund pending, refunded, and forfeited — never revenue.",
    route: "/reports/deposits",
    permissions: ["reports.view_accounting"],
  },

  // OPERATIONS -------------------------------------------------------------
  {
    id: "rental-activity",
    category: "operations",
    title: "Rental Activity",
    description:
      "Rentals started, active, completed, extended, exchanged, and overdue by model.",
    route: "/reports/rental-activity",
    permissions: ["reports.view_operations"],
  },
  {
    id: "tasks",
    category: "operations",
    title: "Tasks",
    description:
      "Open, overdue, urgent, unassigned, and completed tasks by assignee and category.",
    route: "/reports/tasks",
    permissions: ["reports.view_operations"],
  },
  {
    id: "staff-activity",
    category: "operations",
    title: "Staff Activity & Workload",
    description:
      "Operational activity and current workload by staff member — no productivity scoring.",
    route: "/reports/staff-activity",
    permissions: ["reports.view_staff_activity"],
  },

  // PARTNERS ---------------------------------------------------------------
  {
    id: "investor-jv",
    category: "partners",
    title: "Investor / JV Summary",
    description:
      "Partner vehicles, compensation, projected vs finalized vs paid settlements, and company share.",
    route: "/reports/investor-jv",
    permissions: ["reports.view_partner_reports", "investors.view_financials"],
  },
  {
    id: "profitability",
    category: "partners",
    title: "Profitability & P&L",
    description:
      "Vehicle, fleet, and company P&L with charts (links to the Profitability module).",
    route: "/profitability",
    permissions: ["reports.view_profitability"],
  },
  {
    id: "historical-financials",
    category: "overview",
    title: "Historical Financials",
    description:
      "Imported pre-Fleet revenue, collections, and expenses with Fleet/Historical/Combined views and a Go-Live cutover marker.",
    route: "/reports/historical-financials",
    permissions: ["reports.view_management_summary"],
  },
  {
    id: "violations",
    category: "operations",
    title: "Tolls & Violations",
    description:
      "Assessed amounts, company-paid costs, customer charges, recovery, and unrecovered exposure by type and responsibility.",
    route: "/reports/violations",
    permissions: ["violations.view"],
  },
  {
    id: "compliance",
    category: "operations",
    title: "Compliance",
    description:
      "Document compliance, expirations, blocked vehicles, and customer credential status — derived from requirements and verification.",
    route: "/reports/compliance",
    permissions: ["reports.view_compliance"],
  },
];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  overview: "Overview",
  revenue: "Revenue & Collections",
  fleet: "Fleet",
  accounting: "Accounting",
  operations: "Operations",
  partners: "Partners",
};

export const REPORT_CATEGORY_ORDER: ReportCategory[] = [
  "overview",
  "revenue",
  "fleet",
  "accounting",
  "operations",
  "partners",
];

/** Reports the current user may access (permission-filtered). */
export function visibleReports(
  canAccess: (perm: string) => boolean,
): ReportDef[] {
  return REPORT_CATALOG.filter((r) => r.permissions.every((p) => canAccess(p)));
}
