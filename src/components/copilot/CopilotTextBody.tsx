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
import {
  Sparkles,
  Send,
  X,
  RotateCcw,
  Eraser,
  Mic,
  MicOff,
  Square,
  Volume2,
  StopCircle,
  Headphones,
} from "lucide-react";
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
  const dictationSupported =
    dictation.state.supported && settings.voiceInputEnabled;
  const voiceConvSupported =
    voiceConv.state.supported && settings.voiceConversationsEnabled;
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              Fleet Copilot
            </div>
            <div className="text-[11px] text-muted-foreground">
              Your operational assistant
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
                  {/* Read aloud (Text Mode only, optional). */}
                  {settings.readResponsesAloud &&
                    synthesis?.supported &&
                    !isSpeaking && (
                      <button
                        type="button"
                        onClick={() => speakAnswer(m.answer!)}
                        title="Read aloud"
                        aria-label="Read answer aloud"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Volume2 className="h-3.5 w-3.5" /> Read aloud
                      </button>
                    )}
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
        {/* Voice conversation error (e.g. unsupported browser). */}
        {voiceConv.state.error && (
          <p className="mb-2 text-xs text-muted-foreground" role="alert">
            {voiceConv.state.error}
          </p>
        )}
        {isSpeaking && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5 text-primary" /> Reading answer…
            </span>
            <button
              type="button"
              onClick={stopSpeaking}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
            >
              <StopCircle className="h-3.5 w-3.5" /> Stop
            </button>
          </div>
        )}
        {/* Dictation listening indicator (inside the composer, not Voice Mode). */}
        {dictation.state.isListening && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-primary/40 bg-primary/8 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              Dictating
              {dictation.state.interimTranscript
                ? ` — ${dictation.state.interimTranscript}`
                : "…"}
            </span>
            <button
              type="button"
              onClick={dictation.stop}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          </div>
        )}
        {dictation.state.error && !dictation.state.isListening && (
          <p className="mb-2 text-xs text-muted-foreground" role="alert">
            {dictation.state.error}
          </p>
        )}
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
            placeholder={
              dictationSupported || voiceConvSupported
                ? "Ask Fleet Copilot…"
                : "Ask about your operation…"
            }
            aria-label="Ask Fleet Copilot"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {/* DICTATION mic — voice-to-text into the composer (NOT Voice Mode).
           *  Tooltip/aria: "Dictate message". Speech → editable text → Send. */}
          {dictationSupported && (
            <button
              type="button"
              onClick={dictation.toggle}
              title={
                dictation.state.isListening
                  ? "Stop dictation"
                  : "Dictate message"
              }
              aria-label={
                dictation.state.isListening
                  ? "Stop dictation"
                  : "Dictate message"
              }
              className={cn(
                "rounded-md p-2 transition-colors",
                dictation.state.isListening
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {dictation.state.isListening ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="rounded-md bg-primary p-2 text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
          {/* START VOICE CONVERSATION — a distinct, clearly labelled action that
           *  enters true conversational Voice Mode (NOT dictation). */}
          {voiceConvSupported && (
            <button
              type="button"
              onClick={voiceConv.startVoice}
              title="Start Voice Conversation"
              aria-label="Start Voice Conversation"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/8 px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <Headphones className="h-4 w-4" />
              <span className="hidden sm:inline">Voice</span>
            </button>
          )}
        </form>
        {/* Unsupported-voice hint when neither dictation nor Voice Conversation is available. */}
        {!dictationSupported && !voiceConvSupported && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MicOff className="h-3 w-3" /> Voice isn't available in this browser
            yet.
          </p>
        )}
      </div>
    </>
  );
}
