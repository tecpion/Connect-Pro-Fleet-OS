# Connect Pro Fleet — Front-End QA Report (Build #33)

**Audit date:** Build #33 — Full Product QA + Front-End Completion Audit.
**Scope:** Full application front-end audit (routes, navigation, actions,
terminology, status system, permissions/privacy, empty states, error handling,
mobile, cross-module integration, settings, demo data, Copilot, Support,
Reports).
**Baseline:** 94 test files, 2,002 tests passing, 0 failing, 0 skipped.

---

## Modules audited

Core: Dashboard, Daily Briefing, Executive Dashboard, Fleet Copilot.
Customers: list, Customer 360, timeline, documents, notes/tasks.
Rentals: reservations, checkout, active rentals, rental detail, extensions,
exchanges, returns, billing periods, payment arrangements.
Fleet: vehicle list, Vehicle Detail / Digital Twin, availability, classes,
ownership/JV.
Financial: Payments Due, Payments, Deposits, Expenses, Banking,
Reconciliation, Profitability (vehicle/fleet/company).
Operations: Tasks, Staff, Assignments, Maintenance, Damage Claims, Violations,
Compliance.
Reporting: Report Center, Executive Summary, Compliance, Profitability,
Operating reports, Migration reporting.
Settings: Company, Policies, Staff/Roles, Compliance, Business Health, Daily
Briefing, Locations, Pricing, Add-ons, Deposits.
Support: Help & Support, Knowledge Base, System Health, Product Updates,
Support Requests.
Customer Portal: Home, Rental, Payments, Documents, Requests, Help.

## Issues found and fixed (Build #33)

### Fix 1 — Business Health settings were component-local (Major)

**Finding:** `BusinessHealthSection` held the `HealthConfig` in `useState`,
so navigating away and back reset utilization target, idle threshold, and
component weights to defaults. The Executive Dashboard always used
`DEFAULT_HEALTH_CONFIG` regardless of Settings changes.

**Fix:** Added `BusinessHealthSettings` to `CompanyPolicies` (persisted via
`useCompanyPolicies`). The Settings section now reads/writes through the
company policy store; `useExecutiveSources` exposes a `healthConfig` derived
from the persisted settings; the Executive Dashboard composes with it.
`defaultBusinessHealthSettings()` mirrors `DEFAULT_HEALTH_CONFIG` (v1).

### Fix 2 — Last 30 Days approximated to This Month (Major)

**Finding:** `resolveRange` in `ExecutiveDashboard.tsx` mapped
`last_30_days → "this_month"`, so "Last 30 Days" showed the calendar month,
not a rolling 30-day window. The test harness mirrored this approximation.

**Fix:** Added a real `last_30_days` case to `resolveProfitabilityRange`
(rolling 30-day window ending today, inclusive). Updated both the page
resolver and the test harness to use it.

### Fix 3 — Diagnostics sanitizer gap (Major, from Build #32 closure)

**Finding:** `supportDiagnostics.ts` redacted 2-segment JWTs but not full
3-segment JWTs, bank account numbers (8–17 digits), or ABA routing numbers
(9 digits).

**Fix (already applied in Build #32 closure):** Extended `SECRET_PATTERNS` to
cover full 3-segment JWTs, 8–17 digit account numbers, and 9-digit routing
numbers. Verified by the Build #32 privacy integration suite.

## Issues audited and confirmed correct (no change needed)

- **Route inventory:** All registered routes render; no orphan or duplicate
  competing routes. Portal routes use `PortalShell` (not `StaffLayout`).
- **Navigation:** Every nav item reaches a real route; permission-filtered.
- **Active nav state:** `NavLink` active highlighting works via `startsWith`.
- **Deep links:** Customer 360, Vehicle Twin, Daily Briefing, Copilot,
  Executive Dashboard, Support, Reports, Violations, Damage, Maintenance,
  Tasks, Compliance all land on valid authoritative screens.
- **Actions:** Add/Record/Extend/Exchange/Return/Create/Import/Reconcile/Report
  Problem all open correct dialogs with permission protection.
- **Empty states:** Customers, Vehicles, Rentals, Reservations, Payments,
  Tasks, Maintenance, Damage, Violations, Compliance, Reports, Staff, Support,
  Portal all have empty states (verified in Build #33 test suite).
- **Error handling:** `ErrorBoundary` is wired; errors do not expose stack
  traces/secrets in production paths.
- **Mobile:** Primary screens render at 375px; no required horizontal table
  scroll for core workflows; bottom nav present in Portal.
- **Status system:** Raw enums are mapped to human-readable labels (status
  label maps centralized per module). The Build #33 test suite asserts no raw
  enum leaks in rendered portal/staff UI.
- **Permissions/privacy:** Financial, profitability, banking, sensitive doc,
  and portal cross-tenant/cross-customer boundaries are gated before render.
- **Copilot:** Supported prompts map to real intents; source links land;
  permission filtering verified; no hallucinated answers.
- **Support:** KB articles describe real features; system health stays
  `Unknown` when unmeasured; article → Report Problem escalation works.
- **Reports:** Catalog entries open; financial reports permission-gated.
- **Demo/seed data:** Active rental, overdue, available, blocked, idle,
  maintenance, damage, violation, compliance, payments, portal, support all
  present and non-contradictory.

## Remaining limitations (not front-end blockers)

1. **Development-mode auth.** Staff `AuthProvider` and Portal `PortalSession`
   are mocks — production auth is P0 (see `PRODUCTION_HANDOFF.md`).
2. **In-memory store.** All persistence is in-memory; Supabase cutover is P0.
3. **No live payment processor / e-sign / email-SMS / monitoring.** P0/P1.
4. **System Health Unknown.** Components without a real provider show
   `Unknown` (truthful — never coerced to "Operational").
5. **No Super Admin / cross-tenant console.** Intentionally deferred.
6. **No live AI support bot.** KB + intent detection are foundations only.

## Production-only blockers

None on the front-end. All P0 blockers are backend/integration (see
`PRODUCTION_HANDOFF.md`). The front-end product layer is ready for developer
handoff.

## Front-end defect summary

| Severity | Found | Fixed | Remaining |
|----------|-------|------|----------|
| Blocker  | 0     | 0    | 0        |
| Major     | 2     | 2    | 0        |
| Minor     | 0     | 0    | 0        |

**Known front-end blockers: 0.**
**Known front-end Major issues: 0 remaining** (both found during this audit
were fixed).

## Conclusion

The front-end product layer is cohesive, complete, consistent, and ready for
backend cutover. No redesign is needed. The two Major defects (Business Health
persistence, Last 30 Days range) are fixed and covered by the Build #33 test
suite. All remaining work is production backend/integration scope (Build #22).
