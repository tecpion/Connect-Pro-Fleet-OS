import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/pages/portal/PortalEntry";
import { PortalDocuments } from "@/pages/portal/PortalDocuments";

export const Route = createFileRoute("/portal/documents")({
  component: () => <PortalShell><PortalDocuments /></PortalShell>,
});
