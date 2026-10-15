// Connect Pro Fleet — row <-> domain mappers (Build #22).
//
// Maps between Supabase row types and the existing domain objects so the
// repository adapters stay focused. Money columns (numeric in SQL, returned as
// strings) are normalized to rounded numbers via toMoney. JSON columns cast
// through `unknown` because the flexible Json union isn't directly assignable.

import type {
  Customer,
  Vehicle,
  RentalAgreement,
  Reservation,
  FinancialTransaction,
} from "../types";
import type {
  CustomerRow,
  VehicleRow,
  RentalRow,
  ReservationRow,
  RentalLedgerTransactionRow,
} from "./database.types";
import { toMoney } from "./repository";

export function rowToCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    first_name: r.first_name,
    last_name: r.last_name,
    phone: r.phone,
    email: r.email,
    date_of_birth: r.date_of_birth,
    address: r.address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    emergency_contact_name: r.emergency_contact_name,
    emergency_contact_phone: r.emergency_contact_phone,
    customer_status: r.customer_status as Customer["customer_status"],
    customer_source: r.customer_source as Customer["customer_source"],
    notes: r.notes,
    drivers_license_number: r.drivers_license_number,
    drivers_license_state: r.drivers_license_state,
    drivers_license_expiry: r.drivers_license_expiry,
    drivers_license_front_url: r.drivers_license_front_path,
    drivers_license_back_url: r.drivers_license_back_path,
    insurance_company: r.insurance_company,
    insurance_policy_number: r.insurance_policy_number,
    insurance_expiry: r.insurance_expiry,
    insurance_document_url: r.insurance_document_path,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function customerToRow(c: Customer): Partial<CustomerRow> {
  return {
    id: c.id,
    organization_id: c.tenant_id,
    first_name: c.first_name,
    last_name: c.last_name,
    phone: c.phone,
    email: c.email,
    date_of_birth: c.date_of_birth,
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    emergency_contact_name: c.emergency_contact_name,
    emergency_contact_phone: c.emergency_contact_phone,
    customer_status: c.customer_status,
    customer_source: c.customer_source,
    notes: c.notes,
    drivers_license_number: c.drivers_license_number,
    drivers_license_state: c.drivers_license_state,
    drivers_license_expiry: c.drivers_license_expiry,
    drivers_license_front_path: c.drivers_license_front_url,
    drivers_license_back_path: c.drivers_license_back_url,
    insurance_company: c.insurance_company,
    insurance_policy_number: c.insurance_policy_number,
    insurance_expiry: c.insurance_expiry,
    insurance_document_path: c.insurance_document_url,
  };
}

export function customerPatchToRow(
  patch: Partial<Customer>,
): Partial<CustomerRow> {
  return customerToRow({ ...({} as Customer), ...patch });
}

export function rowToVehicle(r: VehicleRow): Vehicle {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    vin: r.vin,
    make: r.make,
    model: r.model,
    year: r.year,
    license_plate: r.license_plate,
    status: r.status as Vehicle["status"],
    location: r.location,
    vehicle_type: r.vehicle_type as Vehicle["vehicle_type"],
    vehicle_class_id: r.vehicle_class_id,
    pricing_override: r.pricing_override ?? false,
    min_rental_days_override: r.min_rental_days_override,
    deposit_override: r.deposit_override ?? false,
    daily_rate: toMoney(r.daily_rate),
    weekly_rate: toMoney(r.weekly_rate),
    deposit_amount: toMoney(r.deposit_amount),
    images: [],
    documents: [],
    purchase_date: r.purchase_date,
    purchase_price: toMoney(r.purchase_price),
    current_mileage: r.current_mileage,
    insurance_policy_number: r.insurance_policy_number,
    insurance_expiry: r.insurance_expiry,
    registration_expiry: r.registration_expiry,
    ownership_type: r.ownership_type as Vehicle["ownership_type"],
    owner_entity_id: r.owner_entity_id,
    owner_display_name: r.owner_display_name,
    ownership_notes: r.ownership_notes,
    ownership_effective_date: r.ownership_effective_date,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function vehicleToRow(v: Vehicle): Partial<VehicleRow> {
  return {
    id: v.id,
    organization_id: v.tenant_id,
    vin: v.vin,
    make: v.make,
    model: v.model,
    year: v.year,
    license_plate: v.license_plate,
    status: v.status,
    location: v.location,
    vehicle_type: v.vehicle_type,
    vehicle_class_id: v.vehicle_class_id,
    pricing_override: v.pricing_override,
    min_rental_days_override: v.min_rental_days_override,
    deposit_override: v.deposit_override,
    daily_rate: v.daily_rate,
    weekly_rate: v.weekly_rate,
    deposit_amount: v.deposit_amount,
    purchase_date: v.purchase_date,
    purchase_price: v.purchase_price,
    current_mileage: v.current_mileage,
    insurance_policy_number: v.insurance_policy_number,
    insurance_expiry: v.insurance_expiry,
    registration_expiry: v.registration_expiry,
    ownership_type: v.ownership_type ?? null,
    owner_entity_id: v.owner_entity_id,
    owner_display_name: v.owner_display_name,
    ownership_notes: v.ownership_notes,
    ownership_effective_date: v.ownership_effective_date,
  };
}

export function vehiclePatchToRow(
  patch: Partial<Vehicle>,
): Partial<VehicleRow> {
  return vehicleToRow({ ...({} as Vehicle), ...patch });
}

export function rowToRental(r: RentalRow): RentalAgreement {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    reservation_id: r.reservation_id,
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    agreement_number: r.agreement_number,
    status: r.status as RentalAgreement["status"],
    checkout_date: r.checkout_date,
    checkout_time: r.checkout_time,
    scheduled_return_date: r.scheduled_return_date,
    scheduled_return_time: r.scheduled_return_time,
    actual_return_date: r.actual_return_date,
    actual_return_time: r.actual_return_time,
    rate_type: r.rate_type as RentalAgreement["rate_type"],
    rate_amount: toMoney(r.rate_amount),
    subtotal: toMoney(r.subtotal),
    tax: toMoney(r.tax),
    fees: toMoney(r.fees),
    discount: toMoney(r.discount),
    deposit_amount: toMoney(r.deposit_amount),
    amount_paid: toMoney(r.amount_paid),
    balance_due: toMoney(r.balance_due),
    mileage_out: r.mileage_out,
    mileage_in: r.mileage_in,
    fuel_out: r.fuel_out,
    fuel_in: r.fuel_in,
    weekly_payment_day: r.weekly_payment_day,
    next_payment_due: r.next_payment_due,
    payment_cutoff_time: r.payment_cutoff_time,
    grace_period: r.grace_period,
    late_fee: toMoney(r.late_fee),
    late_fee_applied: r.late_fee_applied,
    weeks_rented: r.weeks_rented,
    billing_config:
      (r.billing_config as unknown as RentalAgreement["billing_config"]) ??
      null,
    pricing_snapshot:
      (r.pricing_snapshot as unknown as RentalAgreement["pricing_snapshot"]) ??
      null,
    rental_origin:
      (r.rental_origin as unknown as RentalAgreement["rental_origin"]) ??
      "native",
    migration_cutover_at: r.migration_cutover_at,
    imported_legacy_rental: r.imported_legacy_rental ?? false,
    external_agreement_id: r.external_agreement_id,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function rentalToRow(r: RentalAgreement): Partial<RentalRow> {
  return {
    id: r.id,
    organization_id: r.tenant_id,
    reservation_id: r.reservation_id,
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    agreement_number: r.agreement_number,
    status: r.status,
    checkout_date: r.checkout_date,
    checkout_time: r.checkout_time,
    scheduled_return_date: r.scheduled_return_date,
    scheduled_return_time: r.scheduled_return_time,
    actual_return_date: r.actual_return_date,
    actual_return_time: r.actual_return_time,
    rate_type: r.rate_type,
    rate_amount: r.rate_amount,
    subtotal: r.subtotal,
    tax: r.tax,
    fees: r.fees,
    discount: r.discount,
    deposit_amount: r.deposit_amount,
    amount_paid: r.amount_paid,
    balance_due: r.balance_due,
    mileage_out: r.mileage_out,
    mileage_in: r.mileage_in,
    fuel_out: r.fuel_out,
    fuel_in: r.fuel_in,
    weekly_payment_day: r.weekly_payment_day,
    next_payment_due: r.next_payment_due,
    payment_cutoff_time: r.payment_cutoff_time,
    grace_period: r.grace_period,
    late_fee: r.late_fee,
    late_fee_applied: r.late_fee_applied,
    weeks_rented: r.weeks_rented,
    billing_config: (r.billing_config ??
      null) as unknown as RentalRow["billing_config"],
    pricing_snapshot: (r.pricing_snapshot ??
      null) as unknown as RentalRow["pricing_snapshot"],
    rental_origin: r.rental_origin ?? "native",
    migration_cutover_at: r.migration_cutover_at,
    imported_legacy_rental: r.imported_legacy_rental ?? false,
    external_agreement_id: r.external_agreement_id,
    created_by: r.created_by,
  };
}

export function rentalPatchToRow(
  patch: Partial<RentalAgreement>,
): Partial<RentalRow> {
  return rentalToRow({ ...({} as RentalAgreement), ...patch });
}

export function rowToTransaction(
  r: RentalLedgerTransactionRow,
): FinancialTransaction {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    rental_id: r.rental_id,
    reservation_id: r.reservation_id,
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    invoice_id: r.invoice_id,
    deposit_id: r.deposit_id,
    transaction_type:
      r.transaction_type as FinancialTransaction["transaction_type"],
    category: r.category as FinancialTransaction["category"],
    description: r.description,
    amount: toMoney(r.amount),
    direction: r.direction as FinancialTransaction["direction"],
    payment_method:
      (r.payment_method as FinancialTransaction["payment_method"]) ?? null,
    external_transaction_id: r.external_transaction_id,
    status: r.status as FinancialTransaction["status"],
    effective_date: r.effective_date,
    created_at: r.created_at,
    created_by: r.created_by,
    notes: r.notes,
    related_transaction_id: r.related_transaction_id,
    billing_period: r.billing_period,
    metadata: (r.metadata as Record<string, unknown>) ?? null,
  };
}

export function transactionToRow(
  t: FinancialTransaction,
): Partial<RentalLedgerTransactionRow> {
  return {
    id: t.id,
    organization_id: t.tenant_id,
    rental_id: t.rental_id,
    reservation_id: t.reservation_id,
    customer_id: t.customer_id,
    vehicle_id: t.vehicle_id,
    invoice_id: t.invoice_id,
    deposit_id: t.deposit_id,
    transaction_type: t.transaction_type,
    category: t.category,
    description: t.description,
    amount: t.amount,
    direction: t.direction,
    payment_method: t.payment_method,
    external_transaction_id: t.external_transaction_id,
    status: t.status,
    effective_date: t.effective_date,
    created_at: t.created_at,
    created_by: t.created_by,
    notes: t.notes,
    related_transaction_id: t.related_transaction_id,
    billing_period: t.billing_period,
    metadata: (t.metadata ?? null) as RentalLedgerTransactionRow["metadata"],
  };
}

export function transactionPatchToRow(
  patch: Partial<FinancialTransaction>,
): Partial<RentalLedgerTransactionRow> {
  return transactionToRow({ ...({} as FinancialTransaction), ...patch });
}

// ---------------------------------------------------------------------------
// Reservation mappers
// ---------------------------------------------------------------------------
export function rowToReservation(r: ReservationRow): Reservation {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    vehicle_id: r.vehicle_id,
    customer_id: r.customer_id,
    renter_name: r.renter_name,
    renter_email: r.renter_email,
    renter_phone: r.renter_phone,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status as Reservation["status"],
    source: r.source as Reservation["source"],
    ghl_opportunity_id: r.ghl_opportunity_id,
    total_price: toMoney(r.total_price),
    deposit_amount: toMoney(r.deposit_amount),
    deposit_status: r.deposit_status as Reservation["deposit_status"],
    amount_paid: toMoney(r.amount_paid),
    converted_to_rental_id: r.converted_to_rental_id,
    pricing_snapshot:
      (r.pricing_snapshot as unknown as Reservation["pricing_snapshot"]) ??
      null,
    created_at: r.created_at,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
  };
}

export function reservationToRow(r: Reservation): Partial<ReservationRow> {
  return {
    id: r.id,
    organization_id: r.tenant_id,
    vehicle_id: r.vehicle_id,
    customer_id: r.customer_id ?? null,
    renter_name: r.renter_name,
    renter_email: r.renter_email,
    renter_phone: r.renter_phone,
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
    source: r.source,
    ghl_opportunity_id: r.ghl_opportunity_id,
    total_price: r.total_price,
    deposit_amount: r.deposit_amount,
    deposit_status: r.deposit_status,
    amount_paid: r.amount_paid,
    converted_to_rental_id: r.converted_to_rental_id ?? null,
    pricing_snapshot: (r.pricing_snapshot ??
      null) as unknown as ReservationRow["pricing_snapshot"],
    created_by: r.created_by,
    created_by_name: r.created_by_name,
  };
}

export function reservationPatchToRow(
  patch: Partial<Reservation>,
): Partial<ReservationRow> {
  return reservationToRow({ ...({} as Reservation), ...patch });
}
