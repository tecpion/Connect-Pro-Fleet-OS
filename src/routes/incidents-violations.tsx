import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Incidents from "@/pages/Incidents";

export const Route = createFileRoute("/incidents-violations")({
  component: () => (
    <StaffLayout>
      <Incidents />
    </StaffLayout>
  ),
});
