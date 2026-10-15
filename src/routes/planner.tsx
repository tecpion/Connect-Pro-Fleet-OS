import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Planner from "@/pages/Planner";

export const Route = createFileRoute("/planner")({
  component: () => <StaffLayout><Planner /></StaffLayout>,
});
