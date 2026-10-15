import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import SupportUpdates from "@/pages/support/SupportUpdates";

export const Route = createFileRoute("/support/updates")({
  component: () => <StaffLayout><SupportUpdates /></StaffLayout>,
});
