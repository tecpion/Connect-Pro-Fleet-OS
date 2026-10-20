// Connect Pro Fleet — repository layer (Build #22).
//
// Domain repositories abstract persistence so the store can swap between an
// in-memory adapter (tests/dev) and a Supabase-backed adapter (production)
// without changing business logic. Pages/components never call `.from(table)`
// directly. The store continues to own domain semantics; repositories own
// durable read/write + mapping between DB rows and domain objects.
//
// This module holds the repository INTERFACES, error normalization, money
// normalization, and the factory. The Supabase adapter implementations live in
// repositoryAdapters.ts; the row/domain mappers live in repositoryMappers.ts.

import type {
  Customer,
  Vehicle,
  RentalAgreement,
  Reservation,
  FinancialTransaction,
} from "../types";
import type {
  BookingRequest,
  BookingOutboundEvent,
} from "../bookingRequestTypes";
import type { Inspection } from "../inspectionTypes";
import type { RentalDeposit, DepositHistoryEvent } from "../depositTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceEvent,
} from "../complianceTypes";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationAuditEvent,
  VerificationUsageCharge,
} from "../verificationTypes";
import { getSupabase } from "./client";
import {
  SupabaseCustomerRepository,
  SupabaseVehicleRepository,
  SupabaseRentalRepository,
  SupabaseLedgerRepository,
  SupabaseReservationRepository,
  SupabaseBookingRequestRepository,
  SupabaseInspectionRepository,
  SupabaseDepositRepository,
  SupabaseComplianceRepository,
  SupabaseVerificationRepository,
} from "./repositoryAdapters";
import {
  SupabaseTelematicsRepository,
  SupabaseViolationRepository,
  SupabaseCaseRepository,
  type TelematicsRepository,
  type ViolationRepository,
  type CaseRepository,
} from "./phase4Adapters";
import {
  SupabaseExpenseRepository,
  SupabaseBankingRepository,
  SupabaseInvestorRepository,
  type ExpenseRepository,
  type BankingRepository,
  type InvestorRepository,
} from "./phase5Adapters";
import {
  SupabaseMaintenanceRepository,
  type MaintenanceRepository,
} from "./maintenanceAdapters";
import {
  SupabaseLocationsRepository,
  SupabaseStaffAssignmentsRepository,
  type LocationsRepository,
  type StaffAssignmentsRepository,
} from "./phase8OperationalAdapters";
import {
  SupabaseTasksRepository,
  SupabaseNotificationsRepository,
  SupabaseCompanySettingsRepository,
  SupabaseVehicleClassesRepository,
  SupabaseAddonsRepository,
  type TasksRepository,
  type NotificationsRepository,
  type CompanySettingsRepository,
  type VehicleClassesRepository,
  type AddonsRepository,
} from "./phase8ConfigAdapters";
import {
  SupabaseRentalEventsRepository,
  SupabaseInvoicesRepository,
  SupabaseReceiptsRepository,
  SupabasePaymentArrangementsRepository,
  SupabaseAgreementsRepository,
  SupabaseActivityAuditRepository,
  type RentalEventsRepository,
  type InvoicesRepository,
  type ReceiptsRepository,
  type PaymentArrangementsRepository,
  type AgreementsRepository,
  type ActivityAuditRepository,
} from "./phase9Adapters";
import {
  SupabaseLeadRepository,
  type LeadRepository,
} from "./phase10Adapters";

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface CustomerRepository {
  list(orgId: string): Promise<Customer[]>;
  get(orgId: string, id: string): Promise<Customer | null>;
  insert(c: Customer): Promise<Customer>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Customer>,
  ): Promise<Customer>;
}

export interface VehicleRepository {
  list(orgId: string): Promise<Vehicle[]>;
  get(orgId: string, id: string): Promise<Vehicle | null>;
  insert(v: Vehicle): Promise<Vehicle>;
  update(orgId: string, id: string, patch: Partial<Vehicle>): Promise<Vehicle>;
}

export interface RentalRepository {
  list(orgId: string): Promise<RentalAgreement[]>;
  get(orgId: string, id: string): Promise<RentalAgreement | null>;
  insert(r: RentalAgreement): Promise<RentalAgreement>;
  update(
    orgId: string,
    id: string,
    patch: Partial<RentalAgreement>,
  ): Promise<RentalAgreement>;
}

export interface ReservationRepository {
  list(orgId: string): Promise<Reservation[]>;
  get(orgId: string, id: string): Promise<Reservation | null>;
  insert(r: Reservation): Promise<Reservation>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Reservation>,
  ): Promise<Reservation>;
}

export interface LedgerRepository {
  listForRental(
    orgId: string,
    rentalId: string,
  ): Promise<FinancialTransaction[]>;
  insert(t: FinancialTransaction): Promise<FinancialTransaction>;
  update(
    orgId: string,
    id: string,
    patch: Partial<FinancialTransaction>,
  ): Promise<FinancialTransaction>;
}

export interface BookingRequestRepository {
  list(orgId: string): Promise<BookingRequest[]>;
  insert(b: BookingRequest): Promise<BookingRequest>;
  update(
    orgId: string,
    id: string,
    patch: Partial<BookingRequest>,
  ): Promise<BookingRequest>;
}

export interface InspectionRepository {
  list(orgId: string): Promise<Inspection[]>;
  insert(i: Inspection): Promise<Inspection>;
}

export interface DepositRepository {
  list(orgId: string): Promise<RentalDeposit[]>;
  insert(d: RentalDeposit): Promise<RentalDeposit>;
  update(
    orgId: string,
    id: string,
    patch: Partial<RentalDeposit>,
  ): Promise<RentalDeposit>;
  listHistory(orgId: string, depositId: string): Promise<DepositHistoryEvent[]>;
  insertHistory(e: DepositHistoryEvent): Promise<DepositHistoryEvent>;
}

export interface ComplianceRepository {
  listDocuments(orgId: string): Promise<DocumentRecord[]>;
  listDocumentsForEntity(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<DocumentRecord[]>;
  insertDocument(d: DocumentRecord): Promise<DocumentRecord>;
  updateDocument(
    orgId: string,
    id: string,
    patch: Partial<DocumentRecord>,
  ): Promise<DocumentRecord>;
  listRequirements(orgId: string): Promise<ComplianceRequirement[]>;
  upsertRequirement(r: ComplianceRequirement): Promise<ComplianceRequirement>;
  listOverrides(orgId: string): Promise<ComplianceOverride[]>;
  insertOverride(o: ComplianceOverride): Promise<ComplianceOverride>;
  updateOverride(
    orgId: string,
    id: string,
    patch: Partial<ComplianceOverride>,
  ): Promise<ComplianceOverride>;
  listEvents(orgId: string): Promise<ComplianceEvent[]>;
  insertEvent(e: ComplianceEvent): Promise<ComplianceEvent>;
}

export interface VerificationRepository {
  listRequests(orgId: string): Promise<VerificationRequest[]>;
  insertRequest(v: VerificationRequest): Promise<VerificationRequest>;
  updateRequest(
    orgId: string,
    id: string,
    patch: Partial<VerificationRequest>,
  ): Promise<VerificationRequest>;
  listRequirements(orgId: string): Promise<VerificationRequirement[]>;
  insertRequirement(
    r: VerificationRequirement,
  ): Promise<VerificationRequirement>;
  updateRequirement(
    orgId: string,
    id: string,
    patch: Partial<VerificationRequirement>,
  ): Promise<VerificationRequirement>;
  listOverrides(orgId: string): Promise<VerificationOverride[]>;
  insertOverride(o: VerificationOverride): Promise<VerificationOverride>;
  listAudit(orgId: string): Promise<VerificationAuditEvent[]>;
  insertAudit(e: VerificationAuditEvent): Promise<VerificationAuditEvent>;
  listUsageCharges(orgId: string): Promise<VerificationUsageCharge[]>;
  insertUsageCharge(
    c: VerificationUsageCharge,
  ): Promise<VerificationUsageCharge>;
  updateUsageCharge(
    orgId: string,
    id: string,
    patch: Partial<VerificationUsageCharge>,
  ): Promise<VerificationUsageCharge>;
}

// Re-export adapter classes + mappers so existing imports keep working.
export {
  SupabaseCustomerRepository,
  SupabaseVehicleRepository,
  SupabaseRentalRepository,
  SupabaseLedgerRepository,
  SupabaseReservationRepository,
  SupabaseBookingRequestRepository,
  SupabaseInspectionRepository,
  SupabaseDepositRepository,
  SupabaseComplianceRepository,
  SupabaseVerificationRepository,
  SupabaseTelematicsRepository,
  SupabaseViolationRepository,
  SupabaseCaseRepository,
  SupabaseExpenseRepository,
  SupabaseBankingRepository,
  SupabaseInvestorRepository,
  SupabaseMaintenanceRepository,
  SupabaseLocationsRepository,
  SupabaseStaffAssignmentsRepository,
  SupabaseTasksRepository,
  SupabaseNotificationsRepository,
  SupabaseCompanySettingsRepository,
  SupabaseVehicleClassesRepository,
  SupabaseAddonsRepository,
  SupabaseLeadRepository,
};
export type {
  TelematicsRepository,
  ViolationRepository,
  CaseRepository,
  ExpenseRepository,
  BankingRepository,
  InvestorRepository,
  MaintenanceRepository,
  LocationsRepository,
  StaffAssignmentsRepository,
  TasksRepository,
  NotificationsRepository,
  CompanySettingsRepository,
  VehicleClassesRepository,
  AddonsRepository,
  LeadRepository,
};

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

export class RepositoryError extends Error {
  constructor(
    message: string,
    public kind:
      | "permission"
      | "not_found"
      | "conflict"
      | "validation"
      | "connection"
      | "unknown",
  ) {
    super(message);
  }
}

export function normalizeError(err: unknown): RepositoryError {
  let msg = "";
  let hint = "";
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error?: unknown;
    };
    if (typeof e.message === "string") msg = e.message;
    else if (typeof e.error === "string") msg = e.error;
    else if (typeof e.details === "string") msg = e.details;
    if (typeof e.hint === "string") hint = e.hint;
  }
  if (!msg) msg = err instanceof Error ? err.message : String(err);
  if (hint && !msg.includes(hint)) msg = `${msg} (hint: ${hint})`;
  const lower = msg.toLowerCase();
  if (
    lower.includes("jwt") ||
    lower.includes("not authorized") ||
    lower.includes("rls") ||
    lower.includes("permission")
  ) {
    return new RepositoryError(
      "You don't have access to this data.",
      "permission",
    );
  }
  if (
    lower.includes("duplicate") ||
    lower.includes("unique") ||
    lower.includes("conflict")
  ) {
    return new RepositoryError("This record already exists.", "conflict");
  }
  if (lower.includes("not found") || lower.includes("no rows")) {
    return new RepositoryError("Record not found.", "not_found");
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("connection")
  ) {
    return new RepositoryError(
      "Could not connect to the server.",
      "connection",
    );
  }
  return new RepositoryError(msg || "Something went wrong.", "unknown");
}

// ---------------------------------------------------------------------------
// Money normalization: Supabase returns numeric as string; app uses number.
// ---------------------------------------------------------------------------

export function toMoney(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Factory: returns Supabase-backed repositories when configured, else null.
// ---------------------------------------------------------------------------

export function createRepositories(): {
  customers: CustomerRepository | null;
  vehicles: VehicleRepository | null;
  rentals: RentalRepository | null;
  reservations: ReservationRepository | null;
  ledger: LedgerRepository | null;
  bookingRequests: BookingRequestRepository | null;
  inspections: InspectionRepository | null;
  deposits: DepositRepository | null;
  compliance: ComplianceRepository | null;
  verification: VerificationRepository | null;
  telematics: TelematicsRepository | null;
  violations: ViolationRepository | null;
  cases: CaseRepository | null;
  expenses: ExpenseRepository | null;
  banking: BankingRepository | null;
  investor: InvestorRepository | null;
  maintenance: MaintenanceRepository | null;
  locations: LocationsRepository | null;
  staffAssignments: StaffAssignmentsRepository | null;
  tasks: TasksRepository | null;
  notifications: NotificationsRepository | null;
  companySettings: CompanySettingsRepository | null;
  vehicleClasses: VehicleClassesRepository | null;
  addons: AddonsRepository | null;
  rentalEvents: RentalEventsRepository | null;
  invoices: InvoicesRepository | null;
  receipts: ReceiptsRepository | null;
  paymentArrangements: PaymentArrangementsRepository | null;
  agreements: AgreementsRepository | null;
  activityAudit: ActivityAuditRepository | null;
  leads: LeadRepository | null;
} {
  const db = getSupabase();
  if (!db)
    return {
      customers: null,
      vehicles: null,
      rentals: null,
      reservations: null,
      ledger: null,
      bookingRequests: null,
      inspections: null,
      deposits: null,
      compliance: null,
      verification: null,
      telematics: null,
      violations: null,
      cases: null,
      expenses: null,
      banking: null,
      investor: null,
      maintenance: null,
      locations: null,
      staffAssignments: null,
      tasks: null,
      notifications: null,
      companySettings: null,
      vehicleClasses: null,
      addons: null,
      rentalEvents: null,
      invoices: null,
      receipts: null,
      paymentArrangements: null,
      agreements: null,
      activityAudit: null,
      leads: null,
    };
  return {
    customers: new SupabaseCustomerRepository(db),
    vehicles: new SupabaseVehicleRepository(db),
    rentals: new SupabaseRentalRepository(db),
    reservations: new SupabaseReservationRepository(db),
    ledger: new SupabaseLedgerRepository(db),
    bookingRequests: new SupabaseBookingRequestRepository(db),
    inspections: new SupabaseInspectionRepository(db),
    deposits: new SupabaseDepositRepository(db),
    compliance: new SupabaseComplianceRepository(db),
    verification: new SupabaseVerificationRepository(db),
    telematics: new SupabaseTelematicsRepository(db),
    violations: new SupabaseViolationRepository(db),
    cases: new SupabaseCaseRepository(db),
    expenses: new SupabaseExpenseRepository(db),
    banking: new SupabaseBankingRepository(db),
    investor: new SupabaseInvestorRepository(db),
    maintenance: new SupabaseMaintenanceRepository(db),
    locations: new SupabaseLocationsRepository(db),
    staffAssignments: new SupabaseStaffAssignmentsRepository(db),
    tasks: new SupabaseTasksRepository(db),
    notifications: new SupabaseNotificationsRepository(db),
    companySettings: new SupabaseCompanySettingsRepository(db),
    vehicleClasses: new SupabaseVehicleClassesRepository(db),
    addons: new SupabaseAddonsRepository(db),
    rentalEvents: new SupabaseRentalEventsRepository(db),
    invoices: new SupabaseInvoicesRepository(db),
    receipts: new SupabaseReceiptsRepository(db),
    paymentArrangements: new SupabasePaymentArrangementsRepository(db),
    agreements: new SupabaseAgreementsRepository(db),
    activityAudit: new SupabaseActivityAuditRepository(db),
    leads: new SupabaseLeadRepository(db),
  };
}
