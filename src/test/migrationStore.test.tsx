// Connect Pro Fleet — Build #19 migration store integration tests.
//
// Tests the real MigrationProvider + StoreProvider: importing an active
// rental (origin marker, vehicle rented, opening balance, migrated deposit),
// historical period add/overlap, rollback safety, idempotency, and
// financial non-interference (opening balance ≠ revenue, migrated deposit
// ≠ collection).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { MigrationProvider, useMigration } from "@/lib/migrationStore";
import { InvestorProvider } from "@/lib/investorStore";
import type { ReactNode } from "react";
import { isRevenueCharge } from "@/lib/profitabilityHelpers";
import { isDepositHeldEvent } from "@/lib/deposit";
import { rentalBalance } from "@/lib/ledger";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <InvestorProvider>
        <MigrationProvider>{children}</MigrationProvider>
      </InvestorProvider>
    </StoreProvider>
  );
}

function useHooks() {
  return renderHook(() => ({ store: useStore(), mig: useMigration() }), {
    wrapper,
  }).result;
}

describe("migration: active rental import", () => {
  it("creates an imported-legacy rental, marks vehicle rented, posts opening balance", () => {
    const r = useHooks();
    const beforeVehicles = r.current.store.vehicles.length;
    const beforeRentals = r.current.store.rentals.length;

    act(() => {
      r.current.mig.importActiveRental({
        external_agreement_id: "HQ-TEST-1",
        customer_id: "cus_3",
        vehicle_id: "veh_5",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: "14:00",
        current_term_end_date: null,
        opening_balance: 650,
        late_balance: 0,
        deposit_held: 300,
        payment_method: "card",
        status: "active",
        location_id: null,
        notes: "Imported from HQ",
        responsible_staff_id: null,
      });
    });

    const store = r.current.store;
    expect(store.rentals.length).toBe(beforeRentals + 1);
    const rental = store.rentals.find(
      (r2) => r2.external_agreement_id === "HQ-TEST-1",
    )!;
    expect(rental.rental_origin).toBe("imported_legacy");
    expect(rental.imported_legacy_rental).toBe(true);
    expect(rental.external_agreement_id).toBe("HQ-TEST-1");
    expect(rental.migration_cutover_at).toBeTruthy();
    expect(rental.billing_config?.billing_anchor_date).toBe("2026-09-05");

    // Vehicle marked rented.
    const vehicle = store.vehicles.find((v) => v.id === "veh_5");
    expect(vehicle?.status).toBe("rented");

    // Opening balance charge posted.
    const obTxn = store.transactions.find(
      (t) =>
        t.transaction_type === "migration_opening_balance" &&
        t.rental_id === rental.id,
    );
    expect(obTxn).toBeTruthy();
    expect(obTxn!.amount).toBe(650);
    expect(obTxn!.metadata?.migration).toBe(true);

    // Opening balance counts toward outstanding obligation.
    const balance = rentalBalance(store.transactions, rental.id);
    expect(balance).toBe(650);

    // Opening balance is NOT earned revenue.
    expect(isRevenueCharge(obTxn!)).toBe(false);
  });

  it("migrates a held deposit as held money, not current-day collection/revenue", () => {
    const r = useHooks();
    act(() => {
      r.current.mig.importActiveRental({
        external_agreement_id: "HQ-TEST-2",
        customer_id: "cus_4",
        vehicle_id: "veh_6",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: null,
        current_term_end_date: null,
        opening_balance: 0,
        late_balance: 0,
        deposit_held: 300,
        payment_method: "cash",
        status: "active",
        location_id: null,
        notes: null,
        responsible_staff_id: null,
      });
    });
    const store = r.current.store;
    const rental = store.rentals.find(
      (r2) => r2.external_agreement_id === "HQ-TEST-2",
    )!;
    const depTxn = store.transactions.find(
      (t) =>
        t.metadata?.deposit_kind === "collection" &&
        t.metadata?.migration === true &&
        t.rental_id === rental.id,
    );
    expect(depTxn).toBeTruthy();
    expect(depTxn!.amount).toBe(300);
    // Held money — excluded from collections/revenue.
    expect(isDepositHeldEvent(depTxn!)).toBe(true);
    // RentalDeposit record in held status.
    const dep = store.rentalDeposits.find((d) => d.rental_id === rental.id);
    expect(dep).toBeTruthy();
    expect(dep!.status).toBe("held");
    expect(dep!.collected_amount).toBe(300);
  });

  it("is idempotent — re-importing the same external agreement is blocked", () => {
    const r = useHooks();
    act(() => {
      r.current.mig.importActiveRental({
        external_agreement_id: "HQ-DUP-1",
        customer_id: "cus_3",
        vehicle_id: "veh_5",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: null,
        current_term_end_date: null,
        opening_balance: 100,
        late_balance: 0,
        deposit_held: 0,
        payment_method: null,
        status: "active",
        location_id: null,
        notes: null,
        responsible_staff_id: null,
      });
    });
    const before = r.current.store.rentals.length;
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.mig.importActiveRental({
        external_agreement_id: "HQ-DUP-1",
        customer_id: "cus_3",
        vehicle_id: "veh_6",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: null,
        current_term_end_date: null,
        opening_balance: 100,
        late_balance: 0,
        deposit_held: 0,
        payment_method: null,
        status: "active",
        location_id: null,
        notes: null,
        responsible_staff_id: null,
      });
    });
    expect(res?.ok).toBe(false);
    expect(r.current.store.rentals.length).toBe(before); // no duplicate
  });

  it("blocks import when vehicle already has an active rental", () => {
    const r = useHooks();
    // veh_1 is rented by rnt_1 in seed data.
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.mig.importActiveRental({
        external_agreement_id: "HQ-CONFLICT-1",
        customer_id: "cus_3",
        vehicle_id: "veh_1",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: null,
        current_term_end_date: null,
        opening_balance: 100,
        late_balance: 0,
        deposit_held: 0,
        payment_method: null,
        status: "active",
        location_id: null,
        notes: null,
        responsible_staff_id: null,
      });
    });
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain("already has an active rental");
  });

  it("rejects cross-tenant customer/vehicle references", () => {
    const r = useHooks();
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.mig.importActiveRental({
        external_agreement_id: "HQ-XT-1",
        customer_id: "cus_nonexistent",
        vehicle_id: "veh_5",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: null,
        current_term_end_date: null,
        opening_balance: 100,
        late_balance: 0,
        deposit_held: 0,
        payment_method: null,
        status: "active",
        location_id: null,
        notes: null,
        responsible_staff_id: null,
      });
    });
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain("Customer not found");
  });
});

describe("migration: historical financials", () => {
  it("adds a historical period that creates no ledger/invoice/expense/bank transactions", () => {
    const r = useHooks();
    const txnsBefore = r.current.store.transactions.length;
    const invoicesBefore = r.current.store.invoices.length;
    const expensesBefore = r.current.store.expenses.length;
    let res: { ok: boolean; period?: unknown } | undefined;
    act(() => {
      res = r.current.mig.addHistoricalPeriod({
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        granularity: "month",
        source_system: "spreadsheet",
        revenue: 75000,
        collections: 73000,
        expenses: 30000,
        net_profit: 45000,
        rental_count: 120,
      });
    });
    expect(res?.ok).toBe(true);
    expect(r.current.store.transactions.length).toBe(txnsBefore);
    expect(r.current.store.invoices.length).toBe(invoicesBefore);
    expect(r.current.store.expenses.length).toBe(expensesBefore);
    expect(r.current.mig.historicalPeriods.length).toBeGreaterThan(0);
  });

  it("blocks overlapping historical periods of the same granularity", () => {
    const r = useHooks();
    act(() => {
      r.current.mig.addHistoricalPeriod({
        period_start: "2026-04-01",
        period_end: "2026-04-30",
        granularity: "month",
        source_system: "spreadsheet",
        revenue: 70000,
      });
    });
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.mig.addHistoricalPeriod({
        period_start: "2026-04-15",
        period_end: "2026-05-15",
        granularity: "month",
        source_system: "spreadsheet",
        revenue: 71000,
      });
    });
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain("overlapping");
  });
});

describe("migration: rollback safety", () => {
  it("blocks rollback when an imported rental has native payments", () => {
    const r = useHooks();
    let rentalId = "";
    act(() => {
      const res = r.current.mig.importActiveRental({
        external_agreement_id: "HQ-RB-1",
        customer_id: "cus_3",
        vehicle_id: "veh_5",
        rental_start_date: "2026-07-01",
        current_rate: 350,
        rate_type: "weekly",
        billing_frequency: "weekly",
        next_payment_due_date: "2026-09-05",
        next_payment_due_time: null,
        current_term_end_date: null,
        opening_balance: 200,
        late_balance: 0,
        deposit_held: 0,
        payment_method: null,
        status: "active",
        location_id: null,
        notes: null,
        responsible_staff_id: null,
      });
      rentalId = res.rental_id ?? "";
    });
    // Record a native payment against the imported rental.
    act(() => {
      r.current.store.recordRentalPayment(rentalId, 100, "cash");
    });
    // Create a batch referencing this rental, then attempt rollback.
    let batch;
    act(() => {
      batch = r.current.mig.createBatch({
        import_type: "active_rentals",
        source_name: "test",
        row_count: 1,
      });
      r.current.mig.finalizeBatch(batch.id, {
        success_count: 1,
        skipped_count: 0,
        warning_count: 0,
        error_count: 0,
        created_record_ids: [rentalId],
      });
    });
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.mig.rollbackBatch(batch.id);
    });
    expect(res?.ok).toBe(false);
    expect(res?.error).toContain("native payments");
  });
});
