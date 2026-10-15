import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/api-keys")({
  component: () => (
    <Navigate to="/integrations" search={{ tab: "api-keys" }} replace />
  ),
});
