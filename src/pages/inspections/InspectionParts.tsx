// Connect Pro Fleet — Inspections page helper components.
//
// Pure presentation components extracted to keep Inspections.tsx lean:
// InspKpi (KPI tile), InspTab (segmented tab), InspectionTableBody (desktop
// table), InspectionCardView (mobile/card grid). No domain logic.
//
// Final UX polish:
//   - human-friendly inspection number (INSP-YYYY-NNNNN) instead of raw ids
//   - AI Review column consuming existing AI Damage Detection state
//   - Resume vs View primary action (Resume for unfinished, View for completed)
//   - clickable operational states (photos / signature / AI review / damage)
//     that deep-link into the relevant wizard step
//   - transparent attention reasons (no opaque scores)
//   - AI-vs-human-confirmed damage distinction in the Damage column

import { Link } from "@/lib/router-compat";
import { StatusPill } from "@/components/Status";
import { fmtDateTime, fmtNumber, inspectionTypeMeta } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deriveInspectionStatus,
  inspectionStatusTone,
  requiredPhotosCaptured,
  REQUIRED_PHOTO_COUNT,
  getDamageItems,
  confirmedNewDamage,
  hasCustomerSignature,
  inspectionNumber,
  deriveAiReviewState,
  aiReviewStateTone,
  AI_REVIEW_STATE_LABELS,
  attentionReason,
  resumeStep,
} from "@/lib/inspectionSelectors";
import { INSPECTION_STATUS_LABELS } from "@/lib/inspectionWorkspaceTypes";
import type { Inspection } from "@/lib/inspectionTypes";
import type { Reservation, Vehicle } from "@/lib/types";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Fuel,
  Sparkles,
  PenLine,
  ClipboardCheck,
} from "lucide-react";

export type InspTabKey =
  | "all"
  | "in_progress"
  | "checkout"
  | "checkin"
  | "needs_review"
  | "damage"
  | "completed";

export function inspTabLabel(t: InspTabKey): string {
  const m: Record<InspTabKey, string> = {
    all: "All",
    in_progress: "In Progress",
    checkout: "Checkout",
    checkin: "Check-In",
    needs_review: "Needs Review",
    damage: "Damage",
    completed: "Completed",
  };
  return m[t];
}

const TILE: Record<string, string> = {
  available: "bg-status-available/10 text-status-available",
  rented: "bg-kpi-teal/10 text-kpi-teal",
  maintenance: "bg-status-maintenance/15 text-status-maintenance",
  out: "bg-status-out/10 text-status-out",
  neutral: "bg-kpi-blue/10 text-kpi-blue",
};

export function InspKpi({
  icon,
  label,
  value,
  tone,
  onClick,
  active,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "available" | "rented" | "maintenance" | "out" | "neutral";
  onClick?: () => void;
  active?: boolean;
  testId?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] transition-all",
        onClick &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_hsl(214_30%_15%_/_0.08)]",
        active && "ring-2 ring-primary/50",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          TILE[tone],
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-2xl font-bold tabular text-foreground">
          {value}
        </span>
      </span>
    </Comp>
  );
}

export function InspTab({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular",
            active
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-surface text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function StatusBadge({ i }: { i: Inspection }) {
  const status = deriveInspectionStatus(i);
  return (
    <StatusPill tone={inspectionStatusTone(status)}>
      {INSPECTION_STATUS_LABELS[status]}
    </StatusPill>
  );
}

/** Build the resume deep-link href for an unfinished inspection. */
function resumeHref(i: Inspection): string {
  const step = resumeStep(i);
  return `/inspections/new?res=${i.reservation_id}&type=${i.inspection_type}&step=${step}&resume=${i.id}`;
}

/** Whether an inspection is unfinished (should show Resume, not View). */
function isUnfinished(i: Inspection): boolean {
  const s = deriveInspectionStatus(i);
  return s === "in_progress" || s === "incomplete";
}

/** AI review cell — clickable when review is needed. */
function AiReviewCell({
  i,
  onAction,
}: {
  i: Inspection;
  onAction: (href: string) => void;
}) {
  const state = deriveAiReviewState(i);
  const tone = aiReviewStateTone(state);
  const label = AI_REVIEW_STATE_LABELS[state];
  const clickable =
    state === "review_needed" ||
    state === "retake_needed" ||
    state === "potential_damage";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) onAction(resumeHref(i));
      }}
      data-testid={`insp-ai-${i.id}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tone === "available" && "text-status-available",
        tone === "maintenance" && "text-status-maintenance",
        tone === "out" && "text-status-out",
        tone === "rented" && "text-kpi-teal",
        tone === "neutral" && "text-muted-foreground",
        clickable && "cursor-pointer hover:underline",
      )}
      title={label}
    >
      <Sparkles size={12} /> {label}
    </button>
  );
}

export function InspectionTableBody({
  filtered,
  vehicles,
  reservations,
  onOpen,
  onAction,
}: {
  filtered: Inspection[];
  vehicles: Vehicle[];
  reservations: Reservation[];
  onOpen: (id: string) => void;
  onAction: (href: string) => void;
}) {
  return (
    <tbody className="divide-y divide-border">
      {filtered.map((i) => {
        const v = vehicles.find((x) => x.id === i.vehicle_id);
        const r = reservations.find((x) => x.id === i.reservation_id);
        const photos = requiredPhotosCaptured(i);
        const damageItems = getDamageItems(i);
        const confirmedDmg = confirmedNewDamage(i).length;
        const aiFindingsPending = deriveAiReviewState(i) === "review_needed";
        const signed = hasCustomerSignature(i);
        const unfinished = isUnfinished(i);
        const reason = attentionReason(i);
        return (
          <tr
            key={i.id}
            onClick={() => onOpen(i.id)}
            data-testid={`insp-row-${i.id}`}
            className="group cursor-pointer transition-colors hover:bg-surface-2/60"
          >
            <td className="px-4 py-3">
              <span
                className="font-mono text-xs font-semibold tabular text-foreground"
                data-testid={`insp-number-${i.id}`}
              >
                {inspectionNumber(i)}
              </span>
              <p className="text-xs text-muted-foreground">
                {inspectionTypeMeta[i.inspection_type]} ·{" "}
                {r ? `Reservation ${r.id}` : "—"}
              </p>
              {reason && (
                <p className="mt-0.5 text-xs font-medium text-status-maintenance">
                  {reason}
                </p>
              )}
            </td>
            <td className="px-4 py-3">
              {v ? (
                <Link
                  to={`/vehicles/${v.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-foreground group-hover:text-primary"
                >
                  {v.year} {v.make} {v.model}
                </Link>
              ) : (
                "—"
              )}
              <p className="font-mono text-xs tabular text-muted-foreground">
                {v?.license_plate}
              </p>
            </td>
            <td className="px-4 py-3 text-sm text-foreground">
              {r?.renter_name ?? "—"}
            </td>
            <td className="px-4 py-3">
              <StatusBadge i={i} />
            </td>
            <td className="px-4 py-3">
              <AiReviewCell i={i} onAction={onAction} />
            </td>
            <td className="px-4 py-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(resumeHref(i));
                }}
                data-testid={`insp-photos-${i.id}`}
                title={`${photos} of ${REQUIRED_PHOTO_COUNT} required photos captured`}
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-xs tabular hover:underline",
                  photos >= REQUIRED_PHOTO_COUNT
                    ? "text-status-available"
                    : "text-status-maintenance",
                )}
              >
                <Camera size={12} /> {photos}/{REQUIRED_PHOTO_COUNT}
              </button>
            </td>
            <td className="px-4 py-3">
              {confirmedDmg > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-out">
                  <AlertTriangle size={12} /> {confirmedDmg} confirmed
                </span>
              ) : aiFindingsPending ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-status-maintenance">
                  <Sparkles size={12} /> AI findings
                </span>
              ) : damageItems.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle size={12} /> {damageItems.length}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-status-available">
                  <CheckCircle2 size={12} /> 0
                </span>
              )}
            </td>
            <td className="px-4 py-3 text-xs">
              {signed ? (
                <span className="inline-flex items-center gap-1 text-status-available">
                  <CheckCircle2 size={12} /> Signed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(resumeHref(i));
                  }}
                  data-testid={`insp-sig-${i.id}`}
                  className="inline-flex items-center gap-1 font-medium text-status-maintenance hover:underline"
                >
                  <PenLine size={12} /> Missing
                </button>
              )}
            </td>
            <td
              className="px-4 py-3 text-right"
              onClick={(e) => e.stopPropagation()}
            >
              {unfinished ? (
                <button
                  onClick={() => onAction(resumeHref(i))}
                  data-testid={`insp-resume-${i.id}`}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-press"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={() => onOpen(i.id)}
                  data-testid={`insp-open-${i.id}`}
                  className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  View
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

export function InspectionCardView({
  filtered,
  vehicles,
  reservations,
  onOpen,
  onAction,
}: {
  filtered: Inspection[];
  vehicles: Vehicle[];
  reservations: Reservation[];
  onOpen: (id: string) => void;
  onAction: (href: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((i) => {
        const v = vehicles.find((x) => x.id === i.vehicle_id);
        const r = reservations.find((x) => x.id === i.reservation_id);
        const photos = requiredPhotosCaptured(i);
        const confirmedDmg = confirmedNewDamage(i).length;
        const aiState = deriveAiReviewState(i);
        const signed = hasCustomerSignature(i);
        const unfinished = isUnfinished(i);
        const reason = attentionReason(i);
        return (
          <div
            key={i.id}
            data-testid={`insp-card-${i.id}`}
            className="w-full rounded-xl border border-border bg-surface p-4 text-left shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] transition-all hover:shadow-[0_8px_24px_hsl(214_30%_15%_/_0.08)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-mono text-xs font-semibold text-foreground"
                data-testid={`insp-card-number-${i.id}`}
              >
                {inspectionNumber(i)}
              </span>
              <StatusBadge i={i} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {inspectionTypeMeta[i.inspection_type]} ·{" "}
              {r ? `Reservation ${r.id}` : "—"}
            </p>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {v ? `${v.year} ${v.make} ${v.model}` : "—"}
            </p>
            <p className="font-mono text-xs tabular text-muted-foreground">
              {v?.license_plate} · {r?.renter_name ?? "—"}
            </p>
            {reason && (
              <p className="mt-1.5 text-xs font-medium text-status-maintenance">
                {reason}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono tabular text-foreground">
                <Gauge size={12} /> {fmtNumber(i.odometer_reading)} mi
              </span>
              <span className="inline-flex items-center gap-1 font-mono tabular text-foreground">
                <Fuel size={12} /> {i.fuel_level}%
              </span>
              <button
                type="button"
                onClick={() => onAction(resumeHref(i))}
                data-testid={`insp-card-photos-${i.id}`}
                className={cn(
                  "inline-flex items-center gap-1 font-mono tabular hover:underline",
                  photos >= REQUIRED_PHOTO_COUNT
                    ? "text-status-available"
                    : "text-status-maintenance",
                )}
              >
                <Camera size={12} /> {photos}/{REQUIRED_PHOTO_COUNT}
              </button>
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  aiReviewStateTone(aiState) === "available" &&
                    "text-status-available",
                  aiReviewStateTone(aiState) === "maintenance" &&
                    "text-status-maintenance",
                  aiReviewStateTone(aiState) === "out" && "text-status-out",
                  aiReviewStateTone(aiState) === "neutral" &&
                    "text-muted-foreground",
                )}
              >
                <Sparkles size={12} /> {AI_REVIEW_STATE_LABELS[aiState]}
              </span>
              {confirmedDmg > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-status-out">
                  <AlertTriangle size={12} /> {confirmedDmg} confirmed
                </span>
              )}
              {signed ? (
                <span className="inline-flex items-center gap-1 text-status-available">
                  <CheckCircle2 size={12} />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-status-maintenance">
                  <PenLine size={12} /> Sig
                </span>
              )}
            </div>
            <div className="mt-3 border-t border-border pt-2.5">
              {unfinished ? (
                <button
                  onClick={() => onAction(resumeHref(i))}
                  data-testid={`insp-card-resume-${i.id}`}
                  className="w-full rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-press"
                >
                  Resume Inspection
                </button>
              ) : (
                <button
                  onClick={() => onOpen(i.id)}
                  data-testid={`insp-card-open-${i.id}`}
                  className="w-full rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  View
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyInspectionsIcon() {
  return <ClipboardCheck size={28} />;
}
