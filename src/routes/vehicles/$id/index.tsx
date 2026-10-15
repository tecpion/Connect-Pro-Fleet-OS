import { createFileRoute } from "@tanstack/react-router";
import VehicleDetail from "@/pages/VehicleDetail";

export const Route = createFileRoute("/vehicles/$id/")({
  component: () => <VehicleDetail />,
});
