import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/pages/portal/PortalEntry";
import { PortalHelp } from "@/pages/portal/PortalHelp";

export const Route = createFileRoute("/portal/help/")({
  component: () => <PortalShell><PortalHelp /></PortalShell>,
});
