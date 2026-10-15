// Connect Pro Fleet — Documentation Readiness + Documentation Package.
//
// TWO objective sections — NO legal score, NO "Graves" label, NO liability
// conclusion. Each item is Complete / Missing / Needs Attention / Not
// Applicable.
//
// The Documentation Package assembler indexes existing records — it NEVER
// fabricates missing evidence. Missing items show "Not on file".

import type {
  DefenseSources,
  DocumentationReadiness,
  DocumentationPackageItem,
  IncidentDocumentationPackage,
  ReadinessItem,
  ReadinessStatus,
} from "./defenseTypes";
import { buildRentalDefenseRecord } from "./rentalDefenseRecord";

/** Build the Documentation Readiness for a rental (+ optional incident).
 *  Pure. */
export function buildDocumentationReadiness(
  rentalId: string,
  incidentId: string | null,
  src: DefenseSources,
  customerName: (id: string) => string,
): DocumentationReadiness {
  const record = buildRentalDefenseRecord(rentalId, src, customerName);

  // --- A. RENTAL DOCUMENTATION ---
  const rentalItems: ReadinessItem[] = [
    {
      key: "agreement_signed",
      label: "Agreement signed",
      status: record?.release_snapshot?.agreement_signed
        ? "complete"
        : "missing",
      detail: record?.release_snapshot
        ? record.release_snapshot.agreement_signed
          ? "Signed at release."
          : "Not signed at release."
        : null,
    },
    {
      key: "rental_drivers_recorded",
      label: "Rental drivers recorded",
      status:
        (record?.authorized_drivers.length ?? 0) > 0 ? "complete" : "missing",
      detail: record
        ? `${record.authorized_drivers.length} driver(s) recorded.`
        : null,
    },
    {
      key: "license_verification_complete",
      label: "Required license verification complete",
      status: record?.authorized_drivers.every(
        (d) => d.verification_status === "verified",
      )
        ? "complete"
        : record &&
            record.authorized_drivers.some(
              (d) => d.verification_status === "verified",
            )
          ? "needs_attention"
          : "missing",
      detail: record
        ? `${record.authorized_drivers.filter((d) => d.verification_status === "verified").length}/${record.authorized_drivers.length} verified.`
        : null,
    },
    {
      key: "checkout_inspection_complete",
      label: "Checkout inspection complete",
      status: record?.checkout
        ? record.checkout.required_photos_status === "captured"
          ? "complete"
          : "needs_attention"
        : "missing",
      detail: record?.checkout
        ? `Photos: ${record.checkout.required_photos_status}.`
        : null,
    },
    {
      key: "photos_captured",
      label: "Photos captured",
      status: record?.checkout
        ? record.checkout.photos_count > 0
          ? record.checkout.required_photos_status === "captured"
            ? "complete"
            : "needs_attention"
          : "missing"
        : "missing",
      detail: record?.checkout
        ? `${record.checkout.photos_count} photo(s).`
        : null,
    },
    {
      key: "release_snapshot_captured",
      label: "Release Snapshot captured",
      status: record?.release_snapshot ? "complete" : "missing",
      detail: record?.release_snapshot
        ? `Captured ${record.release_snapshot.released_at}.`
        : null,
    },
    {
      key: "possession_timestamps_present",
      label: "Possession timestamps present",
      status: record?.rental.possession_start ? "complete" : "missing",
      detail: record?.rental.possession_start
        ? `Start: ${record.rental.possession_start}.`
        : null,
    },
    {
      key: "compliance_evidence_preserved",
      label: "Required compliance evidence preserved",
      status:
        record?.compliance.at_release.insurance_status !== "not_on_file" &&
        record?.compliance.at_release.registration_status !== "not_on_file"
          ? "complete"
          : "needs_attention",
      detail: record
        ? `Insurance: ${record.compliance.at_release.insurance_status}. Registration: ${record.compliance.at_release.registration_status}.`
        : null,
    },
  ];

  // --- B. INCIDENT FILE COMPLETENESS (only where an incident exists) ---
  let incidentItems: ReadinessItem[] = [];
  if (incidentId) {
    const inc = src.incidents.find((i) => i.id === incidentId);
    if (inc) {
      const hasDriver = !!inc.incident_driver;
      const hasStatement = !!inc.renter_statement;
      const hasPolice = !!inc.police_report_url;
      const hasClaim =
        !!inc.insurance_claim_number || !!inc.linked_damage_claim_id;
      const hasPhotos = inc.photos.length > 0;
      const hasPostInsp = !!inc.post_incident_inspection_id;
      const hasDamage = !!inc.linked_damage_claim_id;
      incidentItems = [
        {
          key: "incident_report",
          label: "Incident report",
          status: inc.description ? "complete" : "missing",
          detail: inc.description ? "Report on file." : null,
        },
        {
          key: "actual_driver_recorded",
          label: "Actual driver recorded",
          status: hasDriver ? "complete" : "missing",
          detail: hasDriver
            ? `Driver: ${inc.incident_driver?.actual_driver_name}.`
            : null,
        },
        {
          key: "driver_authorization_status",
          label: "Driver authorization status recorded",
          status: hasDriver ? "complete" : "missing",
          detail: hasDriver
            ? `Auth: ${inc.incident_driver?.authorization_at_incident}.`
            : null,
        },
        {
          key: "renter_statement",
          label: "Renter statement",
          status: hasStatement ? "complete" : "missing",
          detail: hasStatement ? "Statement on file." : null,
        },
        {
          key: "police_report",
          label: "Police report",
          status: hasPolice ? "complete" : "missing",
          detail: hasPolice ? "Report on file." : null,
        },
        {
          key: "insurance_claim_info",
          label: "Insurance claim information",
          status: hasClaim ? "complete" : "needs_attention",
          detail: hasClaim
            ? (inc.insurance_claim_number ?? "Claim linked.")
            : null,
        },
        {
          key: "incident_photos",
          label: "Incident photos",
          status: hasPhotos ? "complete" : "missing",
          detail: hasPhotos ? `${inc.photos.length} photo(s).` : null,
        },
        {
          key: "post_incident_inspection",
          label: "Post-incident inspection",
          status: hasPostInsp ? "complete" : "needs_attention",
          detail: hasPostInsp ? "Inspection on file." : null,
        },
        {
          key: "damage_record",
          label: "Damage record",
          status: hasDamage ? "complete" : "needs_attention",
          detail: hasDamage ? "Damage claim linked." : null,
        },
        {
          key: "related_maintenance",
          label: "Related maintenance",
          status: "not_applicable",
          detail: null,
        },
      ];
    }
  }

  return {
    rental: { items: rentalItems },
    incident: { items: incidentItems },
  };
}

/** Build the Incident Documentation Package — an indexed manifest of the
 *  22-item evidence package. Each item is "on_file" or "not_on_file". NEVER
 *  fabricates missing evidence. Pure. */
export function buildIncidentDocumentationPackage(
  rentalId: string,
  incidentId: string | null,
  src: DefenseSources,
  customerName: (id: string) => string,
): IncidentDocumentationPackage {
  const record = buildRentalDefenseRecord(rentalId, src, customerName);
  const inc = incidentId
    ? src.incidents.find((i) => i.id === incidentId)
    : null;
  const items: DocumentationPackageItem[] = [];
  let idx = 1;
  const push = (
    label: string,
    onFile: boolean,
    sourceModule: string,
    reference: string | null,
    note: string | null,
  ) => {
    items.push({
      index: idx++,
      label,
      status: onFile ? "on_file" : "not_on_file",
      source_module: sourceModule,
      reference,
      note,
    });
  };

  // 1. Rental agreement
  push(
    "Rental agreement",
    !!record,
    "Rental",
    record?.agreement_id ?? null,
    record?.agreement_number ?? null,
  );
  // 2. Agreement extensions/renewals
  const renewals = record ? 0 : 0; // chain count — simplified
  push(
    "Agreement extensions/renewals",
    renewals > 0,
    "Rental",
    null,
    renewals > 0 ? `${renewals} renewal(s)` : null,
  );
  // 3. Possession dates/times
  push(
    "Possession dates/times",
    !!record?.rental.possession_start,
    "Rental",
    record?.rental.possession_start ?? null,
    record?.rental.possession_start ?? null,
  );
  // 4. Renter identity
  push(
    "Renter identity",
    !!record?.renter.primary_renter_id,
    "Customer",
    record?.renter.primary_renter_id ?? null,
    record?.renter.primary_renter_name ?? null,
  );
  // 5. Driver license verification
  push(
    "Driver license verification",
    record?.renter.license_verification_status === "verified",
    "Driver",
    null,
    record?.renter.license_verification_status ?? null,
  );
  // 6. Authorized-driver list
  push(
    "Authorized-driver list",
    (record?.authorized_drivers.length ?? 0) > 0,
    "Driver",
    null,
    record ? `${record.authorized_drivers.length} driver(s)` : null,
  );
  // 7. Checkout inspection
  push(
    "Checkout inspection",
    !!record?.checkout,
    "Inspection",
    record?.checkout?.inspection_id ?? null,
    record?.checkout?.inspection_id ?? null,
  );
  // 8. Checkout photos/video
  push(
    "Checkout photos/video",
    (record?.checkout?.photos_count ?? 0) > 0,
    "Inspection",
    record?.checkout?.inspection_id ?? null,
    record ? `${record.checkout?.photos_count ?? 0} photo(s)` : null,
  );
  // 9. Mileage/fuel
  push(
    "Mileage/fuel",
    record?.checkout?.mileage != null,
    "Inspection",
    record?.checkout?.inspection_id ?? null,
    record?.checkout
      ? `${record.checkout.mileage} mi / ${record.checkout.fuel}% fuel`
      : null,
  );
  // 10. Maintenance history relevant to pre-rental condition
  push(
    "Maintenance history (pre-rental)",
    record?.maintenance.at_release.open_items.length
      ? true
      : !!record?.release_snapshot,
    "Maintenance",
    null,
    record?.maintenance.at_release.open_items.length
      ? `${record.maintenance.at_release.open_items.length} open at release`
      : "No open items at release",
  );
  // 11. Repairs completed before release
  push(
    "Repairs completed before release",
    !!record?.release_snapshot,
    "Maintenance",
    null,
    record?.release_snapshot
      ? record.release_snapshot.safety_critical_maintenance_open
        ? "Safety items were open at release"
        : "No safety items open at release"
      : null,
  );
  // 12. Compliance documents/status
  push(
    "Compliance documents/status",
    record?.compliance.at_release.insurance_status !== "not_on_file",
    "Compliance",
    null,
    record
      ? `Insurance: ${record.compliance.at_release.insurance_status}, Registration: ${record.compliance.at_release.registration_status}`
      : null,
  );
  // 13. Renter mechanical-issue communications
  push("Renter mechanical-issue communications", false, "Rental", null, null);
  // 14. Incident report
  push("Incident report", !!inc, "Incident", inc?.id ?? null, inc?.id ?? null);
  // 15. Actual-driver information
  push(
    "Actual driver information",
    !!inc?.incident_driver,
    "Incident",
    inc?.incident_driver?.rental_driver_id ?? null,
    inc?.incident_driver?.actual_driver_name ?? null,
  );
  // 16. Renter statement
  push(
    "Renter statement",
    !!inc?.renter_statement,
    "Incident",
    inc?.id ?? null,
    inc?.renter_statement ? "Statement on file" : null,
  );
  // 17. Police report
  push(
    "Police report",
    !!inc?.police_report_url,
    "Incident",
    inc?.police_report_number ?? null,
    inc?.police_report_number ?? null,
  );
  // 18. Insurance/claim information
  push(
    "Insurance/claim information",
    !!inc?.insurance_claim_number || !!inc?.linked_damage_claim_id,
    "Incident",
    inc?.insurance_claim_number ?? inc?.linked_damage_claim_id ?? null,
    inc?.insurance_claim_number ?? null,
  );
  // 19. Damage photos
  push(
    "Incident/damage photos",
    (inc?.photos.length ?? 0) > 0,
    "Incident",
    inc?.id ?? null,
    inc ? `${inc.photos.length} photo(s)` : null,
  );
  // 20. GPS/possession references
  push("GPS/possession references", false, "Rental", null, null);
  // 21. Return inspection
  const returnInspection = src.inspections.find(
    (i) =>
      i.inspection_type === "checkin" &&
      (i.reservation_id === record?.rental_id ||
        i.vehicle_id === record?.vehicle.vehicle_id),
  );
  push(
    "Return inspection",
    !!returnInspection,
    "Inspection",
    returnInspection?.id ?? null,
    returnInspection?.id ?? null,
  );
  // 22. Audit trail
  push(
    "Audit trail",
    (record?.audit.status_changes.length ?? 0) > 0,
    "Audit",
    record?.rental_id ?? null,
    record ? `${record.audit.status_changes.length} event(s)` : null,
  );

  const onFileCount = items.filter((i) => i.status === "on_file").length;
  return {
    rental_id: rentalId,
    incident_id: incidentId,
    generated_at: new Date().toISOString(),
    items,
    on_file_count: onFileCount,
    not_on_file_count: items.length - onFileCount,
  };
}

/** Assert that NO legal-score / Graves-protection language appears in the
 *  readiness labels. Used by the regression test. Pure. */
export function assertNoLegalScoreLanguage(
  readiness: DocumentationReadiness,
): string[] {
  const forbidden = [
    "graves",
    "protected",
    "liability",
    "legally compliant",
    "legal score",
    "graves compliant",
    "graves protection",
  ];
  const violations: string[] = [];
  const check = (label: string) => {
    const lower = label.toLowerCase();
    if (forbidden.some((f) => lower.includes(f))) violations.push(label);
  };
  readiness.rental.items.forEach((i) => check(i.label));
  readiness.incident.items.forEach((i) => check(i.label));
  return violations;
}
