// Connect Pro Fleet — RentalVehicleExchange type (Build #5).
// Extracted from storeContext to keep it under the line limit.

export interface RentalVehicleExchange {
  id: string;
  tenant_id: string;
  rental_id: string;
  customer_id: string;
  old_vehicle_id: string;
  new_vehicle_id: string;
  exchange_at: string;
  reason: string;
  old_mileage_in: number;
  old_fuel_in: number;
  new_mileage_out: number;
  new_fuel_out: number;
  old_vehicle_disposition: "available" | "maintenance" | "out_of_service";
  rate_changed: boolean;
  old_rate: number;
  new_rate: number | null;
  created_by: string | null;
  created_at: string;
}
