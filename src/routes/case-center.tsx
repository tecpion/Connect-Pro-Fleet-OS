import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import CaseCenter from "@/pages/CaseCenter";

export const Route = createFileRoute("/case-center")({
  component: () => (
    <StaffLayout>
      <CaseCenter />
    </StaffLayout>
  ),
});
