import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/violations")({
  component: () => (
    <Navigate
      to="/incidents-violations"
      search={{ tab: "violations" }}
      replace
    />
  ),
});
