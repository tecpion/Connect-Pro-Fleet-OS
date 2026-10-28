// Smart Capture — contextual vehicle action menu.
//
// Given a matched vehicle, returns the appropriate set of actions based on
// the vehicle's current status. Each action links to an EXISTING workflow —
// no new business logic is created here. The routes use query params so the
// destination page can preselect the vehicle where the existing workflow
// safely supports it.

import type { Vehicle } from "@/lib/types";

export interface VehicleAction {
  id: string;
  label: string;
  /** lucide icon name for rendering */
  icon: "car" | "wrench" | "clipboard" | "alert" | "wallet" | "shield" | "file";
  to: string;
}

export function actionsForVehicle(vehicle: Vehicle): VehicleAction[] {
  const status = vehicle.status;
  const base: VehicleAction[] = [
    { id: "view", label: "View Vehicle", icon: "car", to: `/vehicles/${vehicle.id}` },
  ];

  if (status === "available") {
    return [
      ...base,
      { id: "work_order", label: "Create Work Order", icon: "wrench", to: `/maintenance?new=1&vehicle=${vehicle.id}` },
      { id: "inspection", label: "Start Inspection", icon: "clipboard", to: `/inspections/new?vehicle=${vehicle.id}` },
      { id: "expense", label: "Record Expense", icon: "wallet", to: `/expenses?new=1&vehicle=${vehicle.id}` },
      { id: "maint", label: "View Maintenance", icon: "wrench", to: `/maintenance?vehicle=${vehicle.id}` },
    ];
  }

  if (status === "rented") {
    return [
      { id: "rental", label: "View Active Rental", icon: "car", to: `/rental-management?tab=active&vehicle=${vehicle.id}` },
      { id: "work_order", label: "Create Work Order", icon: "wrench", to: `/maintenance?new=1&vehicle=${vehicle.id}` },
      { id: "damage", label: "Report Incident", icon: "alert", to: `/incidents-violations?new=1&vehicle=${vehicle.id}` },
      { id: "expense", label: "Record Expense", icon: "wallet", to: `/expenses?new=1&vehicle=${vehicle.id}` },
      ...base,
    ];
  }

  if (status === "maintenance") {
    return [
      { id: "maint_detail", label: "View Work Order", icon: "wrench", to: `/maintenance?vehicle=${vehicle.id}` },
      { id: "service", label: "Record Service", icon: "wallet", to: `/expenses?new=1&vehicle=${vehicle.id}` },
      { id: "work_order", label: "Create Work Order", icon: "wrench", to: `/maintenance?new=1&vehicle=${vehicle.id}` },
      ...base,
    ];
  }

  // out_of_service / blocked
  return [
    { id: "compliance", label: "View Compliance", icon: "shield", to: `/compliance?vehicle=${vehicle.id}` },
    { id: "work_order", label: "Create Work Order", icon: "wrench", to: `/maintenance?new=1&vehicle=${vehicle.id}` },
    { id: "inspection", label: "Start Inspection", icon: "clipboard", to: `/inspections/new?vehicle=${vehicle.id}` },
    ...base,
  ];
}