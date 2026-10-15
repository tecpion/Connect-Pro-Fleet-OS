// Connect Pro Fleet — vehicle detail violations section (Build #25).
// Shows lifetime violation count, open count, and recent violations for a
// vehicle. Violations are operational evidence, not customer risk on their
// own — counts are shown with context. Permission-aware (financial values
// hidden without violations.view_financials).

import { useStore } from "@/lib/store";
import { useViolations } from "@/lib/violationStoreProvider";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtDate } from "@/lib/format";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  VIOLATION_TYPE_LABELS,
  VIOLATION_STATUS_LABELS,
  VIOLATION_STATUS_TONE,
  RESPONSIBILITY_LABELS,
  VIOLATION_OPEN_STATUSES,
} from "@/lib/violationTypes";

export function VehicleViolationsSection({ vehicleId }: { vehicleId: string }) {
  const store = useStore();
  const vio = useViolations();

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "violations.view_financials",
  );

  const all = vio.violationsForVehicle(vehicleId);
  const open = all.filter((v) => VIOLATION_OPEN_STATUSES.includes(v.status));
  const recent = all.slice(0, 5);

  return (
    <SectionCard
      title="Tolls & Violations"
      right={
        <span className="text-xs text-muted-foreground">
          {all.length} lifetime · {open.length} open
        </span>
      }
    >
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tolls, tickets, or violations recorded for this vehicle.
        </p>
      ) : (
        <div className="space-y-2">
          {recent.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
                  {VIOLATION_STATUS_LABELS[v.status]}
                </StatusPill>
                <span className="text-sm font-medium text-foreground">
                  {VIOLATION_TYPE_LABELS[v.violation_type]}
                </span>
                {v.citation_number && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {v.citation_number}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {fmtDate(v.occurred_at)}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {RESPONSIBILITY_LABELS[v.responsibility]}
                </span>
              </div>
              <span className="font-mono text-sm tabular text-foreground">
                {canViewFinancials ? fmtMoney(v.total_amount) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
