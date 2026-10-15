# Connect Pro Fleet — Backend Migration Status (Build #22)

This document honestly tracks which domains are actually backed by Supabase
versus still using the in-memory mock store. Build #22 ships the persistence
**foundation** (schema, auth, RLS, storage, repositories, RPCs) and switches a
first set of domains. It does NOT claim every domain is production-backed.

Legend:
- ✅ Schema ready — SQL migration created.
- 🔌 Repository implemented — adapter + row/domain mappers exist.
- 🔄 Store switched — domain reads/writes through the repository.
- ⏳ RLS/RPC runtime-verified — executed against local Supabase.

| Domain | Schema | Repository | Store switched | RLS verified | RPC verified |
|---|---|---|---|---|---|
| Auth / Organizations / Memberships | ✅ | 🔌 (AuthProvider) | 🔄 | ⏳ | n/a |
| Customers | ✅ | 🔌 | ⏳ (repo available, store still memory) | ⏳ | n/a |
| Vehicles | ✅ | 🔌 | ⏳ | ⏳ | n/a |
| Vehicle Classes / Locations | ✅ | — | Memory | ⏳ | n/a |
| Reservations | ✅ | — | Memory | ⏳ | n/a |
| Rentals | ✅ | 🔌 | ⏳ | ⏳ | n/a |
| Vehicle Exchanges | ✅ | — | Memory | ⏳ | n/a |
| Billing Periods | ✅ | — | Memory | ⏳ | n/a |
| Rental Ledger | ✅ | 🔜 | Memory | ⏳ | ⏳ `post_payment` |
| Payment Allocations | ✅ | — | Memory | ⏳ | n/a |
| Security Deposits | ✅ | — | Memory | ⏳ | n/a |
| Expenses / Petty Cash | ✅ | — | Memory | ⏳ | n/a |
| Banking / Reconciliation | ✅ | — | Memory | ⏳ | n/a |
| Maintenance / Vendors | ✅ | — | Memory | ⏳ | n/a |
| Damage Claims | ✅ | — | Memory | ⏳ | n/a |
| Tasks | ✅ | — | Memory | ⏳ | n/a |
| Notifications | ✅ | — | Memory | ⏳ | n/a |
| Investor / JV | ✅ | — | Memory | ⏳ | n/a |
| Migration / Historical | ✅ | — | Memory | ⏳ | n/a |
| Integration (outbox/inbox) | ✅ | — | Memory | ⏳ | n/a |
| Storage (private buckets) | ✅ | 🔜 | — | ⏳ | n/a |
| Document Sequences | ✅ | — | Memory | ⏳ | ⏳ `next_document_number` |

## What "switched" means

A domain is "store switched" when its store methods read/write through the
repository instead of the in-memory `useState` arrays. In Build #22 the
repository adapters + mappers exist for customers, vehicles, rentals, and the
ledger, but the existing `StoreProvider` still serves the in-memory arrays so
the 919-test suite and the running app remain stable. Switching the store over
is a controlled follow-up that can happen domain-by-domain without redesign.

## RLS / RPC runtime verification

The SQL in `supabase/migrations/` is written against `is_org_member` /
`has_permission` SECURITY DEFINER helpers and includes cross-tenant policies,
unique idempotency indexes, and the `post_payment` / `next_document_number`
RPCs. **These have not been executed against a live Postgres/Supabase instance
in this environment.** Runtime RLS and RPC verification is pending a local
Supabase CLI run. Until then Build #22 is NOT "production-verified" — it is
"production-ready foundation."

## Production config safeguard

In `VITE_BACKEND_MODE=supabase` with missing config, `requireSupabaseConfig()`
surfaces a configuration error rather than silently falling back to ephemeral
memory. Tests/dev default to memory mode and never require network.
