import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import ReturnWorkflow from "@/pages/ReturnWorkflow";

export const Route = createFileRoute("/return/$id")({
  component: () => <StaffLayout><ReturnWorkflow /></StaffLayout>,
});
