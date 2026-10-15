import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Notifications from "@/pages/Notifications";

export const Route = createFileRoute("/notifications")({
  component: () => <StaffLayout><Notifications /></StaffLayout>,
});
