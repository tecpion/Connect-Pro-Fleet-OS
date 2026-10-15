import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import SupportTicketDetail from "@/pages/support/SupportTicketDetail";

export const Route = createFileRoute("/support/tickets/$id")({
  component: () => (
    <StaffLayout>
      <SupportTicketDetail />
    </StaffLayout>
  ),
});
