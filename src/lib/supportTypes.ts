// Connect Pro Fleet — Support Center domain types (Build #31).
//
// The Support Center is a PRODUCT-SUPPORT layer — it is NOT a new operational
// rental source of truth. Support tickets capture customer-reported product/
// support issues; system incidents capture Connect Pro Fleet service
// conditions; knowledge-base articles hold product-help content; release
// notes communicate product updates. The Support Center brings these together.
//
// Critical distinction: rental-company Owners/Managers are NOT platform
// administrators. Tenant users never see another tenant's tickets, internal
// notes, or platform-agent metadata. Internal/future fields are modeled but
// never exposed to tenant UI.

// ---------------------------------------------------------------------------
// App / build version
// ---------------------------------------------------------------------------

export const APP_VERSION = "0.31.0";
export const APP_BUILD_LABEL = "Build #31";
export const APP_ENVIRONMENT = "Development";

// ---------------------------------------------------------------------------
// Support ticket
// ---------------------------------------------------------------------------

export type SupportTicketType =
  | "question"
  | "problem"
  | "bug_report"
  | "feature_request"
  | "account_help"
  | "data_issue"
  | "integration_issue"
  | "other";

export type SupportCategory =
  | "customers"
  | "rentals"
  | "reservations"
  | "vehicles"
  | "payments"
  | "billing"
  | "maintenance"
  | "damage"
  | "violations"
  | "compliance"
  | "documents"
  | "reports"
  | "dashboard"
  | "copilot"
  | "staff_permissions"
  | "settings"
  | "integrations"
  | "login_access"
  | "performance"
  | "other";

export type SupportTicketStatus =
  | "open"
  | "in_review"
  | "waiting_on_customer"
  | "in_progress"
  | "resolved"
  | "closed";

export type SupportPriority = "low" | "normal" | "high" | "urgent";

export type BugSeverity = "minor" | "major" | "blocking";

export type SupportTicketSource = "in_app" | "email" | "api" | "imported";

export interface TicketEntityContext {
  entity_type: string;
  entity_id: string;
  human_label: string;
  deep_link: string;
}

export interface SupportTicket {
  id: string;
  tenant_id: string;
  ticket_number: string;
  requester_user_id: string;
  requester_name: string;
  requester_email: string | null;
  ticket_type: SupportTicketType;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  product_area: string;
  entity_context: TicketEntityContext | null;
  route_context: string | null;
  diagnostics_snapshot_id: string | null;
  // Bug-report-specific optional fields.
  bug_severity: BugSeverity | null;
  reproducible: boolean | null;
  repro_steps: string | null;
  screenshot_ref: string | null;
  contact_preference: string | null;
  // Future internal platform-support fields — NEVER exposed to tenant UI.
  assigned_platform_agent_id: string | null;
  internal_priority: SupportPriority | null;
  internal_notes: string | null;
  linked_incident_id: string | null;
  linked_bug_id: string | null;
  resolution_code: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  last_activity_at: string;
  source: SupportTicketSource;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Support comments
// ---------------------------------------------------------------------------

export type SupportCommentAuthorType =
  "tenant_user" | "platform_support" | "system";

export interface SupportComment {
  id: string;
  ticket_id: string;
  tenant_id: string;
  author_type: SupportCommentAuthorType;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  internal_only: boolean;
  attachment_refs: string[];
}

// ---------------------------------------------------------------------------
// Ticket history (audit timeline — never overwritten)
// ---------------------------------------------------------------------------

export type TicketHistoryEventType =
  | "created"
  | "status_changed"
  | "comment_added"
  | "attachment_added"
  | "resolved"
  | "reopened"
  | "priority_changed";

export interface TicketHistoryEvent {
  id: string;
  ticket_id: string;
  tenant_id: string;
  event_type: TicketHistoryEventType;
  detail: string;
  actor_id: string;
  actor_name: string;
  at: string;
}

// ---------------------------------------------------------------------------
// Diagnostics snapshot (safe — secrets excluded)
// ---------------------------------------------------------------------------

export interface DiagnosticsSnapshot {
  id: string;
  tenant_id: string;
  created_at: string;
  app_version: string;
  build_label: string;
  environment: string;
  route: string | null;
  browser: string | null;
  platform: string | null;
  viewport: string | null;
  tenant_reference: string | null;
  user_reference: string | null;
  selected_location: string | null;
  storage_mode: string;
  backend_mode: string;
  network_state: string | null;
  recent_safe_errors: string[];
  metadata: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export type KnowledgeArticleStatus = "draft" | "published" | "archived";

export type KnowledgeAudience =
  "all_staff" | "owners" | "managers" | "customer" | "both";

export interface KnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  product_area: string;
  audience: KnowledgeAudience;
  status: KnowledgeArticleStatus;
  version: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  related_routes: string[];
  related_article_ids: string[];
  search_keywords: string[];
  featured: boolean;
  author_reference: string | null;
}

export interface ArticleFeedbackEntry {
  article_id: string;
  helpful: boolean;
  at: string;
  user_reference: string | null;
}

// ---------------------------------------------------------------------------
// System Health
// ---------------------------------------------------------------------------

export type SystemStatusLevel =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
  | "unknown";

export type SystemComponentKey =
  | "web_app"
  | "authentication"
  | "database"
  | "file_storage"
  | "billing_payments"
  | "notifications"
  | "connect_pro_sync"
  | "copilot"
  | "reporting";

export type SystemStatusSource =
  "manual" | "development" | "monitoring" | "backend";

export interface SystemComponentStatus {
  key: SystemComponentKey;
  label: string;
  status: SystemStatusLevel;
  source: SystemStatusSource;
  checked_at: string;
  message: string | null;
}

export type IncidentStatus =
  "investigating" | "identified" | "monitoring" | "resolved";

export type IncidentSeverity = "minor" | "major" | "critical";

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  status: IncidentStatus;
  message: string;
  at: string;
}

export interface SystemIncident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  affected_components: SystemComponentKey[];
  started_at: string;
  resolved_at: string | null;
  summary: string;
  updates: IncidentUpdate[];
  source: SystemStatusSource;
  public: boolean;
  created_at: string;
}

export interface MaintenanceNotice {
  id: string;
  title: string;
  starts_at: string;
  expected_end_at: string;
  affected_components: SystemComponentKey[];
  description: string;
}

export interface KnownIssue {
  id: string;
  title: string;
  description: string;
  affected_components: SystemComponentKey[];
  severity: IncidentSeverity;
  status: "open" | "resolved";
  created_at: string;
}

export interface SystemHealthSnapshot {
  overall: SystemStatusLevel;
  components: SystemComponentStatus[];
  active_incidents: SystemIncident[];
  scheduled_maintenance: MaintenanceNotice[];
  recent_resolved: SystemIncident[];
  known_issues: KnownIssue[];
  monitoring_configured: boolean;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Release Notes
// ---------------------------------------------------------------------------

export type ReleaseNoteCategory =
  "new" | "improved" | "fixed" | "security" | "deprecated";

export type ReleaseNoteStatus = "published" | "draft" | "archived";

export interface ReleaseNoteChange {
  category: ReleaseNoteCategory;
  summary: string;
}

export interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  summary: string;
  published_at: string;
  changes: ReleaseNoteChange[];
  categories: ReleaseNoteCategory[];
  featured: boolean;
  related_article_ids: string[];
  status: ReleaseNoteStatus;
}

// ---------------------------------------------------------------------------
// Support knowledge context (no LLM)
// ---------------------------------------------------------------------------

export interface SupportKnowledgeMatch {
  article_id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  product_area: string;
  score: number;
  matched_fields: string[];
  related_routes: string[];
  excerpt: string;
}

export interface SupportKnowledgeContext {
  query: string;
  matches: SupportKnowledgeMatch[];
  total_articles_searched: number;
}

// ---------------------------------------------------------------------------
// Report-a-problem input
// ---------------------------------------------------------------------------

export interface ReportProblemInput {
  subject: string;
  description: string;
  what_happened: string;
  what_trying_to_do: string;
  ticket_type: SupportTicketType;
  category: SupportCategory;
  product_area: string;
  priority: SupportPriority;
  bug_severity: BugSeverity | null;
  reproducible: boolean | null;
  repro_steps: string | null;
  screenshot_ref: string | null;
  contact_preference: string | null;
  include_diagnostics: boolean;
  entity_context: TicketEntityContext | null;
  route_context: string | null;
}
