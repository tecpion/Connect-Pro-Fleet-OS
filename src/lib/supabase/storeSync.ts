// Connect Pro Fleet — Cloud store hydration + persistence sync
// (Phase 1 + 3 + 4).
//
// Bridges the frozen in-memory StoreProvider to the Cloud repository layer
// WITHOUT changing the synchronous `useStore()` API that every component
// depends on. The store keeps its useState arrays as the UI cache; this
// module hydrates them from Cloud on auth/org change and persists mutations
// through the repository abstraction (UI → store method → repository → Cloud).
//
// In memory mode (no Cloud config) every function is a no-op so the existing
// seeded demo experience is unchanged.

import type { Customer, Vehicle, Reservation } from "../types";
import type {
  DocumentRecord,
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
import type {
  TelematicsDevice,
  TelematicsDeviceAssignment,
  TelematicsPosition,
  TelematicsEvent,
  TelematicsTrip,
  TelematicsAlert,
  TelematicsGeofence,
} from "../telematicsTypes";
import type {
  Violation,
  ViolationEvidence,
  ViolationEvent,
} from "../violationTypes";
import type { CaseRecord, CaseEvent } from "../caseCenterTypes";
import type {
  ExpenseTransaction,
  ExpenseLineItem,
  ExpenseCategory,
  ExpenseEvent,
  ExpenseReceipt,
  ExpenseReimbursement,
  CashAccount,
  CashEntry,
} from "../expenseTypes";
import type {
  FinancialAccount,
  ImportedTransaction,
  FinancialStatement,
  ImportBatch,
  ReconciliationMatch,
  AccountTransfer,
  ReconciliationEvent,
} from "../bankingTypes";
import type {
  Investor,
  InvestorVehicle,
  Settlement,
} from "../investorTypes";
import { getSupabase, getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type {
  CustomerRepository,
  VehicleRepository,
  ReservationRepository,
  ComplianceRepository,
  VerificationRepository,
  TelematicsRepository,
  ViolationRepository,
  CaseRepository,
  ExpenseRepository,
  BankingRepository,
  InvestorRepository,
} from "./repository";

export interface StoreSyncHandles {
  setCustomers: (updater: (prev: Customer[]) => Customer[]) => void;
  setVehicles: (updater: (prev: Vehicle[]) => Vehicle[]) => void;
  setReservations: (updater: (prev: Reservation[]) => Reservation[]) => void;
}

export interface StoreSyncDeps {
  customers: Customer[];
  vehicles: Vehicle[];
  reservations: Reservation[];
}

export interface Repositories {
  customers: CustomerRepository | null;
  vehicles: VehicleRepository | null;
  reservations: ReservationRepository | null;
  compliance: ComplianceRepository | null;
  verification: VerificationRepository | null;
  telematics: TelematicsRepository | null;
  violations: ViolationRepository | null;
  cases: CaseRepository | null;
}

function repos(): Repositories | null {
  if (getBackendMode() !== "supabase") return null;
  return createRepositories();
}

/** Hydrate the three Phase 1 slices from Cloud into the store cache.
 *  Returns true when Cloud mode is active and hydration ran. */
export async function hydratePhase1Slices(
  orgId: string,
  handles: StoreSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r || !r.customers || !r.vehicles || !r.reservations) return false;
  const [customers, vehicles, reservations] = await Promise.all([
    r.customers.list(orgId),
    r.vehicles.list(orgId),
    r.reservations.list(orgId),
  ]);
  handles.setCustomers(() => customers);
  handles.setVehicles(() => vehicles);
  handles.setReservations(() => reservations);
  return true;
}

/** Persist a new customer to Cloud (fire-and-forget; local state already
 *  updated optimistically). No-op in memory mode. */
export function persistCustomerInsert(c: Customer): void {
  const r = repos();
  if (!r?.customers) return;
  void r.customers.insert(c).catch((e) => {
    console.error("[storeSync] customer insert failed", e);
  });
}

export function persistCustomerUpdate(
  orgId: string,
  id: string,
  patch: Partial<Customer>,
): void {
  const r = repos();
  if (!r?.customers) return;
  void r.customers.update(orgId, id, patch).catch((e) => {
    console.error("[storeSync] customer update failed", e);
  });
}

export function persistVehicleInsert(v: Vehicle): void {
  const r = repos();
  if (!r?.vehicles) return;
  void r.vehicles.insert(v).catch((e) => {
    console.error("[storeSync] vehicle insert failed", e);
  });
}

export function persistVehicleUpdate(
  orgId: string,
  id: string,
  patch: Partial<Vehicle>,
): void {
  const r = repos();
  if (!r?.vehicles) return;
  void r.vehicles.update(orgId, id, patch).catch((e) => {
    console.error("[storeSync] vehicle update failed", e);
  });
}

export function persistReservationInsert(rsv: Reservation): void {
  const r = repos();
  if (!r?.reservations) return;
  void r.reservations.insert(rsv).catch((e) => {
    console.error("[storeSync] reservation insert failed", e);
  });
}

export function persistReservationUpdate(
  orgId: string,
  id: string,
  patch: Partial<Reservation>,
): void {
  const r = repos();
  if (!r?.reservations) return;
  void r.reservations.update(orgId, id, patch).catch((e) => {
    console.error("[storeSync] reservation update failed", e);
  });
}

/** Resolve the active organization id from the auth session (memory demo
 *  returns the seeded tenant id). */
export function resolveOrgId(activeOrgId: string | null): string {
  if (activeOrgId) return activeOrgId;
  return "tnt_connectpro";
}

export type {
  CustomerRepository,
  VehicleRepository,
  ReservationRepository,
  ComplianceRepository,
  VerificationRepository,
  TelematicsRepository,
  ViolationRepository,
  CaseRepository,
};

// ── Phase 3: Compliance + Verification hydration + persistence ──

export interface ComplianceSyncHandles {
  setDocuments: (updater: (prev: DocumentRecord[]) => DocumentRecord[]) => void;
  setOverrides: (
    updater: (prev: ComplianceOverride[]) => ComplianceOverride[],
  ) => void;
  setEvents: (updater: (prev: ComplianceEvent[]) => ComplianceEvent[]) => void;
}

export async function hydrateCompliance(
  orgId: string,
  handles: ComplianceSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.compliance) return false;
  const [documents, overrides, events] = await Promise.all([
    r.compliance.listDocuments(orgId),
    r.compliance.listOverrides(orgId),
    r.compliance.listEvents(orgId),
  ]);
  handles.setDocuments(() => documents);
  handles.setOverrides(() => overrides);
  handles.setEvents(() => events);
  return true;
}

export function persistComplianceDocumentInsert(d: DocumentRecord): void {
  const r = repos();
  if (!r?.compliance) return;
  void r.compliance
    .insertDocument(d)
    .catch((e) =>
      console.error("[storeSync] compliance document insert failed", e),
    );
}

export function persistComplianceDocumentUpdate(
  orgId: string,
  id: string,
  patch: Partial<DocumentRecord>,
): void {
  const r = repos();
  if (!r?.compliance) return;
  void r.compliance
    .updateDocument(orgId, id, patch)
    .catch((e) =>
      console.error("[storeSync] compliance document update failed", e),
    );
}

export function persistComplianceOverrideInsert(o: ComplianceOverride): void {
  const r = repos();
  if (!r?.compliance) return;
  void r.compliance
    .insertOverride(o)
    .catch((e) =>
      console.error("[storeSync] compliance override insert failed", e),
    );
}

export function persistComplianceEventInsert(e: ComplianceEvent): void {
  const r = repos();
  if (!r?.compliance) return;
  void r.compliance
    .insertEvent(e)
    .catch((err) =>
      console.error("[storeSync] compliance event insert failed", err),
    );
}

export interface VerificationSyncHandles {
  setRequests: (
    updater: (prev: VerificationRequest[]) => VerificationRequest[],
  ) => void;
  setRequirements: (
    updater: (prev: VerificationRequirement[]) => VerificationRequirement[],
  ) => void;
  setOverrides: (
    updater: (prev: VerificationOverride[]) => VerificationOverride[],
  ) => void;
  setAudit: (
    updater: (prev: VerificationAuditEvent[]) => VerificationAuditEvent[],
  ) => void;
  setUsageCharges: (
    updater: (prev: VerificationUsageCharge[]) => VerificationUsageCharge[],
  ) => void;
}

export async function hydrateVerification(
  orgId: string,
  handles: VerificationSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.verification) return false;
  const [requests, requirements, overrides, audit, charges] = await Promise.all(
    [
      r.verification.listRequests(orgId),
      r.verification.listRequirements(orgId),
      r.verification.listOverrides(orgId),
      r.verification.listAudit(orgId),
      r.verification.listUsageCharges(orgId),
    ],
  );
  handles.setRequests(() => requests);
  handles.setRequirements(() => requirements);
  handles.setOverrides(() => overrides);
  handles.setAudit(() => audit);
  handles.setUsageCharges(() => charges);
  return true;
}

export function persistVerificationRequestInsert(v: VerificationRequest): void {
  const r = repos();
  if (!r?.verification) return;
  void r.verification
    .insertRequest(v)
    .catch((e) =>
      console.error("[storeSync] verification request insert failed", e),
    );
}

export function persistVerificationRequestUpdate(
  orgId: string,
  id: string,
  patch: Partial<VerificationRequest>,
): void {
  const r = repos();
  if (!r?.verification) return;
  void r.verification
    .updateRequest(orgId, id, patch)
    .catch((e) =>
      console.error("[storeSync] verification request update failed", e),
    );
}

export function persistVerificationRequirementInsert(
  req: VerificationRequirement,
): void {
  const r = repos();
  if (!r?.verification) return;
  void r.verification
    .insertRequirement(req)
    .catch((e) =>
      console.error("[storeSync] verification requirement insert failed", e),
    );
}

export function persistVerificationOverrideInsert(
  o: VerificationOverride,
): void {
  const r = repos();
  if (!r?.verification) return;
  void r.verification
    .insertOverride(o)
    .catch((e) =>
      console.error("[storeSync] verification override insert failed", e),
    );
}

export function persistVerificationAuditInsert(
  e: VerificationAuditEvent,
): void {
  const r = repos();
  if (!r?.verification) return;
  void r.verification
    .insertAudit(e)
    .catch((err) =>
      console.error("[storeSync] verification audit insert failed", err),
    );
}

export function persistVerificationUsageChargeInsert(
  c: VerificationUsageCharge,
): void {
  const r = repos();
  if (!r?.verification) return;
  void r.verification
    .insertUsageCharge(c)
    .catch((e) =>
      console.error("[storeSync] verification usage charge insert failed", e),
    );
}

// ── Phase 4: Telematics + Violations + Cases hydration + persistence ──

export interface TelematicsSyncHandles {
  setDevices: (
    updater: (prev: TelematicsDevice[]) => TelematicsDevice[],
  ) => void;
  setAssignments: (
    updater: (
      prev: TelematicsDeviceAssignment[],
    ) => TelematicsDeviceAssignment[],
  ) => void;
  setPositions: (
    updater: (prev: TelematicsPosition[]) => TelematicsPosition[],
  ) => void;
  setEvents: (updater: (prev: TelematicsEvent[]) => TelematicsEvent[]) => void;
  setTrips: (updater: (prev: TelematicsTrip[]) => TelematicsTrip[]) => void;
  setAlerts: (updater: (prev: TelematicsAlert[]) => TelematicsAlert[]) => void;
  setGeofences: (
    updater: (prev: TelematicsGeofence[]) => TelematicsGeofence[],
  ) => void;
}

export async function hydrateTelematics(
  orgId: string,
  handles: TelematicsSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.telematics) return false;
  const [devices, assignments, positions, events, trips, alerts, geofences] =
    await Promise.all([
      r.telematics.listDevices(orgId),
      r.telematics.listAssignments(orgId),
      r.telematics.listPositions(orgId),
      r.telematics.listEvents(orgId),
      r.telematics.listTrips(orgId),
      r.telematics.listAlerts(orgId),
      r.telematics.listGeofences(orgId),
    ]);
  handles.setDevices(() => devices);
  handles.setAssignments(() => assignments);
  handles.setPositions(() => positions);
  handles.setEvents(() => events);
  handles.setTrips(() => trips);
  handles.setAlerts(() => alerts);
  handles.setGeofences(() => geofences);
  return true;
}

export function persistTelematicsDeviceInsert(d: TelematicsDevice): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertDevice(d)
    .catch((e) =>
      console.error("[storeSync] telematics device insert failed", e),
    );
}

export function persistTelematicsDeviceUpdate(
  orgId: string,
  id: string,
  patch: Partial<TelematicsDevice>,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .updateDevice(orgId, id, patch)
    .catch((e) =>
      console.error("[storeSync] telematics device update failed", e),
    );
}

export function persistTelematicsAssignmentInsert(
  a: TelematicsDeviceAssignment,
  orgId: string,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertAssignment(a, orgId)
    .catch((e) =>
      console.error("[storeSync] telematics assignment insert failed", e),
    );
}

export function persistTelematicsAssignmentUpdate(
  orgId: string,
  id: string,
  patch: Partial<TelematicsDeviceAssignment>,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .updateAssignment(orgId, id, patch)
    .catch((e) =>
      console.error("[storeSync] telematics assignment update failed", e),
    );
}

export function persistTelematicsPositionInsert(
  p: TelematicsPosition,
  orgId: string,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertPosition(p, orgId)
    .catch((e) =>
      console.error("[storeSync] telematics position insert failed", e),
    );
}

export function persistTelematicsEventInsert(e: TelematicsEvent): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertEvent(e)
    .catch((err) =>
      console.error("[storeSync] telematics event insert failed", err),
    );
}

export function persistTelematicsTripInsert(t: TelematicsTrip): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertTrip(t)
    .catch((e) =>
      console.error("[storeSync] telematics trip insert failed", e),
    );
}

export function persistTelematicsAlertInsert(a: TelematicsAlert): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertAlert(a)
    .catch((e) =>
      console.error("[storeSync] telematics alert insert failed", e),
    );
}

export function persistTelematicsAlertUpdate(
  orgId: string,
  id: string,
  patch: Partial<TelematicsAlert>,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .updateAlert(orgId, id, patch)
    .catch((e) =>
      console.error("[storeSync] telematics alert update failed", e),
    );
}

export function persistTelematicsGeofenceInsert(g: TelematicsGeofence): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .insertGeofence(g)
    .catch((e) =>
      console.error("[storeSync] telematics geofence insert failed", e),
    );
}

export function persistTelematicsGeofenceUpdate(
  orgId: string,
  id: string,
  patch: Partial<TelematicsGeofence>,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .updateGeofence(orgId, id, patch)
    .catch((e) =>
      console.error("[storeSync] telematics geofence update failed", e),
    );
}

export function persistTelematicsGeofenceDelete(
  orgId: string,
  id: string,
): void {
  const r = repos();
  if (!r?.telematics) return;
  void r.telematics
    .deleteGeofence(orgId, id)
    .catch((e) =>
      console.error("[storeSync] telematics geofence delete failed", e),
    );
}

// ── Violations ──

export interface ViolationSyncHandles {
  setViolations: (updater: (prev: Violation[]) => Violation[]) => void;
  setEvidence: (
    updater: (prev: ViolationEvidence[]) => ViolationEvidence[],
  ) => void;
  setEvents: (updater: (prev: ViolationEvent[]) => ViolationEvent[]) => void;
}

export async function hydrateViolations(
  orgId: string,
  handles: ViolationSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.violations) return false;
  const [violations, evidence, events] = await Promise.all([
    r.violations.list(orgId),
    r.violations.listEvidence(orgId),
    r.violations.listEvents(orgId),
  ]);
  handles.setViolations(() => violations);
  handles.setEvidence(() => evidence);
  handles.setEvents(() => events);
  return true;
}

export function persistViolationInsert(v: Violation): void {
  const r = repos();
  if (!r?.violations) return;
  void r.violations
    .insert(v)
    .catch((e) => console.error("[storeSync] violation insert failed", e));
}

export function persistViolationUpdate(
  orgId: string,
  id: string,
  patch: Partial<Violation>,
): void {
  const r = repos();
  if (!r?.violations) return;
  void r.violations
    .update(orgId, id, patch)
    .catch((e) => console.error("[storeSync] violation update failed", e));
}

export function persistViolationEvidenceInsert(e: ViolationEvidence): void {
  const r = repos();
  if (!r?.violations) return;
  void r.violations
    .insertEvidence(e)
    .catch((err) =>
      console.error("[storeSync] violation evidence insert failed", err),
    );
}

export function persistViolationEventInsert(e: ViolationEvent): void {
  const r = repos();
  if (!r?.violations) return;
  void r.violations
    .insertEvent(e)
    .catch((err) =>
      console.error("[storeSync] violation event insert failed", err),
    );
}

// ── Cases ──

export interface CaseSyncHandles {
  setCases: (updater: (prev: CaseRecord[]) => CaseRecord[]) => void;
  setCaseEvents: (updater: (prev: CaseEvent[]) => CaseEvent[]) => void;
}

export async function hydrateCases(
  orgId: string,
  handles: CaseSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.cases) return false;
  const [cases, caseEvents] = await Promise.all([
    r.cases.list(orgId),
    r.cases.listEvents(orgId),
  ]);
  handles.setCases(() => cases);
  handles.setCaseEvents(() => caseEvents);
  return true;
}

export function persistCaseInsert(c: CaseRecord): void {
  const r = repos();
  if (!r?.cases) return;
  void r.cases
    .insert(c)
    .catch((e) => console.error("[storeSync] case insert failed", e));
}

export function persistCaseUpdate(
  orgId: string,
  id: string,
  patch: Partial<CaseRecord>,
): void {
  const r = repos();
  if (!r?.cases) return;
  void r.cases
    .update(orgId, id, patch)
    .catch((e) => console.error("[storeSync] case update failed", e));
}

export function persistCaseEventInsert(e: CaseEvent): void {
  const r = repos();
  if (!r?.cases) return;
  void r.cases
    .insertEvent(e)
    .catch((err) => console.error("[storeSync] case event insert failed", err));
}
