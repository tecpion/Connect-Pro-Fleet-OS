import { createFileRoute } from "@tanstack/react-router";
import { PortalEntry, PortalShell } from "@/pages/portal/PortalEntry";

export const Route = createFileRoute("/portal/")({
  component: PortalEntry,
});
