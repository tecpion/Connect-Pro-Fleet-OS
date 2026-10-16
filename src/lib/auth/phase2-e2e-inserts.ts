// Phase 2 E2E — direct table inserts for rentals and ledger transactions.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DbClient = SupabaseClient<Database>;

export async function insertRental(
  clientA: DbClient,
  orgA: string,
  rentalId: string,
  rsvId: string,
  custId: string,
  vehId: string,
  stamp: number,
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await clientA.from("rentals").insert({
    id: rentalId,
    organization_id: orgA,
    reservation_id: rsvId,
    customer_id: custId,
    vehicle_id: vehId,
    agreement_number: `AGR-2026-${stamp}`,
    status: "active",
    checkout_date: now.slice(0, 10),
    scheduled_return_date: "2026-11-05",
    scheduled_return_time: "17:00",
    rate_type: "daily",
    rate_amount: 75,
    subtotal: 400,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 200,
    amount_paid: 200,
    balance_due: 200,
    mileage_out: 12000,
    fuel_out: 100,
    grace_period: 1,
    late_fee: 0,
    late_fee_applied: false,
    weeks_rented: 0,
  }).select().single();
  if (error) return null;
  return data?.id ?? null;
}

export async function insertLedgerTxn(
  clientA: DbClient,
  orgA: string,
  rentalId: string,
  rsvId: string,
  custId: string,
  vehId: string,
  type: "rental_charge" | "rental_payment",
  amount: number,
): Promise<string | null> {
  const now = new Date().toISOString();
  const isPayment = type === "rental_payment";
  const { data, error } = await clientA.from("rental_ledger_transactions").insert({
    organization_id: orgA,
    rental_id: rentalId,
    reservation_id: rsvId,
    customer_id: custId,
    vehicle_id: vehId,
    transaction_type: type,
    category: isPayment ? "payment" : "charge",
    description: isPayment ? "Customer payment" : "Rental base charge",
    amount,
    direction: isPayment ? "payment" : "charge",
    payment_method: isPayment ? "card" : null,
    status: "posted",
    effective_date: now.slice(0, 10),
  }).select().single();
  if (error) return null;
  return data?.id ?? null;
}
