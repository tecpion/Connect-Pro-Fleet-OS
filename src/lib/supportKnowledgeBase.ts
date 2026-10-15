// Connect Pro Fleet — Knowledge Base seed articles + deterministic search
// (Build #31).
//
// Seed articles reflect ACTUAL product behavior — no features that don't
// exist. Terminology reuses the product's established names (Billing Period,
// Rental, Work Order, Damage Claim, Compliance Requirement, Daily Briefing,
// Fleet Copilot, Business Health). Tenant users only see Published articles.
//
// Search is deterministic (no external AI): ranks by exact title > keyword/tag
// > summary > body. Empty state never fabricates an answer.

import type {
  KnowledgeArticle,
  SupportKnowledgeContext,
  SupportKnowledgeMatch,
  ArticleFeedbackEntry,
} from "./supportTypes";

const PUBLISHED = "2026-09-01T00:00:00Z";

function article(
  a: Partial<KnowledgeArticle> &
    Pick<
      KnowledgeArticle,
      "id" | "slug" | "title" | "summary" | "body" | "category"
    >,
): KnowledgeArticle {
  return {
    tags: [],
    product_area: a.category,
    audience: "all_staff",
    status: "published",
    version: "1",
    created_at: PUBLISHED,
    updated_at: PUBLISHED,
    published_at: PUBLISHED,
    related_routes: [],
    related_article_ids: [],
    search_keywords: [],
    featured: false,
    author_reference: null,
    ...a,
  } as KnowledgeArticle;
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  article({
    id: "kb_getting_started",
    slug: "getting-started-with-connect-pro-fleet",
    title: "Getting Started with Connect Pro Fleet",
    summary:
      "An overview of the Connect Pro Fleet operations console and how to navigate the core modules.",
    body: `Connect Pro Fleet is the operations console for rental companies. The left rail organizes work into Operations, Fleet, and People. The Dashboard gives a daily operations overview, the Executive Dashboard is the owner's command center, and Daily Briefing surfaces what needs attention today.

Core modules: Reservations, Rentals, Payments Due, Payment Arrangements, Tasks, Deposits, Vehicles, Maintenance, Inspections, Incidents, Damage Claims, Tolls & Violations, Compliance, Customers, Staff, and Reports.

Use Fleet Copilot to ask operational questions in plain language. Use the Support Center (Help & Support) to search help, report a problem, and view system status.`,
    category: "Getting Started",
    tags: ["overview", "navigation", "start"],
    search_keywords: ["getting started", "overview", "navigate", "console"],
    featured: true,
    related_routes: ["/", "/briefing", "/executive"],
  }),
  article({
    id: "kb_company_setup",
    slug: "setting-up-your-company",
    title: "Setting Up Your Company",
    summary:
      "How to configure your company profile, locations, and tax/fee settings.",
    body: `Open Settings to configure your company. The Company section holds your legal name, DBA, contact details, and timezone. Locations define where vehicles operate. Taxes & Fees lets you configure tax rules and fee rules that apply at checkout and during billing periods.

Your company timezone drives day boundaries for billing, late evaluation, and reporting. Set it accurately so "today" and "this month" reflect your operating day.`,
    category: "Company Setup",
    tags: ["settings", "company", "locations", "timezone"],
    search_keywords: ["company setup", "locations", "timezone", "settings"],
    related_routes: ["/settings"],
  }),
  article({
    id: "kb_rental_policies",
    slug: "understanding-rental-policies",
    title: "Understanding Rental Policies",
    summary:
      "How rental policies, minimum rental duration, and deposit requirements work.",
    body: `Rental policies live in Settings under Company Policies. They define minimum rental duration, deposit requirements, and grace periods for late payments. Policies are versioned so changes apply to new rentals without rewriting history.

The late evaluator uses your grace period exactly: a payment due at 2:00 PM with a 30-minute grace is not late at 2:30 PM but is late at 2:31 PM.`,
    category: "Policies",
    tags: ["policies", "rental", "deposits", "grace"],
    search_keywords: [
      "rental policies",
      "minimum rental",
      "grace period",
      "deposit requirement",
    ],
    related_routes: ["/settings"],
  }),
  article({
    id: "kb_add_vehicle",
    slug: "adding-your-first-vehicle",
    title: "Adding Your First Vehicle",
    summary: "How to add a vehicle, assign a class, and set its rate.",
    body: `Go to Vehicles and click Add Vehicle. Enter the VIN, make, model, year, and plate. Assign a Vehicle Class to inherit a default rate and category. Set the vehicle's home location. The vehicle becomes Available once saved.

Vehicle Classes (Settings) define default daily/weekly rates and categorize vehicles for utilization and idle reporting.`,
    category: "Fleet Operations",
    tags: ["vehicles", "add", "class", "rate"],
    search_keywords: ["add vehicle", "vehicle class", "rate", "vin"],
    related_routes: ["/vehicles"],
  }),
  article({
    id: "kb_add_customer",
    slug: "adding-a-customer",
    title: "Adding a Customer",
    summary:
      "How to create a customer record and verify their driver license and insurance.",
    body: `Go to Customers and click Add Customer. Enter name, contact details, and driver license information. Customer 360 aggregates the customer's rentals, payments, arrangements, damage claims, violations, and compliance documents in one view.

Driver verification and insurance documents live under the customer profile. Sensitive documents are permission-gated.`,
    category: "Customers & Rentals",
    tags: ["customers", "add", "verification", "insurance"],
    search_keywords: [
      "add customer",
      "driver license",
      "insurance",
      "customer 360",
    ],
    related_routes: ["/customers"],
  }),
  article({
    id: "kb_create_reservation",
    slug: "creating-a-reservation",
    title: "Creating a Reservation",
    summary:
      "How to create a reservation, pick a vehicle, and confirm pricing.",
    body: `Go to Reservations and click New Reservation. Select the customer, vehicle, pickup and return dates, and rate. The Pricing Panel shows the base rate, taxes, and fees. Confirmed reservations can be converted to a rental at checkout.

Reservations move through statuses: pending verification, manual review, confirmed, active, completed, or cancelled.`,
    category: "Reservations",
    tags: ["reservations", "create", "pricing"],
    search_keywords: [
      "create reservation",
      "new reservation",
      "pricing",
      "pickup",
    ],
    related_routes: ["/reservations"],
  }),
  article({
    id: "kb_start_rental",
    slug: "starting-a-rental",
    title: "Starting a Rental",
    summary:
      "How to check out a reservation into an active rental and record the deposit.",
    body: `Open the reservation and click Start Rental to enter the Checkout Workflow. Record mileage out, fuel out, and confirm the agreement is signed. The deposit is collected and held. Start charges (base, taxes, fees) post to the ledger at checkout.

The rental becomes Active and the vehicle becomes Rented.`,
    category: "Checkout",
    tags: ["rentals", "checkout", "start", "deposit"],
    search_keywords: ["start rental", "checkout", "mileage out", "deposit"],
    related_routes: ["/rentals", "/checkout"],
  }),
  article({
    id: "kb_billing_periods",
    slug: "understanding-billing-periods",
    title: "Understanding Billing Periods",
    summary:
      "How billing periods work for weekly and custom rental billing schedules.",
    body: `A Billing Period is a scheduled charge window for an active rental. Weekly billing creates a period every 7 days; custom schedules use installments. Each period has a start, end, base amount, and period days.

Payments Due shows obligations grouped by bucket: due today, due soon, and late. The authoritative late evaluator decides which bucket a period falls into.`,
    category: "Payments & Billing",
    tags: ["billing", "periods", "weekly", "schedule"],
    search_keywords: [
      "billing period",
      "weekly billing",
      "schedule",
      "installments",
    ],
    related_routes: ["/payments-due"],
  }),
  article({
    id: "kb_record_payment",
    slug: "recording-a-payment",
    title: "Recording a Payment",
    summary:
      "How to record a payment against a rental and how it allocates to charges.",
    body: `Open Payments Due or the rental and click Record Payment. Choose the tender method (card, cash, ACH, Zelle, Cash App, external). The payment posts to the authoritative ledger and allocates to the oldest outstanding charges first.

A receipt is generated automatically. Reversed, voided, and held-deposit payments are not counted as collections.`,
    category: "Payments & Billing",
    tags: ["payments", "record", "tender", "receipt"],
    search_keywords: ["record payment", "tender method", "receipt", "allocate"],
    related_routes: ["/payments-due"],
  }),
  article({
    id: "kb_late_payments",
    slug: "how-late-payments-work",
    title: "How Late Payments Work",
    summary:
      "How the late evaluator decides an obligation is late, including grace periods.",
    body: `An obligation is late when the current time passes the due date plus the configured grace period. The exact late evaluator is authoritative — no separate formula. Example: due 2:00 PM with a 30-minute grace is not late at 2:30 PM but is late at 2:31 PM.

Late fees can be assessed and waived. Payment Arrangements let a customer promise to pay overdue amounts on a schedule.`,
    category: "Payments & Billing",
    tags: ["late", "grace", "late fees", "arrangements"],
    search_keywords: ["late payment", "grace period", "late fee", "overdue"],
    related_routes: ["/payments-due", "/payment-arrangements"],
  }),
  article({
    id: "kb_deposits",
    slug: "security-deposits",
    title: "Security Deposits",
    summary: "How deposits are held, applied, refunded, and forfeited.",
    body: `A security deposit is collected at checkout and Held. On return it can be Released, Applied to damage/charges, Refunded, or Forfeited. Deposit policies (Settings) define the required amount per vehicle class.

A held deposit is not revenue and is not counted as a collection. The Deposits page tracks every deposit lifecycle event.`,
    category: "Payments & Billing",
    tags: ["deposits", "held", "refund", "forfeit"],
    search_keywords: ["security deposit", "held", "refund", "forfeit", "apply"],
    related_routes: ["/deposits"],
  }),
  article({
    id: "kb_arrangements",
    slug: "payment-arrangements",
    title: "Payment Arrangements",
    summary: "How to set up a payment arrangement and what breaks one.",
    body: `A Payment Arrangement is a promise to pay overdue amounts in installments. Create one from the customer or rental. Each installment has a due date. If an installment is missed, the arrangement can be marked broken.

Broken arrangements appear on the Executive Dashboard collections health and in Daily Briefing attention items.`,
    category: "Payments & Billing",
    tags: ["arrangements", "installments", "broken", "promise"],
    search_keywords: [
      "payment arrangement",
      "installment",
      "broken",
      "promise to pay",
    ],
    related_routes: ["/payment-arrangements"],
  }),
  article({
    id: "kb_maintenance",
    slug: "managing-maintenance",
    title: "Managing Maintenance",
    summary: "How to create Work Orders, assign vendors, and track downtime.",
    body: `Go to Maintenance to create a Work Order. Assign a vendor, record costs, and upload receipts. A vehicle in maintenance is Blocked from rental availability. Work Orders can be overdue and blocking.

Maintenance cost flows into vehicle profitability and the Executive Dashboard maintenance load.`,
    category: "Fleet Operations",
    tags: ["maintenance", "work order", "vendor", "downtime"],
    search_keywords: [
      "maintenance",
      "work order",
      "vendor",
      "downtime",
      "blocked",
    ],
    related_routes: ["/maintenance"],
  }),
  article({
    id: "kb_damage_claims",
    slug: "managing-damage-claims",
    title: "Managing Damage Claims",
    summary:
      "How to open a damage claim, determine responsibility, and recover costs.",
    body: `A Damage Claim tracks damage to a vehicle. Determine responsibility (customer, insurance, third party). Recovery is the outstanding amount still to be collected. Claims can block a vehicle from rental.

Unrecovered damage recovery appears in Money Left on the Table on the Executive Dashboard.`,
    category: "Fleet Operations",
    tags: ["damage", "claims", "recovery", "insurance"],
    search_keywords: [
      "damage claim",
      "recovery",
      "insurance",
      "responsibility",
    ],
    related_routes: ["/damage-claims"],
  }),
  article({
    id: "kb_violations",
    slug: "managing-tolls-and-violations",
    title: "Managing Tolls & Violations",
    summary:
      "How to import violations, assign responsibility, and charge customers.",
    body: `Tolls and traffic violations are imported or created manually. Assign responsibility (customer or company). Charge the customer through the ledger. Unrecovered customer-responsible amounts appear in Money Left on the Table.

Disputed and overdue violations are tracked separately.`,
    category: "Fleet Operations",
    tags: ["violations", "tolls", "tickets", "responsibility"],
    search_keywords: [
      "violations",
      "tolls",
      "tickets",
      "responsibility",
      "charge",
    ],
    related_routes: ["/violations"],
  }),
  article({
    id: "kb_compliance",
    slug: "documents-and-compliance",
    title: "Documents & Compliance",
    summary:
      "How compliance requirements, document expiration, and vehicle blocking work.",
    body: `Compliance Requirements define required documents per vehicle class. Documents expire and can block a vehicle from rental. The Compliance Center shows blocked vehicles, expired docs, expiring soon, and missing required documents.

Compliance health feeds the Business Health Score.`,
    category: "Fleet Operations",
    tags: ["compliance", "documents", "expired", "blocked"],
    search_keywords: [
      "compliance",
      "documents",
      "expired",
      "blocked",
      "required",
    ],
    related_routes: ["/compliance"],
  }),
  article({
    id: "kb_staff_roles",
    slug: "staff-roles-and-permissions",
    title: "Staff Roles & Permissions",
    summary: "How roles, permissions, and per-user overrides work.",
    body: `System roles (Owner, Manager, User, Partner) have default permissions. Custom roles can be created in Settings. Per-user permission overrides can turn a permission on or off for a specific staff member.

Location scoping limits a staff member to specific locations. Financial and sensitive-document visibility are separately permission-gated.`,
    category: "Account & Settings",
    tags: ["staff", "roles", "permissions", "overrides"],
    search_keywords: ["staff roles", "permissions", "overrides", "locations"],
    related_routes: ["/staff", "/settings"],
  }),
  article({
    id: "kb_customer_360",
    slug: "understanding-customer-360",
    title: "Understanding Customer 360",
    summary:
      "How Customer 360 aggregates a customer's full relationship in one view.",
    body: `Customer 360 brings together a customer's rentals, payments, arrangements, damage claims, violations, compliance documents, and notes. The Unified Timeline shows timestamped events across all modules.

Use it to answer "what's the status of this customer?" without jumping between pages.`,
    category: "Customers & Rentals",
    tags: ["customer 360", "timeline", "overview"],
    search_keywords: ["customer 360", "unified timeline", "customer overview"],
    related_routes: ["/customers"],
  }),
  article({
    id: "kb_fleet_twin",
    slug: "understanding-fleet-digital-twin",
    title: "Understanding the Fleet Digital Twin",
    summary:
      "How the Fleet Digital Twin models availability, utilization, and blockers.",
    body: `The Fleet Digital Twin models each vehicle's availability over time. Utilization is rented days over rentable days. Blocked days merge maintenance, damage, and compliance blockers so one vehicle-day counts once.

Idle vehicles are available but unused. Idle by class and by location help spot supply imbalance.`,
    category: "Fleet Operations",
    tags: ["digital twin", "utilization", "idle", "blocked"],
    search_keywords: [
      "fleet digital twin",
      "utilization",
      "idle",
      "blocked",
      "availability",
    ],
    related_routes: ["/vehicles"],
  }),
  article({
    id: "kb_daily_briefing",
    slug: "using-daily-briefing",
    title: "Using Daily Briefing",
    summary: "How Daily Briefing prioritizes what needs attention today.",
    body: `Daily Briefing surfaces operational priorities: pickups, returns, payments due, overdue accounts, broken arrangements, maintenance attention, and compliance issues. Items are prioritized Critical, High, Medium, or Informational.

The Executive Dashboard's Needs Attention panel reuses Daily Briefing items.`,
    category: "Reporting",
    tags: ["briefing", "priorities", "attention"],
    search_keywords: ["daily briefing", "priorities", "attention", "today"],
    related_routes: ["/briefing"],
  }),
  article({
    id: "kb_fleet_copilot",
    slug: "using-fleet-copilot",
    title: "Using Fleet Copilot",
    summary: "What Fleet Copilot can answer and how it stays source-backed.",
    body: `Fleet Copilot answers operational questions in plain language using authoritative selectors — no LLM is called. Ask "who owes me today?", "what changed since yesterday?", or "why is my Health Score 72?".

Copilot answers are deterministic and source-backed. It will not fabricate data. When it cannot answer, it says so.`,
    category: "Copilot",
    tags: ["copilot", "ai", "questions", "source-backed"],
    search_keywords: ["fleet copilot", "ask", "questions", "ai assistant"],
    featured: true,
    related_routes: ["/copilot"],
  }),
  article({
    id: "kb_executive_dashboard",
    slug: "understanding-the-executive-dashboard",
    title: "Understanding the Executive Dashboard",
    summary:
      "How the Executive Dashboard aggregates collections, utilization, and health.",
    body: `The Executive Dashboard is the owner's operating console. It composes financial, profitability, fleet utilization, idle, money left on the table, business health, and operational load in a single pass.

It is a derived management intelligence layer — it does not create a new financial source of truth.`,
    category: "Reporting",
    tags: ["executive", "dashboard", "owner", "console"],
    search_keywords: ["executive dashboard", "owner console", "command center"],
    featured: true,
    related_routes: ["/executive"],
  }),
  article({
    id: "kb_business_health",
    slug: "understanding-business-health-score",
    title: "Understanding Business Health Score",
    summary:
      "How the Business Health Score is calculated and what each component means.",
    body: `The Business Health Score is a deterministic 0–100 score from five weighted components: Collections Health (30%), Fleet Utilization (25%), Fleet Availability (15%), Compliance Health (15%), and Operational Follow-Through (15%).

Each component is normalized 0–100 from real metrics. The score is transparent and explainable — never a mysterious AI score. Formula version v1.`,
    category: "Reporting",
    tags: ["health", "score", "components", "weights"],
    search_keywords: [
      "business health",
      "health score",
      "grade",
      "components",
      "weights",
    ],
    related_routes: ["/executive"],
  }),
  article({
    id: "kb_money_left_on_table",
    slug: "money-left-on-the-table-explained",
    title: "Money Left on the Table Explained",
    summary:
      "The difference between known recoverable amounts and idle opportunity.",
    body: `Money Left on the Table is an opportunity tracker, not fake loss accounting. Known Recoverable Amount sums only real outstanding amounts: violation recovery, damage recovery, and assessed unpaid late fees.

Idle Fleet Opportunity is shown separately as vehicle counts and idle days — never multiplied into a dollar figure. Deposits held are not revenue opportunity.`,
    category: "Reporting",
    tags: ["money", "recoverable", "idle", "opportunity"],
    search_keywords: [
      "money left on table",
      "recoverable",
      "idle opportunity",
      "opportunity",
    ],
    related_routes: ["/executive"],
  }),
  article({
    id: "kb_report_problem",
    slug: "reporting-a-problem",
    title: "Reporting a Problem",
    summary:
      "How to report a bug, request a feature, or open a support request.",
    body: `Open the Support Center and click Report a Problem. Describe what happened and what you were trying to do. Choose a type (Question, Problem, Bug Report, Feature Request) and category. Optionally include safe diagnostics.

Your request appears under My Support Requests. You can add follow-up comments. Internal notes are never visible to tenant users.`,
    category: "Troubleshooting",
    tags: ["support", "report", "bug", "feature request"],
    search_keywords: [
      "report problem",
      "bug report",
      "feature request",
      "support request",
    ],
    related_routes: ["/support"],
  }),
  article({
    id: "kb_system_health",
    slug: "reading-system-health",
    title: "Reading System Health",
    summary:
      "How to interpret system status, incidents, and maintenance windows.",
    body: `System Status shows each component's level: Operational, Degraded, Partial Outage, Major Outage, Maintenance, or Unknown. In development mode, live monitoring is not configured — Unknown stays Unknown and is not coerced to Operational.

Active incidents show chronological updates. Scheduled maintenance appears separately.`,
    category: "Troubleshooting",
    tags: ["system health", "status", "incidents", "maintenance"],
    search_keywords: [
      "system health",
      "system status",
      "incidents",
      "maintenance",
      "outage",
    ],
    related_routes: ["/support/status"],
  }),
  article({
    id: "kb_contact_support",
    slug: "how-to-contact-support",
    title: "How to Contact Support",
    summary: "How to reach support and what to include in your request.",
    body: `Use the Support Center to open a request. Include what you were trying to do, the product area, and whether you can reproduce the issue. Including diagnostics helps the team troubleshoot faster.

For urgent operational issues, also check Daily Briefing and System Status first.`,
    category: "Troubleshooting",
    tags: ["support", "contact", "help"],
    search_keywords: [
      "contact support",
      "help",
      "support request",
      "reach support",
    ],
    related_routes: ["/support"],
  }),
];

/** Published articles visible to tenant users (drafts/archived excluded). */
export function publishedArticles(): KnowledgeArticle[] {
  return KNOWLEDGE_ARTICLES.filter((a) => a.status === "published");
}

/** Featured articles for the Support home. */
export function featuredArticles(): KnowledgeArticle[] {
  return publishedArticles().filter((a) => a.featured);
}

/** All distinct knowledge categories (published only). */
export function knowledgeCategories(): string[] {
  return Array.from(new Set(publishedArticles().map((a) => a.category)));
}

/** Articles in a given category (published only). */
export function articlesByCategory(category: string): KnowledgeArticle[] {
  return publishedArticles().filter((a) => a.category === category);
}

/** Find a published article by slug. */
export function articleBySlug(slug: string): KnowledgeArticle | undefined {
  return publishedArticles().find((a) => a.slug === slug);
}

/** Articles related to a route (published only). */
export function articlesForRoute(route: string): KnowledgeArticle[] {
  return publishedArticles().filter((a) =>
    a.related_routes.some((r) => route === r || route.startsWith(r)),
  );
}

/** Normalize a string for matching: lowercase, trimmed, collapse spaces. */
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Deterministic knowledge search. Ranks: exact title > keyword/tag > summary > body. */
export function searchKnowledge(
  query: string,
  limit = 10,
): SupportKnowledgeContext {
  const q = norm(query);
  const matches: SupportKnowledgeMatch[] = [];
  if (!q) {
    return {
      query,
      matches: [],
      total_articles_searched: publishedArticles().length,
    };
  }
  const terms = q.split(" ").filter(Boolean);

  for (const a of publishedArticles()) {
    const title = norm(a.title);
    const summary = norm(a.summary);
    const body = norm(a.body);
    const tags = a.tags.map(norm);
    const keywords = a.search_keywords.map(norm);
    const matchedFields: string[] = [];
    let score = 0;

    if (title === q) {
      score += 100;
      matchedFields.push("title");
    } else if (title.includes(q)) {
      score += 60;
      matchedFields.push("title");
    }
    for (const t of terms) {
      if (title.includes(t)) score += 5;
    }

    for (const k of keywords) {
      if (k === q) {
        score += 50;
        if (!matchedFields.includes("keyword")) matchedFields.push("keyword");
      } else if (k.includes(q)) {
        score += 30;
        if (!matchedFields.includes("keyword")) matchedFields.push("keyword");
      }
    }
    for (const t of tags) {
      if (t === q) {
        score += 45;
        if (!matchedFields.includes("tag")) matchedFields.push("tag");
      } else if (t.includes(q)) {
        score += 25;
        if (!matchedFields.includes("tag")) matchedFields.push("tag");
      }
    }

    if (summary.includes(q)) {
      score += 20;
      matchedFields.push("summary");
    } else {
      for (const t of terms) if (summary.includes(t)) score += 3;
    }

    if (body.includes(q)) {
      score += 10;
      matchedFields.push("body");
    } else {
      for (const t of terms) if (body.includes(t)) score += 1;
    }

    if (score > 0) {
      const idx = body.includes(q) ? body.indexOf(q) : 0;
      const start = Math.max(0, idx - 40);
      const excerpt = body.slice(start, start + 120).trim();
      matches.push({
        article_id: a.id,
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        category: a.category,
        product_area: a.product_area,
        score,
        matched_fields: matchedFields,
        related_routes: a.related_routes,
        excerpt,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return {
    query,
    matches: matches.slice(0, limit),
    total_articles_searched: publishedArticles().length,
  };
}

/** Build the structured support knowledge context (no LLM). */
export function buildSupportKnowledgeContext(
  query: string,
  limit = 10,
): SupportKnowledgeContext {
  return searchKnowledge(query, limit);
}

// ---------------------------------------------------------------------------
// Article feedback (in-memory/session — no ticket auto-created)
// ---------------------------------------------------------------------------

const feedbackStore: ArticleFeedbackEntry[] = [];

export function recordArticleFeedback(
  articleId: string,
  helpful: boolean,
  userReference: string | null,
  now: Date = new Date(),
): void {
  feedbackStore.push({
    article_id: articleId,
    helpful,
    at: now.toISOString(),
    user_reference: userReference,
  });
}

export function articleFeedback(articleId: string): ArticleFeedbackEntry[] {
  return feedbackStore.filter((f) => f.article_id === articleId);
}

/** Reset feedback store (test helper). */
export function resetArticleFeedback(): void {
  feedbackStore.length = 0;
}

// ---------------------------------------------------------------------------
// Product-help intent detection (deterministic foundation)
// ---------------------------------------------------------------------------

const PRODUCT_HELP_PATTERNS = [
  /^\s*how (do|to|can) i\b/i,
  /^\s*where (do|to|can) i\b/i,
  /^\s*how does\b/i,
  /^\s*why can'?t i\b/i,
  /^\s*what does (this|the) .* (mean|do)\b/i,
  /^\s*what is\b/i,
  /^\s*explain\b/i,
  /\bhelp (me )?(understand|with|on)\b/i,
];

const OPERATIONAL_PATTERNS = [
  /\bwho owes\b/i,
  /\bhow much\b/i,
  /\bwhat changed\b/i,
  /\bwhat happened\b/i,
  /\bhealth score\b/i,
  /\bmoney left\b/i,
  /\butilization\b/i,
  /\boverdue\b/i,
  /\bidle\b/i,
];

/** True when a query looks like a product-help question (vs operational). */
export function isProductHelpQuery(query: string): boolean {
  if (!query || !query.trim()) return false;
  if (OPERATIONAL_PATTERNS.some((re) => re.test(query))) return false;
  return PRODUCT_HELP_PATTERNS.some((re) => re.test(query));
}
