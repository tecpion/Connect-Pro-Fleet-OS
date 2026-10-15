import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/pages/portal/PortalEntry";
import { PortalRequests } from "@/pages/portal/PortalRequests";

export const Route = createFileRoute("/portal/requests")({
  component: () => <PortalShell><PortalRequests /></PortalShell>,
});
