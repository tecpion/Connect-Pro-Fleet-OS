import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import SupportStatus from "@/pages/support/SupportStatus";

export const Route = createFileRoute("/support/status")({
  component: () => <StaffLayout><SupportStatus /></StaffLayout>,
});
