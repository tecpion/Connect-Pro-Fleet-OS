import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import ManagementSummaryReport from "@/pages/reports/ManagementSummaryReport";

export const Route = createFileRoute("/reports/management-summary")({
  component: () => (
    <StaffLayout>
      <ManagementSummaryReport />
    </StaffLayout>
  ),
});
