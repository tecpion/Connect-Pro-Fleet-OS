import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Dashboard from "@/pages/Dashboard";

export const Route = createFileRoute("/")({
  component: () => (
    <StaffLayout>
      <Dashboard />
    </StaffLayout>
  ),
});
