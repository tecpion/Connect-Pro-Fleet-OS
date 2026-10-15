// Connect Pro Fleet — Copilot Voice Mode screen (Build #39 / #41).
//
// A distinct, premium conversational Voice Mode surface — NOT "text chat with a
// mic". A large central animated orb whose motion reflects the current phase
// (listening / thinking / speaking), the user's last spoken transcript, the
// spoken answer text, and a clear End Voice control.
//
// Build #41 — the separate Interrupt button was REMOVED. It caused a visible
// "blink": the control area swapped between two different elements (a Listening
// pill vs. an Interrupt button) every time the orb flipped to speaking — which
// happens whenever a partial transcript auto-submits and Copilot speaks a short
// response. That element-type swap (button ↔ div) remounts the node on every
// phase change, looking like the interrupt button flashing on/off and "cutting
// the user off". The control area is now ONE stable status pill whose label +
// icon change by phase but whose node identity never swaps — no blink. Barge-in
// is no longer a manual button; the conversational flow is speak → respond →
// resume listening.
//
// Mobile-first: full-screen on small viewports. Uses semantic design tokens
// only (no raw colors). Accessibility: all controls are labelled + focusable.

import { Mic, PhoneOff, AudioLines } from "lucide-react";
import type { VoiceConversationState } from "@/lib/useVoiceConversation";
import { cn } from "@/lib/utils";

interface VoiceModeScreenProps {
  state: VoiceConversationState;
  onEndVoice: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  idle: "Voice Mode",
  listening: "Listening…",
  submitting: "Submitting…",
  thinking: "Fleet Copilot is thinking…",
  speaking: "Speaking…",
  error: "Let's try that again",
};

export function VoiceModeScreen({ state, onEndVoice }: VoiceModeScreenProps) {
  const isListening = state.phase === "listening";
  const isSpeaking = state.phase === "speaking";
  const isThinking = state.phase === "thinking" || state.phase === "submitting";

  return (
    <div
      role="dialog"
      aria-label="Fleet Copilot Voice Mode"
      aria-live="polite"
      className="flex h-full w-full flex-col items-center justify-between bg-background px-4 py-6"
    >
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <AudioLines className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-foreground">
            Fleet Copilot Voice
          </span>
        </div>
        {state.error && (
          <span
            className="max-w-[55%] truncate text-xs text-muted-foreground"
            role="alert"
          >
            {state.error}
          </span>
        )}
      </div>

      {/* Orb + state */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
          {/* Outer pulse ring (listening) */}
          {isListening && (
            <>
              <span className="absolute h-full w-full animate-ping rounded-full bg-primary/20" />
              <span className="absolute h-[80%] w-[80%] animate-pulse rounded-full bg-primary/10" />
            </>
          )}
          {/* Speaking wave rings */}
          {isSpeaking && (
            <>
              <span className="absolute h-full w-full animate-ping rounded-full bg-primary/15" />
              <span className="absolute h-[70%] w-[70%] animate-pulse rounded-full bg-primary/20" />
            </>
          )}
          {/* Thinking spinner */}
          {isThinking && (
            <span className="absolute h-full w-full animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          )}
          {/* Core orb */}
          <span
            className={cn(
              "relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg transition-transform sm:h-28 sm:w-28",
              isListening && "scale-105",
              isSpeaking && "scale-110",
            )}
          >
            {isListening ? (
              <Mic className="h-9 w-9" />
            ) : isSpeaking ? (
              <AudioLines className="h-9 w-9" />
            ) : (
              <AudioLines className="h-9 w-9 opacity-80" />
            )}
          </span>
        </div>

        <div className="w-full max-w-md px-2 text-center">
          <p className="font-display text-lg font-semibold text-foreground">
            {PHASE_LABEL[state.phase] ?? state.status}
          </p>
          {state.lastUserTranscript && (
            <div className="mt-2 rounded-xl border border-border/70 bg-surface-2/60 px-3.5 py-2 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                You
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                “{state.lastUserTranscript}”
              </p>
            </div>
          )}
          {state.lastSpoken && (
            <div className="mt-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-left">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Copilot {isSpeaking && "· Speaking"}
                </p>
                {/* Fallback button in case browser audio was muted/blocked */}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (
                        typeof window !== "undefined" &&
                        "speechSynthesis" in window
                      ) {
                        window.speechSynthesis.cancel();
                        window.speechSynthesis.resume();
                        const u = new SpeechSynthesisUtterance(
                          state.lastSpoken ?? "",
                        );
                        u.rate = 1.0;
                        window.speechSynthesis.speak(u);
                      }
                    } catch {
                      /* noop */
                    }
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                  title="Play audio directly"
                >
                  🔊 Hear answer
                </button>
              </div>
              <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">
                {state.lastSpoken}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Controls — ONE stable status pill (no element-type swap = no blink) +
        End Voice. Build #41 removed the separate Interrupt button: it caused a
        visible blink by swapping the control node between a Listening pill and
        an Interrupt button every time the orb flipped to speaking. The pill
        below keeps a constant node identity; only its label + icon + tone change
        with the phase. */}
      <div className="flex w-full max-w-sm items-center justify-center gap-3">
        <div
          className={cn(
            "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors",
            isSpeaking
              ? "border-primary/30 bg-primary/8 text-primary"
              : isThinking
                ? "border-border bg-surface text-muted-foreground"
                : "border-primary/30 bg-primary/8 text-primary",
          )}
          aria-live="polite"
          aria-label={
            isSpeaking
              ? "Copilot is speaking"
              : isThinking
                ? "Copilot is thinking"
                : "Listening"
          }
        >
          {isSpeaking ? (
            <AudioLines className="h-4 w-4" />
          ) : isThinking ? (
            <AudioLines className="h-4 w-4 opacity-70" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {isSpeaking ? "Speaking" : isThinking ? "Thinking" : "Listening"}
        </div>
        <button
          type="button"
          onClick={onEndVoice}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-press"
          aria-label="End Voice"
        >
          <PhoneOff className="h-4 w-4" /> End Voice
        </button>
      </div>
    </div>
  );
}
