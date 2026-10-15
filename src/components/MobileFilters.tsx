// Connect Pro Fleet — Build #20 mobile filter affordances.
//
// Reusable primitives so list pages share one filter UX:
//  - FilterChip: removable active-filter chip shown on mobile
//  - FilterSheet: a bottom-sheet drawer for stacked filter controls on mobile
//  - ActiveFilterCount: shows "Filters (3)" when filters are active
// Pages keep their own filter state; these just standardize presentation.

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useState } from "react";

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-full p-0.5 hover:bg-primary/20"
      >
        <X size={12} />
      </button>
    </span>
  );
}

export function ActiveFilterCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold text-primary-foreground">
      {count}
    </span>
  );
}

/** Mobile-only filter sheet. Renders the trigger button (hidden on desktop)
 *  and a bottom sheet containing the caller's filter controls. */
export function MobileFilters({
  children,
  activeCount,
  triggerLabel = "Filters",
}: {
  children: ReactNode;
  activeCount: number;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 lg:hidden"
          aria-label={`${triggerLabel}${activeCount > 0 ? `, ${activeCount} active` : ""}`}
        >
          <SlidersHorizontal size={15} />
          {triggerLabel}
          <ActiveFilterCount count={activeCount} />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{triggerLabel}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6 pt-2">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** A "Clear all" button shown when multiple filters are active. */
export function ClearFiltersButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      Clear all
    </button>
  );
}
