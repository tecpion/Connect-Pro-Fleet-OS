import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard";

export const Route = createFileRoute("/executive")({
  component: () => <StaffLayout><ExecutiveDashboard /></StaffLayout>,
});
