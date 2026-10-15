import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import RentalDetail from "@/pages/RentalDetail";

export const Route = createFileRoute("/rentals/$id")({
  component: () => (
    <StaffLayout>
      <RentalDetail />
    </StaffLayout>
  ),
});
