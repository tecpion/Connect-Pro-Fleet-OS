import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import VehiclePerformancePage from "@/pages/VehiclePerformancePage";

export const Route = createFileRoute("/vehicles/$id/performance")({
  component: () => <StaffLayout><VehiclePerformancePage /></StaffLayout>,
});
