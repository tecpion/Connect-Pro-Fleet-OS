// Connect Pro Fleet — shared entity-link + badge components (Build #27, spec §54, §56).
//
// RelatedEntityLink gives consistent navigation to authoritative entities.
// EntityBadges surface consistent operational state without a redundant status
// system (spec §56). No custom color classes — all via semantic tokens.

import { Link } from "@/lib/router-compat";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RelatedEntityLink({
  to,
  id,
  label,
  type,
}: {
  to?: string;
  id?: string;
  label: string;
  type?: string;
}) {
  const href = to ?? (type && id ? routeForEntity(type, id) : "#");
  return (
    <Link
      to={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <span className="truncate">{label}</span>
      {type && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {type}
        </span>
      )}
    </Link>
  );
}

export function routeForEntity(type: string, id: string): string {
  switch (type) {
    case "rental":
      return `/rentals/${id}`;
    case "customer":
      return `/customers/${id}`;
    case "vehicle":
      return `/vehicles/${id}`;
    case "reservation":
      return `/reservations/${id}`;
    case "damage_claim":
      return "/damage-claims";
    case "violation":
      return "/incidents-violations?tab=violations";
    case "work_order":
      return "/maintenance";
    case "task":
      return "/tasks";
    case "expense":
      return "/finance?tab=expenses";
    case "document":
      return "/compliance";
    default:
      return "#";
  }
}

export function CustomerBadge({
  kind,
}: {
  kind:
    | "active_rental"
    | "balance_due"
    | "compliance"
    | "open_damage"
    | "open_violation";
}) {
  const map = {
    active_rental: { label: "Active Rental", variant: "default" as const },
    balance_due: { label: "Balance Due", variant: "destructive" as const },
    compliance: { label: "Compliance", variant: "secondary" as const },
    open_damage: { label: "Open Damage", variant: "destructive" as const },
    open_violation: { label: "Open Violation", variant: "secondary" as const },
  };
  const m = map[kind];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function VehicleBadge({
  kind,
}: {
  kind:
    | "rented"
    | "available"
    | "maintenance"
    | "damage_block"
    | "compliance_block";
}) {
  const map = {
    rented: { label: "Rented", cls: "bg-status-rented text-white" },
    available: { label: "Available", cls: "bg-status-available text-white" },
    maintenance: {
      label: "Maintenance",
      cls: "bg-status-maintenance text-white",
    },
    damage_block: { label: "Damage Block", cls: "bg-status-out text-white" },
    compliance_block: {
      label: "Compliance Block",
      cls: "bg-status-out text-white",
    },
  };
  const m = map[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}
