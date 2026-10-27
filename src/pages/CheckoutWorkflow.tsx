import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router-compat";
import { useStore, uid } from "@/lib/store";
import type {
  RentalAgreement,
  Vehicle,
  Customer,
  Addon,
  Inspection,
} from "@/lib/types";
import type { RentalBillingConfig } from "@/lib/billingTypes";
import { RouteProgress } from "@/components/RouteLine";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill, rentalTone } from "@/components/Status";
import {
  rentalStatusMeta,
  fmtMoney,
  fmtMoneyExact,
  fmtNumber,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  CreditCard,
  ClipboardCheck,
  PenLine,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { CheckoutPricingStep } from "@/pages/checkout/CheckoutPricingStep";
import { VerifyStep, VehicleStep } from "@/pages/checkout/CheckoutVerifyStep";
import { Row } from "@/pages/checkout/CheckoutHelpers";
import { CheckoutReleaseGate } from "@/pages/checkout/CheckoutReleaseGate";
import { PaymentMethodSelect } from "@/components/PaymentMethodSelect";
import { depositBlocksCheckout, getDepositCollectDue } from "@/lib/deposit";
import { DEPOSIT_STATUS_LABELS } from "@/lib/depositTypes";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { isVerificationRequired } from "@/lib/verificationConfig";
import { useDefenseSources } from "@/lib/useDefenseSources";
import { useVerificationOptional } from "@/lib/store/verificationStore";
import { evaluateReleaseGateFromSources } from "@/lib/rentalReleaseGateSources";
import { canOverrideGate } from "@/lib/rentalReleaseGate";
import type {
  ReleaseBlockReason,
  ReleaseBlockSeverity,
} from "@/lib/defenseTypes";
import { useCan } from "@/pages/settings/useCan";

const SEVERITY_STYLE: Record<
  ReleaseBlockSeverity,
  { tone: string; label: string }
> = {
  hard_block: {
    tone: "text-status-out",
    label: "Hard block — cannot be overridden",
  },
  override_eligible: {
    tone: "text-status-maintenance",
    label: "Override eligible (manager)",
  },
  warning: { tone: "text-muted-foreground", label: "Warning" },
};

const STEPS = [
  "Verify",
  "Vehicle",
  "Pricing",
  "Payment",
  "Inspection",
  "Signature",
  "Start",
] as const;

export default function CheckoutWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    rentals,
    customers,
    vehicles,
    drivers,
    addons,
    inspections,
    recordRentalPayment,
    startCheckout,
    depositForRental,
    depositForReservation,
    addRentalEvent,
    logActivity,
    staff,
    currentStaffId,
  } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const verificationRequired = isVerificationRequired(companyPolicies);
  // ── AUTHORITATIVE RELEASE GATE ──────────────────────────────────────────
  // The START/RELEASE step uses the SAME authoritative evaluateRentalReleaseGate
  // used by the Defense Record / Action Center — NO duplicate hand-rolled gate.
  const defense = useDefenseSources();
  const verificationOpt = useVerificationOptional();
  const canOverride = useCan("rentals.override_release_gate");

  const rental = rentals.find((r) => r.id === id);
  const [step, setStep] = useState(0);
  const [payAmount, setPayAmount] = useState(0);
  const [mileageOut, setMileageOut] = useState<number>(
    rental?.mileage_out ?? 0,
  );
  const [fuelOut, setFuelOut] = useState<number>(rental?.fuel_out ?? 100);
  const [signed, setSigned] = useState(false);
  // Draft billing config held locally; persisted atomically at startCheckout.
  const [billingConfig, setBillingConfig] =
    useState<RentalBillingConfig | null>(rental?.billing_config ?? null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  // Manager override of override_eligible gate reasons. Hard blocks can NEVER
  // be overridden. When applied, the START step records an audited gate_override
  // rental event carrying actor + reason + the overridden reasons.
  const [overrideApplied, setOverrideApplied] = useState(false);

  const customer = useMemo(
    () => customers.find((c) => c.id === rental?.customer_id),
    [customers, rental],
  );
  const vehicle = useMemo(
    () => vehicles.find((v) => v.id === rental?.vehicle_id),
    [vehicles, rental],
  );
  const driver = useMemo(
    () => drivers.find((d) => d.reservation_id === rental?.reservation_id),
    [drivers, rental],
  );
  const rentalAddons = useMemo(
    () => addons.filter((a) => a.reservation_id === rental?.reservation_id),
    [addons, rental],
  );
  const checkoutInspection = useMemo(
    () =>
      inspections.find(
        (i) =>
          i.reservation_id === rental?.reservation_id &&
          i.inspection_type === "checkout",
      ),
    [inspections, rental],
  );
  // Build #8 — checkout deposit gate. Resolve the operational deposit record
  // (snapshotted on the reservation, linked to the rental once converted) and
  // block checkout if it's uncollected.
  const deposit =
    depositForRental(rental?.id ?? "") ??
    (rental?.reservation_id
      ? depositForReservation(rental.reservation_id)
      : null);
  const depositRemaining = deposit ? getDepositCollectDue(deposit) : 0;
  const depositBlocks = depositBlocksCheckout(deposit);

  // ── AUTHORITATIVE RELEASE GATE — single source of truth for the START step.
  // Evaluates: signed agreement, required verification, checkout inspection,
  // deposit eligibility, safety-critical maintenance, out-of-service status,
  // and compliance requirements. NO duplicate gate logic in this component.
  const gateResult = useMemo(() => {
    if (!rental || !vehicle) return null;
    return evaluateReleaseGateFromSources({
      rental,
      vehicle,
      defense,
      verification: verificationOpt
        ? {
            policies: companyPolicies.verification_services.services,
            requirements: verificationOpt.requirements,
            requests: verificationOpt.requests,
            overrides: verificationOpt.overrides,
          }
        : { policies: null, requirements: [], requests: [], overrides: [] },
      agreementSigned: signed,
    });
  }, [rental, vehicle, defense, verificationOpt, companyPolicies, signed]);

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
  const balanceBefore = Math.max(0, grandTotal - rental.amount_paid);
  const tone = rentalTone(rental.status);

  const licenseOk =
    driver?.verification_status === "verified" ||
    (!!customer?.drivers_license_expiry &&
      new Date(customer.drivers_license_expiry) > new Date());
  const insuranceOk =
    !!customer?.insurance_company &&
    !!customer?.insurance_expiry &&
    new Date(customer.insurance_expiry) > new Date();
  // Verification only blocks checkout when the tenant requires it. When
  // Verification = Off or Basic, missing verification is not a checkout blocker
  // (Basic is informational). Compliance (the authoritative blocker engine)
  // still independently gates configured blocking rules.
  const verificationReady = verificationRequired
    ? licenseOk && insuranceOk
    : true;
  const inspectionReady = !!checkoutInspection;

  // ── START STEP uses the AUTHORITATIVE release gate (no duplicate logic) ──
  // hard_blocks (safety maintenance / out-of-service / non-overridable
  // compliance) can NEVER be released. override_eligible blockers may be
  // released by a manager with `rentals.override_release_gate` after recording
  // an audited gate_override event. The deposit block is also override-eligible.
  const gateBlocked = !!gateResult?.blocked;
  const gateHardBlocked = !!gateResult?.hard_blocked;
  const gateOverrideEligible = !!gateResult?.override_eligible;
  const gateReasons = gateResult?.reasons ?? [];
  // A manager override clears override_eligible blockers only. Hard blocks
  // always prevent release regardless of overrideApplied.
  const startBlocked =
    gateBlocked && (!overrideApplied || gateHardBlocked || depositBlocks);
  const canOverrideStart =
    canOverride && gateOverrideEligible && !gateHardBlocked;

  const canAdvance = (() => {
    if (step === 0) return verificationReady;
    if (step === 1) return mileageOut > 0;
    if (step === 2) return true;
    if (step === 3) return rental.amount_paid >= grandTotal * 0.5;
    if (step === 4) return inspectionReady;
    if (step === 5) return signed;
    // Start step — the authoritative release gate decides. Hard blocks and
    // (un-overridden) eligible blocks prevent advancing to release.
    if (step === 6) return !startBlocked;
    return true;
  })();

  const [payTender, setPayTender] =
    useState<import("@/lib/paymentMethodTypes").TenderMethod>("credit_card");
  const [payProcessor, setPayProcessor] = useState<
    import("@/lib/paymentMethodTypes").PaymentProcessor | null
  >("stripe");
  const [payRef, setPayRef] = useState("");
  const handlePayment = () => {
    if (payAmount <= 0) return;
    recordRentalPayment(rental.id, payAmount, payTender, {
      processor: payProcessor,
      reference: payRef,
    });
    setPayAmount(0);
    setPayRef("");
    toast.success(`Recorded ${fmtMoney(payAmount)}.`);
  };

  const startRental = () => {
    // Atomic checkout (Build #5): persist the confirmed draft billing config
    // as the single authoritative value at start.
    startCheckout(rental.id, {
      mileageOut,
      fuelOut,
      signed,
      billingConfig,
    });
    // Audit any manager override applied at release. The provider/inspection
    // results themselves are NEVER altered — this records the operational
    // decision (actor + reason + overridden blockers) on the rental timeline.
    if (overrideApplied && gateOverrideEligible) {
      addRentalEvent({
        id: uid("rev"),
        rental_id: rental.id,
        type: "gate_override",
        label: `Release-gate override approved${
          overrideReason.trim() ? ` — ${overrideReason.trim()}` : ""
        }`,
        at: new Date().toISOString(),
        tone: "maintenance",
        staff_id: currentStaffId ?? null,
      });
      logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Override approved for ${rental.agreement_number}`,
        tone: "maintenance",
      });
    }
    toast.success("Rental started — vehicle is out.");
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
        title="Checkout"
        subtitle={
          <span className="font-mono tabular">
            {rental.agreement_number} ·{" "}
            {customer ? `${customer.first_name} ${customer.last_name}` : "—"} ·{" "}
            {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
          </span>
        }
        actions={
          <StatusPill tone={tone}>
            {rentalStatusMeta[rental.status].label}
          </StatusPill>
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
        {step === 0 && (
          <VerifyStep
            customer={customer}
            licenseOk={licenseOk}
            insuranceOk={insuranceOk}
            verificationReady={verificationReady}
          />
        )}

        {step === 1 && (
          <VehicleStep
            vehicle={vehicle}
            mileageOut={mileageOut}
            setMileageOut={setMileageOut}
            fuelOut={fuelOut}
            setFuelOut={setFuelOut}
          />
        )}

        {step === 2 && (
          <CheckoutPricingStep
            rental={rental}
            vehicle={vehicle}
            rentalAddons={rentalAddons}
            onBillingConfirm={setBillingConfig}
          />
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md bg-surface-2 px-3 py-3">
              <Row label="Grand total" value={fmtMoneyExact(grandTotal)} />
              <Row
                label="Paid so far"
                value={fmtMoneyExact(rental.amount_paid)}
                valueClass="text-status-available"
              />
              <Row
                label="Balance due"
                value={fmtMoneyExact(balanceBefore)}
                valueClass={
                  balanceBefore > 0
                    ? "text-status-maintenance"
                    : "text-status-available"
                }
              />
            </div>
            {balanceBefore > 0 && (
              <div className="space-y-3">
                <Label>Record a payment now</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={payAmount || ""}
                    onChange={(e) =>
                      setPayAmount(Math.max(0, Number(e.target.value)))
                    }
                    placeholder="0"
                    className="font-mono tabular"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setPayAmount(balanceBefore)}
                  >
                    Full balance
                  </Button>
                  <Button
                    disabled={payAmount <= 0}
                    onClick={handlePayment}
                    className="bg-primary text-primary-foreground hover:bg-primary-press"
                  >
                    <CreditCard size={16} className="mr-1.5" /> Record
                  </Button>
                </div>
                <PaymentMethodSelect
                  value={{ tender: payTender, processor: payProcessor }}
                  onChange={(v) => {
                    setPayTender(v.tender);
                    setPayProcessor(v.processor);
                  }}
                />
                <Input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Reference / confirmation ID (optional)"
                  className="font-mono tabular text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  At least half the total must be collected before checkout can
                  proceed.
                </p>
              </div>
            )}
            {balanceBefore === 0 && (
              <p className="flex items-center gap-2 rounded-md bg-status-available/10 px-3 py-2 text-sm text-status-available">
                <CheckCircle2 size={16} /> Balance fully collected — ready to
                continue.
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            {inspectionReady ? (
              <div className="flex items-center gap-3 rounded-md bg-status-available/10 px-3 py-3">
                <CheckCircle2 size={20} className="text-status-available" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Checkout inspection complete
                  </p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {checkoutInspection?.odometer_reading.toLocaleString()} mi ·{" "}
                    {checkoutInspection?.fuel_level}% fuel ·{" "}
                    {checkoutInspection?.photos.length} photos
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Capture the vehicle's condition at handoff. This opens the
                  inspection wizard — you'll return here when it's done.
                </p>
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary-press"
                  onClick={() =>
                    navigate(
                      `/inspections/new?res=${rental.reservation_id ?? ""}&type=checkout&return=/checkout/${rental.id}`,
                    )
                  }
                >
                  <ClipboardCheck size={16} className="mr-1.5" /> Open checkout
                  inspection <ExternalLink size={14} className="ml-1" />
                </Button>
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <Label className="flex items-center gap-1.5">
              <PenLine size={15} /> Agreement signature
            </Label>
            <button
              onClick={() => setSigned((s) => !s)}
              className={cn(
                "flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed transition-colors",
                signed
                  ? "border-status-available bg-status-available/10"
                  : "border-border hover:border-primary/40",
              )}
            >
              {signed ? (
                <div className="text-center">
                  <Check className="mx-auto text-status-available" size={28} />
                  <p className="mt-1 font-mono text-sm text-status-available">
                    Signed by {customer?.first_name ?? "renter"}
                  </p>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Tap to sign
                </span>
              )}
            </button>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md bg-surface-2 px-3 py-3">
              <Row
                label="Customer"
                value={
                  customer
                    ? `${customer.first_name} ${customer.last_name}`
                    : "—"
                }
              />
              <Row
                label="Vehicle"
                value={
                  vehicle
                    ? `${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`
                    : "—"
                }
              />
              <Row
                label="Mileage out"
                value={`${fmtNumber(mileageOut)} mi`}
                mono
              />
              <Row label="Fuel out" value={`${fuelOut}%`} mono />
              <Row
                label="Inspection"
                value={inspectionReady ? "Complete" : "Pending"}
              />
              <Row label="Signature" value={signed ? "Signed" : "—"} />
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Security deposit
                </span>
                <span
                  className={cn(
                    "font-mono tabular",
                    depositBlocks
                      ? "text-status-maintenance"
                      : "text-status-available",
                  )}
                >
                  {deposit
                    ? `${DEPOSIT_STATUS_LABELS[deposit.status]} · ${fmtMoneyExact(deposit.collected_amount)}`
                    : "No deposit required"}
                </span>
              </div>
              {depositBlocks && (
                <div className="flex items-start gap-2 rounded-md border border-status-maintenance/30 bg-status-maintenance/5 px-3 py-2 text-xs text-status-maintenance">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Security deposit remaining:{" "}
                    {fmtMoneyExact(depositRemaining)}. Collect it on the
                    reservation before starting the rental.
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-sm font-medium text-foreground">
                  Balance due
                </span>
                <span className="font-mono tabular text-status-maintenance">
                  {fmtMoneyExact(Math.max(0, grandTotal - rental.amount_paid))}
                </span>
              </div>
            </div>
            <CheckoutReleaseGate
              reasons={gateReasons}
              hardBlocked={gateHardBlocked}
              overrideEligible={gateOverrideEligible}
              overrideApplied={overrideApplied}
              overrideOpen={overrideOpen}
              overrideReason={overrideReason}
              canOverride={canOverrideStart}
              onOpenOverride={() => setOverrideOpen(true)}
              onCancelOverride={() => {
                setOverrideOpen(false);
                setOverrideReason("");
              }}
              onReasonChange={setOverrideReason}
              onApplyOverride={() => {
                setOverrideApplied(true);
                setOverrideOpen(false);
                toast.success("Override applied — eligible blockers cleared.");
              }}
            />
            <p className="text-sm text-muted-foreground">
              Starting the rental marks the vehicle as rented, the customer as
              an active renter, and updates the calendar.
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
            onClick={startRental}
            className="bg-primary px-6 text-primary-foreground hover:bg-primary-press"
          >
            <Check size={18} /> Start rental
          </Button>
        )}
      </div>
    </div>
  );
}
