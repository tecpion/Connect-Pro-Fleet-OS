// Connect Pro Fleet — Rental Detail warning area (Build #59).
//
// Surfaces only the important warnings (release blocks + operational issues).
// Returns null when there is nothing to flag so the dashboard stays clean.
// Reuses the authoritative release-gate selector — no second rules engine.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useDefenseSources } from "@/lib/useDefenseSources";
import type { RentalAgreement } from "@/lib/types";
import { fmtMoneyExact, fmtDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ban } from "lucide-react";
import { evaluateRentalReleaseGate } from "@/lib/rentalReleaseGate";
import type { ReleaseBlockSeverity } from "@/lib/defenseTypes";

const SEVERITY_TONE: Record<ReleaseBlockSeverity, string> = {
  hard_block: "border-destructive/40 bg-destructive/5 text-destructive",
  override_eligible:
    "border-accent-foreground/30 bg-accent text-accent-foreground",
  warning: "border-border bg-muted/40 text-muted-foreground",
};

const ACTIVE = ["active", "late", "overdue", "payment_due", "return_pending"];

export function RentalWarningArea({ rental }: { rental: RentalAgreement }) {
  const src = useDefenseSources();
  const { drivers, inspections } = useStore();

  const result = useMemo(() => {
    const vehicle = src.vehicles.find((v) => v.id === rental.vehicle_id);
    if (!vehicle) return null;
    const checkoutInspection =
      src.inspections.find(
        (i) =>
          i.inspection_type === "checkout" &&
          (i.reservation_id === rental.reservation_id ||
            i.vehicle_id === rental.vehicle_id),
      ) ?? null;
    const rentalDrivers = src.rentalDrivers.filter(
      (d) => d.rental_id === rental.id,
    );
    const signed = src.rentalEvents.some(
      (e) => e.rental_id === rental.id && e.type === "signed",
    );
    return evaluateRentalReleaseGate({
      rental,
      vehicle,
      drivers: rentalDrivers,
      checkoutInspection,
      workOrders: src.workOrders,
      requirements: src.requirements,
      documents: src.documents,
      overrides: src.overrides,
      agreementSigned: signed,
    });
  }, [src, rental]);

  const warnings: {
    key: string;
    label: string;
    detail?: string;
    severity?: ReleaseBlockSeverity;
  }[] = [];

  if (result?.blocked) {
    for (const r of result.reasons.filter((x) => x.severity !== "warning")) {
      warnings.push({
        key: `gate-${r.key}`,
        label: r.label,
        detail: r.detail ?? undefined,
        severity: r.severity,
      });
    }
  }

  if (ACTIVE.includes(rental.status)) {
    if (rental.balance_due > 0) {
      warnings.push({
        key: "balance",
        label: "Payment late",
        detail: `Outstanding balance ${fmtMoneyExact(rental.balance_due)}`,
      });
    }
    if (rental.status === "overdue" || rental.status === "late") {
      warnings.push({
        key: "overdue-return",
        label:
          rental.status === "overdue"
            ? "Overdue return"
            : "Late payment / overdue",
        detail: `Scheduled return ${fmtDateShort(rental.scheduled_return_date)}`,
      });
    }
  }

  const rentalInspections = inspections.filter(
    (i) => i.reservation_id === rental.reservation_id,
  );
  if (rental.checkout_date && rentalInspections.length === 0) {
    warnings.push({
      key: "no-inspection",
      label: "Missing inspection",
      detail: "No checkout inspection on file",
    });
  }

  const rentalDrivers = drivers.filter(
    (d) => d.reservation_id === rental.reservation_id,
  );
  if (rentalDrivers.some((d) => d.verification_status !== "verified")) {
    warnings.push({
      key: "driver-verify",
      label: "Verification issue",
      detail: "Driver verification pending or failed",
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div
      data-testid="rental-warning-area"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-destructive">
        <AlertTriangle size={15} /> Attention required
      </div>
      <ul className="space-y-1.5">
        {warnings.map((w) => (
          <li
            key={w.key}
            className={cn(
              "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
              w.severity
                ? SEVERITY_TONE[w.severity]
                : "border-border bg-surface text-foreground",
            )}
          >
            <Ban size={12} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">{w.label}</span>
              {w.detail ? ` — ${w.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
