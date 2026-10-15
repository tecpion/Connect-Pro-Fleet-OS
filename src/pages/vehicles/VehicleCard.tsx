// Connect Pro Fleet — Vehicle card (Card View for Vehicle Inventory).
//
// A premium vehicle card showing the key operational facts: name, plate,
// status, location, mileage, ownership, current renter (active rental
// authority only), next maintenance indicator, registration expiry, and Fleet
// Health. Clicking the card opens the existing Vehicle Digital Twin.

import { Link } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import { StatusPill, vehicleTone } from "@/components/Status";
import { vehicleStatusMeta, fmtNumber, fmtDate } from "@/lib/format";
import { ownershipTypeLabel } from "@/lib/ownership";
import type { Vehicle } from "@/lib/types";
import type { FleetHealth } from "@/lib/fleetHealth";
import { FleetHealthBadge } from "./FleetHealthBadge";
import { VehicleQuickActions } from "./VehicleQuickActions";
import { Car, MapPin, Gauge, User, Wrench, FileText } from "lucide-react";

export interface VehicleCardData {
  vehicle: Vehicle;
  currentRenter: string | null;
  nextMaintenance: { label: string; overdue: boolean } | null;
  health: FleetHealth;
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm text-foreground">{children}</p>
      </div>
    </div>
  );
}

export function VehicleCard({ data }: { data: VehicleCardData }) {
  const { vehicle: v, currentRenter, nextMaintenance, health } = data;
  const tone = vehicleTone(v.status);
  const photo = v.images?.[0]?.url;

  return (
    <div
      data-testid={`vehicle-card-${v.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_hsl(214_30%_15%_/_0.08)]"
    >
      {/* Photo / placeholder banner */}
      <Link to={`/vehicles/${v.id}`} className="block">
        {photo ? (
          <img
            src={photo}
            alt={`${v.year} ${v.make} ${v.model}`}
            loading="lazy"
            className="h-32 w-full object-cover"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-2/40">
            <Car size={36} className="text-muted-foreground/40" />
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {/* Header: name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/vehicles/${v.id}`}
              className="font-display text-base font-semibold text-foreground group-hover:text-primary"
            >
              {v.year} {v.make} {v.model}
            </Link>
            <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
              {v.license_plate}
            </p>
          </div>
          <StatusPill tone={tone}>
            {vehicleStatusMeta[v.status].label}
          </StatusPill>
        </div>

        {/* Fields */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field icon={<MapPin size={14} />} label="Location">
            {v.location}
          </Field>
          <Field icon={<Gauge size={14} />} label="Mileage">
            {fmtNumber(v.current_mileage)} mi
          </Field>
          <Field icon={<User size={14} />} label="Current rental">
            {currentRenter ?? "—"}
          </Field>
          <Field icon={<Wrench size={14} />} label="Next maintenance">
            {nextMaintenance ? (
              <span
                className={cn(
                  nextMaintenance.overdue && "font-medium text-status-out",
                )}
              >
                {nextMaintenance.label}
              </span>
            ) : (
              "No upcoming"
            )}
          </Field>
          <Field icon={<FileText size={14} />} label="Registration">
            {fmtDate(v.registration_expiry)}
          </Field>
          <Field icon={<Car size={14} />} label="Ownership">
            {ownershipTypeLabel(v)}
          </Field>
        </div>

        {/* Footer: Fleet Health + actions */}
        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
          <FleetHealthBadge health={health} compact />
          <VehicleQuickActions vehicle={v} />
        </div>
      </div>
    </div>
  );
}
