import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Inspections from "@/pages/Inspections";

export const Route = createFileRoute("/inspections/")({
  component: () => <StaffLayout><Inspections /></StaffLayout>,
});
