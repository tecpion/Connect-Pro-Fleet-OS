-- ===========================================================================
-- POC cleanup — drop isolated proof-of-concept artifacts.
-- The real Phase 1 + Phase 2 production-slice E2E tests now pass against the
-- live Cloud backend using the production tables, so the poc_* scaffolding is
-- no longer needed. No source file references any of these objects.
-- ===========================================================================

-- 1. Drop the poc-private storage bucket policy (the one permitted write to
--    storage.objects from the POC). Safe to drop — production uses the
--    customer-documents bucket with its own org-prefix policies.
drop policy if exists "poc_private_rw" on storage.objects;

-- 2. Drop poc_* tables (order respects FK dependencies).
drop table if exists public.poc_reservations;
drop table if exists public.poc_vehicles;
drop table if exists public.poc_customers;
drop table if exists public.poc_memberships;
drop table if exists public.poc_orgs;

-- 3. Drop the poc_is_member SECURITY DEFINER helper function.
drop function if exists public.poc_is_member(org_id uuid);