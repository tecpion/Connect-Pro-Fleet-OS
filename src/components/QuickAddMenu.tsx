// Connect Pro Fleet — Quick Add action menu (UI polish pass).
//
// Replaces the dashboard's row of separate action buttons with a single
// prominent "+ Quick Add" dropdown. Each option routes to an EXISTING creation
// workflow (the destination page opens its own dialog). Options are filtered
// BEFORE rendering based on the current user's permissions — unauthorized
// actions are removed, not merely disabled.
//
// On mobile the dropdown content adapts to full-width via Radix's built-in
// responsive positioning; no horizontal overflow is introduced.

import { useNavigate } from "@/lib/router-compat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCan } from "@/pages/settings/useCan";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Car,
  CreditCard,
  ListTodo,
  Plus,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

export interface QuickAddOption {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  to: string;
  /** Permission key required to see this option. */
  perm: string;
}

// The canonical Quick Add option set. Each `to` reuses an existing workflow —
// the destination page reads the `?new=1` query param and auto-opens its
// creation dialog. No new workflow logic is introduced here.
export const QUICK_ADD_OPTIONS: QuickAddOption[] = [
  {
    key: "reservation",
    label: "New reservation",
    hint: "Create a future booking",
    icon: CalendarDays,
    to: "/rental-management?tab=reservations&new=1",
    perm: "reservations.create",
  },
  {
    key: "rental",
    label: "Start rental",
    hint: "Begin from a confirmed reservation",
    icon: Car,
    // Rentals are created from confirmed reservations via checkout. Route to
    // the Rental Management "Ready for Checkout" queue so staff can pick a
    // confirmed reservation and start the existing conversion + checkout flow.
    to: "/rental-management?tab=ready",
    perm: "rentals.start",
  },
  {
    key: "payment",
    label: "Record payment",
    hint: "Post a customer payment",
    icon: CreditCard,
    to: "/rental-management?tab=active&filter=payment_due",
    perm: "payments.record",
  },
  {
    key: "vehicle",
    label: "Add vehicle",
    hint: "Add inventory to the fleet",
    icon: Car,
    to: "/vehicles?new=1",
    perm: "vehicles.add",
  },
  {
    key: "task",
    label: "Create task",
    hint: "Assign an operational follow-up",
    icon: ListTodo,
    to: "/tasks?new=1",
    perm: "tasks.create",
  },
  // NOTE: "Add customer" is intentionally omitted — no customer creation
  // workflow/dialog exists yet. Adding it would create a dead button. It can
  // be added once a customer creation dialog is wired into the Customers page.
];

/**
 * Pure selector: returns the Quick Add options the user may see, given a
 * permission resolver. Exported so tests can verify the option set, labels,
 * routes, and filter-before-render behaviour without driving the Radix
 * dropdown (which is slow to exercise in jsdom). The component itself uses the
 * same resolver at render time.
 */
export function visibleQuickAddOptions(
  can: (perm: string) => boolean,
): QuickAddOption[] {
  return QUICK_ADD_OPTIONS.filter((o) => can(o.perm));
}

export function QuickAddMenu({
  className,
  label = "Quick Add",
}: {
  className?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  // Resolve each option's permission at the top level (one hook call per
  // option, in a stable order) so we never call a hook conditionally or inside
  // a loop body. The QUICK_ADD_OPTIONS array is module-level and stable, so
  // the number and order of useCan calls is constant across renders.
  const canReservation = useCan("reservations.create");
  const canRental = useCan("rentals.start");
  const canPayment = useCan("payments.record");
  const canVehicle = useCan("vehicles.add");
  const canTask = useCan("tasks.create");
  const permMap: Record<string, boolean> = {
    reservation: canReservation,
    rental: canRental,
    payment: canPayment,
    vehicle: canVehicle,
    task: canTask,
  };
  // Filter before rendering: only show actions the user can perform.
  const visible = QUICK_ADD_OPTIONS.filter((o) => permMap[o.key] !== false);

  // If the user can perform no quick actions, render nothing rather than a
  // dead trigger.
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="quick-add-trigger"
          aria-label="Quick add"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-primary-glow px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_4px_14px_-4px] shadow-primary/50 transition-all hover:shadow-[0_6px_18px_-4px] hover:shadow-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
        >
          <Plus size={16} className="shrink-0" />
          <span>{label}</span>
          <ChevronDown size={14} className="shrink-0 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[300px] max-w-[calc(100vw-2rem)] p-1.5"
      >
        {visible.map((o) => {
          const Icon = o.icon;
          return (
            <DropdownMenuItem
              key={o.key}
              data-testid={`quick-add-${o.key}`}
              onSelect={() => navigate(o.to)}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2.5 outline-none focus:bg-primary/10 data-[highlighted]:bg-primary/10"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {o.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {o.hint}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
