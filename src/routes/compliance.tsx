import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Compliance from "@/pages/Compliance";

export const Route = createFileRoute("/compliance")({
  component: () => <StaffLayout><Compliance /></StaffLayout>,
});
