import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Investors from "@/pages/Investors";

export const Route = createFileRoute("/investors/")({
  component: () => <StaffLayout><Investors /></StaffLayout>,
});
