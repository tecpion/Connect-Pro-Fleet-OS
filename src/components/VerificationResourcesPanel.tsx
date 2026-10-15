import { useEffect } from "react";
import { useResourceCenter } from "@/lib/resourceCenterStore";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { ExternalLink, BookCheck } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import type {
  ReservationVerification,
  ReservationVerificationStatus,
  ResourceCategory,
} from "@/lib/resourceCenter";

const VERIFICATION_STATUSES: {
  value: ReservationVerificationStatus;
  label: string;
}[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
];

const statusTone: Record<ReservationVerificationStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-status-maintenance",
  passed: "text-status-available",
  failed: "text-status-out",
};

/**
 * Pure gate logic: a reservation can only move to "confirmed" if every
 * category that is BOTH active AND required has a status of "passed".
 * Optional categories never block confirmation regardless of their status.
 */
export function canConfirmReservation(
  categories: ResourceCategory[],
  verifications: ReservationVerification[],
  reservationId: string,
): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const cat of categories) {
    if (!cat.is_active) continue;
    if (!(cat.is_required ?? false)) continue;
    const v = verifications.find(
      (x) => x.reservation_id === reservationId && x.category_id === cat.id,
    );
    if (!v || v.status !== "passed") blockers.push(cat.name);
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * Verification & Resources panel for a reservation.
 *
 * Shows one row per ACTIVE category only (inactive categories are skipped
 * entirely). Each row exposes the category's resource links (open in a new
 * tab), a status dropdown, a notes field, and who marked it + when. Optional
 * categories (required: false) show a muted "optional" label so staff can tell
 * at a glance what actually blocks the booking versus what's just reference.
 */
export function VerificationResourcesPanel({
  reservationId,
}: {
  reservationId: string;
}) {
  const {
    resourceCategories,
    resourceLinks,
    reservationVerificationsFor,
    ensureReservationVerification,
    setReservationVerification,
  } = useResourceCenter();
  const { staff, currentStaffId } = useStore();

  const activeCategories = resourceCategories
    .filter((c) => c.is_active)
    .sort((a, b) => a.display_order - b.display_order);

  // Ensure a verification row exists for every active category so the
  // dropdown stays controlled. Idempotent — runs on mount / when the
  // active category set changes.
  useEffect(() => {
    activeCategories.forEach((cat) =>
      ensureReservationVerification(reservationId, cat.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId, activeCategories.length]);

  const verifications = reservationVerificationsFor(reservationId);

  const staffName = (id: string | null) =>
    staff.find((s) => s.id === id)?.full_name ?? "—";

  return (
    <SectionCard
      title="Verification & resources"
      right={<BookCheck size={15} className="text-muted-foreground" />}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Run each check before confirming the booking. Required categories must
        be marked Passed to confirm; optional ones are reference only.
      </p>

      {activeCategories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No verification categories are active. Add them in Settings → Resource
          Center.
        </p>
      ) : (
        <div className="space-y-4">
          {activeCategories.map((cat) => {
            const links = resourceLinks
              .filter((l) => l.category_id === cat.id && l.is_active)
              .sort((a, b) => a.display_order - b.display_order);
            const v =
              verifications.find((x) => x.category_id === cat.id) ??
              defaultVerification(reservationId, cat.id);
            const required = cat.is_required ?? false;

            return (
              <div
                key={cat.id}
                className={cn(
                  "rounded-md border border-border p-3",
                  required && "border-l-2 border-l-status-maintenance",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {cat.name}
                    </p>
                    {required ? (
                      <span className="rounded-full bg-status-maintenance/10 px-2 py-0.5 text-xs text-status-maintenance">
                        required
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        optional
                      </span>
                    )}
                  </div>
                  <select
                    value={v.status}
                    onChange={(e) => {
                      const status = e.target
                        .value as ReservationVerificationStatus;
                      setReservationVerification(reservationId, cat.id, {
                        status,
                        verified_by:
                          status === "not_started"
                            ? null
                            : (currentStaffId ?? null),
                        verified_at:
                          status === "not_started"
                            ? null
                            : new Date().toISOString(),
                      });
                    }}
                    className={cn(
                      "rounded-md border border-input bg-surface px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring",
                      statusTone[v.status],
                    )}
                  >
                    {VERIFICATION_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {cat.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cat.description}
                  </p>
                )}

                {links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {links.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground hover:border-primary/40 hover:text-primary"
                      >
                        {link.name}
                        <ExternalLink
                          size={11}
                          className="text-muted-foreground"
                        />
                      </a>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={v.notes ?? ""}
                  onChange={(e) =>
                    setReservationVerification(reservationId, cat.id, {
                      notes: e.target.value || null,
                    })
                  }
                  placeholder="Notes…"
                  className="mt-2 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />

                {v.verified_by && (
                  <p className="mt-1.5 font-mono text-xs tabular text-muted-foreground">
                    {staffName(v.verified_by)}
                    {v.verified_at ? ` · ${fmtDateTime(v.verified_at)}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function defaultVerification(
  reservationId: string,
  categoryId: string,
): ReservationVerification {
  return {
    id: `rvf_${reservationId}_${categoryId}`,
    reservation_id: reservationId,
    category_id: categoryId,
    tenant_id: "tnt_connectpro",
    status: "not_started",
    required: false,
    verified_by: null,
    verified_at: null,
    notes: null,
  };
}
