// Connect Pro Fleet — Build #20 shared overflow action menu.
//
// ONE kebab-menu pattern used across pages so overflow actions are consistent.
// Desktop renders a dropdown; on touch it remains the same dropdown (Radix
// handles positioning). Each item is permission-gated by the caller (only pass
// items the user may perform). Items with `danger` styling use the destructive
// color. Items can be `disabled`.

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "react";

export interface MoreAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** When true, the item is not rendered. */
  hidden?: boolean;
  /** When true, a separator is rendered before this item. */
  separator?: boolean;
}

export function MoreActionsMenu({
  items,
  triggerClassName,
  ariaLabel = "More actions",
}: {
  items: MoreAction[];
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          triggerClassName,
        )}
        aria-label={ariaLabel}
      >
        <MoreHorizontal size={18} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {visible.map((item, idx) => (
          <div key={item.key}>
            {idx > 0 && item.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={(e) => {
                if (item.disabled) {
                  e.preventDefault();
                  return;
                }
                item.onSelect();
              }}
              disabled={item.disabled}
              className={cn(
                "min-h-[40px] cursor-pointer",
                item.danger && "text-destructive focus:text-destructive",
              )}
            >
              {item.icon && <item.icon size={15} className="mr-2" />}
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Re-export for callers that build their own trigger button.
export const menuButtonProps = (
  ariaLabel = "More actions",
): ButtonHTMLAttributes<HTMLButtonElement> => ({
  "aria-label": ariaLabel,
});
