// Connect Pro Fleet — Rental Detail operational dashboard (Build #59).
//
// Founder review: the previous tab-heavy command-center layout required too
// many clicks. Rental Detail is restored to a strong at-a-glance operational
// dashboard so a staff member can open a rental and immediately understand
// customer, vehicle, status, dates, balance, payment status, deposit,
// billing, staff assignment, warnings, recent activity, damage/tolls/issues,
// documents, and the Rental Record — without clicking through tabs.
//
// Navigation consolidation (Build #58) is preserved: Payments Due, Payment
// Arrangements, Security Deposits, and Verification remain contextual (Rental
// Management filters, Action Center, Rental Detail, Customer Detail, Finance,
// Reports). No standalone sidebar pages were reintroduced.
//
// Every section reuses the EXISTING authoritative sub-components and store
// logic — no ledger duplicated, no financial engine changed, no deposit
// accounting altered. The Rental Record remains the read-only derived view.

import { useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router-compat";
import { AskCopilotButton } from "@/components/copilot/AskCopilotButton";
import { useStore } from "@/lib/store";
import type { ChargeType } from "@/lib/types";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill, rentalTone } from "@/components/Status";
import { RouteProgress } from "@/components/RouteLine";
import { rentalStatusMeta, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { RentalDialogs } from "@/pages/rentals/RentalDialogs";
import { RentalActions } from "@/pages/rentals/RentalActions";
import { ExchangeVehicleDialog } from "@/pages/rentals/ExchangeVehicleDialog";
import { CreateTaskDialog } from "@/pages/tasks/CreateTaskDialog";
import { RentalWarningArea } from "@/pages/rentals/RentalWarningArea";
import {
  AgreementDetailsSection,
  FinancialSummarySection,
  AssignedStaffSection,
  ActivityTimelineSection,
  DriversSection,
  InspectionsSection,
  RentalRecordSection,
} from "@/pages/rentals/RentalDetailLeftSections";
import { RentalVehicleLocationSection } from "@/pages/rentals/RentalVehicleLocationSection";
import { RentalVerificationReadinessCard } from "@/pages/rentals/RentalVerificationReadinessCard";
import {
  SecurityDepositSection,
  PaymentArrangementSection,
  BillingSection,
  DamageClaimsSection,
  TollsViolationsSection,
  RentalDocumentsSection,
} from "@/pages/rentals/RentalDetailRightSections";

export default function RentalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    rentals,
    customers,
    vehicles,
    recordRentalPayment,
    extendRental: extendRentalStore,
  } = useStore();

  const rental = rentals.find((r) => r.id === id);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState(7);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeType, setChargeType] = useState<ChargeType>(
    "miscellaneous_charge",
  );
  const [chargeAmount, setChargeAmount] = useState(0);
  const [chargeDesc, setChargeDesc] = useState("");
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  if (!rental) {
    return (
      <EmptyState
        title="Rental agreement not found"
        hint="It may have been removed."
        action={
          <Link to="/rental-management">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
    );
  }

  const customer = customers.find((c) => c.id === rental.customer_id);
  const vehicle = vehicles.find((v) => v.id === rental.vehicle_id);
  const tone = rentalTone(rental.status);
  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : "";

  const progress =
    rental.status === "completed"
      ? 1
      : rental.status === "active"
        ? 0.5
        : rental.status === "ready_for_checkout"
          ? 0.15
          : 0.05;

  const recordPayment = (
    amount: number,
    tender: import("@/lib/paymentMethodTypes").TenderMethod,
    processor: import("@/lib/paymentMethodTypes").PaymentProcessor | null,
    reference: string,
  ) => {
    recordRentalPayment(rental.id, amount, tender, { processor, reference });
    toast.success(`Recorded ${fmtMoney(amount)}. Balance updated.`);
    setPayOpen(false);
  };

  const extendRental = (days: number) => {
    extendRentalStore(rental.id, days);
    toast.success(`Extended ${days} days. Balance updated.`);
    setExtendOpen(false);
  };

  const sectionProps = { rental, customer, customerName };

  return (
    <div className="space-y-6" data-testid="rental-detail-dashboard">
      {/* Contextual breadcrumb */}
      <Link
        to="/rental-management"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} /> Rental Management
      </Link>

      {rental.reservation_id && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Created from reservation
          </span>
          <Link
            to={`/reservations/${rental.reservation_id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {rental.reservation_id}
          </Link>
        </div>
      )}

      {/* Top header: rental number, customer, vehicle, plate, status, copilot */}
      <PageHeader
        title={rental.agreement_number}
        subtitle={
          <span className="font-mono tabular">
            {customerName || "—"} ·{" "}
            {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"} ·{" "}
            {vehicle?.license_plate ?? ""}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone={tone}>
              {rentalStatusMeta[rental.status].label}
            </StatusPill>
            <AskCopilotButton
              rentalId={rental.id}
              label={`Rental ${rental.agreement_number}`}
            />
          </div>
        }
      />

      {/* Lifecycle / progress bar */}
      <SectionCard>
        <div className="flex items-center justify-between">
          {["Checkout", "Active rental", "Return"].map((label) => (
            <p
              key={label}
              className={cn(
                "flex-1 text-xs font-medium",
                progress >= 0.4 ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </p>
          ))}
        </div>
        <div className="mt-2">
          <RouteProgress value={progress} stops={3} />
        </div>
      </SectionCard>

      {/* Warning / attention area (only when applicable) */}
      <RentalWarningArea rental={rental} />

      {/* Two-column dashboard. Mobile: single column with priority order. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT / MAIN COLUMN */}
        <div className="space-y-6 lg:col-span-2">
          <AgreementDetailsSection {...sectionProps} />
          <FinancialSummarySection {...sectionProps} />
          <AssignedStaffSection {...sectionProps} />
          <ActivityTimelineSection {...sectionProps} />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <DriversSection {...sectionProps} />
            <InspectionsSection {...sectionProps} />
          </div>
          <RentalRecordSection {...sectionProps} />
        </div>

        {/* RIGHT COLUMN — operational cards */}
        <div className="space-y-6">
          <div data-testid="rd-actions">
            <RentalActions
              rental={rental}
              customer={customer}
              navigate={navigate}
              handlers={{
                setPayOpen: (v) => {
                  setPayAmount(rental.balance_due);
                  setPayOpen(v);
                },
                setExtendOpen,
                setChargeOpen,
                setChargeType,
                setChargeAmount,
                setChargeDesc,
                openExchange: () => setExchangeOpen(true),
                setTaskOpen: setTaskOpen,
              }}
            />
          </div>
          {/* V1 Telematics — compact rental-relevant vehicle location card.
              The full Telematics workspace lives under /telematics. */}
          <RentalVehicleLocationSection
            rentalId={rental.id}
            vehicleId={rental.vehicle_id}
          />
          <RentalVerificationReadinessCard rental={rental} />
          <SecurityDepositSection {...sectionProps} />
          <PaymentArrangementSection {...sectionProps} />
          <BillingSection {...sectionProps} />
          <DamageClaimsSection {...sectionProps} />
          <TollsViolationsSection {...sectionProps} />
          <RentalDocumentsSection {...sectionProps} />
        </div>
      </div>

      <RentalDialogs
        rental={rental}
        vehicle={vehicle}
        state={{
          payOpen,
          setPayOpen,
          payAmount,
          setPayAmount,
          extendOpen,
          setExtendOpen,
          extendDays,
          setExtendDays,
          chargeOpen,
          setChargeOpen,
          chargeType,
          setChargeType,
          chargeAmount,
          setChargeAmount,
          chargeDesc,
          setChargeDesc,
        }}
        recordPayment={recordPayment}
        extendRental={extendRental}
      />

      <ExchangeVehicleDialog
        rental={rental}
        open={exchangeOpen}
        onOpenChange={setExchangeOpen}
      />
      <CreateTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        preset={{
          entityType: "rental",
          entityId: rental.id,
          entityLabel: `${rental.agreement_number}${customer ? ` · ${customer.first_name} ${customer.last_name}` : ""}`,
          category: "return",
        }}
      />
    </div>
  );
}
