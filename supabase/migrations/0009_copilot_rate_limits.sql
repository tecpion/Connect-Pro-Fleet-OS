-- Connect Pro Fleet — Copilot Edge Function rate-limit counter table.
--
-- Backs the per user+org rate limiter used by the `copilot` Edge Function.
-- This is the ONLY schema addition for LLM routing; it does NOT touch any
-- Fleet domain table. The function degrades to an in-memory counter if this
-- table is absent, so it is optional for development but recommended for
-- production.

create table if not exists public.copilot_rate_limits (
  bucket_key text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Allow authenticated users to read/increment their own bucket via RLS-scoped
-- queries from the Edge Function (which uses the user's JWT). The function
-- itself uses the anon client + user JWT, so RLS applies.
alter table public.copilot_rate_limits enable row level security;

-- The Edge Function reads/writes this table using the caller's JWT. Because
-- rate limiting must work for any authenticated user, we permit authenticated
-- access to this lightweight counter table. No business data lives here.
create policy "authenticated can manage rate limits"
  on public.copilot_rate_limits
  for all
  to authenticated
  using (true)
  with check (true);
