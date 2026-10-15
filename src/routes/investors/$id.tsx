import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import InvestorDetail from "@/pages/InvestorDetail";

export const Route = createFileRoute("/investors/$id")({
  component: () => (
    <StaffLayout>
      <InvestorDetail />
    </StaffLayout>
  ),
});
