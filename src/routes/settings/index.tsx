import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Settings from "@/pages/Settings";

export const Route = createFileRoute("/settings/")({
  component: () => <StaffLayout><Settings /></StaffLayout>,
});
