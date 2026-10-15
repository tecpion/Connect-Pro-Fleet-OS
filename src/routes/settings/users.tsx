import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/users")({
  component: () => <Navigate to="/staff" search={{ tab: "team" }} replace />,
});
