// Connect Pro Fleet — Vehicle quick action menu (•••).
//
// A permission- and status-aware dropdown of operational actions for a vehicle.
// Invalid actions are hidden (e.g. "Start Rental" is hidden when the vehicle is
// already rented or out of service). Each action navigates to the existing
// authoritative workspace or opens the existing dialog — no duplicate pages,
// no new domain logic.

import { useNavigate } from "@/lib/router-compat";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useCan } from "@/pages/settings/useCan";
import type { Vehicle } from "@/lib/types";
import { MoreHorizontal } from "lucide-react";

export function VehicleQuickActions({ vehicle }: { vehicle: Vehicle }) {
  const navigate = useNavigate();
  const { reservations } = useStore();
  const canStartRental = useCan("rentals.start");
  const canMaintenance = useCan("maintenance.add");
  const canInspection = useCan("inspections.create");
  const canIncident = useCan("vehicles.edit");
  const canViolation = useCan("vehicles.edit");
  const canDamage = useCan("vehicles.edit");
  const canDocs = useCan("vehicles.edit");

  // "Start Rental" is valid only when the vehicle is available (not already
  // rented, not in maintenance, not out of service).
  const canStart = canStartRental && vehicle.status === "available";

  // A confirmed reservation for this vehicle that could be checked out.
  const hasConfirmedReservation = reservations.some(
    (r) =>
      r.vehicle_id === vehicle.id &&
      (r.status === "confirmed" || r.status === "active"),
  );

  const items: {
    label: string;
    show: boolean;
    onClick: () => void;
  }[] = [
    {
      label: "View vehicle",
      show: true,
      onClick: () => navigate(`/vehicles/${vehicle.id}`),
    },
    {
      label: hasConfirmedReservation ? "Start rental" : "Start rental",
      show: canStart,
      onClick: () =>
        navigate(
          hasConfirmedReservation ? `/rental-management` : `/reservations`,
        ),
    },
    {
      label: "Schedule maintenance",
      show: canMaintenance,
      onClick: () => navigate(`/maintenance?vehicle=${vehicle.id}`),
    },
    {
      label: "Start inspection",
      show: canInspection,
      onClick: () => navigate(`/inspections/new?vehicle=${vehicle.id}`),
    },
    {
      label: "Report incident",
      show: canIncident,
      onClick: () => navigate(`/incidents?vehicle=${vehicle.id}`),
    },
    {
      label: "Add toll / violation",
      show: canViolation,
      onClick: () => navigate(`/violations?vehicle=${vehicle.id}`),
    },
    {
      label: "Add damage claim",
      show: canDamage,
      onClick: () => navigate(`/damage-claims?vehicle=${vehicle.id}`),
    },
    {
      label: "Upload document",
      show: canDocs,
      onClick: () => navigate(`/vehicles/${vehicle.id}?tab=documents`),
    },
  ];

  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;

  // Split into groups: View vehicle | operational actions.
  const [first, ...rest] = visible;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          data-testid={`vehicle-actions-${vehicle.id}`}
          aria-label="Vehicle actions"
        >
          <MoreHorizontal size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={first.onClick}
          data-testid="action-view-vehicle"
        >
          {first.label}
        </DropdownMenuItem>
        {rest.length > 0 && <DropdownMenuSeparator />}
        {rest.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onClick={item.onClick}
            data-testid={`action-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
