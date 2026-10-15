// Connect Pro Fleet — Rental Defense Record derived view (pure selector).
//
// Aggregates existing authoritative records into a defense-oriented view. This
// is DERIVED — it never duplicates authoritative records. Where useful, it
// shows BOTH historical (at release) and current state so the historical fact
// is never replaced by current data.
//
// No legal conclusions. No "Graves" label. No liability score. Facts only.

import type {
  DefenseSources,
  RentalDefenseRecord,
  ReleaseMaintenanceItem,
} from "./defenseTypes";
import type { DocumentStatus } from "./complianceTypes";
import { buildMaintenanceItemsOpen } from "./rentalReleaseGate";
import {
  requiredPhotosCaptured,
  REQUIRED_PHOTO_COUNT,
} from "./inspectionSelectors";

/** Resolve the current compliance status for a vehicle (registration +
 *  insurance). Pure. */
function currentCompliance(
  vehicleId: string,
  documents: DefenseSources["documents"],
): {
  registration_status: DocumentStatus | "not_on_file";
  registration_expiration: string | null;
  insurance_status: DocumentStatus | "not_on_file";
  insurance_expiration: string | null;
} {
  const findDoc = (type: string) =>
    documents.find(
      (d) =>
        d.entity_type === "vehicle" &&
        d.entity_id === vehicleId &&
        d.document_type === type &&
        d.status !== "archived",
    );
  const reg = findDoc("registration");
  const ins = findDoc("insurance");
  return {
    registration_status: reg ? reg.status : "not_on_file",
    registration_expiration: reg?.expiration_date ?? null,
    insurance_status: ins ? ins.status : "not_on_file",
    insurance_expiration: ins?.expiration_date ?? null,
  };
}

/** Build the derived Rental Defense Record for a rental. Pure — operates on
 *  the passed-in DefenseSources. */
export function buildRentalDefenseRecord(
  rentalId: string,
  src: DefenseSources,
  customerName: (id: string) => string,
): RentalDefenseRecord | null {
  const rental = src.rentals.find((r) => r.id === rentalId);
  if (!rental) return null;

  const customer = src.customers.find((c) => c.id === rental.customer_id);
  const vehicle = src.vehicles.find((v) => v.id === rental.vehicle_id);
  if (!vehicle) return null;

  // Canonical rental drivers for this rental.
  const rentalDrivers = src.rentalDrivers.filter(
    (d) => d.rental_id === rentalId,
  );
  const primaryDriver = rentalDrivers.find((d) => d.role === "primary") ?? null;

  // Checkout inspection.
  const checkoutInspection =
    src.inspections.find(
      (i) =>
        i.inspection_type === "checkout" &&
        (i.reservation_id === rental.reservation_id ||
          i.vehicle_id === rental.vehicle_id),
    ) ?? null;

  // Release snapshot (immutable historical evidence).
  const releaseSnapshot = src.releaseSnapshots.find(
    (s) => s.rental_id === rentalId,
  );

  // Maintenance — historical (at release) vs current.
  const currentOpenMaintenance: ReleaseMaintenanceItem[] =
    buildMaintenanceItemsOpen(vehicle.id, src.workOrders);
  const atReleaseMaintenance = releaseSnapshot
    ? releaseSnapshot.maintenance_open_at_release
    : currentOpenMaintenance;

  // Compliance — historical (at release) vs current.
  const currentComp = currentCompliance(vehicle.id, src.documents);
  const atReleaseComp = releaseSnapshot
    ? {
        registration_status:
          releaseSnapshot.compliance_at_release.registration_status,
        registration_expiration:
          releaseSnapshot.compliance_at_release.registration_expiration,
        insurance_status:
          releaseSnapshot.compliance_at_release.insurance_status,
        insurance_expiration:
          releaseSnapshot.compliance_at_release.insurance_expiration,
      }
    : currentComp;

  // Incidents for this rental/vehicle.
  const incidents = src.incidents.filter(
    (inc) =>
      inc.reservation_id === rental.reservation_id ||
      inc.vehicle_id === rental.vehicle_id,
  );

  // Audit — rental events for this rental.
  const rentalEvents = src.rentalEvents.filter((e) => e.rental_id === rentalId);
  const statusChanges = rentalEvents.map((e) => ({
    at: e.at,
    label: e.label,
    actor: e.staff_id,
  }));

  // Required photos status.
  const photosCount = checkoutInspection?.photos.length ?? 0;
  const requiredPhotosStatus: "captured" | "partial" | "missing" =
    checkoutInspection &&
    requiredPhotosCaptured(checkoutInspection) >= REQUIRED_PHOTO_COUNT
      ? "captured"
      : photosCount > 0
        ? "partial"
        : "missing";

  // Vehicle unit number (not on the Vehicle type — derived from license_plate
  // or a display convention; null when not tracked).
  const unitNumber = null;

  return {
    rental_id: rentalId,
    agreement_id: rental.id,
    agreement_number: rental.agreement_number,
    rental: {
      agreement_start: rental.checkout_date,
      agreement_scheduled_end: rental.scheduled_return_date,
      actual_return: rental.actual_return_date,
      possession_start: rental.checkout_date,
      possession_end: rental.actual_return_date,
      status: rental.status,
      agreement_term_days: null,
    },
    renter: {
      primary_renter_id: rental.customer_id,
      primary_renter_name: customerName(rental.customer_id),
      driver_license_number:
        customer?.drivers_license_number ??
        primaryDriver?.license_number ??
        null,
      license_verification_status:
        primaryDriver?.verification_status ?? "pending",
      license_expiry:
        primaryDriver?.license_expiry ??
        customer?.drivers_license_expiry ??
        null,
      verification_timestamp: primaryDriver?.authorized_at ?? null,
    },
    authorized_drivers: rentalDrivers.map((d) => ({
      rental_driver_id: d.id,
      full_name: d.full_name,
      role: d.role,
      relationship: d.relationship,
      license_number: d.license_number,
      verification_status: d.verification_status,
      authorization_status: d.authorization_status,
      authorized_at: d.authorized_at,
      authorized_by: d.authorized_by,
      revoked_at: d.revoked_at,
    })),
    vehicle: {
      vehicle_id: vehicle.id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      vin: vehicle.vin,
      plate: vehicle.license_plate,
      unit_number: unitNumber,
      ownership_type: vehicle.ownership_type ?? null,
      operating_entity: vehicle.owner_display_name ?? null,
    },
    checkout: checkoutInspection
      ? {
          inspection_id: checkoutInspection.id,
          timestamp: checkoutInspection.timestamp,
          mileage: checkoutInspection.odometer_reading,
          fuel: checkoutInspection.fuel_level,
          condition_notes: checkoutInspection.damage_notes,
          photos_count: checkoutInspection.photos.length,
          required_photos_status: requiredPhotosStatus,
          staff_member: null,
        }
      : null,
    maintenance: {
      at_release: {
        open_items: atReleaseMaintenance,
        safety_critical_open: atReleaseMaintenance.some(
          (m) => m.safety_critical && m.blocks_vehicle_use,
        ),
      },
      current: {
        open_items: currentOpenMaintenance,
        safety_critical_open: currentOpenMaintenance.some(
          (m) => m.safety_critical && m.blocks_vehicle_use,
        ),
      },
    },
    compliance: {
      at_release: atReleaseComp,
      current: currentComp,
    },
    incidents: incidents.map((inc) => ({
      incident_id: inc.id,
      incident_type: inc.incident_type,
      occurred_at: inc.occurred_at,
      reported_at: inc.reported_at,
      actual_driver_name: inc.incident_driver?.actual_driver_name ?? null,
      driver_authorization:
        inc.incident_driver?.authorization_at_incident ?? null,
      has_police_report: !!inc.police_report_url,
      has_insurance_claim: !!inc.insurance_claim_number,
      linked_damage_claim_id: inc.linked_damage_claim_id ?? null,
      status: inc.status,
    })),
    audit: {
      created_at: rental.created_at,
      created_by: rental.created_by,
      last_updated: rental.updated_at,
      status_changes: statusChanges,
    },
    release_snapshot: releaseSnapshot ?? null,
  };
}
