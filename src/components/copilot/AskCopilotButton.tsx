// Connect Pro Fleet — "Ask Copilot" context button (Build #29 / Build #37).
//
// Drops onto Customer 360 / Vehicle Twin / Rental Detail / Dashboard / Action
// Center to open the Copilot drawer preloaded with that entity's context +
// tailored suggested questions. Reuses the CopilotPanel — no separate engine.
//
// Build #37 — supports `initialQuery` (auto-runs a starter question when the
// drawer opens) and `promptLabel` for page-level "Ask about this page" actions.

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";

export interface AskCopilotButtonProps {
  customerId?: string | null;
  vehicleId?: string | null;
  rentalId?: string | null;
  label?: string | null;
  promptLabel?: string;
  /** A query to auto-run when the drawer opens. */
  initialQuery?: string | null;
}

export function AskCopilotButton({
  customerId,
  vehicleId,
  rentalId,
  label,
  promptLabel = "Ask Copilot",
  initialQuery,
}: AskCopilotButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="h-4 w-4" />
          {promptLabel}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full p-0 sm:max-w-[440px]" side="right">
        <CopilotPanel
          onClose={() => setOpen(false)}
          initialContext={{ customerId, vehicleId, rentalId, label }}
          initialQuery={initialQuery}
        />
      </SheetContent>
    </Sheet>
  );
}
