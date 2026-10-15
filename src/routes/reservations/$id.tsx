import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import ReservationDetail from "@/pages/ReservationDetail";

export const Route = createFileRoute("/reservations/$id")({
  component: () => (
    <StaffLayout>
      <ReservationDetail />
    </StaffLayout>
  ),
});
