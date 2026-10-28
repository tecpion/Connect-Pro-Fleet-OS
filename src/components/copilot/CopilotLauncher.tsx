// Connect Pro Fleet — Copilot drawer launcher (Build #29).
//
// A persistent "Copilot" button in the application shell that opens a
// right-side drawer (desktop) / full-screen sheet (mobile). Shares the same
// CopilotPanel as the /copilot route. No LLM — deterministic Phase 1.

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function CopilotLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary-glow px-3.5 text-xs font-semibold text-primary-foreground shadow-[0_4px_16px_-4px] shadow-primary/50 transition-all hover:scale-[1.02] hover:shadow-[0_6px_20px_-4px] shadow-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          title="Connect Pro AI Operator"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">AI Operator</span>
        </button>
      </SheetTrigger>
      <SheetContent className="w-full p-0 sm:max-w-[440px]" side="right">
        <CopilotPanel onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
