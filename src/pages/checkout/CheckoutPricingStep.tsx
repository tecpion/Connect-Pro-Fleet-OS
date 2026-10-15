// Connect Pro Fleet — Checkout pricing step (Build #4 / Build #9).
// Renders the rental pricing summary + estimated taxes/fees + the billing
// schedule picker + a live payment schedule preview. Separates RENTAL PRICING
// (rate/taxes/fees/deposit) from PAYMENT SCHEDULE (when the customer owes money).
//
// Build #9: shows estimated start-time fees + taxes from the configured rules
// (clearly labelled "Estimated"). These post at startRental via the tax/fee
// engine. Build #5 cleanup: the picker confirms a DRAFT config up to the
// checkout workflow (via onConfirm); the workflow persists it atomically.

import { useStore, uid } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import type { Addon, RentalAgreement, Vehicle } from "@/lib/types";
import type { RentalBillingConfig } from "@/lib/billingTypes";
import { rateTypeMeta, fmtMoneyExact } from "@/lib/format";
import { calculateFees, calculateTaxes } from "@/lib/taxEngine";
import type { ChargeLine } from "@/lib/taxFeeTypes";
import { BillingSchedulePicker } from "@/pages/rentals/BillingSchedulePicker";
import { BillingSchedulePreview } from "./BillingSchedulePreview";

export function CheckoutPricingStep({
  rental,
  vehicle,
  rentalAddons,
  onBillingConfirm,
}: {
  rental: RentalAgreement;
  vehicle?: Vehicle;
  rentalAddons: Addon[];
  /** Lifts the confirmed draft billing config up to the checkout workflow so it
   *  persists once at `startCheckout` (single authoritative path). */
  onBillingConfirm?: (cfg: RentalBillingConfig) => void;
}) {
  const { processRentalBilling } = useBilling();
  const { logActivity, taxRules, feeRules } = useStore();
  const grandTotal =
    rental.subtotal + rental.fees + rental.tax - rental.discount;

  // Build #9 — estimated start-time fees + taxes from configured rules.
  const today = new Date().toISOString().slice(0, 10);
  const baseCharges: ChargeLine[] = [
    { category: "rental_rate", amount: rental.subtotal, description: "Rental" },
    ...rentalAddons.map((a) => ({
      category: "addon" as const,
      amount: a.price * a.quantity,
      description: "Add-on",
    })),
  ];
  const { lines: estFeeLines, total: estFeeTotal } = calculateFees(feeRules, {
    tenant_id: rental.tenant_id,
    location_id: vehicle?.location ?? null,
    effective_date: today,
    trigger: "rental_start",
    rental_days: 0,
    base_charges: baseCharges,
  });
  const taxableLines: ChargeLine[] = [
    ...baseCharges,
    ...estFeeLines
      .filter((f) => f.taxable)
      .map((f) => ({
        category: f.charge_category,
        amount: f.amount,
        description: f.rule_name,
      })),
  ];
  const { lines: estTaxLines, total: estTaxTotal } = calculateTaxes(taxRules, {
    tenant_id: rental.tenant_id,
    location_id: vehicle?.location ?? null,
    effective_date: today,
    charges: taxableLines,
  });

  return (
    <div className="space-y-4">
      {/* Rental pricing */}
      <div className="space-y-2 rounded-md bg-surface-2 px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rental pricing
        </p>
        <Row
          label="Rental rate"
          value={`${fmtMoneyExact(rental.rate_amount)} / ${rateTypeMeta[rental.rate_type].toLowerCase()}`}
        />
        <Row label="Subtotal" value={fmtMoneyExact(rental.subtotal)} />
        {rentalAddons.map((a) => (
          <Row
            key={a.id}
            label={`Add-on: ${a.addon_type.replace(/_/g, " ")} ×${a.quantity}`}
            value={fmtMoneyExact(a.price * a.quantity)}
          />
        ))}
        {rental.fees > 0 && (
          <Row label="Fees & add-ons" value={fmtMoneyExact(rental.fees)} />
        )}
        {estFeeLines.map((f) => (
          <Row
            key={f.rule_id}
            label={`Est. fee — ${f.rule_name}`}
            value={fmtMoneyExact(f.amount)}
          />
        ))}
        {rental.tax > 0 && (
          <Row label="Tax" value={fmtMoneyExact(rental.tax)} />
        )}
        {estTaxLines.map((t) => (
          <Row
            key={t.rule_id}
            label={`Est. tax — ${t.rule_name}`}
            value={fmtMoneyExact(t.amount)}
          />
        ))}
        {rental.discount > 0 && (
          <Row label="Discount" value={`-${fmtMoneyExact(rental.discount)}`} />
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-medium text-foreground">
            Grand total
          </span>
          <span className="font-mono text-base font-semibold tabular text-foreground">
            {fmtMoneyExact(grandTotal)}
          </span>
        </div>
        <Row
          label="Deposit held"
          value={fmtMoneyExact(rental.deposit_amount)}
        />
        {(estFeeTotal > 0 || estTaxTotal > 0) && (
          <p className="text-xs text-muted-foreground">
            Estimated fees & taxes post at rental start. Deposit is held
            separately.
          </p>
        )}
      </div>

      {/* Payment schedule — separate concept from rental pricing */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payment schedule
        </p>
        <p className="text-xs text-muted-foreground">
          Choose how this rental bills. The rate above is fixed; this controls
          when the customer owes money.
        </p>
        <BillingSchedulePicker rental={rental} onConfirm={onBillingConfirm} />
        <BillingSchedulePreview rental={rental} />
        <button
          onClick={() => {
            const res = processRentalBilling();
            logActivity({
              id: uid("act"),
              at: new Date().toISOString(),
              label: `Billing processed — ${res.periodsGenerated} period(s), ${res.lateFeesApplied} late fee(s).`,
              tone: res.periodsGenerated > 0 ? "available" : "neutral",
            });
          }}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          Generate billing periods now
        </button>
      </div>

      {vehicle && (
        <p className="text-xs text-muted-foreground">
          Vehicle: {vehicle.make} {vehicle.model} · {vehicle.license_plate}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular text-foreground">{value}</span>
    </div>
  );
}
