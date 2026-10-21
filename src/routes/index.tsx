import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import Dashboard from "@/pages/Dashboard";

export const Route = createFileRoute("/")({
  component: () => (
    <RequireAuth>
      <StaffLayout>
        <Dashboard />
      </StaffLayout>
    </RequireAuth>
  ),
});
