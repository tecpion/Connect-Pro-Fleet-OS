// Connect Pro Fleet — Build #19 active rental import tab.
//
// Manual entry form for importing a legacy active rental. CSV import reuses
// the same store method. Shows clear warnings that the opening balance
// becomes an active obligation but is NOT counted as new Fleet-period
// revenue, and the migrated deposit is held money without a current-day
// cash collection.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { BILLING_FREQUENCY_LABELS } from "@/lib/billingTypes";
import type { BillingFrequency } from "@/lib/billingTypes";
import type { RateType } from "@/lib/types";

export function ActiveRentalImport() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canImport = can(role, overrides, "migration.import_active_rentals");

  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [rate, setRate] = useState("");
  const [rateType, setRateType] = useState<RateType>("weekly");
  const [frequency, setFrequency] = useState<BillingFrequency>("weekly");
  const [nextDue, setNextDue] = useState("");
  const [nextDueTime, setNextDueTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [depositHeld, setDepositHeld] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canImport) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to import active rentals.
      </p>
    );
  }

  function submit() {
    setError(null);
    setResult(null);
    if (!customerId || !vehicleId || !startDate || !rate) {
      setError("Customer, vehicle, start date, and current rate are required.");
      return;
    }
    const res = mig.importActiveRental({
      external_agreement_id: externalId || null,
      customer_id: customerId,
      vehicle_id: vehicleId,
      rental_start_date: startDate,
      current_rate: Number(rate) || 0,
      rate_type: rateType,
      billing_frequency: frequency,
      next_payment_due_date: nextDue || null,
      next_payment_due_time: nextDueTime || null,
      current_term_end_date: endDate || null,
      opening_balance: Number(openingBalance) || 0,
      late_balance: 0,
      deposit_held: Number(depositHeld) || 0,
      payment_method: null,
      status,
      location_id: null,
      notes: notes || null,
      responsible_staff_id: null,
    });
    if (!res.ok) {
      setError(res.error ?? "Import failed.");
    } else {
      setResult(`Imported rental ${res.rental_id}.`);
      setExternalId("");
      setOpeningBalance("");
      setDepositHeld("");
      setNotes("");
    }
  }

  const availableVehicles = store.vehicles.filter(
    (v) => v.status === "available" || v.status === "rented",
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-status-maintenance/40 bg-surface p-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Opening balance</strong> becomes an
        active customer obligation but is NOT counted as new Fleet-period
        revenue. <strong className="text-foreground">Held deposit</strong> is
        recorded as held money without increasing current-period collections or
        revenue. Future billing anchors from the imported next payment due date.
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Customer">
          <select
            className="mig-input"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select customer…</option>
            {store.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vehicle">
          <select
            className="mig-input"
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
          >
            <option value="">Select vehicle…</option>
            {availableVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} · {v.license_plate}
              </option>
            ))}
          </select>
        </Field>
        <Field label="External agreement ID">
          <input
            className="mig-input"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Rental start date">
          <input
            type="date"
            className="mig-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Current rate ($)">
          <input
            type="number"
            className="mig-input"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="Rate type">
          <select
            className="mig-input"
            value={rateType}
            onChange={(e) => setRateType(e.target.value as RateType)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Billing frequency">
          <select
            className="mig-input"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as BillingFrequency)}
          >
            {Object.entries(BILLING_FREQUENCY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next payment due">
          <input
            type="date"
            className="mig-input"
            value={nextDue}
            onChange={(e) => setNextDue(e.target.value)}
          />
        </Field>
        <Field label="Next due time">
          <input
            type="time"
            className="mig-input"
            value={nextDueTime}
            onChange={(e) => setNextDueTime(e.target.value)}
          />
        </Field>
        <Field label="Term end date (optional)">
          <input
            type="date"
            className="mig-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <Field label="Opening balance ($)">
          <input
            type="number"
            className="mig-input"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </Field>
        <Field label="Deposit held ($)">
          <input
            type="number"
            className="mig-input"
            value={depositHeld}
            onChange={(e) => setDepositHeld(e.target.value)}
          />
        </Field>
        <Field label="Status">
          <select
            className="mig-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="late">Late</option>
            <option value="overdue">Overdue</option>
            <option value="payment_due">Payment due</option>
            <option value="return_due">Return pending</option>
          </select>
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          className="mig-input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {error && <p className="text-sm text-status-out">{error}</p>}
      {result && <p className="text-sm text-status-available">{result}</p>}

      <button
        onClick={submit}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Import active rental
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
