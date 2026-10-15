import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import RentalManagement from "@/pages/RentalManagement";

export const Route = createFileRoute("/rental-management")({
  component: () => <StaffLayout><RentalManagement /></StaffLayout>,
});
