// Connect Pro Fleet — Action Center Copilot composer (Build #37 / #39 / #40 Voice).
//
// A prominent, premium Copilot composer at the top of the Action Center. It
// opens the global Copilot drawer (right side) and can auto-run a starter
// prompt. Reuses the existing CopilotPanel — no engine logic is duplicated.
//
// Build #39/#40 — adds a "Start Voice Conversation" entry point so operators
// can launch a true conversational Voice Mode directly from the Action Center.
// This is distinct from dictation (which lives inside the panel composer).

import { useState } from "react";
import { Sparkles, Send, AudioLines } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { cn } from "@/lib/utils";

export function ActionCenterCopilot({ prompts }: { prompts: string[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function launch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setOpen(true);
  }

  return (
    <>
      <section
        aria-label="Ask Fleet Copilot"
        className="card-surface overflow-hidden"
      >
        <div className="bg-gradient-to-br from-primary/8 via-primary/4 to-transparent px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold text-foreground">
                Ask Fleet Copilot
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Ask what needs attention, who owes money, what's blocked, what
                changed, or what you should focus on.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              launch(draft);
              setDraft("");
            }}
            className="mt-3 flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask or speak to Fleet Copilot…"
              aria-label="Ask Fleet Copilot"
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-press disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
            {/* Start Voice Conversation — enters true conversational Voice Mode. */}
            <button
              type="button"
              onClick={() => {
                setQuery(null);
                setOpen(true);
              }}
              title="Start Voice Conversation"
              aria-label="Start Voice Conversation"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/8 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <AudioLines className="h-4 w-4" />
              <span className="hidden sm:inline">Start Voice</span>
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => launch(p)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary",
                )}
              >
                <Sparkles className="h-3 w-3 text-primary/70" />
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery(null);
        }}
      >
        <SheetContent className="w-full p-0 sm:max-w-[440px]" side="right">
          <CopilotPanel
            onClose={() => {
              setOpen(false);
              setQuery(null);
            }}
            initialQuery={query}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
