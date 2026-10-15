# Connect Pro Fleet — Security Model (Build #22)

## Authentication

Supabase Auth owns identity. Email/password is supported in V1. Passwords are
never stored or hashed by the app. The browser uses only the publishable anon
key (`VITE_SUPABASE_ANON_KEY`); the service-role key is never present in client
code.

`AuthProvider` (`src/lib/supabase/authContext.tsx`) exposes session, profile,
memberships, active organization, `signIn`, `signOut`. In memory mode (no
Supabase config) it exposes a deterministic demo session so dev/test works
without auth.

## Multi-tenancy & RLS

Row Level Security is enabled on every tenant-scoped table. Frontend
`tenant_id` filtering is NOT security — the database enforces it.

- **`is_org_member(org_id)`** — SECURITY DEFINER, stable search_path. Returns
  true when `auth.uid()` is an active member of the org. Every standard policy
  delegates to it.
- **`has_permission(org_id, permission_code)`** — true when the user's role
  grants the code (via `role_permissions`) or the user is an Owner.
- Client-supplied `organization_id` on inserts is validated by RLS membership;
  the repository layer supplies the active org id rather than trusting client
  input.

## Financial RLS

Sensitive financial tables gate reads by permission:
- `financial_accounts`, `financial_statements`, `imported_transactions` →
  `banking.view`.
- Expense/ledger reads are membership-gated; column-level financial hiding
  (e.g. company overhead, investor economics) is enforced by the
  repository/permission layer on top of tenant-isolated rows (V1 does not claim
  column-level RLS).

## Ledger immutability

`rental_ledger_transactions` has SELECT/INSERT/UPDATE policies but **no DELETE
policy**, so hard deletes are blocked at the RLS level. Corrections use
reversal/void rows.

## Private storage

All operational files use **private** Supabase Storage buckets
(`vehicle-documents`, `inspection-evidence`, `damage-evidence`,
`expense-receipts`, `maintenance-receipts`, `rental-agreements`,
`customer-documents`, `avatars`). No public buckets.

- Paths are `{organization_id}/{entity_type}/{entity_id}/{uuid}-{file}`.
- Storage policies check the first path segment against the user's memberships,
  so Org A cannot read Org B files.
- We persist `storage_path` (never a permanent public URL) and generate
  short-lived signed URLs on demand (`createSignedUrl`).
- Driver's license / verification documents use the `customer-documents` bucket
  with stricter handling.

## Service role

The service-role key is never in frontend code. Future backend
workers/webhooks may use it securely. Production inbound Connect Pro webhooks
must hit a backend/Edge Function, not the browser Supabase client.

## Session & cache

On sign out / organization switch, the AuthProvider clears the session and the
app reloads tenant data. Expired sessions redirect to `/signin` rather than
showing stale privileged data.

## Limitations (honest)

- RLS SQL is created but **runtime RLS verification is pending** a local
  Supabase environment (see `docs/backend-migration-status.md`). The policies
  are written against `is_org_member`/`has_permission` but have not been
  executed against a live Postgres instance in this environment.
- Financial RPC SQL is created but **runtime RPC verification is pending** the
  same local Supabase environment.
- Column-level financial permission hiding is enforced in the app/repository
  layer, not via column-level RLS.
