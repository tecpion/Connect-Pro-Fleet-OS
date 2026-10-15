import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router-compat";
import { useStore, uid } from "@/lib/store";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useVerificationOptional } from "@/lib/store/verificationStore";
import { useViolations } from "@/lib/violationStoreProvider";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { getViolationsByCustomer } from "@/lib/violationSelectors";
import {
  deriveLicenseDisplayStatus,
  deriveInsuranceDocumentStatus,
  deriveInsuranceVerificationStatus,
  LICENSE_STATUS_LABELS,
  INSURANCE_DOC_LABELS,
  INSURANCE_VERIFICATION_LABELS,
  type LicenseDisplayStatus,
} from "@/lib/customerVerificationDisplay";
import {
  PageHeader,
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { EntityAssignmentsSection } from "@/components/EntityAssignmentsSection";
import { StatusPill, customerTone, rentalTone } from "@/components/Status";
import {
  customerStatusMeta,
  customerSourceMeta,
  rentalStatusMeta,
  reservationStatusMeta,
  fmtMoney,
  fmtMoneyExact,
  fmtDate,
  fmtDateShort,
  fmtDateTime,
  statusToneClasses,
} from "@/lib/format";
import { DEPOSIT_STATUS_LABELS } from "@/lib/depositTypes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import {
  ArrowLeft,
  CalendarPlus,
  PlayCircle,
  DollarSign,
  StickyNote,
  Phone,
  Mail,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Car,
  ListTodo,
} from "lucide-react";
import { CustomerArrangementsTab } from "@/pages/customers/CustomerArrangementsTab";
import { CustomerNotesTab } from "@/pages/customers/CustomerNotesTab";
import { CustomerPaymentsTab } from "@/pages/customers/CustomerPaymentsTab";
import {
  CustomerReservationsTab,
  CustomerRentalsTab,
} from "@/pages/customers/CustomerListTabs";
import { CreateTaskDialog } from "@/pages/tasks/CreateTaskDialog";
import { toast } from "sonner";
import { CustomerDamageTab } from "@/pages/customers/CustomerDamageTab";
import { CustomerViolationsSection } from "@/pages/violations/ViolationSections";
import { CustomerComplianceSection } from "@/pages/compliance/ComplianceSections";
import { Customer360Overview } from "@/pages/customers/Customer360Overview";
import { CustomerOverviewTab } from "@/pages/customers/CustomerOverviewTab";

const TABS = [
  "Overview",
  "360",
  "Verification & Documents",
  "Reservations",
  "Rentals",
  "Payments",
  "Arrangements",
  "Tickets",
  "Damage",
  "Notes",
] as const;
type Tab = (typeof TABS)[number];

export default function CustomerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    customers,
    rentals,
    reservations,
    vehicles,
    rentalEvents,
    inspections,
    maintenance,
    updateCustomer,
    logActivity,
    transactions,
    depositForCustomer,
    recordRentalPayment,
    currentStaffId,
  } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const verificationOpt = useVerificationOptional();
  const violationsStore = useViolations();
  const damageStore = useDamageClaims();
  const [tab, setTab] = useState<Tab>("Overview");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [taskOpen, setTaskOpen] = useState(false);

  const customer = customers.find((c) => c.id === id);

  const custRentals = useMemo(
    () => rentals.filter((r) => r.customer_id === id),
    [rentals, id],
  );
  const custReservations = useMemo(
    () => reservations.filter((r) => r.customer_id === id),
    [reservations, id],
  );

  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        hint="They may have been removed."
        action={
          <Link to="/customers">
            <Button variant="outline">Back</Button>
          </Link>
        }
      />
    );
  }

  const tone = customerTone(customer.customer_status);
  const lifetimeRevenue = custRentals.reduce((s, r) => s + r.amount_paid, 0);
  const currentBalance = custRentals
    .filter((r) =>
      ["active", "late", "overdue", "payment_due"].includes(r.status),
    )
    .reduce((s, r) => s + r.balance_due, 0);
  const activeRental = custRentals.find((r) => r.status === "active");
  const currentVehicle = activeRental
    ? vehicles.find((v) => v.id === activeRental.vehicle_id)
    : undefined;
  const futureReservations = custReservations.filter((r) =>
    ["confirmed", "pending_verification"].includes(r.status),
  );
  const totalRentals = custRentals.length;

  // ── Primary action eligibility (no dead buttons) ──
  // New reservation → prefilled reservation-creation flow. Start rental → only
  // when a confirmed reservation exists with a converted rental to check out.
  // Record payment → opens the existing payment flow against an active rental.
  // Send message → Connect Pro CRM communication is not live in-app, so it is
  // hidden (no second messaging system). Add note → existing notes flow.
  const newReservationHref = `/planner?customer=${customer.id}`;
  const checkoutEligibleRes = custReservations.find(
    (r) =>
      r.status === "confirmed" &&
      r.converted_to_rental_id &&
      rentals.some(
        (x) =>
          x.id === r.converted_to_rental_id &&
          x.status === "ready_for_checkout",
      ),
  );
  const paymentRentals = custRentals.filter((r) =>
    ["active", "late", "overdue", "payment_due"].includes(r.status),
  );
  const hasPaymentTarget = paymentRentals.length > 0;
  // Prefer the active rental with a balance; fall back to the first eligible.
  const paymentTargetRental =
    paymentRentals.find((r) => r.balance_due > 0) ?? paymentRentals[0];

  // Derive Tickets + Damage Claims counts from AUTHORITATIVE stores (never a
  // hardcoded zero unless the count is truly derived as zero).
  const ticketsCount = useMemo(
    () => getViolationsByCustomer(violationsStore.violations, id ?? "").length,
    [violationsStore.violations, id],
  );
  const damageClaimsCount = useMemo(
    () =>
      damageStore.damageClaims.filter(
        (c) =>
          c.customer_id === id &&
          c.claim_status !== "closed" &&
          c.claim_status !== "cancelled",
      ).length,
    [damageStore.damageClaims, id],
  );

  // Derive license + insurance display states from authoritative data.
  const licenseStatus: LicenseDisplayStatus = customer
    ? deriveLicenseDisplayStatus({
        customer,
        requests: verificationOpt?.requests ?? [],
        requirements: verificationOpt?.requirements ?? [],
        overrides: verificationOpt?.overrides ?? [],
        policies: companyPolicies.verification_services.services,
      })
    : "not_verified";
  const insuranceDocStatus = customer
    ? deriveInsuranceDocumentStatus(customer)
    : "missing";
  const insuranceVerificationStatus = customer
    ? deriveInsuranceVerificationStatus({
        customer,
        requests: verificationOpt?.requests ?? [],
        policies: companyPolicies.verification_services.services,
      })
    : "not_run";

  const summaryCards = [
    { label: "Lifetime Revenue", value: fmtMoney(lifetimeRevenue), mono: true },
    { label: "Total Rentals", value: String(totalRentals), mono: true },
    {
      label: "Current Balance",
      value: fmtMoney(currentBalance),
      mono: true,
      tone: currentBalance > 0 ? "maintenance" : "neutral",
    },
    {
      label: "Current Rental",
      value: currentVehicle
        ? `${currentVehicle.make} ${currentVehicle.model}`
        : "None",
      mono: false,
    },
    {
      label: "Future Reservations",
      value: String(futureReservations.length),
      mono: true,
    },
    { label: "Tickets", value: String(ticketsCount), mono: true },
    { label: "Damage Claims", value: String(damageClaimsCount), mono: true },
  ];

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} /> Customers
      </Link>

      <PageHeader
        title={`${customer.first_name} ${customer.last_name}`}
        subtitle={
          <span className="font-mono tabular">
            {customer.phone} · {customer.email}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone={tone}>
              {customerStatusMeta[customer.customer_status].label}
            </StatusPill>
            <span className="font-mono text-xs text-muted-foreground">
              since {fmtDate(customer.created_at)}
            </span>
          </div>
        }
      />

      {/* Primary actions — every visible button performs a real contextual
          action. Send message is hidden (Connect Pro CRM communication is not
          live in-app; no second messaging system is built here). */}
      <div className="flex flex-wrap gap-2">
        <a href={newReservationHref}>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-press">
            <CalendarPlus size={15} className="mr-1.5" /> New reservation
          </Button>
        </a>
        {checkoutEligibleRes && (
          <Button
            variant="outline"
            onClick={() =>
              navigate(
                `/checkout/${checkoutEligibleRes.converted_to_rental_id}`,
              )
            }
          >
            <PlayCircle size={15} className="mr-1.5" /> Start rental
          </Button>
        )}
        {hasPaymentTarget && (
          <Button variant="outline" onClick={() => setPayOpen(true)}>
            <DollarSign size={15} className="mr-1.5" /> Record payment
          </Button>
        )}
        <Button variant="outline" onClick={() => setNoteOpen(true)}>
          <StickyNote size={15} className="mr-1.5" /> Add note
        </Button>
        <Button variant="outline" onClick={() => setTaskOpen(true)}>
          <ListTodo size={15} className="mr-1.5" /> Create task
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p
              className={cn(
                "mt-1 text-lg font-semibold",
                card.mono && "font-mono tabular",
                card.tone === "maintenance"
                  ? "text-status-maintenance"
                  : "text-foreground",
              )}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "360" && <Customer360Overview customerId={customer.id} />}

      {tab === "Overview" && (
        <CustomerOverviewTab
          customer={customer}
          custRentals={custRentals}
          vehicles={vehicles}
        />
      )}

      {tab === "Verification & Documents" && (
        <div className="space-y-6">
          <SectionCard title="Driver's license">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <DataLabel>License number</DataLabel>
                <DataValue mono>
                  {customer.drivers_license_number ?? "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>State</DataLabel>
                <DataValue mono>
                  {customer.drivers_license_state ?? "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>Expiry</DataLabel>
                <DataValue mono>
                  {customer.drivers_license_expiry
                    ? fmtDate(customer.drivers_license_expiry)
                    : "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>Verification</DataLabel>
                <DataValue>
                  <span
                    data-testid="license-verification-status"
                    className="inline-flex items-center gap-1.5"
                  >
                    {licenseStatus === "verified" ? (
                      <ShieldCheck
                        size={15}
                        className="text-status-available"
                      />
                    ) : licenseStatus === "expired" ? (
                      <ShieldX size={15} className="text-status-out" />
                    ) : licenseStatus === "failed" ? (
                      <ShieldX size={15} className="text-status-out" />
                    ) : licenseStatus === "not_required" ? (
                      <ShieldCheck
                        size={15}
                        className="text-muted-foreground"
                      />
                    ) : (
                      <ShieldAlert
                        size={15}
                        className="text-status-maintenance"
                      />
                    )}{" "}
                    <span
                      className={cn(
                        licenseStatus === "verified"
                          ? "text-status-available"
                          : licenseStatus === "expired" ||
                              licenseStatus === "failed"
                            ? "text-status-out"
                            : "text-foreground",
                      )}
                    >
                      {LICENSE_STATUS_LABELS[licenseStatus]}
                    </span>
                  </span>
                </DataValue>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {["Front", "Back"].map((side) => (
                <div
                  key={side}
                  className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border bg-surface-2 text-sm text-muted-foreground"
                >
                  {side} image
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Insurance">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <DataLabel>Company</DataLabel>
                <DataValue>{customer.insurance_company ?? "—"}</DataValue>
              </div>
              <div>
                <DataLabel>Policy number</DataLabel>
                <DataValue mono>
                  {customer.insurance_policy_number ?? "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>Expiry</DataLabel>
                <DataValue mono>
                  {customer.insurance_expiry
                    ? fmtDate(customer.insurance_expiry)
                    : "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>Document</DataLabel>
                <DataValue>
                  <span
                    data-testid="insurance-document-status"
                    className={cn(
                      insuranceDocStatus === "missing"
                        ? "text-status-out"
                        : insuranceDocStatus === "expired"
                          ? "text-status-out"
                          : "text-status-available",
                    )}
                  >
                    {INSURANCE_DOC_LABELS[insuranceDocStatus]}
                  </span>
                </DataValue>
              </div>
              <div>
                <DataLabel>Verification</DataLabel>
                <DataValue>
                  <span
                    data-testid="insurance-verification-status"
                    className="inline-flex items-center gap-1.5"
                  >
                    {insuranceVerificationStatus === "verified" ? (
                      <ShieldCheck
                        size={15}
                        className="text-status-available"
                      />
                    ) : insuranceVerificationStatus === "failed" ? (
                      <ShieldX size={15} className="text-status-out" />
                    ) : insuranceVerificationStatus === "not_required" ? (
                      <ShieldCheck
                        size={15}
                        className="text-muted-foreground"
                      />
                    ) : (
                      <ShieldAlert
                        size={15}
                        className="text-status-maintenance"
                      />
                    )}{" "}
                    <span
                      className={cn(
                        insuranceVerificationStatus === "verified"
                          ? "text-status-available"
                          : insuranceVerificationStatus === "failed"
                            ? "text-status-out"
                            : "text-foreground",
                      )}
                    >
                      {
                        INSURANCE_VERIFICATION_LABELS[
                          insuranceVerificationStatus
                        ]
                      }
                    </span>
                  </span>
                </DataValue>
              </div>
            </dl>
          </SectionCard>

          <CustomerComplianceSection
            customerId={customer.id}
            customerLabel={`${customer.first_name} ${customer.last_name}`}
          />
        </div>
      )}

      {tab === "Reservations" && (
        <CustomerReservationsTab
          customer={customer}
          custReservations={custReservations}
        />
      )}

      {tab === "Rentals" && <CustomerRentalsTab custRentals={custRentals} />}

      {tab === "Payments" && (
        <CustomerPaymentsTab
          customerId={id ?? ""}
          custRentals={custRentals}
          rentalEvents={rentalEvents}
        />
      )}

      {tab === "Tickets" && <CustomerViolationsSection customerId={id ?? ""} />}

      {tab === "Damage" && <CustomerDamageTab customerId={id ?? ""} />}

      {tab === "Notes" && <CustomerNotesTab customer={customer} />}

      {tab === "Arrangements" && (
        <CustomerArrangementsTab customerId={customer.id} />
      )}

      {taskOpen && (
        <CreateTaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          preset={{
            entityType: "customer",
            entityId: customer.id,
            entityLabel: `${customer.first_name} ${customer.last_name}`,
            category: "customer_follow_up",
          }}
        />
      )}

      {payOpen && paymentTargetRental && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          balanceDue={paymentTargetRental.balance_due}
          defaultAmount={paymentTargetRental.balance_due}
          title={`Record payment — ${paymentTargetRental.agreement_number}`}
          onSubmit={(r) => {
            recordRentalPayment(paymentTargetRental.id, r.amount, r.tender, {
              processor: r.processor,
              reference: r.reference,
            });
            logActivity({
              id: uid("act"),
              at: new Date().toISOString(),
              label: `Payment ${fmtMoney(r.amount)} recorded for ${paymentTargetRental.agreement_number}`,
              tone: "available",
            });
            toast.success(`Recorded ${fmtMoney(r.amount)}.`);
            setPayOpen(false);
          }}
        />
      )}

      {noteOpen && (
        <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add note</DialogTitle>
            </DialogHeader>
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a customer note…"
              className="min-h-[120px]"
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setNoteOpen(false);
                  setNoteText("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!noteText.trim()}
                onClick={() => {
                  const next = noteText.trim();
                  updateCustomer(customer.id, {
                    notes: customer.notes
                      ? `${customer.notes}\n\n${next}`
                      : next,
                  });
                  logActivity({
                    id: uid("act"),
                    at: new Date().toISOString(),
                    label: `Note added to ${customer.first_name} ${customer.last_name}`,
                    tone: "neutral",
                  });
                  setNoteOpen(false);
                  setNoteText("");
                }}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                Save note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
