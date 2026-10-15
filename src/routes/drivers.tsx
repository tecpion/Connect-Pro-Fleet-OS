import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/drivers")({
  component: () => (
    <Navigate
      to="/customers"
      search={{ filter: "pending_verification" }}
      replace
    />
  ),
});
