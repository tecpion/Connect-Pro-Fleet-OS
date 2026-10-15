import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import SupportCenter from "@/pages/support/SupportCenter";

export const Route = createFileRoute("/support/")({
  component: () => <StaffLayout><SupportCenter /></StaffLayout>,
});
