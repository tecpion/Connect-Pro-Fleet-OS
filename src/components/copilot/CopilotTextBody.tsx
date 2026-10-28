// Connect Pro Fleet — Copilot text-chat body (Build #40 — Dual Voice).
//
// Extracted from CopilotPanel so the panel stays focused on orchestration
// (Text Mode vs Voice Mode). This is the header + messages + composer shown
// when Voice Mode is NOT active.
//
// Build #40 — DUAL voice experience. The composer now has TWO clearly distinct
// voice controls:
//
//  1. DICTATION mic (small mic icon INSIDE the textarea) — "Dictate message".
//     Speech becomes editable text in the composer; the user manually presses
//     Send. This is voice-to-text dictation only. It does NOT auto-submit and
//     does NOT enter Voice Mode.
//
//  2. "Start Voice Conversation" button (distinct, labelled, with a headphones
//     icon) — enters the true conversational Voice Mode (auto-submit + auto-speak
//     + auto-listen-again). The user must understand the difference.
//
// Text Mode keeps: type → Send → text answer, with optional "Read aloud".
// Voice Conversation replaces this body with VoiceModeScreen (see CopilotPanel).

import type { RefObject, Dispatch, SetStateAction } from "react";
import { Sparkles, Send, X, RotateCcw, Eraser } from "lucide-react";
import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotViewerPermissions,
} from "@/lib/copilotTypes";
import type { VoiceInputState } from "@/lib/useCopilotVoiceInput";
import { AnswerCard } from "@/components/copilot/AnswerCard";
import { CopilotRoutingDebugPanel } from "@/components/copilot/CopilotRoutingDebugPanel";
import { cn } from "@/lib/utils";

export interface CopilotTextBodyProps {
  conversation: CopilotConversation;
  compact?: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  perms: CopilotViewerPermissions;
  runQuery: (q: string) => void;
  setFeedback: (id: string, r: "helpful" | "not_helpful") => void;
  settings: {
    readResponsesAloud: boolean;
    voiceInputEnabled: boolean;
    voiceConversationsEnabled: boolean;
  };
  synthesis: { supported: boolean } | null;
  isSpeaking: boolean;
  speakAnswer: (a: CopilotAnswer) => void;
  stopSpeaking: () => void;
  input: string;
  setInput: (v: string | ((p: string) => string)) => void;
  onClose?: () => void;
  clearConversation: () => void;
  refreshLastAnswer: () => void;
  voiceConv: {
    state: { supported: boolean; error: string | null };
    startVoice: () => void;
  };
  /** Build #40 — the dictation hook (voice-to-text into the composer). */
  dictation: {
    state: VoiceInputState;
    toggle: () => void;
    stop: () => void;
  };
  setConversation: Dispatch<SetStateAction<CopilotConversation>>;
  EmptyState: (props: {
    onPick: (q: string) => void;
    perms: CopilotViewerPermissions;
    compact?: boolean;
  }) => React.ReactNode;
}

export function CopilotTextBody({
  conversation,
  compact,
  scrollRef,
  loading,
  perms,
  runQuery,
  setFeedback,
  settings,
  synthesis,
  isSpeaking,
  speakAnswer,
  stopSpeaking,
  input,
  setInput,
  onClose,
  clearConversation,
  refreshLastAnswer,
  voiceConv,
  dictation,
  setConversation,
  EmptyState,
}: CopilotTextBodyProps) {
  // V1 — text-only AI Operator. Voice (dictation, Voice Conversation, Read
  // Aloud) is intentionally hidden from the customer-facing V1 experience.
  // The underlying hooks/props are preserved for a possible future phase; the
  // UI simply never renders the voice controls.
  const dictationSupported = false;
  const voiceConvSupported = false;
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              Connect Pro AI Operator
            </div>
            <div className="text-[11px] text-muted-foreground">
              Your AI operations manager
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refreshLastAnswer}
            title="Refresh answer"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={clearConversation}
            title="New conversation"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40"
          >
            <Eraser className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Context label */}
      {conversation.context_label && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-1.5">
          <span className="text-[11px] text-muted-foreground">Context:</span>
          <span className="text-xs font-medium text-foreground">
            {conversation.context_label}
          </span>
          <button
            type="button"
            onClick={() =>
              setConversation((prev) => ({
                ...prev,
                context_customer_id: null,
                context_vehicle_id: null,
                context_rental_id: null,
                context_label: null,
              }))
            }
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            clear
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 space-y-3 overflow-y-auto",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        {conversation.messages.length === 0 && (
          <EmptyState onPick={runQuery} perms={perms} compact={compact} />
        )}
        {conversation.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="space-y-2">
              <div className="max-w-[90%] rounded-lg border border-border bg-muted/20 px-3 py-2">
                {m.answer ? (
                  <AnswerCard answer={m.answer} />
                ) : (
                  <p className="text-sm text-foreground">{m.content}</p>
                )}
              </div>
              {/* Build #53 — INTERNAL routing-debug panel. Only rendered when
               *  the message carries a routing_debug trace (i.e. the internal
               *  debug flag was ON when the turn ran). Hidden otherwise. */}
              {m.routing_debug && (
                <CopilotRoutingDebugPanel debug={m.routing_debug} />
              )}
              {m.answer && (
                <div className="flex flex-wrap items-center gap-3 px-1">
                  <button
                    type="button"
                    onClick={() => setFeedback(m.id, "helpful")}
                    className={cn(
                      "text-xs",
                      m.feedback === "helpful"
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    👍 Helpful
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedback(m.id, "not_helpful")}
                    className={cn(
                      "text-xs",
                      m.feedback === "not_helpful"
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    👎 Not helpful
                  </button>
                  {/* Read aloud hidden in V1 (text-only AI Operator). */}
                </div>
              )}
            </div>
          ),
        )}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 animate-pulse" /> Working on it…
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        {/* V1 — text-only AI Operator. Voice indicators (speaking, dictation,
            voice-conversation errors) are intentionally hidden. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runQuery(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runQuery(input);
              }
            }}
            rows={1}
            placeholder="Ask about your fleet, rentals, payments, maintenance, or operations…"
            aria-label="Ask Connect Pro AI Operator"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {/* V1 — dictation mic hidden (text-only AI Operator). */}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
