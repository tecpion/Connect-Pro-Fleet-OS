import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import AIWorkforce from "@/pages/AIWorkforce";

export const Route = createFileRoute("/ai-workforce")({
  component: () => <StaffLayout><AIWorkforce /></StaffLayout>,
});
