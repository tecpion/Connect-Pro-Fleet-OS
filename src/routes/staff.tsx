import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Staff from "@/pages/Staff";

export const Route = createFileRoute("/staff")({
  component: () => <StaffLayout><Staff /></StaffLayout>,
});
