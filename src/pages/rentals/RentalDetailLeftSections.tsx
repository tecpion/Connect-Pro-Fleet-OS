// Connect Pro Fleet — Rental Detail left-column sections (Build #59).
//
// Agreement details, financial summary, assigned staff, activity timeline,
// drivers, inspections, and the read-only Rental Record. Each reuses the
// EXISTING authoritative sub-components and store logic — nothing duplicated.

import { useMemo } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import type { RentalAgreement, Customer } from "@/lib/types";
import type { Driver } from "@/lib/inspectionTypes";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  rateTypeMeta,
  fmtMoneyExact,
  fmtDateShort,
  fmtDateTime,
  fmtNumber,
  statusToneClasses,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";
import { RentalFinancialSummary } from "@/pages/rentals/RentalFinancialSummary";
import { EntityAssignmentsSection } from "@/components/EntityAssignmentsSection";
import {
  RentalDefenseRecordView,
  ReleaseGateBanner,
} from "@/components/rentals/RentalDefenseRecordView";

export interface RentalSectionProps {
  rental: RentalAgreement;
  customer?: Customer;
  customerName: string;
}

// A. Agreement details
export function AgreementDetailsSection({
  rental,
  customer,
}: RentalSectionProps) {
  const { vehicles, staff } = useStore();
  const vehicle = vehicles.find((v) => v.id === rental.vehicle_id);
  const createdBy = staff.find((s) => s.id === rental.created_by);
  const termDays =
    rental.checkout_date && rental.scheduled_return_date
      ? Math.max(
          1,
          Math.round(
            (new Date(rental.scheduled_return_date).getTime() -
              new Date(rental.checkout_date).getTime()) /
              86400000,
          ),
        )
      : null;

  return (
    <div data-testid="rd-agreement-details">
      <SectionCard title="Agreement details">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <div>
            <DataLabel>Customer</DataLabel>
            <DataValue>
              {customer ? (
                <Link
                  to={`/customers/${customer.id}`}
                  className="hover:text-primary"
                >
                  {customer.first_name} {customer.last_name}
                </Link>
              ) : (
                "—"
              )}
            </DataValue>
          </div>
          <div>
            <DataLabel>Vehicle</DataLabel>
            <DataValue>
              {vehicle ? (
                <Link
                  to={`/vehicles/${vehicle.id}`}
                  className="hover:text-primary"
                >
                  {vehicle.make} {vehicle.model}
                </Link>
              ) : (
                "—"
              )}
            </DataValue>
          </div>
          <div>
            <DataLabel>Unit / plate</DataLabel>
            <DataValue mono>{vehicle?.license_plate ?? "—"}</DataValue>
          </div>
          <div>
            <DataLabel>Checkout</DataLabel>
            <DataValue mono>
              {rental.checkout_date
                ? `${fmtDateShort(rental.checkout_date)} ${rental.checkout_time ?? ""}`
                : "Not checked out"}
            </DataValue>
          </div>
          <div>
            <DataLabel>Scheduled return</DataLabel>
            <DataValue mono>
              {fmtDateShort(rental.scheduled_return_date)}{" "}
              {rental.scheduled_return_time ?? ""}
            </DataValue>
          </div>
          <div>
            <DataLabel>Actual return</DataLabel>
            <DataValue mono>
              {rental.actual_return_date
                ? `${fmtDateShort(rental.actual_return_date)} ${rental.actual_return_time ?? ""}`
                : "—"}
            </DataValue>
          </div>
          <div>
            <DataLabel>Rate</DataLabel>
            <DataValue mono>
              {fmtMoneyExact(rental.rate_amount)} /{" "}
              {rateTypeMeta[rental.rate_type].toLowerCase()}
            </DataValue>
          </div>
          <div>
            <DataLabel>Mileage out / in</DataLabel>
            <DataValue mono>
              {fmtNumber(rental.mileage_out ?? 0)} mi
              {rental.mileage_in != null
                ? ` / ${fmtNumber(rental.mileage_in)}`
                : ""}
            </DataValue>
          </div>
          <div>
            <DataLabel>Fuel out / in</DataLabel>
            <DataValue mono>
              {rental.fuel_out ?? "—"}%
              {rental.fuel_in != null ? ` / ${rental.fuel_in}%` : ""}
            </DataValue>
          </div>
          <div>
            <DataLabel>Payment day</DataLabel>
            <DataValue mono>{rental.weekly_payment_day ?? "—"}</DataValue>
          </div>
          {rental.next_payment_due && (
            <div>
              <DataLabel>Next payment due</DataLabel>
              <DataValue mono>
                {fmtDateShort(rental.next_payment_due)}
              </DataValue>
            </div>
          )}
          <div>
            <DataLabel>Weeks / days rented</DataLabel>
            <DataValue mono>
              {termDays != null
                ? `${rental.weeks_rented || 0}w · ${termDays}d`
                : "—"}
            </DataValue>
          </div>
          <div>
            <DataLabel>Created</DataLabel>
            <DataValue mono>{fmtDateTime(rental.created_at)}</DataValue>
            <p className="text-xs text-muted-foreground">
              by {createdBy?.full_name ?? "System"}
            </p>
          </div>
          {rental.prior_agreement_id && (
            <div>
              <DataLabel>Prior agreement</DataLabel>
              <DataValue>
                <Link
                  to={`/rentals/${rental.prior_agreement_id}`}
                  className="font-mono text-primary hover:underline"
                >
                  {rental.prior_agreement_id}
                </Link>
              </DataValue>
            </div>
          )}
          {rental.renewed_from_agreement_id && (
            <div>
              <DataLabel>Renewed from</DataLabel>
              <DataValue>
                <Link
                  to={`/rentals/${rental.renewed_from_agreement_id}`}
                  className="font-mono text-primary hover:underline"
                >
                  {rental.renewed_from_agreement_id}
                </Link>
              </DataValue>
            </div>
          )}
        </dl>
        {rental.policy_snapshot && (
          <p className="mt-3 text-xs text-muted-foreground">
            Policy snapshot frozen at checkout. Prior agreements are never
            overwritten — renewals create a new agreement.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

// B. Financial summary (authoritative)
export function FinancialSummarySection({ rental }: RentalSectionProps) {
  return (
    <div data-testid="rd-financial-summary">
      <RentalFinancialSummary rental={rental} />
    </div>
  );
}

// C. Assigned staff
export function AssignedStaffSection({ rental }: RentalSectionProps) {
  return (
    <div data-testid="rd-assigned-staff">
      <EntityAssignmentsSection
        entityType="rental"
        entityId={rental.id}
        entityLabel={rental.agreement_number}
      />
    </div>
  );
}

// D. Activity timeline (authoritative rental events + vehicle history)
export function ActivityTimelineSection({ rental }: RentalSectionProps) {
  const { rentalEvents, staff, vehicles, vehicleExchanges } = useStore();
  const events = useMemo(
    () =>
      rentalEvents
        .filter((e) => e.rental_id === rental.id)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [rentalEvents, rental],
  );
  const vehicle = vehicles.find((v) => v.id === rental.vehicle_id);
  const exchanges = vehicleExchanges(rental.id);

  return (
    <div data-testid="rd-activity">
      <SectionCard title="Activity timeline">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet. Actions on this rental will appear here.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((e) => {
              const evStaff = staff.find((s) => s.id === e.staff_id);
              return (
                <li key={e.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full",
                      statusToneClasses[e.tone].dot,
                    )}
                  />
                  <p className="text-sm text-foreground">{e.label}</p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {fmtDateTime(e.at)}
                    {evStaff ? ` · ${evStaff.full_name}` : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground">
            Vehicle history
          </h4>
          {exchanges.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No vehicle exchanges.{" "}
              {vehicle ? `${vehicle.make} ${vehicle.model}` : "This vehicle"}{" "}
              has been assigned since checkout.
            </p>
          ) : (
            <ol className="relative mt-3 space-y-3 border-l border-border pl-5">
              <li className="relative">
                <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-status-rented" />
                <p className="text-sm text-foreground">
                  {rental.checkout_date
                    ? `${fmtDateShort(rental.checkout_date)} – `
                    : ""}
                  Current · {vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}
                </p>
              </li>
              {exchanges
                .slice()
                .reverse()
                .map((x) => {
                  const oldV = vehicles.find((v) => v.id === x.old_vehicle_id);
                  return (
                    <li key={x.id} className="relative">
                      <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                      <p className="text-sm text-foreground">
                        {fmtDateShort(x.exchange_at.slice(0, 10))} ·{" "}
                        {oldV ? `${oldV.make} ${oldV.model}` : x.old_vehicle_id}
                      </p>
                      <p className="font-mono text-xs tabular text-muted-foreground">
                        Reason: {x.reason}
                        {x.rate_changed
                          ? ` · rate changed to ${fmtMoneyExact(x.new_rate ?? 0)}`
                          : ""}
                      </p>
                    </li>
                  );
                })}
            </ol>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// Drivers — compact summary (verification lives per customer)
export function DriversSection({ rental }: RentalSectionProps) {
  const { drivers } = useStore();
  const rentalDrivers = useMemo(
    () => drivers.filter((d) => d.reservation_id === rental.reservation_id),
    [drivers, rental],
  );
  return (
    <div data-testid="rd-drivers">
      <SectionCard title="Drivers">
        {rentalDrivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No authorized drivers recorded. Drivers are added during
            reservation/checkout verification.
          </p>
        ) : (
          <ul className="space-y-2">
            {rentalDrivers.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {d.full_name}
                  </p>
                  <p className="font-mono text-xs tabular text-muted-foreground">
                    {d.license_number} · {d.license_state}
                    {d.license_expiry
                      ? ` · exp ${fmtDateShort(d.license_expiry)}`
                      : ""}
                  </p>
                </div>
                <DriverVerifyPill status={d.verification_status} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Verification is managed per customer at{" "}
          <Link
            to={`/customers/${rental.customer_id}`}
            className="text-primary hover:underline"
          >
            Customer Detail
          </Link>
          .
        </p>
      </SectionCard>
    </div>
  );
}

// Inspections — compact summary with link to full inspection
export function InspectionsSection({ rental }: RentalSectionProps) {
  const { inspections } = useStore();
  const navigate = useNavigate();
  const rentalInspections = useMemo(
    () => inspections.filter((i) => i.reservation_id === rental.reservation_id),
    [inspections, rental],
  );
  return (
    <div data-testid="rd-inspections">
      <SectionCard
        title="Inspections"
        right={
          <button
            onClick={() =>
              navigate(
                `/inspections/new?res=${rental.reservation_id ?? ""}&type=checkout`,
              )
            }
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <ClipboardCheck size={13} /> Start
          </button>
        }
      >
        {rentalInspections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No inspections recorded yet for this rental.
          </p>
        ) : (
          <ul className="space-y-2">
            {rentalInspections
              .slice()
              .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
              .map((i) => (
                <li
                  key={i.id}
                  className="rounded-md border border-border bg-surface-2 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize text-foreground">
                      {i.inspection_type} inspection
                    </span>
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {fmtDateTime(i.timestamp)}
                    </span>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    <div>
                      <DataLabel>Odometer</DataLabel>
                      <DataValue mono>
                        {fmtNumber(i.odometer_reading)} mi
                      </DataValue>
                    </div>
                    <div>
                      <DataLabel>Fuel</DataLabel>
                      <DataValue mono>{i.fuel_level}%</DataValue>
                    </div>
                    <div>
                      <DataLabel>Photos</DataLabel>
                      <DataValue mono>{i.photos.length}</DataValue>
                    </div>
                    <div>
                      <DataLabel>Damage</DataLabel>
                      <DataValue>{i.damage_detected ? "Yes" : "No"}</DataValue>
                    </div>
                  </dl>
                </li>
              ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// F. Rental Record — read-only derived evidence view (inline, collapsible
// subsections handled inside RentalDefenseRecordView).
export function RentalRecordSection({ rental }: RentalSectionProps) {
  return (
    <div data-testid="rd-rental-record">
      <ReleaseGateBanner rentalId={rental.id} />
      <RentalDefenseRecordView rentalId={rental.id} />
    </div>
  );
}

function DriverVerifyPill({
  status,
}: {
  status: Driver["verification_status"];
}) {
  if (status === "verified")
    return <StatusPill tone="available">Verified</StatusPill>;
  if (status === "failed") return <StatusPill tone="out">Failed</StatusPill>;
  return <StatusPill tone="maintenance">Pending</StatusPill>;
}
