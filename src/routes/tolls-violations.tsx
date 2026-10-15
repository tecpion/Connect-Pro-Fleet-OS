import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/tolls-violations")({
  component: () => <Navigate to="/incidents-violations" search={{ tab: "violations" }} replace />,
});
