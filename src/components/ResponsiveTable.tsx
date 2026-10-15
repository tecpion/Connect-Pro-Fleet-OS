// Connect Pro Fleet — Build #20 responsive table/card primitive.
//
// ONE table→card pattern for operational list pages (Rentals, Payments Due,
// Vehicles, Maintenance, Damage Claims, Customers, Expenses, Banking, Tasks,
// Investors, Migration imports). Desktop renders a <table>; mobile (<lg)
// renders stacked cards built from the same column definitions. This avoids
// horizontal scrolling on core workflows and keeps card information hierarchy
// consistent (primary identity, status, money, next action, metadata).
//
// Columns define `render(row)` for the desktop cell and an optional
// `mobilePrimary`/`mobileSecondary` for the card layout. When omitted, the
// first column is treated as primary.

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  mono?: boolean;
  align?: "left" | "right";
  /** Mark as the primary identity on mobile cards (bold, top line). */
  mobilePrimary?: boolean;
  /** Mark as secondary line on mobile cards. */
  mobileSecondary?: boolean;
  /** Hide this column on mobile cards entirely. */
  mobileHidden?: boolean;
}

export function ResponsiveTable<T>({
  columns,
  rows,
  emptyTitle,
  emptyHint,
  emptyIcon,
  emptyAction,
  onRowClick,
  rowKey,
  mobileCardClassName,
}: {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyHint?: string;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T, index: number) => string;
  mobileCardClassName?: string;
}) {
  const isMobile = useIsMobile();

  if (rows.length === 0 && emptyTitle) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
        {emptyIcon && (
          <div className="mb-3 text-muted-foreground">{emptyIcon}</div>
        )}
        <p className="font-display text-base font-semibold text-foreground">
          {emptyTitle}
        </p>
        {emptyHint && (
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {emptyHint}
          </p>
        )}
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  if (isMobile) {
    const primary = columns.find((c) => c.mobilePrimary) ?? columns[0];
    const secondary = columns.find((c) => c.mobileSecondary);
    const rest = columns.filter(
      (c) => c !== primary && c !== secondary && !c.mobileHidden,
    );
    return (
      <div className="space-y-2.5">
        {rows.map((row, i) => (
          <div
            key={rowKey(row, i)}
            onClick={() => onRowClick?.(row)}
            className={cn(
              "rounded-lg border border-border bg-surface p-3",
              onRowClick && "cursor-pointer hover:bg-surface-2",
              mobileCardClassName,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {primary.render(row)}
                </div>
                {secondary && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {secondary.render(row)}
                  </div>
                )}
              </div>
            </div>
            <dl className="mt-2 space-y-1">
              {rest.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-2"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {c.header}
                  </dt>
                  <dd
                    className={cn(
                      "text-right text-sm text-foreground",
                      c.mono && "font-mono tabular",
                    )}
                  >
                    {c.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-3 font-medium",
                    c.align === "right" && "text-right",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-surface-2",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 text-foreground",
                      c.mono && "font-mono tabular",
                      c.align === "right" && "text-right",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
