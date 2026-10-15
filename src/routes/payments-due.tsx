import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/payments-due")({
  component: () => <Navigate to="/rental-management" search={{ tab: "active", filter: "payment_due" }} replace />,
});
