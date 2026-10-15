import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import IntegrationSettings from "@/pages/IntegrationSettings";

export const Route = createFileRoute("/integrations")({
  component: () => <StaffLayout><IntegrationSettings /></StaffLayout>,
});
