import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Telematics from "@/pages/telematics/Telematics";

export const Route = createFileRoute("/telematics")({
  component: () => (
    <StaffLayout>
      <Telematics />
    </StaffLayout>
  ),
});
