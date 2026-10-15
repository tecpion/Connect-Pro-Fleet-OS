import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";

export const Route = createFileRoute("/vehicles/$id")({
  component: () => (
    <StaffLayout>
      <Outlet />
    </StaffLayout>
  ),
});
