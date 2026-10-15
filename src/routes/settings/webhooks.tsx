import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/webhooks")({
  component: () => <Navigate to="/integrations" search={{ tab: "webhooks" }} replace />,
});
