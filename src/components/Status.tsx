import { cn } from "@/lib/utils";
import { statusToneClasses } from "@/lib/format";
import type {
  CustomerStatus,
  RentalStatus,
  ReservationStatus,
  VehicleStatus,
} from "@/lib/types";

export type Tone = "available" | "maintenance" | "out" | "rented" | "neutral";

export function StatusDot({
  tone,
  className,
}: {
  tone: Tone;
  className?: string;
}) {
  const t = statusToneClasses[tone];
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        t.dot,
        className,
      )}
      role="presentation"
    />
  );
}

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = statusToneClasses[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        t.bg,
        t.text,
        className,
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

export function vehicleTone(s: VehicleStatus): Tone {
  return s === "available"
    ? "available"
    : s === "maintenance"
      ? "maintenance"
      : s === "out_of_service"
        ? "out"
        : "rented";
}

export function reservationTone(s: ReservationStatus): Tone {
  const map: Record<ReservationStatus, Tone> = {
    pending_verification: "maintenance",
    manual_review: "maintenance",
    pending_insurance_addon: "maintenance",
    confirmed: "available",
    active: "rented",
    completed: "neutral",
    cancelled: "neutral",
    blocked_license: "out",
  };
  return map[s];
}

export function customerTone(s: CustomerStatus): Tone {
  const map: Record<CustomerStatus, Tone> = {
    good_standing: "available",
    active_renter: "rented",
    previous_renter: "neutral",
    watchlist: "maintenance",
    do_not_rent: "out",
    vip: "available",
    pending_verification: "maintenance",
  };
  return map[s];
}

export function rentalTone(s: RentalStatus): Tone {
  const map: Record<RentalStatus, Tone> = {
    draft: "neutral",
    ready_for_checkout: "maintenance",
    active: "rented",
    payment_due: "maintenance",
    late: "maintenance",
    overdue: "out",
    return_pending: "maintenance",
    completed: "neutral",
    cancelled: "neutral",
  };
  return map[s];
}
