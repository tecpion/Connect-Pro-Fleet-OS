import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  VehiclePerformanceReport,
  MaintenanceReport,
  DamageClaimsReport,
} from "@/pages/reports/FleetReports";

export const Route = createFileRoute("/reports/damage-claims")({
  component: () => (
    <StaffLayout>
      <DamageClaimsReport />
    </StaffLayout>
  ),
});
