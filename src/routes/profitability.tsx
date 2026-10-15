import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Profitability from "@/pages/Profitability";

export const Route = createFileRoute("/profitability")({
  component: () => (
    <StaffLayout>
      <Profitability />
    </StaffLayout>
  ),
});
