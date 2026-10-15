import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import ActionCenter from "@/pages/ActionCenter";

export const Route = createFileRoute("/action-center")({
  component: () => <StaffLayout><ActionCenter /></StaffLayout>,
});
