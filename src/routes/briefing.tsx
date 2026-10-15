import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import DailyBriefing from "@/pages/DailyBriefing";

export const Route = createFileRoute("/briefing")({
  component: () => (
    <StaffLayout>
      <DailyBriefing />
    </StaffLayout>
  ),
});
