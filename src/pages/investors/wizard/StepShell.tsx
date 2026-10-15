// Connect Pro Fleet — partnership wizard step shell (Build #7).
// Shared layout for each wizard step: heading, supporting text, content.

import type { ReactNode } from "react";

export function StepShell({
  heading,
  supporting,
  children,
}: {
  heading: string;
  supporting?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">
          {heading}
        </h3>
        {supporting && (
          <p className="mt-1 text-sm text-muted-foreground">{supporting}</p>
        )}
      </div>
      {children}
    </div>
  );
}

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export { selectCls };
