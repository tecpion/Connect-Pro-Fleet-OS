import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import InspectionWizard from "@/pages/InspectionWizard";

export const Route = createFileRoute("/inspections/new")({
  component: () => (
    <StaffLayout>
      <InspectionWizard />
    </StaffLayout>
  ),
});
