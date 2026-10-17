-- Phase 5: payout idempotency for investor_settlements.
-- A settlement is uniquely identified by (org, investor, pairing, period).
-- Prevents duplicate authoritative payout records for the same settlement
-- period on retry, without inventing a new payout model.
-- Handles nullable pairing_id via a partial unique index (NULLs are distinct
-- under a normal unique constraint, so we scope the two cases explicitly).

-- Case A: pairing-scoped settlements (pairing_id present).
CREATE UNIQUE INDEX IF NOT EXISTS
  investor_settlements_pairing_period_uniq
ON public.investor_settlements
  (organization_id, investor_id, pairing_id, period_start, period_end)
WHERE pairing_id IS NOT NULL;

-- Case B: vehicle-scoped settlements without a pairing (pairing_id NULL,
-- vehicle_id present). Covers the historical vehicle-level payout path.
CREATE UNIQUE INDEX IF NOT EXISTS
  investor_settlements_vehicle_period_uniq
ON public.investor_settlements
  (organization_id, investor_id, vehicle_id, period_start, period_end)
WHERE pairing_id IS NULL AND vehicle_id IS NOT NULL;

-- Idempotency key columns already exist on imported_transactions
-- (import_fingerprint) — bank import dedupe is already enforced at the row
-- level. No additional banking constraint is required.