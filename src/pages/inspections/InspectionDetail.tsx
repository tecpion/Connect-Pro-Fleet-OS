// Connect Pro Fleet — Inspection detail drawer.
//
// Shows the full inspection record: overview, condition checklist, photos,
// mileage/fuel, damage findings, signatures, linked damage claims, linked
// maintenance work orders, and audit timeline. Read-only presentation over
// authoritative records. Offers handoff actions (Create Damage Claim /
// Create Maintenance Work Order) only when findings warrant them and only
// with explicit user action — never auto-creates.

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusPill } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtNumber, inspectionTypeMeta } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deriveInspectionStatus,
  inspectionStatusTone,
  getConditionItems,
  getDamageItems,
  getInspectionEvents,
  getLinkedClaimIds,
  getLinkedWorkOrderIds,
  hasCustomerSignature,
  hasStaffSignature,
  requiredPhotosCaptured,
  REQUIRED_PHOTO_COUNT,
  findCheckoutForCheckin,
  compareCheckInToCheckout,
  mileageDelta,
  fuelDelta,
  reviewDecisionLabel,
} from "@/lib/inspectionSelectors";
import {
  CONDITION_STATE_LABELS,
  DAMAGE_TYPE_LABELS,
  DAMAGE_SEVERITY_LABELS,
  DAMAGE_PROVENANCE_LABELS,
  INSPECTION_STATUS_LABELS,
} from "@/lib/inspectionWorkspaceTypes";
import type { Inspection } from "@/lib/inspectionTypes";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Gauge,
  Fuel,
  PenLine,
  Wrench,
  FileText,
  Car,
  Link2,
} from "lucide-react";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-sm text-foreground">{children}</span>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function InspectionDetail({
  inspection,
  open,
  onOpenChange,
}: {
  inspection: Inspection | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { inspections, reservations, vehicles, createWorkOrder } = useStore();
  const dc = useDamageClaims();

  if (!inspection) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg" />
      </Sheet>
    );
  }

  const v = vehicles.find((x) => x.id === inspection.vehicle_id);
  const r = reservations.find((x) => x.id === inspection.reservation_id);
  const status = deriveInspectionStatus(inspection);
  const conditionItems = getConditionItems(inspection);
  const damageItems = getDamageItems(inspection);
  const events = getInspectionEvents(inspection);
  const linkedClaims = getLinkedClaimIds(inspection);
  const linkedWos = getLinkedWorkOrderIds(inspection);
  const photos = requiredPhotosCaptured(inspection);

  // Checkout comparison (check-in only).
  const checkout = findCheckoutForCheckin(inspections, inspection);
  const comparison = compareCheckInToCheckout(inspection, checkout);
  const mDelta = mileageDelta(inspection, checkout);
  const fDelta = fuelDelta(inspection, checkout);

  const conditionGroups = Array.from(
    new Set(conditionItems.map((c) => c.group)),
  );

  const handleCreateClaim = () => {
    dc.createClaim({
      vehicle_id: inspection.vehicle_id,
      reservation_id: inspection.reservation_id,
      customer_id: r?.customer_id ?? null,
      inspection_id: inspection.id,
      damage_source:
        inspection.inspection_type === "checkin"
          ? "checkin_inspection"
          : "checkout_inspection",
      description:
        damageItems
          .map(
            (d) =>
              `${d.area}: ${DAMAGE_TYPE_LABELS[d.damage_type]} (${DAMAGE_SEVERITY_LABELS[d.severity]})`,
          )
          .join("; ") ||
        inspection.damage_notes ||
        "Damage flagged during inspection",
      severity: damageItems.some((d) => d.severity === "major")
        ? "major"
        : damageItems.some((d) => d.severity === "moderate")
          ? "moderate"
          : "minor",
    });
    toast.success("Damage claim created from inspection.");
  };

  const handleCreateWorkOrder = () => {
    createWorkOrder({
      vehicle_id: inspection.vehicle_id,
      title: `Service issue from inspection ${inspection.id}`,
      maintenance_type: "other",
      priority: "normal",
      source: "inspection",
      reported_issue:
        damageItems
          .filter((d) => d.damage_type === "mechanical")
          .map((d) => `${d.area}: ${d.note}`)
          .join("; ") || "Mechanical concern flagged during inspection.",
    });
    toast.success("Maintenance work order created.");
  };

  const hasDamage = inspection.damage_detected || damageItems.length > 0;
  const hasMechanical = damageItems.some((d) => d.damage_type === "mechanical");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">{inspection.id}</span>
            <StatusPill tone={inspectionStatusTone(status)}>
              {INSPECTION_STATUS_LABELS[status]}
            </StatusPill>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          {/* Overview */}
          <section className="space-y-1">
            <GroupTitle>Overview</GroupTitle>
            <Row label="Type">
              {inspectionTypeMeta[inspection.inspection_type]}
            </Row>
            <Row label="Vehicle">
              {v ? (
                <Link
                  to={`/vehicles/${v.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {v.year} {v.make} {v.model}
                </Link>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Plate">
              <span className="font-mono tabular">
                {v?.license_plate ?? "—"}
              </span>
            </Row>
            <Row label="Customer">{r?.renter_name ?? "—"}</Row>
            <Row label="Reservation">
              {r ? (
                <Link
                  to={`/reservations/${r.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {r.id}
                </Link>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Date">{fmtDateTime(inspection.timestamp)}</Row>
          </section>

          {/* Mileage / Fuel */}
          <section className="space-y-1">
            <GroupTitle>Mileage & Fuel</GroupTitle>
            <Row label="Odometer">
              <span className="inline-flex items-center gap-1 font-mono tabular">
                <Gauge size={13} /> {fmtNumber(inspection.odometer_reading)} mi
              </span>
            </Row>
            <Row label="Fuel">
              <span className="inline-flex items-center gap-1 font-mono tabular">
                <Fuel size={13} /> {inspection.fuel_level}%
              </span>
            </Row>
            {checkout && (
              <>
                <Row label="Checkout odometer">
                  <span className="font-mono tabular">
                    {fmtNumber(checkout.odometer_reading)} mi
                  </span>
                </Row>
                <Row label="Mileage delta">
                  <span
                    className={cn(
                      "font-mono tabular",
                      mDelta !== null && mDelta < 0
                        ? "font-medium text-status-out"
                        : "text-foreground",
                    )}
                  >
                    {mDelta !== null
                      ? `${mDelta >= 0 ? "+" : ""}${fmtNumber(mDelta)} mi`
                      : "—"}
                    {mDelta !== null && mDelta < 0 && " ⚠ lower than checkout"}
                  </span>
                </Row>
                <Row label="Fuel delta">
                  <span
                    className={cn(
                      "font-mono tabular",
                      fDelta !== null && fDelta < 0
                        ? "text-status-maintenance"
                        : "text-foreground",
                    )}
                  >
                    {fDelta !== null
                      ? `${fDelta >= 0 ? "+" : ""}${fDelta}%`
                      : "—"}
                  </span>
                </Row>
              </>
            )}
          </section>

          {/* Photos */}
          <section className="space-y-2">
            <GroupTitle>Photos</GroupTitle>
            <p className="text-xs text-muted-foreground">
              <Camera size={12} className="mr-1 inline" />
              {photos}/{REQUIRED_PHOTO_COUNT} required captured
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(inspection.photos ?? []).map((p) => (
                <span
                  key={p}
                  className="rounded bg-surface-2 px-2 py-1 font-mono text-[11px] tabular text-muted-foreground"
                >
                  {p}
                </span>
              ))}
              {(inspection.photos ?? []).length === 0 && (
                <span className="text-sm text-muted-foreground">No photos</span>
              )}
            </div>
          </section>

          {/* Condition checklist */}
          {conditionItems.length > 0 && (
            <section className="space-y-2">
              <GroupTitle>Condition</GroupTitle>
              {conditionGroups.map((g) => (
                <div key={g}>
                  <p className="text-xs font-medium text-foreground">{g}</p>
                  <div className="mt-1 space-y-0.5">
                    {conditionItems
                      .filter((c) => c.group === g)
                      .map((c) => (
                        <div
                          key={c.key}
                          className="flex items-center justify-between py-0.5 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {c.label}
                          </span>
                          <span
                            className={cn(
                              "font-medium",
                              c.state === "good" && "text-status-available",
                              c.state === "attention" &&
                                "text-status-maintenance",
                              c.state === "damaged" && "text-status-out",
                              c.state === "n/a" && "text-muted-foreground",
                            )}
                          >
                            {CONDITION_STATE_LABELS[c.state]}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Checkout comparison */}
          {comparison.length > 0 && (
            <section className="space-y-2">
              <GroupTitle>Potential New Damage (vs. Checkout)</GroupTitle>
              <div className="space-y-1.5">
                {comparison.map((c) => (
                  <div
                    key={c.area}
                    className="rounded-md border border-status-out/30 bg-status-out/5 p-2"
                  >
                    <p className="text-xs font-medium text-foreground">
                      {c.area}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Checkout:{" "}
                      {CONDITION_STATE_LABELS[c.checkoutState as never] ??
                        c.checkoutState}{" "}
                      → Check-In:{" "}
                      <span className="font-medium text-status-out">
                        {CONDITION_STATE_LABELS[c.checkinState as never] ??
                          c.checkinState}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Damage findings */}
          <section className="space-y-2">
            <GroupTitle>Damage Findings</GroupTitle>
            {damageItems.length > 0 ? (
              <div className="space-y-1.5">
                {damageItems.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-md border border-border bg-surface-2/40 p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {d.area}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {reviewDecisionLabel(d.review_decision)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {DAMAGE_TYPE_LABELS[d.damage_type]} ·{" "}
                      {DAMAGE_SEVERITY_LABELS[d.severity]} ·{" "}
                      {DAMAGE_PROVENANCE_LABELS[d.provenance]}
                    </p>
                    {d.note && (
                      <p className="mt-0.5 text-xs text-foreground">{d.note}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : inspection.damage_notes ? (
              <p className="text-sm text-muted-foreground">
                {inspection.damage_notes}
              </p>
            ) : (
              <p className="inline-flex items-center gap-1 text-sm text-status-available">
                <CheckCircle2 size={14} /> No damage recorded
              </p>
            )}
          </section>

          {/* Signatures */}
          <section className="space-y-1">
            <GroupTitle>Signatures</GroupTitle>
            <Row label="Customer signature">
              {hasCustomerSignature(inspection) ? (
                <span className="inline-flex items-center gap-1 text-status-available">
                  <PenLine size={13} /> Captured
                </span>
              ) : (
                <span className="text-muted-foreground">Missing</span>
              )}
            </Row>
            <Row label="Staff sign-off">
              {hasStaffSignature(inspection) ? (
                <span className="inline-flex items-center gap-1 text-status-available">
                  <PenLine size={13} /> Captured
                </span>
              ) : (
                <span className="text-muted-foreground">Missing</span>
              )}
            </Row>
          </section>

          {/* Linked records */}
          {(linkedClaims.length > 0 || linkedWos.length > 0) && (
            <section className="space-y-1">
              <GroupTitle>Linked Records</GroupTitle>
              {linkedClaims.map((id) => (
                <Row key={id} label="Damage claim">
                  <Link
                    to={`/damage-claims`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Link2 size={12} /> {id}
                  </Link>
                </Row>
              ))}
              {linkedWos.map((id) => (
                <Row key={id} label="Work order">
                  <Link
                    to={`/maintenance`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <Link2 size={12} /> {id}
                  </Link>
                </Row>
              ))}
            </section>
          )}

          {/* Timeline */}
          {(events?.length ?? 0) > 0 && (
            <section className="space-y-2">
              <GroupTitle>Timeline</GroupTitle>
              <div className="space-y-2 border-l border-border pl-3">
                {(events ?? []).map((e) => (
                  <div key={e.id} className="relative">
                    <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-primary" />
                    <p className="text-xs font-medium text-foreground">
                      {e.label}
                    </p>
                    <p className="font-mono text-[11px] tabular text-muted-foreground">
                      {fmtDateTime(e.at)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Handoff actions */}
          {hasDamage && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                size="sm"
                onClick={handleCreateClaim}
                data-testid="detail-create-claim"
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                <AlertTriangle size={14} className="mr-1.5" /> Create Damage
                Claim
              </Button>
              {hasMechanical && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateWorkOrder}
                  data-testid="detail-create-wo"
                >
                  <Wrench size={14} className="mr-1.5" /> Create Maintenance
                  Work Order
                </Button>
              )}
              <Link to={`/vehicles/${inspection.vehicle_id}`}>
                <Button size="sm" variant="ghost">
                  <Car size={14} className="mr-1.5" /> View Vehicle
                </Button>
              </Link>
              {r && (
                <Link to={`/reservations/${r.id}`}>
                  <Button size="sm" variant="ghost">
                    <FileText size={14} className="mr-1.5" /> View Reservation
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
