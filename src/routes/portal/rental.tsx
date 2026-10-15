import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/pages/portal/PortalEntry";
import { PortalRental } from "@/pages/portal/PortalRental";

export const Route = createFileRoute("/portal/rental")({
  component: () => (
    <PortalShell>
      <PortalRental />
    </PortalShell>
  ),
});
