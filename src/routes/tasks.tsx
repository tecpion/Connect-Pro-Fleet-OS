import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Tasks from "@/pages/Tasks";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <StaffLayout>
      <Tasks />
    </StaffLayout>
  ),
});
