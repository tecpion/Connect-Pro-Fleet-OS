import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { RouteProgress } from "@/components/RouteLine";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { fmtMoney, fmtMoneyExact, fmtNumber, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { ReturnDepositStep } from "@/pages/rentals/ReturnDepositStep";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Gauge,
  Fuel,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  DollarSign,
} from "lucide-react";

const STEPS = [
  "Return info",
  "Inspection",
  "Charges",
  "Deposit",
  "Complete",
] as const;

type ChargeKey =
  "fuel" | "mileage" | "late" | "cleaning" | "damage" | "ticket" | "other";

const CHARGE_LABELS: Record<ChargeKey, string> = {
  fuel: "Fuel refuel",
  mileage: "Extra mileage",
  late: "Late return",
  cleaning: "Cleaning",
  damage: "Damage",
  ticket: "Ticket",
  other: "Other",
};

export default function ReturnWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    rentals,
    customers,
    vehicles,
    inspections,
    transactions,
    depositForRental,
    applyDeposit,
    refundDeposit,
    completeReturn,
  } = useStore();

  const rental = rentals.find((r) => r.id === id);
  const [step, setStep] = useState(0);
  const [mileageIn, setMileageIn] = useState<number>(0);
  const [fuelIn, setFuelIn] = useState<number>(100);
  const [returnDate, setReturnDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [returnTime, setReturnTime] = useState(
    new Date().toISOString().slice(11, 16),
  );
  const [charges, setCharges] = useState<Record<ChargeKey, number>>({
    fuel: 0,
    mileage: 0,
    late: 0,
    cleaning: 0,
    damage: 0,
    ticket: 0,
    other: 0,
  });
  const [confirmedDamage, setConfirmedDamage] = useState(false);
  // Completion guard — require explicit confirmation when there's an
  // outstanding balance OR the vehicle is being returned before the scheduled
  // return date. Never silently complete a return leaving money on the table.
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);

  const customer = useMemo(
    () => customers.find((c) => c.id === rental?.customer_id),
    [customers, rental],
  );
  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === rental?.vehicle_id),
    [vehicles, rental],
  );
  const checkinInspection = useMemo(
    () =>
      inspections.find(
        (i) =>
          i.reservation_id === rental?.reservation_id &&
          i.inspection_type === "checkin",
      ),
    [inspections, rental],
  );

  if (!rental) {
    return (
      <EmptyState
        title="Rental agreement not found"
        hint="It may have been removed."
        action={
          <Link to="/rentals">
            <Button variant="outline">Back to rentals</Button>
          </Link>
        }
      />
    );
  }

  const grandTotal =
    rental.subtotal + rental.fees + rental.tax - rental.discount;
  const totalCharges = Object.values(charges).reduce((s, n) => s + n, 0);
  const deposit = depositForRental(rental.id);
  const settlement = getRentalSettlement(rental, transactions, deposit);
  const finalBalance = settlement.customerBalanceDue + totalCharges;
  const inspectionReady = !!checkinInspection;
  const aiFlaggedDamage =
    checkinInspection?.damage_ai_flagged_regions?.length > 0;
  // Completion guard conditions. The Complete step must NOT silently close a
  // rental with an outstanding balance or an early (pre-scheduled) return.
  const hasOutstandingBalance = finalBalance > 0;
  const isEarlyReturn =
    !!rental.scheduled_return_date && returnDate < rental.scheduled_return_date;
  const needsCompletionConfirm = hasOutstandingBalance || isEarlyReturn;

  const canAdvance = (() => {
    if (step === 0) return mileageIn > 0;
    if (step === 1)
      return inspectionReady && (!aiFlaggedDamage || confirmedDamage);
    if (step === 2) return true;
    if (step === 3) return true;
    return true;
  })();

  const finishReturn = () => {
    completeReturn(rental.id, {
      mileageIn,
      fuelIn,
      returnDate,
      returnTime,
      charges: totalCharges,
      depositRefund: 0,
    });
    toast.success("Rental returned and closed.");
    navigate(`/rentals/${rental.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={`/rentals/${rental.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} /> Back to rental
      </Link>

      <PageHeader
        title="Return vehicle"
        subtitle={
          <span className="font-mono tabular">
            {rental.agreement_number} ·{" "}
            {customer ? `${customer.first_name} ${customer.last_name}` : "—"} ·{" "}
            {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
          </span>
        }
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
        </div>
        <RouteProgress value={(step + 1) / STEPS.length} stops={STEPS.length} />
      </div>

      <SectionCard>
        {/* Step 0 — Return info */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Return date</Label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="mt-1.5 font-mono tabular"
                />
              </div>
              <div>
                <Label>Return time</Label>
                <Input
                  type="time"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  className="mt-1.5 font-mono tabular"
                />
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Gauge size={15} /> Mileage in (mi)
              </Label>
              <Input
                type="number"
                value={mileageIn || ""}
                onChange={(e) =>
                  setMileageIn(Math.max(0, Number(e.target.value)))
                }
                placeholder="0"
                inputMode="numeric"
                className="mt-1.5 h-14 font-mono text-2xl tabular"
              />
              {rental.mileage_out != null && mileageIn > 0 && (
                <p className="mt-1 font-mono text-xs tabular text-muted-foreground">
                  {fmtNumber(mileageIn - rental.mileage_out)} mi driven this
                  rental
                </p>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Fuel size={15} /> Fuel level in
              </Label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={fuelIn}
                  onChange={(e) => setFuelIn(Number(e.target.value))}
                  className="flex-1 accent-primary"
                  aria-label="Fuel level in"
                />
                <span className="w-14 text-right font-mono text-lg tabular text-foreground">
                  {fuelIn}%
                </span>
              </div>
              {rental.fuel_out != null && fuelIn < rental.fuel_out && (
                <p className="mt-1 font-mono text-xs tabular text-status-maintenance">
                  {rental.fuel_out - fuelIn}% below checkout level — consider a
                  fuel charge
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 1 — Inspection */}
        {step === 1 && (
          <div className="space-y-4">
            {inspectionReady ? (
              <>
                <div className="flex items-center gap-3 rounded-md bg-status-available/10 px-3 py-3">
                  <CheckCircle2 size={20} className="text-status-available" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Return inspection complete
                    </p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {checkinInspection?.odometer_reading.toLocaleString()} mi
                      · {checkinInspection?.fuel_level}% fuel ·{" "}
                      {checkinInspection?.photos.length} photos
                    </p>
                  </div>
                </div>
                {aiFlaggedDamage && (
                  <div className="rounded-lg border border-status-maintenance/40 bg-status-maintenance/10 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        size={18}
                        className="text-status-maintenance"
                      />
                      <p className="font-display text-sm font-semibold text-foreground">
                        AI flagged possible new damage
                      </p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {checkinInspection?.damage_ai_flagged_regions.map(
                        (f, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-status-maintenance/30 bg-surface p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-foreground">
                                {f.angle}
                              </span>
                              <span className="font-mono text-xs tabular text-status-maintenance">
                                {Math.round(f.confidence * 100)}% confidence
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {f.note}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                    <label className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={confirmedDamage}
                        onChange={(e) => setConfirmedDamage(e.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm text-foreground">
                        I've reviewed the photos and confirm this is new damage
                        — charge the customer
                      </span>
                    </label>
                    {!confirmedDamage && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Confirm the damage before you can add a damage charge
                        and complete the return.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Run a return inspection to compare the vehicle's condition
                  against checkout photos. AI flags any likely new damage for
                  your review.
                </p>
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary-press"
                  onClick={() =>
                    navigate(
                      `/inspections/new?res=${rental.reservation_id ?? ""}&type=checkin&return=/return/${rental.id}`,
                    )
                  }
                >
                  <ClipboardCheck size={16} className="mr-1.5" /> Open return
                  inspection <ExternalLink size={14} className="ml-1" />
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 2 — Charges */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add any charges for the return. The damage charge is only
              available if you confirmed AI-flagged damage.
            </p>
            <div className="space-y-2">
              {(Object.keys(CHARGE_LABELS) as ChargeKey[]).map((key) => {
                const isDamage = key === "damage";
                const disabled = isDamage && !confirmedDamage;
                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-3 rounded-md border border-border px-3 py-2",
                      disabled && "opacity-50",
                    )}
                  >
                    <Label className="flex-1 text-sm font-medium">
                      {CHARGE_LABELS[key]}
                      {isDamage && !confirmedDamage && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (confirm damage first)
                        </span>
                      )}
                    </Label>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={charges[key] || ""}
                        onChange={(e) =>
                          setCharges((c) => ({
                            ...c,
                            [key]: Math.max(0, Number(e.target.value)),
                          }))
                        }
                        placeholder="0"
                        className="w-24 font-mono tabular"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2.5">
              <span className="text-sm font-medium text-foreground">
                Total charges
              </span>
              <span className="font-mono text-base font-semibold tabular text-foreground">
                {fmtMoneyExact(totalCharges)}
              </span>
            </div>
          </div>
        )}

        {/* Step 3 — Deposit */}
        {step === 3 && (
          <ReturnDepositStep
            rental={rental}
            deposit={deposit}
            transactions={transactions}
            totalCharges={totalCharges}
            onApply={(amount, key) =>
              applyDeposit(deposit?.id ?? "", { amount }, key)
            }
            onRefund={(amount, method, key) =>
              refundDeposit(deposit?.id ?? "", { amount, method }, key)
            }
          />
        )}

        {/* Step 4 — Complete */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md bg-surface-2 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Rental total
                </span>
                <span className="font-mono tabular text-foreground">
                  {fmtMoneyExact(grandTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Additional charges
                </span>
                <span className="font-mono tabular text-foreground">
                  {fmtMoneyExact(totalCharges)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Paid so far
                </span>
                <span className="font-mono tabular text-status-available">
                  {fmtMoneyExact(rental.amount_paid)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-sm font-medium text-foreground">
                  Customer owes
                </span>
                <span className="font-mono text-base font-semibold tabular text-status-maintenance">
                  {fmtMoneyExact(settlement.customerBalanceDue)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Deposit refund owed
                </span>
                <span className="font-mono tabular text-status-maintenance">
                  {fmtMoneyExact(settlement.depositRefundDueTotal)}
                </span>
              </div>
            </div>
            {hasOutstandingBalance && (
              <div
                data-testid="return-outstanding-warning"
                className="flex items-start gap-2 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  Outstanding balance: {fmtMoneyExact(finalBalance)}. Completing
                  the return will leave this balance for post-return collection.
                </span>
              </div>
            )}
            {isEarlyReturn && (
              <div
                data-testid="return-early-warning"
                className="flex items-start gap-2 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  This vehicle is being returned before the scheduled return
                  date ({fmtDateShort(rental.scheduled_return_date)}).
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Completing the return marks the vehicle available, the customer a
              previous renter, and updates the planner and financial reports.
              Any unrefunded deposit stays as refund pending.
            </p>
          </div>
        )}
      </SectionCard>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="lg"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="px-6"
        >
          <ChevronLeft size={18} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            size="lg"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
            className="bg-primary px-6 text-primary-foreground hover:bg-primary-press"
          >
            Continue <ChevronRight size={18} />
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={() =>
              needsCompletionConfirm
                ? setCompleteConfirmOpen(true)
                : finishReturn()
            }
            className="bg-primary px-6 text-primary-foreground hover:bg-primary-press"
          >
            <DollarSign size={18} className="mr-1" /> Complete return
          </Button>
        )}
      </div>

      {/* Completion guard — explicit confirmation for outstanding balance or
          early return. Never silent; never blocks post-return collection. */}
      {completeConfirmOpen && (
        <div
          data-testid="return-complete-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-status-maintenance" />
              <p className="text-base font-semibold text-foreground">
                Complete rental
              </p>
            </div>
            {hasOutstandingBalance && (
              <p className="text-sm text-foreground">
                Outstanding balance:{" "}
                <span className="font-mono font-semibold text-status-maintenance">
                  {fmtMoneyExact(finalBalance)}
                </span>
                . Completing now leaves this for post-return collection.
              </p>
            )}
            {isEarlyReturn && (
              <p className="text-sm text-foreground">
                This vehicle is being returned before the scheduled return date.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setCompleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setCompleteConfirmOpen(false);
                  finishReturn();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                Complete with outstanding balance
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
