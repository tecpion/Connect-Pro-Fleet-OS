// Connect Pro Fleet — violation sections for entity profiles (Build #25).
// Reusable sections for Customer Profile, Vehicle Detail, and Rental Detail.

import { useStore } from "@/lib/store";
import { useViolations } from "@/lib/violationStoreProvider";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtDate } from "@/lib/format";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  VIOLATION_STATUS_TONE,
  VIOLATION_TYPE_LABELS,
  RESPONSIBILITY_TONE,
} from "@/lib/violationTypes";
import { statusLabel, typeLabel, responsibilityLabel } from "./shared";

function useCanFinancials() {
  const store = useStore();
  const role = store.roles.find(
    (r) =>
      r.name === store.staff.find((s) => s.id === store.currentStaffId)?.role,
  );
  const overrides = store.staff.find((s) => s.id === store.currentStaffId)
    ?.permission_overrides as Record<string, unknown> | null;
  return can(role, overrides, "violations.view_financials");
}

export function CustomerViolationsSection({
  customerId,
}: {
  customerId: string;
}) {
  const store = useStore();
  const vio = useViolations();
  const canViewFinancials = useCanFinancials();
  const list = vio.violationsForCustomer(customerId);
  const open = list.filter(
    (v) => v.status !== "resolved" && v.status !== "cancelled",
  );
  const disputed = list.filter((v) => v.dispute_status !== "not_disputed");

  return (
    <SectionCard title="Tolls & Violations">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No violations on file.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{open.length} open</span>
            <span>{disputed.length} disputed</span>
            {canViewFinancials && (
              <span>
                Customer-responsible:{" "}
                {fmtMoney(
                  list
                    .filter((v) => v.responsibility === "customer")
                    .reduce((s, v) => s + v.total_amount, 0),
                )}
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {list.slice(0, 8).map((v) => {
              const veh = store.vehicles.find((x) => x.id === v.vehicle_id);
              return (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-md border border-border p-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {v.violation_number} · {typeLabel(v.violation_type)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {veh ? `${veh.make} ${veh.model}` : "—"} ·{" "}
                      {fmtDate(v.occurred_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
                      {responsibilityLabel(v.responsibility)}
                    </StatusPill>
                    <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
                      {statusLabel(v.status)}
                    </StatusPill>
                    {canViewFinancials && (
                      <span className="font-mono text-sm">
                        {fmtMoney(v.total_amount)}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

export function VehicleViolationsSection({ vehicleId }: { vehicleId: string }) {
  const vio = useViolations();
  const canViewFinancials = useCanFinancials();
  const list = vio.violationsForVehicle(vehicleId);
  const open = list.filter(
    (v) => v.status !== "resolved" && v.status !== "cancelled",
  );

  return (
    <SectionCard title="Violations">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No violations for this vehicle.
        </p>
      ) : (
        <>
          <div className="mb-3 flex gap-3 text-xs text-muted-foreground">
            <span>{list.length} lifetime</span>
            <span>{open.length} open</span>
          </div>
          <ul className="space-y-2">
            {list.slice(0, 6).map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {v.violation_number} · {typeLabel(v.violation_type)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(v.occurred_at)}
                    {v.citation_number ? ` · ${v.citation_number}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
                    {responsibilityLabel(v.responsibility)}
                  </StatusPill>
                  <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
                    {statusLabel(v.status)}
                  </StatusPill>
                  {canViewFinancials && (
                    <span className="font-mono text-sm">
                      {fmtMoney(v.total_amount)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

export function RentalViolationsSection({ rentalId }: { rentalId: string }) {
  const store = useStore();
  const vio = useViolations();
  const canViewFinancials = useCanFinancials();
  const list = vio.violationsForRental(rentalId);
  const rental = store.rentals.find((r) => r.id === rentalId);

  return (
    <SectionCard title="Tolls & Violations">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No violations attributed to this rental's possession interval.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((v) => {
            const veh = store.vehicles.find((x) => x.id === v.vehicle_id);
            return (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {v.violation_number} · {typeLabel(v.violation_type)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {veh ? `${veh.make} ${veh.model}` : "—"} ·{" "}
                    {fmtDate(v.occurred_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
                    {responsibilityLabel(v.responsibility)}
                  </StatusPill>
                  <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
                    {statusLabel(v.status)}
                  </StatusPill>
                  {canViewFinancials && (
                    <span className="font-mono text-sm">
                      {fmtMoney(v.total_amount)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rental && (
        <p className="mt-2 text-xs text-muted-foreground">
          Violations are matched by vehicle possession at the violation time,
          not the current renter.
        </p>
      )}
    </SectionCard>
  );
}
