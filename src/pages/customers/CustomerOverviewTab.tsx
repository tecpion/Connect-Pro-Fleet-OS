// Connect Pro Fleet — Customer Profile Overview tab (Build #27).
// Extracted from CustomerProfile to keep it under the line limit and host the
// new "360" Customer 360 overview tab.

import { Link } from "@/lib/router-compat";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { StatusPill, rentalTone } from "@/components/Status";
import { EntityAssignmentsSection } from "@/components/EntityAssignmentsSection";
import {
  customerSourceMeta,
  rentalStatusMeta,
  fmtDate,
  fmtDateShort,
} from "@/lib/format";
import type { Customer, RentalAgreement, Vehicle } from "@/lib/types";
import { Phone, Mail, Car } from "lucide-react";

export function CustomerOverviewTab({
  customer,
  custRentals,
  vehicles,
}: {
  customer: Customer;
  custRentals: RentalAgreement[];
  vehicles: Vehicle[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <SectionCard title="Contact">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <DataLabel>Phone</DataLabel>
              <DataValue mono>{customer.phone}</DataValue>
            </div>
            <div>
              <DataLabel>Email</DataLabel>
              <DataValue>{customer.email}</DataValue>
            </div>
            <div>
              <DataLabel>Date of birth</DataLabel>
              <DataValue mono>
                {customer.date_of_birth ? fmtDate(customer.date_of_birth) : "—"}
              </DataValue>
            </div>
            <div>
              <DataLabel>Source</DataLabel>
              <DataValue>
                {customerSourceMeta[customer.customer_source]}
              </DataValue>
            </div>
            <div className="col-span-2">
              <DataLabel>Address</DataLabel>
              <DataValue>
                {customer.address
                  ? `${customer.address}, ${customer.city ?? ""}, ${customer.state ?? ""} ${customer.zip ?? ""}`
                  : "—"}
              </DataValue>
            </div>
            <div>
              <DataLabel>Emergency contact</DataLabel>
              <DataValue>{customer.emergency_contact_name ?? "—"}</DataValue>
              <p className="font-mono text-xs tabular text-muted-foreground">
                {customer.emergency_contact_phone ?? ""}
              </p>
            </div>
          </dl>
        </SectionCard>
        <EntityAssignmentsSection
          entityType="customer"
          entityId={customer.id}
          entityLabel={`${customer.first_name} ${customer.last_name}`}
          title="Account Owner"
        />
        <SectionCard title="Recent rentals">
          {custRentals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rentals yet. Start a rental from a reservation to see it here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {custRentals.slice(0, 5).map((r) => {
                const v = vehicles.find((x) => x.id === r.vehicle_id);
                return (
                  <li key={r.id} className="py-2.5">
                    <Link
                      to={`/rentals/${r.id}`}
                      className="flex items-center justify-between hover:text-primary"
                    >
                      <div>
                        <p className="font-mono text-sm font-medium text-foreground">
                          {r.agreement_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {v ? `${v.make} ${v.model}` : "—"} ·{" "}
                          {fmtDateShort(r.checkout_date ?? r.created_at)}
                        </p>
                      </div>
                      <StatusPill tone={rentalTone(r.status)}>
                        {rentalStatusMeta[r.status].label}
                      </StatusPill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="space-y-6">
        <SectionCard title="Quick actions">
          <div className="space-y-2">
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <Phone size={15} className="text-primary" /> Call customer
            </a>
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <Mail size={15} className="text-primary" /> Email customer
            </a>
            <Link
              to="/vehicles"
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2"
            >
              <Car size={15} className="text-primary" /> Browse fleet
            </Link>
          </div>
        </SectionCard>
        <SectionCard title="Notes">
          <p className="text-sm text-foreground">
            {customer.notes || "No notes yet."}
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
