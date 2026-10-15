// Connect Pro Fleet — Supabase repository adapters (Build #22).
//
// Concrete repository implementations backed by the typed Supabase client.
// Each delegates to the row/domain mappers and normalizes errors. Used only
// when Supabase is configured; in memory mode the factory returns nulls.

import type {
  Customer,
  Vehicle,
  RentalAgreement,
  Reservation,
  FinancialTransaction,
} from "../types";
import type { getSupabase } from "./client";
import {
  type CustomerRepository,
  type VehicleRepository,
  type RentalRepository,
  type ReservationRepository,
  type LedgerRepository,
  normalizeError,
} from "./repository";
import {
  rowToCustomer,
  customerToRow,
  customerPatchToRow,
  rowToVehicle,
  vehicleToRow,
  vehiclePatchToRow,
  rowToRental,
  rentalToRow,
  rentalPatchToRow,
  rowToReservation,
  reservationToRow,
  reservationPatchToRow,
  rowToTransaction,
  transactionToRow,
  transactionPatchToRow,
} from "./repositoryMappers";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

export class SupabaseCustomerRepository implements CustomerRepository {
  constructor(private db: Db) {}
  async list(orgId: string): Promise<Customer[]> {
    const { data, error } = await this.db
      .from("customers")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToCustomer);
  }
  async get(orgId: string, id: string): Promise<Customer | null> {
    const { data, error } = await this.db
      .from("customers")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToCustomer(data) : null;
  }
  async insert(c: Customer): Promise<Customer> {
    const { data, error } = await this.db
      .from("customers")
      .insert(customerToRow(c))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToCustomer(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<Customer>,
  ): Promise<Customer> {
    const { data, error } = await this.db
      .from("customers")
      .update(customerPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToCustomer(data);
  }
}

export class SupabaseVehicleRepository implements VehicleRepository {
  constructor(private db: Db) {}
  async list(orgId: string): Promise<Vehicle[]> {
    const { data, error } = await this.db
      .from("vehicles")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVehicle);
  }
  async get(orgId: string, id: string): Promise<Vehicle | null> {
    const { data, error } = await this.db
      .from("vehicles")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToVehicle(data) : null;
  }
  async insert(v: Vehicle): Promise<Vehicle> {
    const { data, error } = await this.db
      .from("vehicles")
      .insert(vehicleToRow(v))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVehicle(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<Vehicle>,
  ): Promise<Vehicle> {
    const { data, error } = await this.db
      .from("vehicles")
      .update(vehiclePatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVehicle(data);
  }
}

export class SupabaseRentalRepository implements RentalRepository {
  constructor(private db: Db) {}
  async list(orgId: string): Promise<RentalAgreement[]> {
    const { data, error } = await this.db
      .from("rentals")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToRental);
  }
  async get(orgId: string, id: string): Promise<RentalAgreement | null> {
    const { data, error } = await this.db
      .from("rentals")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToRental(data) : null;
  }
  async insert(r: RentalAgreement): Promise<RentalAgreement> {
    const { data, error } = await this.db
      .from("rentals")
      .insert(rentalToRow(r))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToRental(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<RentalAgreement>,
  ): Promise<RentalAgreement> {
    const { data, error } = await this.db
      .from("rentals")
      .update(rentalPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToRental(data);
  }
}

export class SupabaseReservationRepository implements ReservationRepository {
  constructor(private db: Db) {}
  async list(orgId: string): Promise<Reservation[]> {
    const { data, error } = await this.db
      .from("reservations")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToReservation);
  }
  async get(orgId: string, id: string): Promise<Reservation | null> {
    const { data, error } = await this.db
      .from("reservations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToReservation(data) : null;
  }
  async insert(r: Reservation): Promise<Reservation> {
    const { data, error } = await this.db
      .from("reservations")
      .insert(reservationToRow(r))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToReservation(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<Reservation>,
  ): Promise<Reservation> {
    const { data, error } = await this.db
      .from("reservations")
      .update(reservationPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToReservation(data);
  }
}

export class SupabaseLedgerRepository implements LedgerRepository {
  constructor(private db: Db) {}
  async listForRental(
    orgId: string,
    rentalId: string,
  ): Promise<FinancialTransaction[]> {
    const { data, error } = await this.db
      .from("rental_ledger_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("rental_id", rentalId)
      .order("created_at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToTransaction);
  }
  async insert(t: FinancialTransaction): Promise<FinancialTransaction> {
    const { data, error } = await this.db
      .from("rental_ledger_transactions")
      .insert(transactionToRow(t))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTransaction(data);
  }
  async update(
    orgId: string,
    id: string,
    patch: Partial<FinancialTransaction>,
  ): Promise<FinancialTransaction> {
    const { data, error } = await this.db
      .from("rental_ledger_transactions")
      .update(transactionPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToTransaction(data);
  }
}
