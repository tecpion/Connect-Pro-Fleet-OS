import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import CheckoutWorkflow from "@/pages/CheckoutWorkflow";

export const Route = createFileRoute("/checkout/$id")({
  component: () => (
    <StaffLayout>
      <CheckoutWorkflow />
    </StaffLayout>
  ),
});
