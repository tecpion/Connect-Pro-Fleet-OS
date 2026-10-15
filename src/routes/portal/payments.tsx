import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/pages/portal/PortalEntry";
import { PortalPayments } from "@/pages/portal/PortalPayments";

export const Route = createFileRoute("/portal/payments")({
  component: () => (
    <PortalShell>
      <PortalPayments />
    </PortalShell>
  ),
});
