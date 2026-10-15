import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import DamageClaims from "@/pages/DamageClaims";

export const Route = createFileRoute("/damage-claims")({
  component: () => (
    <StaffLayout>
      <DamageClaims />
    </StaffLayout>
  ),
});
