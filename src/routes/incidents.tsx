import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/incidents")({
  component: () => <Navigate to="/incidents-violations" replace />,
});
