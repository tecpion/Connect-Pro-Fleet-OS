// Connect Pro Fleet — Copilot domain types (Build #29).
//
// The Copilot is a permission-aware operational assistant. It is NOT a source of
// truth — it understands the user's question and presents/explains the
// authoritative results from existing selectors (billing, late evaluator, Daily
// Briefing, Customer 360, Fleet Digital Twin, compliance, maintenance,
// violations, damage). Every operational answer retains source references so the
// user can trace "why" back to the authoritative record. No LLM is called in
// Phase 1; a future server-backed provider can phrase the structured answers
// conversationally. No client-side API secrets.

import type {
  BriefingSources,
  BriefingViewerPermissions,
} from "./briefingTypes";
import type { Customer360Sources } from "./customer360Selectors";
import type { VehicleTwinSources } from "./vehicleTwinSelectors";
import type { TimelineSources } from "./timelineComposer";
import type { DomainTimeRange } from "./copilotDomainRouter";

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

export type CopilotIntent =
  // Daily operations
  | "daily_priorities"
  | "todays_summary"
  | "recent_changes"
  | "end_of_day_recap"
  | "morning_ops_briefing"
  | "weekly_review"
  | "executive_focus"
  // Payments
  | "money_due_today"
  | "overdue_accounts"
  | "customer_balance"
  | "payments_received_today"
  | "broken_arrangements"
  | "collections_rank"
  // Rentals
  | "rentals_starting_today"
  | "rentals_returning_today"
  | "overdue_returns"
  | "rental_status"
  // Vehicles
  | "idle_vehicles"
  | "vehicle_status"
  | "vehicle_unavailable_reason"
  | "blocked_vehicles"
  | "vehicle_utilization"
  | "fleet_utilization"
  | "vehicle_profitability"
  | "vehicle_history"
  | "fleet_count"
  | "popular_vehicle"
  | "earnings_summary"
  | "deposit_summary"
  | "open_tasks"
  | "finance_overview"
  | "active_rentals"
  | "historical_returns"
  | "vehicle_additions"
  | "create_reminder"
  // Customers
  | "customer_summary"
  | "customer_payment_status"
  | "customer_rental_history"
  | "customer_damage_history"
  | "customer_violation_history"
  | "customer_compliance"
  // Maintenance
  | "maintenance_attention"
  | "vehicle_maintenance_history"
  // Damage
  | "open_damage_claims"
  | "customer_damage_claims"
  | "vehicle_damage_claims"
  // Compliance
  | "compliance_attention"
  | "expiring_documents"
  | "blocked_by_compliance"
  // Violations
  | "violation_attention"
  | "unresolved_violations"
  // Staff / work
  | "my_priorities"
  | "needs_assignment"
  | "overdue_tasks"
  // Executive (Build #30)
  | "executive_summary"
  | "business_health"
  | "health_score_explanation"
  | "improve_health"
  | "money_left_on_table"
  | "fleet_performance"
  | "utilization_explanation"
  | "collections_summary"
  // Banking (Build #42)
  | "banking_needs_review"
  | "banking_unmatched_out"
  | "banking_unmatched_in"
  | "banking_duplicate_expenses"
  | "banking_statements_attention"
  | "banking_suggested_matches"
  // Compound / business summary (Build #40 — natural voice)
  | "compound_query"
  | "business_summary"
  // Follow-up meta (Build #33)
  | "why"
  | "product_help_handoff"
  // Defense record (Build #52) — factual evidence questions. Copilot NEVER
  // concludes legal liability / Graves protection; it summarizes the factual
  // records and recommends legal review for legal-conclusion questions.
  | "rentals_missing_license_verification"
  | "active_rentals_without_checkout"
  | "authorized_driver_check"
  | "vehicles_released_with_maintenance_warning"
  | "incidents_missing_police_reports"
  | "generate_documentation_package"
  | "rental_defense_record"
  | "driver_authorization_check"
  | "release_insurance_status"
  | "release_safety_maintenance"
  // Case Center (Build #54) — operational case-management questions. Copilot
  // answers from authoritative case/rental selectors; never a legal conclusion.
  | "cases_need_attention"
  | "unresolved_tolls"
  | "toll_reimbursements_owed"
  | "disputed_charges"
  | "unrecovered_amount"
  | "deposits_waiting_review"
  | "case_for_entity"
  // Booking Requests (Build #62 — CRM handoff). Intake questions answered from
  // the authoritative BookingRequest store; a request is never a Reservation.
  | "booking_requests_new"
  | "booking_requests_follow_up"
  | "booking_requests_waitlisted"
  | "booking_requests_today"
  | "booking_request_summary"
  // Telematics (V1 Telematics Hub) — GPS visibility/monitoring/history/alerts.
  | "telematics_vehicle_location"
  | "telematics_offline_devices"
  | "telematics_stale_locations"
  | "telematics_rental_alerts"
  | "telematics_no_device"
  | "telematics_outside_geofence"
  | "telematics_trips_for_vehicle"
  | "telematics_last_seen"
  | "telematics_summary"
  // Customer Verification (V1) — optional paid third-party checks. Copilot
  // distinguishes optional vs required; never reports an optional unrun check
  // as a missing requirement.
  | "verification_blocked"
  | "verification_needs_review"
  | "verification_expired_licenses"
  | "verification_usage"
  | "verification_customer_summary"
  | "verification_no_history"
  // V1 Tolls & Violations Automation — Copilot answers from normalized
  // violation records via possession matching. Never infers responsibility
  // without possession evidence.
  | "tolls_unmatched"
  | "violations_need_review"
  | "tolls_for_customer_rental"
  | "toll_possession_at_event"
  | "tolls_unrecovered"
  | "tolls_paid_this_month"
  | "tolls_recovered_amount"
  | "violations_due_this_week"
  | "customers_disputed_violations"
  // Conversational (social) — handled before entity resolution
  | "greeting"
  | "thanks"
  | "goodbye"
  | "affirmation"
  // Meta
  | "help"
  | "unsupported";

export const COPILOT_INTENT_LABELS: Partial<Record<CopilotIntent, string>> = {
  daily_priorities: "What should I focus on today?",
  todays_summary: "Today's summary",
  recent_changes: "What changed since yesterday?",
  end_of_day_recap: "How did today go?",
  morning_ops_briefing: "Give me my morning briefing",
  weekly_review: "Give me my weekly owner report",
  executive_focus: "What should I focus on?",
  money_due_today: "Who owes me money today?",
  overdue_accounts: "Who is already late?",
  customer_balance: "What does this customer owe?",
  payments_received_today: "Payments received today",
  broken_arrangements: "Broken payment arrangements",
  collections_rank: "Who should collections follow up with first?",
  rentals_starting_today: "What rentals start today?",
  rentals_returning_today: "What returns are due today?",
  overdue_returns: "Overdue returns",
  rental_status: "Rental status",
  idle_vehicles: "Which cars are sitting?",
  fleet_count: "How many vehicles are in my fleet?",
  popular_vehicle: "What's my most popular vehicle?",
  vehicle_status: "What's going on with this vehicle?",
  vehicle_unavailable_reason: "Why is this vehicle unavailable?",
  blocked_vehicles: "Which vehicles are blocked?",
  vehicle_utilization: "Vehicle utilization",
  fleet_utilization: "What's my fleet utilization?",
  earnings_summary: "How much did I earn?",
  deposit_summary: "How much do I have in deposits?",
  open_tasks: "Do I have any open tasks?",
  finance_overview: "Give me a finance overview",
  active_rentals: "How many active rentals do I have?",
  historical_returns: "How many returns did I have?",
  vehicle_additions: "Any new vehicles added?",
  create_reminder: "Remind me to do something",
  vehicle_profitability: "How profitable is this vehicle?",
  vehicle_history: "Vehicle history",
  customer_summary: "What's going on with this customer?",
  customer_payment_status: "Customer payment status",
  customer_rental_history: "Customer rental history",
  customer_damage_history: "Customer damage history",
  customer_violation_history: "Customer violation history",
  customer_compliance: "Customer compliance",
  maintenance_attention: "Maintenance attention",
  vehicle_maintenance_history: "Vehicle maintenance history",
  open_damage_claims: "Open damage claims",
  customer_damage_claims: "Customer damage claims",
  vehicle_damage_claims: "Vehicle damage claims",
  compliance_attention: "Compliance attention",
  expiring_documents: "Expiring documents",
  blocked_by_compliance: "Blocked by compliance",
  violation_attention: "Violation attention",
  unresolved_violations: "Unresolved violations",
  my_priorities: "What should I work on?",
  needs_assignment: "Needs assignment",
  overdue_tasks: "Overdue tasks",
  executive_summary: "Give me my executive summary",
  business_health: "How is my business health?",
  health_score_explanation: "Why is my Health Score down?",
  improve_health: "How do I improve my Health Score?",
  money_left_on_table: "Where am I leaving money on the table?",
  fleet_performance: "Which vehicles are underperforming?",
  utilization_explanation: "What's hurting utilization?",
  collections_summary: "Where is money still outstanding?",
  banking_needs_review: "Which bank transactions need review?",
  banking_unmatched_out: "How much money out is unmatched?",
  banking_unmatched_in: "How much money in is unmatched?",
  banking_duplicate_expenses: "Are there possible duplicate expenses?",
  banking_statements_attention: "Which statements need attention?",
  banking_suggested_matches: "Which transactions have suggested matches?",
  compound_query: "Combined question",
  business_summary: "Tell me about my numbers",
  why: "Why?",
  product_help_handoff: "Product help",
  rentals_missing_license_verification: "Rentals missing license verification",
  active_rentals_without_checkout: "Active rentals without checkout inspection",
  authorized_driver_check:
    "Does this rental have an authorized additional driver?",
  vehicles_released_with_maintenance_warning:
    "Vehicles released with a maintenance warning",
  incidents_missing_police_reports: "Incidents missing police reports",
  generate_documentation_package:
    "Create the documentation package for this accident",
  rental_defense_record: "Show me the Rental Record for this rental",
  driver_authorization_check: "Was this driver authorized?",
  release_insurance_status:
    "What was the insurance status when this vehicle was released?",
  release_safety_maintenance:
    "Were there open safety maintenance issues at checkout?",
  cases_need_attention: "What cases need my attention?",
  unresolved_tolls: "Do I have unresolved tolls?",
  toll_reimbursements_owed: "Which customers owe toll reimbursements?",
  disputed_charges: "Show me disputed charges.",
  unrecovered_amount: "How much is unrecovered?",
  deposits_waiting_review: "Which deposits are waiting for review?",
  case_for_entity: "Tell me about this customer/rental's cases",
  booking_requests_new: "How many new booking requests do I have?",
  booking_requests_follow_up: "Which booking requests need follow-up?",
  booking_requests_waitlisted: "Do I have waitlisted customers?",
  booking_requests_today: "Show me requests submitted today.",
  booking_request_summary: "Tell me about this booking request.",
  // Telematics (V1) — GPS visibility/monitoring/history/alerts.
  telematics_vehicle_location: "Where is this vehicle?",
  telematics_offline_devices: "Which GPS devices are offline?",
  telematics_stale_locations: "Which vehicles haven't reported recently?",
  telematics_rental_alerts: "Which rented vehicles have GPS alerts?",
  telematics_no_device: "Which vehicles have no GPS device installed?",
  telematics_outside_geofence: "Which vehicles are outside their allowed area?",
  telematics_trips_for_vehicle: "Show trips for this vehicle.",
  telematics_last_seen: "When was this vehicle last seen?",
  telematics_summary: "Tell me about this vehicle's telematics.",
  // Customer Verification (V1).
  verification_blocked: "Which rentals are blocked by verification?",
  verification_needs_review: "Which required checks need staff review?",
  verification_expired_licenses: "Which customers have expired licenses?",
  verification_usage: "How much verification usage this month?",
  verification_customer_summary: "Tell me about this customer's verification.",
  verification_no_history: "Which customers have no verification history?",
  // V1 Tolls & Violations Automation.
  tolls_unmatched: "Which tolls are unmatched?",
  violations_need_review: "Which violations need review?",
  tolls_for_customer_rental: "What tolls belong to this rental?",
  toll_possession_at_event: "Who had this vehicle when this ticket occurred?",
  tolls_unrecovered: "Which tolls haven't been recovered?",
  tolls_paid_this_month: "How much have we paid in tolls this month?",
  tolls_recovered_amount: "How much have we recovered?",
  violations_due_this_week: "Show violations due this week.",
  customers_disputed_violations: "Which customers have disputed violations?",
  greeting: "Hi",
  thanks: "Thanks",
  goodbye: "Goodbye",
  affirmation: "Got it",
  help: "What can you help me with?",
};

// ---------------------------------------------------------------------------
// Sources / answers
// ---------------------------------------------------------------------------

export interface CopilotSource {
  source_module: string;
  entity_type: string;
  entity_id: string;
  label: string;
  deep_link: string | null;
  occurred_at?: string | null;
  field_context?: string | null;
}

export interface CopilotSuggestedAction {
  label: string;
  action_type: string;
  deep_link?: string | null;
}

/** Build #33 — a Create-Task preview row. The Copilot never mutates; it
 *  prepares a bounded preview the user confirms (with assignment / due date /
 *  priority) before the existing Task domain creates anything. */
export interface CopilotTaskPreviewItem {
  /** Stable occurrence/source id (used for dedupe against existing open tasks). */
  occurrence_id: string;
  title: string;
  /** Suggested task description (factual). */
  description: string;
  entity_type: string;
  entity_id: string;
  deep_link: string | null;
}

/** Build #33 — a draft customer message. The Copilot drafts but never sends.
 *  Uses factual fields only (no invented discounts/threats/policies). */
export interface CopilotDraftMessage {
  customer_id: string;
  customer_name: string;
  subject: string;
  body: string;
  /** Deep link to the customer (for review). */
  deep_link: string | null;
}

export interface CopilotFact {
  label: string;
  value: string | number;
  financial?: boolean;
}

export interface CopilotAnswerItem {
  id: string;
  title: string;
  subtitle?: string | null;
  amount?: number | null;
  due_at?: string | null;
  occurred_at?: string | null;
  status?: string | null;
  deep_link?: string | null;
}

export type CopilotAnswerType =
  "summary" | "list" | "entity" | "disambiguation" | "help" | "fallback";

export type CopilotConfidenceType = "deterministic" | "derived" | "ai_assisted";

export interface CopilotAnswer {
  intent: CopilotIntent;
  answer_type: CopilotAnswerType;
  summary: string;
  facts: CopilotFact[];
  items: CopilotAnswerItem[];
  sources: CopilotSource[];
  suggested_actions: CopilotSuggestedAction[];
  caveats: string[];
  generated_at: string;
  as_of: string;
  permission_filtered: boolean;
  confidence_type: CopilotConfidenceType;
  /** Disambiguation options (answer_type === "disambiguation"). */
  options?: { entity_type: string; entity_id: string; label: string }[];
  /** Build #33 — Create-Task preview (confirm before mutation). */
  task_preview?: CopilotTaskPreviewItem[];
  /** Build #33 — draft customer messages (review/edit/copy, never auto-send). */
  draft_messages?: CopilotDraftMessage[];
}

// ---------------------------------------------------------------------------
// Messages / conversation
// ---------------------------------------------------------------------------

export type CopilotRole = "user" | "assistant" | "system";

export interface CopilotMessage {
  id: string;
  role: CopilotRole;
  content: string;
  created_at: string;
  status: "pending" | "complete" | "error";
  answer_type?: CopilotAnswerType;
  intent?: CopilotIntent;
  sources?: CopilotSource[];
  suggested_actions?: CopilotSuggestedAction[];
  answer?: CopilotAnswer;
  error?: string;
  feedback?: "helpful" | "not_helpful" | null;
  feedback_reason?: string | null;
  /** Build #53 — INTERNAL routing-debug trace for the founder/developer panel.
   *  Only present when the internal debug flag is ON. Contains safe display
   *  labels only (no ids, no secrets, no full VINs). Never alters the answer. */
  routing_debug?: CopilotRoutingDebug | null;
}

// ---------------------------------------------------------------------------
// Build #53 — INTERNAL routing-debug trace (founder/developer diagnostics).
// Defined here (the canonical types module) so CopilotMessage can reference it
// without a circular import. The trace is built by copilotDebug.ts from safe
// display labels only — it never carries API keys, JWTs, Supabase secrets,
// internal database ids, full VINs, raw financial payloads, or unrestricted
// conversation context.
// ---------------------------------------------------------------------------

export interface CopilotRoutingDebugEntity {
  /** Safe display label only — never an internal id. */
  type: string;
  label: string;
  resolution: "matched" | "ambiguous" | "no_match";
}

export interface CopilotRoutingDebugEntityHint {
  type: string;
  /** Safe semantic label (name / make-model / plate / rental number). Never a
   *  full VIN and never an internal id. */
  label: string;
}

export interface CopilotRoutingDebug {
  /** Which path produced the final answer. */
  providerPath: "deterministic" | "llm" | "llm_fallback";
  /** The raw user query (already visible in the chat — not a secret). */
  rawQuery: string;
  /** Normalized query if deterministic normalization changed it, else null. */
  normalizedQuery: string | null;
  /** Coarse resolved domain (money / rentals / fleet / …). */
  domain: string | null;
  /** Final resolved intent. */
  intent: CopilotIntent | null;
  /** LLM confidence (0..1) when the LLM path was used, else null. */
  confidence: number | null;
  scope: string | null;
  requestType: string | null;
  timeRange: string | null;
  /** Semantic entity hints from the LLM (safe labels only). Empty for the
   *  deterministic path. */
  entityHints: CopilotRoutingDebugEntityHint[];
  /** Deterministically resolved entity (safe label + resolution result). */
  resolvedEntity: CopilotRoutingDebugEntity | null;
  /** Follow-up context used (prior intent + prior entity label). */
  followUpContext: {
    priorIntent: string | null;
    priorEntityLabel: string | null;
    priorTimeRange: string | null;
  } | null;
  /** Final handler/tool label selected. */
  handler: string | null;
  /** Why the LLM classification was rejected / unavailable, when applicable. */
  fallbackReason: string | null;
  /** Classification + dispatch latency in ms, when measurable. */
  latencyMs: number | null;
}

/** A follow-up filter applied to a prior result set (Build #33). Bounded —
 *  only the last meaningful turn's filter is retained so memory never grows
 *  unbounded. Filters are deterministic (amount threshold, age, arrangement,
 *  location) and never store raw sensitive answer content. */
export interface CopilotFollowUpFilter {
  /** Minimum amount (e.g. "over $500"). Null = no amount filter. */
  min_amount?: number | null;
  /** Minimum days late (e.g. "more than 7 days"). Null = no age filter. */
  min_days_late?: number | null;
  /** Restrict to accounts with a payment arrangement. */
  has_arrangement?: boolean | null;
  /** Restrict to a location id (location follow-up). */
  location_id?: string | null;
  /** Restrict to a vehicle class. */
  vehicle_class?: string | null;
}

export interface CopilotConversation {
  id: string;
  messages: CopilotMessage[];
  /** Current entity context (last resolved customer/vehicle/rental). */
  context_customer_id?: string | null;
  context_vehicle_id?: string | null;
  context_rental_id?: string | null;
  context_label?: string | null;
  /** Build #33 — the prior intent (for "why?" and follow-up filtering). */
  context_prior_intent?: CopilotIntent | null;
  /** Build #33 — entity ids from the prior answer's result set, so a follow-up
   *  ("only the ones over $500") can filter that set rather than re-scan. */
  context_prior_result_ids?: string[] | null;
  /** Build #33 — the active follow-up filter applied to the prior result. */
  context_followup_filter?: CopilotFollowUpFilter | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Provider boundary
// ---------------------------------------------------------------------------

/** Build #50 — LLM classification output. The LLM decides ONLY which intent +
 *  scope + time range + semantic entity hints to use; it never computes
 *  business values and never returns trusted internal entity IDs. Entity
 *  resolution is always re-run by the deterministic Fleet resolver. */
export interface LlmEntityHint {
  type: "customer" | "vehicle" | "rental";
  /** Semantic match hints — never an internal database id. The deterministic
   *  resolver uses these to find the real record (name, make/model, plate, …). */
  customerName?: string;
  makeOrModel?: string;
  plate?: string;
  vin?: string;
  rentalNumber?: string;
}

export type LlmScope =
  "fleet_wide" | "company_wide" | "location" | "list" | "specific_record";

export type LlmRequestType =
  | "aggregate_metric"
  | "count"
  | "list"
  | "ranking"
  | "status"
  | "specific_record"
  | "summary"
  | "historical_activity"
  | "create_action"
  | "follow_up";

export interface LlmClassification {
  intent: CopilotIntent;
  /** Semantic hints only — never trusted internal ids. */
  entityHints: LlmEntityHint[];
  scope: LlmScope;
  timeRange: DomainTimeRange | null;
  requestType: LlmRequestType;
  /** 0..1 — below the threshold the classifier returns null (deterministic
   *  fallback). A wrong confident answer is worse than a clarification. */
  confidence: number;
}

/** A minimal, permission-safe conversational context snapshot sent to the LLM
 *  so it can resolve follow-ups ("it", "that", "today"). Never includes raw
 *  sensitive answer content, amounts, or unrestricted application data. */
export interface LlmConversationContext {
  /** The last user utterance (truncated). */
  lastUserQuery: string | null;
  /** The prior resolved intent (so "today" can be applied as a modifier). */
  priorIntent: CopilotIntent | null;
  /** A human label for the last-discussed entity, if any (no internal id). */
  priorEntityLabel: string | null;
  priorEntityType: "customer" | "vehicle" | "rental" | null;
}

export interface CopilotLanguageProvider {
  /** Interpret a free-text query into an intent + entity refs (future server). */
  interpretQuery?: (
    query: string,
    context: CopilotConversation,
  ) => Promise<{ intent: CopilotIntent; entityRefs: EntityRef[] }>;
  /** Build #50 — classify a natural-language query into a structured
   *  classification (intent + semantic entity hints + scope + time range).
   *  Returns null when the provider is unavailable / low-confidence / invalid.
   *  The LLM never returns trusted internal ids — only semantic hints. */
  classifyIntent?: (
    query: string,
    context: LlmConversationContext,
  ) => Promise<LlmClassification | null>;
  /** Phrase a structured answer conversationally (future server). */
  summarizeStructuredAnswer?: (answer: CopilotAnswer) => Promise<string>;
  /** Generate an end-of-day recap narrative (future server). */
  generateRecap?: (ctx: unknown) => Promise<string>;
}

export interface EntityRef {
  type: "customer" | "vehicle" | "rental";
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Sources bundle passed into the engine
// ---------------------------------------------------------------------------

export interface CopilotSources {
  briefing: BriefingSources;
  customer360: Customer360Sources;
  vehicleTwin: VehicleTwinSources;
  timeline: TimelineSources;
  /** Build #52 — Rental Risk & Defense Record. The authoritative records the
   *  defense-record Copilot handlers operate on (derived — never duplicates
   *  source-of-truth). Optional so non-defense tests can omit it; defense
   *  handlers return a graceful fallback when absent. */
  defense?: import("./defenseTypes").DefenseSources;
  /** Build #54 — Case Center. The authoritative records the case Copilot
   *  handlers operate on (derived — never duplicates source-of-truth).
   *  Optional so non-case tests can omit it; case handlers return a graceful
   *  fallback when absent. */
  caseCenter?: import("./caseCenterTypes").CaseCenterSources;
  /** Build #62 — Booking Request (CRM handoff). The authoritative BookingRequest
   *  records the booking Copilot handlers read from. Optional so non-booking
   *  tests can omit it; booking handlers return a graceful fallback when absent. */
  booking?: import("./bookingRequestTypes").BookingCopilotSources;
  /** V1 Telematics Hub — normalized GPS/telematics records the telematics
   *  Copilot handlers read from. Optional so non-telematics tests can omit it;
   *  telematics handlers return a graceful fallback when absent. Answers come
   *  from normalized Fleet data — never raw provider secrets/credentials. */
  telematics?: import("./copilotTelematicsHandlers").TelematicsCopilotSources;
  /** V1 Customer Verification — optional paid third-party check records the
   *  verification Copilot handlers read from. Optional so non-verification tests
   *  can omit it; verification handlers return a graceful fallback when absent.
   *  Answers come from normalized Fleet data — never provider secrets. */
  verification?: import("./copilotVerificationHandlers").VerificationCopilotSources;
  /** V1 Tolls & Violations Automation — normalized violation records the toll
   *  Copilot handlers read from. Optional so non-toll tests can omit it; toll
   *  handlers return a graceful fallback when absent. Answers come from
   *  normalized Fleet violation data via possession matching — never raw
   *  provider secrets. */
  tolls?: import("./copilotTollHandlers").TollsCopilotSources;
}

/** Viewer permissions reused from Build #27/#28. */
export type CopilotViewerPermissions = BriefingViewerPermissions;

export interface CopilotQueryContext {
  asOf: Date;
  perms: CopilotViewerPermissions;
  staffId: string;
  tenantId: string;
  /** Location ids the viewer may see (empty = all). */
  allowedLocationIds: string[];
}

// ---------------------------------------------------------------------------
// Server-boundary contract (future POST /api/copilot). Documented only — the
// payload must be permission-filtered BEFORE it leaves the browser. No client
// secrets are involved; production AI requests go through a protected backend.
// ---------------------------------------------------------------------------

export interface CopilotServerRequest {
  intent: CopilotIntent;
  entity_refs: EntityRef[];
  permission_filtered_context: unknown;
  as_of: string;
  tenant_id: string;
  generated_for_user_id: string;
}

export interface CopilotServerProvider extends CopilotLanguageProvider {
  endpoint: string;
  /** Whether a real server provider is configured (false in Phase 1). */
  available: boolean;
}

/** The deterministic provider — always available, no secrets, no network. */
export const DETERMINISTIC_PROVIDER: CopilotServerProvider = {
  endpoint: "",
  available: false,
};
