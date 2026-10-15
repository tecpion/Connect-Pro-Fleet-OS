import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/payment-arrangements")({
  component: () => (
    <Navigate
      to="/rental-management"
      search={{ tab: "active", filter: "arrangement" }}
      replace
    />
  ),
});
