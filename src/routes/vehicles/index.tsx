import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Vehicles from "@/pages/Vehicles";

export const Route = createFileRoute("/vehicles/")({
  component: () => <StaffLayout><Vehicles /></StaffLayout>,
});
