import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  VehiclePerformanceReport,
  MaintenanceReport,
  DamageClaimsReport,
} from "@/pages/reports/FleetReports";

export const Route = createFileRoute("/reports/vehicle-performance")({
  component: () => (
    <StaffLayout>
      <VehiclePerformanceReport />
    </StaffLayout>
  ),
});
