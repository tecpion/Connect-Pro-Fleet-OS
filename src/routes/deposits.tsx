import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/deposits")({
  component: () => <Navigate to="/rental-management" search={{ tab: "active", filter: "deposit" }} replace />,
});
