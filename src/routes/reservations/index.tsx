import { createFileRoute } from "@tanstack/react-router";
import { StaffLayout } from "@/components/StaffLayout";
import {
  ReservationsRedirect,
  RentalsRedirect,
} from "@/components/RentalRouteRedirects";

export const Route = createFileRoute("/reservations/")({
  component: () => <StaffLayout><ReservationsRedirect /></StaffLayout>,
});
