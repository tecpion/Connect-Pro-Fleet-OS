import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import Customers from "@/pages/Customers";

export const Route = createFileRoute("/customers/")({
  component: () => <StaffLayout><Customers /></StaffLayout>,
});
