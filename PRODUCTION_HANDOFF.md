# Connect Pro Fleet — Production Handoff Register

**Status:** Front-end product layer is feature-complete and ready for backend cutover.
**Last updated:** Build #33 (Full Product QA + Front-End Completion Audit).
**Test baseline:** 2,002+ passing, 0 failing, 0 skipped (before Build #33 additions).

This document lists the remaining work required to move Connect Pro Fleet from
the current in-memory development build to a production deployment. It is a
**developer-facing** register — no secrets, keys, or credentials are included.

The front-end (React + Vite + Tailwind) is complete: routes, navigation,
permissions, empty states, error boundaries, mobile layouts, Customer Portal,
Support Center, Executive Dashboard, Business Health, Fleet Copilot, Reports,
and all operational modules are wired and tested. What remains is the backend
cutover (Build #22), live integrations, and operational reliability.

---

## P0 — Required before production launch

These block a real multi-tenant production deployment.

### Backend (Build #22 — production Supabase runtime)

- [ ] **Supabase connection / runtime verification.** The SQL migrations
  (`supabase/migrations/0001`–`0008`) define the schema, RLS policies, RPCs,
  and storage buckets. They must be executed against a real Supabase project
  and verified. See `docs/backend-migration-status.md` for the per-domain
  schema/repository/store-switch status table.
- [ ] **Migrations applied in order.** 0001 extensions → 0002 auth/tenancy →
  0003 core operational → 0004 financial ledger → 0005 expenses/banking →
  0006 maintenance/damage → 0007 tasks/notifications/investor →
  0008 RPCs/sequences/storage.
- [ ] **Repository store cutover.** Repository adapters + row/domain mappers
  exist for customers, vehicles, rentals, and the rental ledger. The
  `StoreProvider` currently still serves in-memory arrays. Each domain must be
  switched to read/write through its repository (domain-by-domain, no redesign).
- [ ] **Row-level security runtime verification.** RLS policies are written
  against `is_org_member` / tenant scoping but have NOT been executed against a
  live Postgres instance. Every policy must be runtime-verified.
- [ ] **Stored procedures / RPCs.** `next_document_number` (document sequences)
  and `post_payment` (ledger posting) are defined in SQL but not
  runtime-verified. Confirm idempotency and concurrency safety.

### Auth

- [ ] **Staff authentication.** The current `AuthProvider` is a development
  mock that never validates credentials. Production needs real Supabase Auth
  (email/password, magic link, or SSO) with tenant membership resolution.
- [ ] **Customer Portal authentication.** `PortalSession` is a development-mode
  mock (`verification_mode: "development"`, no password). Production needs
  magic-link / SMS-OTP / email-OTP mapped securely to a customer + tenant.
  No insecure password system was built (intentional).
- [ ] **Tenant membership enforcement.** Every cross-tenant boundary must be
  enforced server-side (RLS), not only in the client selectors. Client-side
  `assertPortalAccess` / permission gating is defense-in-depth, not the
  security boundary.

### Security

- [ ] **Private storage.** Document/file uploads (driver licenses, insurance,
  agreements) currently use memory-mode file references. Production needs
  Supabase Storage private buckets with signed URLs and RLS on `storage.objects`.
- [ ] **Secret management.** No secrets are stored in client code (verified by
  the handoff test suite). Production must wire `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` (publishable) and keep service-role keys server-side
  only. A Supabase Edge Function or service layer is required for any
  privileged operation.
- [ ] **Diagnostics sanitization.** `supportDiagnostics.ts` redacts JWTs, API
  keys, PANs, SSNs, bank account numbers, and routing numbers. Confirm the
  production redaction set covers any new sensitive fields.

### Integrations (live providers)

- [ ] **Payment processor.** Customer Portal shows "Payment processing will be
  connected during production setup" and staff payment recording is manual.
  Production needs a real card/ACH processor (Stripe / Square / etc.) with
  PCI-compliant tokenization. No card numbers are stored.
- [ ] **E-signature.** Rental agreements show "Signature pending" for unsigned
  agreements. Production needs a real e-sign provider if remote signing is
  required.
- [ ] **Connect Pro API transport.** The integration outbox/inbox + transport
  layer is implemented in-memory. Production needs the real Connect Pro sync
  transport wired (see `src/lib/integrationTransport.ts`).

### Reliability

- [ ] **Error tracking.** No production error tracking (Sentry / equivalent) is
  integrated. The `ErrorBoundary` is wired but only logs to console.
- [ ] **Backups / rollback.** Supabase automated backups + a tested rollback
  procedure are required before launch.
- [ ] **System health feed.** `supportSystemHealth.ts` uses `Unknown` status
  for components without a real health provider. Production must wire actual
  health checks (or a monitoring vendor) — the UI must never show "All systems
  operational" when status is genuinely unknown.

---

## P1 — Required soon after launch

- [ ] **Email / SMS delivery.** Notification rules + email templates exist
  (`notificationEmail.ts`) but delivery is not wired. Connect a transactional
  email/SMS provider.
- [ ] **Monitoring.** Uptime / latency monitoring (UptimeRobot, PagerDuty, or
  equivalent) for the Supabase project + web app.
- [ ] **Audit log persistence.** Audit entries (settings changes, ticket
  history, support comments) currently live in memory. Persist to Supabase.
- [ ] **Concurrency / idempotency.** The in-memory store has no concurrency
  control. Production RPCs (`post_payment`, `next_document_number`) must be
  concurrency-safe; payment recording must be idempotent.
- [ ] **Support ticket assignment.** `SupportTicket` has future-ready fields
  (`assigned_platform_agent_id`, `internal_only` comments) but no internal
  agent UI. Tenant-to-platform support routing is out of scope until a Super
  Admin build.

---

## P2 — Enhancements (post-launch)

- [ ] **Super Admin / cross-tenant platform console.** Tenant inspection,
  global KB authoring, platform agent roles, impersonation — all intentionally
  deferred.
- [ ] **Autonomous support AI.** The knowledge base + Copilot intent detection
  (`isProductHelpQuery`) are foundations only; no LLM support bot is wired.
- [ ] **GPS / telematics.** Explicitly out of scope.
- [ ] **Native mobile app.** The UI is mobile-first responsive web, not native.
- [ ] **Live support chat.** Support Center uses tickets + comments, not live
  chat.

---

## What is NOT needed (already complete)

- Front-end routing, navigation, deep links, empty states, error boundaries.
- Permission gating (client-side) for financials, profitability, banking,
  sensitive documents, portal privacy.
- Business Health Score (deterministic, configurable, persisted, v1).
- Executive Dashboard (single composition pass, permission-gated).
- Customer Portal (read-heavy projection + controlled request layer).
- Support Center (tickets, KB, system health, release notes, diagnostics).
- Fleet Copilot (deterministic, source-backed, permission-filtered).
- Reports catalog + CSV export.
- All operational modules (rentals, reservations, maintenance, damage,
  violations, compliance, deposits, expenses, banking, investors/JV).

## Related documents

- `docs/backend-migration-status.md` — per-domain schema/repository/store/RLS status.
- `docs/database-schema.md` — Supabase schema reference.
- `docs/security-model.md` — RLS + tenant scoping model.
- `FRONTEND_QA_REPORT.md` — front-end audit findings + remaining limitations.
