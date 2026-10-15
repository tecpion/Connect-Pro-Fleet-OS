import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import VehicleDetail from "@/pages/VehicleDetail";

export const Route = createFileRoute("/vehicles/$id")({
  component: () => <StaffLayout><VehicleDetail /></StaffLayout>,
});
