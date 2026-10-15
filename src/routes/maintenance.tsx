import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Maintenance from "@/pages/Maintenance";

export const Route = createFileRoute("/maintenance")({
  component: () => (
    <StaffLayout>
      <Maintenance />
    </StaffLayout>
  ),
});
