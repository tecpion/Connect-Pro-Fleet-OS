// Connect Pro Fleet — Rental Record UI (Build #54).
//
// A read-only derived view mounted on Rental Detail. Aggregates the existing
// authoritative records into the Rental Record (formerly "Defense Record"):
// release snapshot, release gate, authorized drivers, agreement timeline,
// documentation readiness, and the incident documentation package. FACTS ONLY
// — no legal conclusion, no "Graves" label, no liability score.

import { useMemo, useState } from "react";
import {
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { useDefenseSources } from "@/lib/useDefenseSources";
import { useStore } from "@/lib/store";
import { buildRentalDefenseRecord } from "@/lib/rentalDefenseRecord";
import { evaluateRentalReleaseGate } from "@/lib/rentalReleaseGate";
import { buildAgreementTimeline } from "@/lib/agreementTimeline";
import {
  buildDocumentationReadiness,
  buildIncidentDocumentationPackage,
} from "@/lib/documentationReadiness";
import {
  RELEASE_BLOCK_SEVERITY_LABELS,
  READINESS_STATUS_LABELS,
  READINESS_STATUS_TONE,
  INCIDENT_DRIVER_AUTH_LABELS,
  type ReadinessStatus,
  type ReleaseBlockSeverity,
} from "@/lib/defenseTypes";
import { fmtDateShort, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, FileText, Ban, Clock } from "lucide-react";

const SEVERITY_TONE: Record<ReleaseBlockSeverity, string> = {
  hard_block: "border-destructive/40 bg-destructive/5 text-destructive",
  override_eligible:
    "border-accent-foreground/30 bg-accent text-accent-foreground",
  warning: "border-border bg-muted/40 text-muted-foreground",
};

const READINESS_TONE_CLASS: Record<string, string> = {
  available:
    "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  out: "border-destructive/40 bg-destructive/5 text-destructive",
  maintenance: "border-accent text-accent-foreground",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};

export function RentalDefenseRecordView({ rentalId }: { rentalId: string }) {
  const src = useDefenseSources();
  const { customerName } = useStore();
  const [pkgOpen, setPkgOpen] = useState(false);

  const record = useMemo(
    () => buildRentalDefenseRecord(rentalId, src, customerName),
    [rentalId, src, customerName],
  );
  const timeline = useMemo(
    () =>
      buildAgreementTimeline({
        rentalId,
        rentals: src.rentals,
        rentalEvents: src.rentalEvents,
        vehicles: src.vehicles,
        vehicleExchanges: src.vehicleExchanges,
        rentalDrivers: src.rentalDrivers,
      }),
    [rentalId, src],
  );
  const readiness = useMemo(
    () => buildDocumentationReadiness(rentalId, null, src, customerName),
    [rentalId, src, customerName],
  );
  const pkg = useMemo(
    () => buildIncidentDocumentationPackage(rentalId, null, src, customerName),
    [rentalId, src, customerName],
  );

  if (!record) return null;
  const snap = record.release_snapshot;

  return (
    <SectionCard
      title="Rental Record"
      right={
        <span className="text-xs font-normal text-muted-foreground">
          Factual evidence layer — no legal conclusion
        </span>
      }
    >
      <div className="space-y-6">
        {/* Documentation Readiness */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ShieldCheck size={15} className="text-primary" /> Documentation
            Readiness
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {readiness.rental.items.map((item) => (
              <div
                key={item.key}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-xs",
                  READINESS_TONE_CLASS[READINESS_STATUS_TONE[item.status]],
                )}
              >
                <span className="font-medium">{item.label}</span>
                <span className="font-semibold">
                  {READINESS_STATUS_LABELS[item.status as ReadinessStatus]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Release Snapshot summary */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Clock size={15} className="text-primary" /> Release Snapshot
          </h4>
          {snap ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs sm:grid-cols-3">
              <div>
                <DataLabel>Released at</DataLabel>
                <DataValue>{fmtDateTime(snap.released_at)}</DataValue>
              </div>
              <div>
                <DataLabel>Released by</DataLabel>
                <DataValue>{snap.releasing_staff_name}</DataValue>
              </div>
              <div>
                <DataLabel>Agreement signed</DataLabel>
                <DataValue>{snap.agreement_signed ? "Yes" : "No"}</DataValue>
              </div>
              <div>
                <DataLabel>Odometer</DataLabel>
                <DataValue>
                  {snap.odometer_at_release?.toLocaleString() ?? "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>Fuel</DataLabel>
                <DataValue>
                  {snap.fuel_at_release != null
                    ? `${snap.fuel_at_release}%`
                    : "—"}
                </DataValue>
              </div>
              <div>
                <DataLabel>Vehicle status at release</DataLabel>
                <DataValue>{snap.vehicle_status_at_release}</DataValue>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              No release snapshot captured for this rental.
            </p>
          )}
        </div>

        {/* Compliance: at release vs current */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            Insurance &amp; Registration
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <CompliancePair
              label="Insurance"
              atRelease={record.compliance.at_release.insurance_status}
              atReleaseExp={record.compliance.at_release.insurance_expiration}
              current={record.compliance.current.insurance_status}
              currentExp={record.compliance.current.insurance_expiration}
            />
            <CompliancePair
              label="Registration"
              atRelease={record.compliance.at_release.registration_status}
              atReleaseExp={
                record.compliance.at_release.registration_expiration
              }
              current={record.compliance.current.registration_status}
              currentExp={record.compliance.current.registration_expiration}
            />
          </div>
        </div>

        {/* Maintenance: at release vs current */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            Maintenance
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <MaintenanceBlock
              title="At release"
              items={record.maintenance.at_release.open_items}
              safety={record.maintenance.at_release.safety_critical_open}
            />
            <MaintenanceBlock
              title="Current"
              items={record.maintenance.current.open_items}
              safety={record.maintenance.current.safety_critical_open}
            />
          </div>
        </div>

        {/* Authorized drivers */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
            Authorized Drivers
          </h4>
          {record.authorized_drivers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No drivers recorded. A person is authorized only when an active
              driver record exists.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {record.authorized_drivers.map((d) => (
                <li
                  key={d.rental_driver_id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-foreground">
                    {d.full_name}
                  </span>
                  <span className="text-muted-foreground">
                    {d.role === "primary" ? "Primary" : "Additional"} ·{" "}
                    {d.verification_status} ·{" "}
                    {d.authorization_status === "active"
                      ? "Authorized"
                      : "Revoked"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Incidents */}
        {record.incidents.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">
              Incidents
            </h4>
            <ul className="space-y-1.5">
              {record.incidents.map((inc) => (
                <li
                  key={inc.incident_id}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {inc.incident_type} — {fmtDateShort(inc.occurred_at)}
                    </span>
                    <span className="text-muted-foreground">{inc.status}</span>
                  </div>
                  {inc.driver_authorization && (
                    <p className="mt-1 text-muted-foreground">
                      Driver: {inc.actual_driver_name ?? "Unknown"} ·{" "}
                      {INCIDENT_DRIVER_AUTH_LABELS[inc.driver_authorization]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Agreement timeline */}
        {timeline.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">
              Agreement Timeline
            </h4>
            <ol className="space-y-1.5">
              {timeline.map((node) => (
                <li
                  key={node.agreement_id}
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-foreground">
                      {node.agreement_number}
                    </span>
                    <span className="text-muted-foreground">
                      {node.signed ? "Signed" : "Unsigned"}
                      {node.agreement_term_days != null
                        ? ` · ${node.agreement_term_days} days`
                        : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {fmtDateShort(node.start_date)} →{" "}
                    {fmtDateShort(node.scheduled_end_date)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Documentation package */}
        <div>
          <button
            type="button"
            onClick={() => setPkgOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/30"
          >
            <span className="flex items-center gap-1.5">
              <FileText size={15} className="text-primary" /> Incident
              Documentation Package
            </span>
            <span className="text-muted-foreground">
              {pkg.on_file_count}/{pkg.items.length} on file
            </span>
          </button>
          {pkgOpen && (
            <ul className="mt-2 space-y-1">
              {pkg.items.map((it) => (
                <li
                  key={it.index}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  <span className="text-foreground">
                    {it.index}. {it.label}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      it.status === "on_file"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {it.status === "on_file" ? "On file" : "Not on file"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function CompliancePair({
  label,
  atRelease,
  atReleaseExp,
  current,
  currentExp,
}: {
  label: string;
  atRelease: string;
  atReleaseExp: string | null;
  current: string;
  currentExp: string | null;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground">
        At release: <span className="text-foreground">{atRelease}</span>
        {atReleaseExp ? ` · ${fmtDateShort(atReleaseExp)}` : ""}
      </p>
      <p className="text-muted-foreground">
        Current: <span className="text-foreground">{current}</span>
        {currentExp ? ` · ${fmtDateShort(currentExp)}` : ""}
      </p>
    </div>
  );
}

function MaintenanceBlock({
  title,
  items,
  safety,
}: {
  title: string;
  items: {
    work_order_id: string;
    title: string;
    maintenance_type: string;
    safety_critical: boolean;
  }[];
  safety: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <p className="mb-1 font-semibold text-foreground">{title}</p>
      {safety && (
        <p className="mb-1 flex items-center gap-1 text-destructive">
          <AlertTriangle size={12} /> Safety-critical open
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground">No open items.</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((m) => (
            <li key={m.work_order_id} className="text-muted-foreground">
              {m.title} ({m.maintenance_type})
              {m.safety_critical ? " · safety" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release Gate banner — shows why release is blocked (severity-classified).
// ---------------------------------------------------------------------------

export function ReleaseGateBanner({ rentalId }: { rentalId: string }) {
  const src = useDefenseSources();
  const { customerName } = useStore();
  const result = useMemo(() => {
    const rental = src.rentals.find((r) => r.id === rentalId);
    const vehicle = src.vehicles.find((v) => v.id === rental?.vehicle_id);
    if (!rental || !vehicle) return null;
    const checkoutInspection =
      src.inspections.find(
        (i) =>
          i.inspection_type === "checkout" &&
          (i.reservation_id === rental.reservation_id ||
            i.vehicle_id === rental.vehicle_id),
      ) ?? null;
    const drivers = src.rentalDrivers.filter((d) => d.rental_id === rentalId);
    const signed = src.rentalEvents.some(
      (e) => e.rental_id === rentalId && e.type === "signed",
    );
    return evaluateRentalReleaseGate({
      rental,
      vehicle,
      drivers,
      checkoutInspection,
      workOrders: src.workOrders,
      requirements: src.requirements,
      documents: src.documents,
      overrides: src.overrides,
      agreementSigned: signed,
    });
  }, [rentalId, src, customerName]);

  if (!result || !result.blocked) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Ban size={15} className="text-destructive" /> Vehicle cannot be
        released
      </div>
      <ul className="space-y-1.5">
        {result.reasons
          .filter((r) => r.severity !== "warning")
          .map((r) => (
            <li
              key={r.key}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                SEVERITY_TONE[r.severity as ReleaseBlockSeverity],
              )}
            >
              <span className="font-semibold">
                {
                  RELEASE_BLOCK_SEVERITY_LABELS[
                    r.severity as ReleaseBlockSeverity
                  ]
                }
                :
              </span>
              <span>
                {r.label}
                {r.detail ? ` — ${r.detail}` : ""}
              </span>
            </li>
          ))}
      </ul>
      {result.hard_blocked && (
        <p className="mt-2 text-xs text-destructive">
          Hard safety blocks cannot be overridden through the normal workflow.
        </p>
      )}
      {result.override_eligible && (
        <p className="mt-2 text-xs text-muted-foreground">
          Override-eligible blocks require a reason, actor, and timestamp
          (permanent audit).
        </p>
      )}
    </div>
  );
}
