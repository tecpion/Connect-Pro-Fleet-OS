// Connect Pro Fleet — Inspection picker (no reservation preselected).
//
// Operational picker with three sections: Ready for Checkout, Due for Return,
// Other Vehicle. Shows only eligible reservations. Pure presentation.

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { InspectionType } from "@/lib/inspectionWorkspaceTypes";

interface PickerRes {
  id: string;
  vehicle_id: string;
  renter_name: string;
  status: string;
  start_date: string;
  end_date: string;
}
interface PickerVehicle {
  id: string;
  year: number;
  make: string;
  model: string;
  license_plate: string;
  location: string;
}

export function InspectionPicker({
  reservations,
  vehicles,
}: {
  reservations: PickerRes[];
  vehicles: PickerVehicle[];
}) {
  const [pickerTab, setPickerTab] = useState<"checkout" | "checkin" | "other">(
    "checkout",
  );

  const readyForCheckout = reservations.filter((r) =>
    ["confirmed"].includes(r.status),
  );
  const dueForReturn = reservations.filter((r) =>
    ["active"].includes(r.status),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Start an inspection"
        subtitle="Pick a reservation to inspect a vehicle, or start a manual inspection."
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {(["checkout", "checkin", "other"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPickerTab(t)}
            data-testid={`picker-tab-${t}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              pickerTab === t
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "checkout"
              ? "Ready for Checkout"
              : t === "checkin"
                ? "Due for Return"
                : "Other Vehicle"}
          </button>
        ))}
      </div>

      <SectionCard>
        {pickerTab === "checkout" && (
          <PickerList
            title="Ready for Checkout"
            empty="No reservations are currently ready for checkout."
            items={readyForCheckout}
            vehicles={vehicles}
            type="checkout"
          />
        )}
        {pickerTab === "checkin" && (
          <PickerList
            title="Due for Return"
            empty="No active rentals are currently due for return."
            items={dueForReturn}
            vehicles={vehicles}
            type="checkin"
          />
        )}
        {pickerTab === "other" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Start a manual/routine inspection by selecting a vehicle.
            </p>
            <ul className="divide-y divide-border">
              {vehicles.map((v) => (
                <li key={v.id}>
                  <Link
                    to={`/inspections/new?res=${v.id}&type=checkout`}
                    className="flex items-center justify-between py-2.5 hover:text-primary"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {v.year} {v.make} {v.model} · {v.license_plate}
                    </span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function PickerList({
  title,
  empty,
  items,
  vehicles,
  type,
}: {
  title: string;
  empty: string;
  items: PickerRes[];
  vehicles: PickerVehicle[];
  type: InspectionType;
}) {
  return (
    <div className="space-y-2">
      <p className="font-display text-sm font-semibold text-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r) => {
            const v = vehicles.find((x) => x.id === r.vehicle_id);
            return (
              <li key={r.id}>
                <Link
                  to={`/inspections/new?res=${r.id}&type=${type}`}
                  data-testid={`picker-${type}-${r.id}`}
                  className="flex items-center justify-between py-3 hover:text-primary"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.renter_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v ? `${v.make} ${v.model} · ${v.license_plate}` : "—"}
                    </p>
                    <p className="font-mono text-[11px] tabular text-muted-foreground">
                      {type === "checkout" ? "Pickup" : "Return"} {r.start_date}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
