import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/roles")({
  component: () => <Navigate to="/staff" search={{ tab: "roles" }} replace />,
});
