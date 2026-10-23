import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import { RequireAuth } from "@/components/RequireAuth";
import MigrationCenter from "@/pages/MigrationCenter";

export const Route = createFileRoute("/migration")({
  component: () => (
    <RequireAuth>
      <StaffLayout>
        <MigrationCenter />
      </StaffLayout>
    </RequireAuth>
  ),
});
