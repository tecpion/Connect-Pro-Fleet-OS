import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Finance from "@/pages/Finance";

export const Route = createFileRoute("/finance")({
  component: () => <StaffLayout><Finance /></StaffLayout>,
});
