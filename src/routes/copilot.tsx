import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import CopilotPage from "@/pages/CopilotPage";

export const Route = createFileRoute("/copilot")({
  component: () => <StaffLayout><CopilotPage /></StaffLayout>,
});
