// Connect Pro Fleet — Rental Risk & Defense Record domain types.
//
// This is an INTEGRATION / EVIDENCE layer over the existing authoritative
// modules (Rental, Customer, Vehicle, Inspection, Maintenance, Compliance,
// Incident, Damage Claim, Vault, Tasks, Ownership, Audit). It does NOT
// duplicate those stores. It adds:
//
//  1. A canonical RentalDriver model (one truth for primary + additional
//     authorized drivers — a person is never "authorized" merely because
//     their name appears in a field).
//  2. An immutable RentalReleaseSnapshot — frozen factual evidence captured
//     at the moment of vehicle release. Later state changes (maintenance
//     closed, insurance renewed, driver revoked, vehicle status changed)
//     NEVER alter the historical snapshot.
//  3. An entity-relationship snapshot (titled owner / operating entity /
//     insurance entity / acquisition entity) frozen at release time.
//  4. A release gate with severity-classified blockers (hard_block /
//     override_eligible / warning) that COMPOSES existing compliance +
//     maintenance logic — never a second rules engine.
//  5. An agreement renewal chain (new linked agreements, never overwrite).
//  6. Incident driver historical authorization (authorization AS OF the
//     incident date — later revocation does not alter the historical fact).
//  7. A derived RentalDefenseRecord view (historical + current state shown
//     distinctly).
//  8. Documentation Readiness (two objective sections — NO legal score, NO
//     "Graves" label, NO liability conclusion).
//  9. An Incident Documentation Package assembler (indexes existing records,
//     "Not on file" for missing — never fabricates).
//
// No legal conclusions are ever produced. This module records FACTS only.

import type { DriverVerificationStatus } from "./types";
import type { WorkOrderStatus, MaintenanceType } from "./maintenanceTypes";
import type { DocumentStatus, VerificationStatus } from "./complianceTypes";

// ---------------------------------------------------------------------------
// 1. Canonical RentalDriver model
// ---------------------------------------------------------------------------

export type RentalDriverRole = "primary" | "additional";

export type RentalDriverAuthorizationStatus = "active" | "revoked";

/** The ONE canonical rental-driver relationship. Replaces the ambiguity of
 *  having both `Driver[]` (primary, reservation-keyed) and a separate
 *  additional-driver list. Existing `Driver` records map into this model
 *  (role: "primary"); all new authorization logic resolves through the
 *  canonical selectors below.
 *
 *  A person is NEVER authorized merely because their name exists in a field —
 *  an active RentalDriver record must exist. */
export interface RentalDriver {
  id: string;
  tenant_id: string;
  rental_id: string;
  reservation_id: string | null;
  customer_id: string | null;
  role: RentalDriverRole;
  full_name: string;
  license_number: string | null;
  license_state: string | null;
  license_expiry: string | null;
  verification_status: DriverVerificationStatus;
  /** Free-text relationship to the primary renter (e.g. "spouse"). */
  relationship: string | null;
  authorization_status: RentalDriverAuthorizationStatus;
  authorized_at: string;
  authorized_by: string | null; // staff id
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const RENTAL_DRIVER_ROLE_LABELS: Record<RentalDriverRole, string> = {
  primary: "Primary Renter",
  additional: "Additional Authorized Driver",
};

export const RENTAL_DRIVER_AUTH_LABELS: Record<
  RentalDriverAuthorizationStatus,
  string
> = {
  active: "Authorized",
  revoked: "Revoked",
};

// ---------------------------------------------------------------------------
// 2. Entity relationship snapshot (frozen at release)
// ---------------------------------------------------------------------------

/** A frozen snapshot of the entity relationships that existed at the time of
 *  rental release. Current vehicle ownership/entity state may later change
 *  without altering this snapshot. Each entity captures a legal name + an
 *  id/reference (the reference is to an existing Investor/Partner record when
 *  available; otherwise a display-name snapshot). */
export interface EntityRelationshipSnapshot {
  titled_owner_legal_name: string | null;
  titled_owner_ref: string | null;
  operating_entity_legal_name: string | null;
  operating_entity_ref: string | null;
  insurance_entity_legal_name: string | null;
  insurance_entity_ref: string | null;
  insurance_policy_reference: string | null;
  acquisition_entity_legal_name: string | null;
  acquisition_entity_ref: string | null;
  effective_timestamp: string;
}

// ---------------------------------------------------------------------------
// 3. Release gate — severity-classified blockers
// ---------------------------------------------------------------------------

export type ReleaseBlockSeverity =
  "hard_block" | "override_eligible" | "warning";

export const RELEASE_BLOCK_SEVERITY_LABELS: Record<
  ReleaseBlockSeverity,
  string
> = {
  hard_block: "Hard Block",
  override_eligible: "Override Eligible",
  warning: "Warning",
};

/** A single reason a vehicle cannot (or should not) be released. Each reason
 *  carries a severity that determines whether a manager override is possible.
 *
 *  - hard_block: safety-critical — CANNOT be bypassed through the normal
 *    manager override workflow (active safety-critical maintenance, explicit
 *    Out of Service, company-configured non-releasable safety conditions).
 *  - override_eligible: administrative / non-safety — may be overridden where
 *    company policy allows, with reason + actor + timestamp + permanent audit.
 *  - warning: does not prevent release but is recorded in the Release Snapshot. */
export interface ReleaseBlockReason {
  key: string;
  label: string;
  severity: ReleaseBlockSeverity;
  detail: string | null;
  /** The compliance requirement id or maintenance work-order id when the
   *  reason derives from an existing authoritative record. */
  source_ref: string | null;
}

export interface ReleaseGateResult {
  blocked: boolean;
  /** True when at least one hard_block reason is present (release impossible
   *  regardless of override). */
  hard_blocked: boolean;
  reasons: ReleaseBlockReason[];
  /** True when all blocking reasons are override_eligible (no hard blocks) and
   *  at least one reason is override_eligible. */
  override_eligible: boolean;
}

// ---------------------------------------------------------------------------
// 4. Rental Release Snapshot (immutable historical evidence)
// ---------------------------------------------------------------------------

/** The compliance/maintenance status frozen at release time. Each field is a
 *  snapshot — later changes to current state do not alter these values. */
export interface ReleaseComplianceSnapshot {
  registration_status: DocumentStatus | "not_on_file";
  registration_expiration: string | null;
  insurance_status: DocumentStatus | "not_on_file";
  insurance_expiration: string | null;
  other_required_statuses: {
    document_type: string;
    label: string;
    status: DocumentStatus | "not_on_file";
    expiration: string | null;
  }[];
}

/** A maintenance item that was open at the moment of release. Frozen — closing
 *  the work order later does not remove it from this snapshot. */
export interface ReleaseMaintenanceItem {
  work_order_id: string;
  work_order_number: string;
  maintenance_type: MaintenanceType;
  title: string;
  status: WorkOrderStatus;
  blocks_vehicle_use: boolean;
  safety_critical: boolean;
}

/** The driver verification status frozen at release time. Later revocation or
 *  verification changes do not alter the historical snapshot. */
export interface ReleaseDriverSnapshot {
  rental_driver_id: string;
  full_name: string;
  role: RentalDriverRole;
  verification_status: DriverVerificationStatus;
  authorization_status: RentalDriverAuthorizationStatus;
  license_expiry: string | null;
}

/** An override recorded at release. Permanent audit — reason + actor +
 *  timestamp. Only override_eligible reasons may be overridden; hard blocks
 *  cannot. */
export interface ReleaseOverride {
  override_type: "release_block_override";
  reason_keys: string[];
  reason: string;
  actor_staff_id: string;
  actor_name: string;
  timestamp: string;
}

/** The immutable factual snapshot captured at the moment a vehicle is
 *  released. This is HISTORICAL EVIDENCE — it must never silently change
 *  because a maintenance order was later closed, insurance renewed,
 *  registration updated, driver revoked, or vehicle status changed.
 *
 *  The current state and release-time state are separate concepts. The
 *  Defense Record shows BOTH. */
export interface RentalReleaseSnapshot {
  id: string;
  tenant_id: string;
  rental_id: string;
  agreement_id: string;
  agreement_number: string;
  agreement_signed: boolean;
  agreement_signature_ref: string | null;
  /** The customer id of the primary renter at release. */
  primary_renter_id: string;
  primary_renter_name: string;
  /** Drivers authorized at release (frozen). */
  drivers: ReleaseDriverSnapshot[];
  /** Vehicle identity snapshot. */
  vehicle_id: string;
  vehicle_label: string;
  vehicle_vin: string;
  vehicle_plate: string;
  vehicle_unit_number: string | null;
  vehicle_status_at_release: string;
  /** Exact possession / release timestamp. */
  released_at: string;
  releasing_staff_id: string;
  releasing_staff_name: string;
  /** Checkout inspection reference. */
  checkout_inspection_id: string | null;
  odometer_at_release: number | null;
  fuel_at_release: number | null;
  existing_damage_refs: string[];
  required_photos_status: "captured" | "partial" | "missing";
  /** Maintenance items open at release (frozen). */
  maintenance_open_at_release: ReleaseMaintenanceItem[];
  safety_critical_maintenance_open: boolean;
  /** Compliance status frozen at release. */
  compliance_at_release: ReleaseComplianceSnapshot;
  /** The release-gate result frozen at release. */
  gate_result: ReleaseGateResult;
  /** Warnings present at release (recorded even when release proceeded). */
  warnings_present: ReleaseBlockReason[];
  /** Blockers present at release (recorded even when overridden). */
  blockers_present: ReleaseBlockReason[];
  /** Override used, if any. null when no override was applied. */
  override: ReleaseOverride | null;
  /** Entity relationships frozen at release. */
  entity_snapshot: EntityRelationshipSnapshot;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 5. Agreement renewal chain
// ---------------------------------------------------------------------------

/** A node in the agreement renewal chain. The chain preserves the full history
 *  of agreements for a rental vehicle + renter relationship. Renewal creates a
 *  NEW agreement linked to the prior — the prior is never overwritten. */
export interface AgreementChainNode {
  agreement_id: string;
  agreement_number: string;
  prior_agreement_id: string | null;
  next_agreement_id: string | null;
  renewed_from_agreement_id: string | null;
  start_date: string;
  scheduled_end_date: string;
  actual_return_date: string | null;
  agreement_term_days: number | null;
  vehicle_id: string;
  vehicle_label: string;
  signed: boolean;
  signature_ref: string | null;
  signed_at: string | null;
  renter_id: string;
  renter_name: string;
  pricing_snapshot_ref: string | null;
  deposit_continuity: "new" | "carried" | "released_renewed" | "unknown";
  /** Vehicle exchanges that occurred during this agreement's period. */
  vehicle_exchanges: {
    exchange_id: string;
    from_vehicle_id: string;
    to_vehicle_id: string;
    at: string;
    reason: string;
  }[];
  /** Driver changes during this agreement's period. */
  driver_changes: {
    rental_driver_id: string;
    full_name: string;
    role: RentalDriverRole;
    action: "authorized" | "revoked";
    at: string;
  }[];
}

// ---------------------------------------------------------------------------
// 6. Incident driver historical authorization
// ---------------------------------------------------------------------------

export type IncidentDriverAuthorization =
  "primary" | "authorized_additional" | "unauthorized" | "unknown";

export const INCIDENT_DRIVER_AUTH_LABELS: Record<
  IncidentDriverAuthorization,
  string
> = {
  primary: "Primary Renter",
  authorized_additional: "Authorized Additional Driver",
  unauthorized: "Unauthorized Driver",
  unknown: "Unknown",
};

/** The driver-at-incident fact, preserved with HISTORICAL authorization. The
 *  authorization status is captured AS OF the incident date/time — later
 *  revocation or changes do not alter this historical fact. */
export interface IncidentDriverFact {
  /** The linked rental-driver record when known (historical reference). */
  rental_driver_id: string | null;
  /** The driver name snapshot (frozen — does not change if the driver record
   *  is later edited). */
  actual_driver_name: string;
  /** License reference snapshot, if captured. */
  license_reference: string | null;
  /** Authorization status AS OF the incident date/time. */
  authorization_at_incident: IncidentDriverAuthorization;
  /** The rental-driver snapshot at the time of the incident (frozen). */
  driver_snapshot: {
    full_name: string;
    role: RentalDriverRole;
    verification_status: DriverVerificationStatus;
    authorization_status: RentalDriverAuthorizationStatus;
    license_expiry: string | null;
  } | null;
}

/** Extension fields for the Incident record (added as optional fields on the
 *  existing Incident type — no new store). These preserve historical facts. */
export interface IncidentDefenseFields {
  /** The actual driver at the time of the incident, with historical auth. */
  incident_driver: IncidentDriverFact | null;
  /** Renter's written statement (text). */
  renter_statement: string | null;
  /** Police report document reference. */
  police_report_url: string | null;
  police_report_number: string | null;
  /** Injuries reported. */
  injuries_reported: "yes" | "no" | "unknown";
  /** Vehicle tow status. */
  vehicle_towed: boolean;
  vehicle_condition_notes: string | null;
  /** Linked damage claim. */
  linked_damage_claim_id: string | null;
  /** Post-incident inspection reference. */
  post_incident_inspection_id: string | null;
  /** Location of the incident. */
  incident_location: string | null;
}

// ---------------------------------------------------------------------------
// 7. Rental Defense Record (derived view — historical + current)
// ---------------------------------------------------------------------------

/** A "current vs release-time" paired value so the Defense Record can show
 *  BOTH without replacing the historical fact with current data. */
export interface HistoricalCurrentPair<T> {
  at_release: T;
  current: T;
}

export interface RentalDefenseRecord {
  rental_id: string;
  agreement_id: string;
  agreement_number: string;
  // Rental facts
  rental: {
    agreement_start: string | null;
    agreement_scheduled_end: string;
    actual_return: string | null;
    possession_start: string | null;
    possession_end: string | null;
    status: string;
    agreement_term_days: number | null;
  };
  // Renter
  renter: {
    primary_renter_id: string;
    primary_renter_name: string;
    driver_license_number: string | null;
    license_verification_status: DriverVerificationStatus;
    license_expiry: string | null;
    verification_timestamp: string | null;
  };
  // Authorized drivers (current authoritative state)
  authorized_drivers: {
    rental_driver_id: string;
    full_name: string;
    role: RentalDriverRole;
    relationship: string | null;
    license_number: string | null;
    verification_status: DriverVerificationStatus;
    authorization_status: RentalDriverAuthorizationStatus;
    authorized_at: string;
    authorized_by: string | null;
    revoked_at: string | null;
  }[];
  // Vehicle
  vehicle: {
    vehicle_id: string;
    year: number;
    make: string;
    model: string;
    vin: string;
    plate: string;
    unit_number: string | null;
    ownership_type: string | null;
    operating_entity: string | null;
  };
  // Checkout
  checkout: {
    inspection_id: string | null;
    timestamp: string | null;
    mileage: number | null;
    fuel: number | null;
    condition_notes: string | null;
    photos_count: number;
    required_photos_status: "captured" | "partial" | "missing";
    staff_member: string | null;
  } | null;
  // Maintenance — historical (at release) vs current
  maintenance: {
    at_release: {
      open_items: ReleaseMaintenanceItem[];
      safety_critical_open: boolean;
    };
    current: {
      open_items: ReleaseMaintenanceItem[];
      safety_critical_open: boolean;
    };
  };
  // Compliance — historical (at release) vs current
  compliance: HistoricalCurrentPair<{
    registration_status: DocumentStatus | "not_on_file";
    registration_expiration: string | null;
    insurance_status: DocumentStatus | "not_on_file";
    insurance_expiration: string | null;
  }>;
  // Incidents
  incidents: {
    incident_id: string;
    incident_type: string;
    occurred_at: string;
    reported_at: string;
    actual_driver_name: string | null;
    driver_authorization: IncidentDriverAuthorization | null;
    has_police_report: boolean;
    has_insurance_claim: boolean;
    linked_damage_claim_id: string | null;
    status: string;
  }[];
  // Audit
  audit: {
    created_at: string;
    created_by: string | null;
    last_updated: string;
    status_changes: { at: string; label: string; actor: string | null }[];
  };
  // The immutable release snapshot (when release occurred)
  release_snapshot: RentalReleaseSnapshot | null;
}

// ---------------------------------------------------------------------------
// 8. Documentation Readiness (two objective sections — NO legal score)
// ---------------------------------------------------------------------------

export type ReadinessStatus =
  "complete" | "missing" | "needs_attention" | "not_applicable";

export const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  complete: "Complete",
  missing: "Missing",
  needs_attention: "Needs Attention",
  not_applicable: "Not Applicable",
};

export const READINESS_STATUS_TONE: Record<
  ReadinessStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  complete: "available",
  missing: "out",
  needs_attention: "maintenance",
  not_applicable: "neutral",
};

export interface ReadinessItem {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string | null;
}

/** A. RENTAL DOCUMENTATION — objective items about the rental's evidence. */
export interface RentalDocumentationReadiness {
  items: ReadinessItem[];
}

/** B. INCIDENT FILE COMPLETENESS — objective items about an incident's
 *  evidence. Only applicable where an incident exists. */
export interface IncidentFileReadiness {
  items: ReadinessItem[];
}

export interface DocumentationReadiness {
  rental: RentalDocumentationReadiness;
  incident: IncidentFileReadiness;
}

// ---------------------------------------------------------------------------
// 9. Incident Documentation Package (assembler — indexes, never fabricates)
// ---------------------------------------------------------------------------

export type PackageItemStatus = "on_file" | "not_on_file";

export interface DocumentationPackageItem {
  /** The 1-based index in the package (matches the SOP list). */
  index: number;
  label: string;
  status: PackageItemStatus;
  /** The source module that holds the record (e.g. "Rental", "Inspection"). */
  source_module: string;
  /** A reference / deep link when on file; null when not on file. */
  reference: string | null;
  /** A brief factual note (e.g. "INSP-2026-000041", "CL-2026-00821"). */
  note: string | null;
}

export interface IncidentDocumentationPackage {
  rental_id: string;
  incident_id: string | null;
  generated_at: string;
  items: DocumentationPackageItem[];
  /** Count of items on file vs not on file. */
  on_file_count: number;
  not_on_file_count: number;
}

// ---------------------------------------------------------------------------
// Sources bundle for the derived selectors
// ---------------------------------------------------------------------------

/** The authoritative records the Defense Record selectors operate on. These
 *  are passed in from the store / providers — the selectors never reach into
 *  a global store directly, keeping them pure + testable. */
export interface DefenseSources {
  rentals: import("./types").RentalAgreement[];
  rentalEvents: import("./types").RentalEvent[];
  customers: import("./types").Customer[];
  vehicles: import("./types").Vehicle[];
  inspections: import("./inspectionTypes").Inspection[];
  drivers: import("./inspectionTypes").Driver[];
  workOrders: import("./maintenanceTypes").MaintenanceWorkOrder[];
  documents: import("./complianceTypes").DocumentRecord[];
  requirements: import("./complianceTypes").ComplianceRequirement[];
  overrides: import("./complianceTypes").ComplianceOverride[];
  incidents: (import("./incidents").Incident &
    Partial<IncidentDefenseFields>)[];
  rentalDrivers: RentalDriver[];
  releaseSnapshots: RentalReleaseSnapshot[];
  vehicleExchanges: import("./store/storeContext").RentalVehicleExchange[];
  ownershipChanges: import("./ownershipTypes").OwnershipChangeRecord[];
  damageClaims: import("./damageClaimTypes").DamageClaim[];
  tasks: import("./taskTypes").Task[];
  staff: import("./types").Staff[];
}
