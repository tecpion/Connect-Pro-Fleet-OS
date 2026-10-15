// Connect Pro Fleet — Customer reservations + rentals tabs (Build #10).
// Extracted from CustomerProfile to keep it under the line limit.

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill, customerTone, rentalTone } from "@/components/Status";
import {
  fmtMoneyExact,
  fmtDateShort,
  rentalStatusMeta,
  reservationStatusMeta,
} from "@/lib/format";
import type {
  Customer,
  RentalAgreement,
  Reservation,
  Vehicle,
} from "@/lib/types";

export function CustomerReservationsTab({
  customer,
  custReservations,
}: {
  customer: Customer;
  custReservations: Reservation[];
}) {
  const { vehicles } = useStore();
  return (
    <SectionCard title="Reservations">
      {custReservations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reservations. Create one to block vehicle dates.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Vehicle</th>
                <th className="px-2 py-2 font-medium">Dates</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {custReservations.map((r) => {
                const v = vehicles.find((x) => x.id === r.vehicle_id);
                return (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="px-2 py-2">
                      <Link
                        to={`/reservations/${r.id}`}
                        className="font-mono text-xs hover:text-primary"
                      >
                        {r.id}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      {v ? `${v.make} ${v.model}` : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono tabular">
                      {fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill tone={customerTone(customer.customer_status)}>
                        {reservationStatusMeta[r.status].label}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function CustomerRentalsTab({
  custRentals,
}: {
  custRentals: RentalAgreement[];
}) {
  const { vehicles } = useStore();
  return (
    <SectionCard title="Rental agreements">
      {custRentals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rental agreements. Convert a reservation to create one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Agreement</th>
                <th className="px-2 py-2 font-medium">Vehicle</th>
                <th className="px-2 py-2 font-medium">Checkout</th>
                <th className="px-2 py-2 font-medium">Return</th>
                <th className="px-2 py-2 text-right font-medium">Balance</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {custRentals.map((r) => {
                const v = vehicles.find((x) => x.id === r.vehicle_id);
                return (
                  <tr key={r.id} className="hover:bg-surface-2">
                    <td className="px-2 py-2">
                      <Link
                        to={`/rentals/${r.id}`}
                        className="font-mono text-xs hover:text-primary"
                      >
                        {r.agreement_number}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      {v ? `${v.make} ${v.model}` : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono tabular">
                      {r.checkout_date ? fmtDateShort(r.checkout_date) : "—"}
                    </td>
                    <td className="px-2 py-2 font-mono tabular">
                      {r.actual_return_date
                        ? fmtDateShort(r.actual_return_date)
                        : fmtDateShort(r.scheduled_return_date)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular">
                      {fmtMoneyExact(r.balance_due)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill tone={rentalTone(r.status)}>
                        {rentalStatusMeta[r.status].label}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
