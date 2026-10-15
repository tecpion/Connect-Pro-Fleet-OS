import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import CustomerProfile from "@/pages/CustomerProfile";

export const Route = createFileRoute("/customers/$id")({
  component: () => <StaffLayout><CustomerProfile /></StaffLayout>,
});
