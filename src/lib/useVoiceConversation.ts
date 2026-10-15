// Connect Pro Fleet — Copilot True Voice Conversation (Build #39 / #44).
//
// useVoiceConversation: the conversational Voice Mode state machine that sits
// ON TOP of the existing speech providers + the existing Copilot engine. It
// does NOT duplicate engine logic — it drives the SAME resolveCopilotQuery +
// buildCopilotSpokenResponse the typed panel uses.
//
// State machine (STRICT — only ONE phase active at a time):
//   idle → listening → (final transcript) → submitting → thinking → speaking
//        → listening  (repeat until End Voice)
//
// Build #44 — self-hearing / self-interruption fix:
//  The browser SpeechRecognition runs with continuous=true, so after a final
//  transcript commits the mic KEEPS listening. Previously submitTranscript()
//  only stopped SPEECH — it never stopped the MICROPHONE. While Copilot spoke
//  its answer, the still-open mic captured Copilot's own TTS output as a new
//  final transcript, which auto-submitted → stopSpeech() cut the response off
//  → a new response started → loop. This produced BOTH reported symptoms:
//   (a) the greeting/briefing repeating and cutting itself off ("blink"), and
//   (b) the apparent "intent lock" — Copilot kept answering its OWN echoed
//       speech instead of the user's real next question.
//  Fix: the mic is STOPPED the moment a final transcript is consumed, and is
//  only restarted AFTER the spoken response finishes naturally. While
//  processing/speaking, any final transcript that arrives is dropped (it is
//  almost certainly echo, not real user speech). This guarantees:
//    one spoken question → one user message → one Copilot response.
//
// Key behaviors:
//  - Auto-submit: when a NEW final transcript arrives in Voice Mode (while in
//    the LISTENING phase), it is submitted to the engine automatically.
//  - Auto-speak: Voice Mode ALWAYS speaks the answer aloud (entering Voice
//    Mode is consent). Text Mode keeps Read Aloud optional.
//  - Auto-listen-again: when speech finishes NATURALLY, resume listening.
//  - Mic-gated phases: the microphone is only active in the LISTENING phase.
//    It is stopped on submit and not restarted until speech ends.
//  - Double-start protection: never call startListening() while already active.
//  - Safe auto-restart: only restart recognition when Voice Mode is still
//    active, recognition is not active, nothing is speaking, no request is
//    processing, and permission remains valid. Prevents restart loops.
//  - No duplicate submission: each finalSeq is consumed exactly once, and only
//    when the machine is in the LISTENING phase (echo during speaking is dropped).
//  - End Voice: stop mic + stop speech + cancel recognition + prevent restart,
//    preserving the unified conversation history.
//  - Mic stops on unmount / panel close (no background recording).
//
// Conversation history is UNIFIED: voice turns are pushed into the same
// CopilotConversation the typed panel uses, so they persist after End Voice.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CopilotSpeechRecognitionProvider,
  SpeechEndReason,
} from "./copilotVoiceSpeechRecognition";
import type { CopilotSpeechSynthesisProvider } from "./copilotVoiceSpeechSynthesis";
import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotMessage,
} from "./copilotTypes";
import { nextMessageId } from "./copilotShared";

/** Re-read a provider's permission state as a union so TypeScript cannot narrow
 *  it after a prior `=== "denied"` comparison. Used after an async start where
 *  permission may have flipped to "denied" during the await. */
function isPermissionDenied(
  recognition: CopilotSpeechRecognitionProvider,
): boolean {
  return recognition.permissionState === "denied";
}

export type VoicePhase =
  "idle" | "listening" | "submitting" | "thinking" | "speaking" | "error";

export interface VoiceConversationState {
  phase: VoicePhase;
  /** True while a Voice Mode session is active (between Start Voice and End Voice). */
  active: boolean;
  /** The transcript of the user's most recent spoken turn (for display). */
  lastUserTranscript: string;
  /** The spoken text of the most recent answer (for display). */
  lastSpoken: string;
  /** Human-readable status message. */
  status: string;
  /** Whether voice is supported in this browser. */
  supported: boolean;
  /** A transient error message (recovery hint). */
  error: string | null;
}

export interface UseVoiceConversationOpts {
  recognition: CopilotSpeechRecognitionProvider | null;
  synthesis: CopilotSpeechSynthesisProvider | null;
  /** Resolve a query through the EXISTING Copilot engine. Build #50 — may now
   *  return a Promise<CopilotAnswer> (LLM routing is async). The state machine
   *  awaits it before speaking; the strict LISTENING → PROCESSING → SPEAKING →
   *  READY flow + self-hearing fix are unchanged. */
  resolveQuery: (
    query: string,
    conv: CopilotConversation,
  ) => CopilotAnswer | Promise<CopilotAnswer>;
  /** Build the safe spoken text from an answer (existing formatter). */
  buildSpoken: (answer: CopilotAnswer) => string;
  /** Current conversation (the same one the typed panel uses). */
  conversation: CopilotConversation;
  /** Append a user + assistant message pair to the shared conversation. */
  appendTurn: (userMsg: CopilotMessage, assistantMsg: CopilotMessage) => void;
  /** Whether Voice Conversations are enabled in settings (gates startVoice). */
  enabled?: boolean;
}

const STATUS: Record<VoicePhase, string> = {
  idle: "Voice Mode is off",
  listening: "Listening…",
  submitting: "Submitting…",
  thinking: "Fleet Copilot is thinking…",
  speaking: "Speaking…",
  error: "Something went wrong",
};

export function useVoiceConversation({
  recognition,
  synthesis,
  resolveQuery,
  buildSpoken,
  conversation,
  appendTurn,
  enabled = true,
}: UseVoiceConversationOpts) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [active, setActive] = useState(false);
  const [lastUserTranscript, setLastUserTranscript] = useState("");
  const [lastSpoken, setLastSpoken] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Refs mirror state so the provider subscription callback (stable) can read
  // the latest values without re-subscribing each render.
  const activeRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("idle");
  const processingRef = useRef(false);
  const lastConsumedFinalSeq = useRef(0);
  const lastConsumedSpokenSeq = useRef(0);
  const submittingRef = useRef(false);
  // CRITICAL: the recognition subscription effect only re-subscribes on
  // [recognition] (stable for the panel's lifetime). Without a ref, the
  // subscription callback would close over a STALE submitTranscript — which
  // closes over `conversation` (state). In the real browser the final
  // transcript arrives asynchronously, AFTER conversation state has changed
  // from a prior turn, so a stale closure resolves against the OLD
  // conversation (wrong context, wrong follow-up). The mock test harness
  // delivers the final transcript synchronously in the same render cycle, so
  // it never exposed this bug. submitTranscriptRef always holds the LATEST
  // submitTranscript so the stable subscription reads current state.
  // startListeningSafeRef / endVoiceRef / resumeListeningIfSafeRef follow the
  // same pattern for the other callbacks invoked from the stable
  // subscriptions.
  const submitTranscriptRef = useRef<(t: string) => void>(() => {});
  const startListeningSafeRef = useRef<() => Promise<boolean>>(
    async () => false,
  );
  const endVoiceRef = useRef<() => void>(() => {});
  const resumeListeningIfSafeRef = useRef<() => Promise<void>>(async () => {});

  // Keep refs in sync with state.
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const supported =
    !!recognition?.supported && !!synthesis?.supported && enabled;

  const setPhaseSafe = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  /** Stop speech playback (used for interrupt / end). */
  const stopSpeech = useCallback(() => {
    synthesis?.stop();
  }, [synthesis]);

  /** Begin listening, guarded against double-start + only when safe.
   *  Returns true if capture started (or was already active). */
  const startListeningSafe = useCallback(async (): Promise<boolean> => {
    if (!recognition || !recognition.supported) return false;
    if (!activeRef.current) return false; // Voice Mode ended.
    if (recognition.isListening) return true; // already active — no double-start.
    if (synthesis?.speaking) return false; // wait for speech to finish.
    if (processingRef.current) return false; // a turn is mid-flight.
    if (recognition.permissionState === "denied") return false;
    return recognition.startListening();
  }, [recognition, synthesis]);

  // Keep startListeningSafeRef current so the stable recognition subscription
  // always calls the latest guard logic (not a stale closure).
  useEffect(() => {
    startListeningSafeRef.current = startListeningSafe;
  }, [startListeningSafe]);

  /** Resume listening after speech ends naturally (safe auto-restart). */
  const resumeListeningIfSafe = useCallback(async () => {
    if (!activeRef.current) return;
    if (phaseRef.current !== "speaking") return;
    // Transition speaking → listening only on NATURAL completion.
    setPhaseSafe("listening");
    await startListeningSafe();
  }, [setPhaseSafe, startListeningSafe]);

  // Keep resumeListeningIfSafeRef current so the stable synthesis
  // subscription always calls the latest resume logic (not a stale closure).
  useEffect(() => {
    resumeListeningIfSafeRef.current = resumeListeningIfSafe;
  }, [resumeListeningIfSafe]);

  /** Submit a finalized transcript to the existing engine + auto-speak.
   *  Build #50 — async-aware: resolveQuery may return a Promise (LLM routing).
   *  The state machine still enforces LISTENING → PROCESSING → SPEAKING →
   *  READY; the mic stays stopped while the async resolution + speech run so
   *  Copilot never hears itself. */
  const submitTranscript = useCallback(
    async (transcript: string) => {
      const query = transcript.trim();
      if (!query) return;
      if (submittingRef.current) return; // no duplicate submission.
      submittingRef.current = true;
      processingRef.current = true;
      setLastUserTranscript(query);
      setError(null);
      setPhaseSafe("submitting");

      // Build #44 — STOP THE MICROPHONE the moment a final transcript is
      // consumed. The browser SpeechRecognition runs continuous=true, so
      // without this the mic stays open while Copilot processes + speaks,
      // capturing Copilot's OWN TTS output as new final transcripts →
      // auto-submit → stopSpeech() cuts the response off → loop (the
      // self-hearing "blink" + apparent intent-lock). Stopping the mic here
      // enforces the strict LISTENING → PROCESSING → SPEAKING → READY flow:
      // the mic is only live again after the spoken response finishes
      // naturally (resumeListeningIfSafe). This is the PRIMARY fix.
      recognition?.stopListening();
      // Stop any in-flight speech before a new turn.
      stopSpeech();

      const userMsg: CopilotMessage = {
        id: nextMessageId(),
        role: "user",
        content: query,
        created_at: new Date().toISOString(),
        status: "complete",
      };

      // Build #50 — resolve through the SAME engine the typed panel uses, now
      // awaitable (LLM routing). The mic is already stopped, so Copilot cannot
      // hear itself during the async resolution.
      let answer: CopilotAnswer;
      try {
        answer = await resolveQuery(query, conversation);
      } catch {
        // Resolution failure → deterministic-style fallback, keep the state
        // machine moving so the user is never stuck in "thinking".
        submittingRef.current = false;
        processingRef.current = false;
        setPhaseSafe("listening");
        void startListeningSafe();
        return;
      }
      const spoken = buildSpoken(answer);
      const assistantMsg: CopilotMessage = {
        id: nextMessageId(),
        role: "assistant",
        content: answer.summary,
        created_at: new Date().toISOString(),
        status: "complete",
        answer_type: answer.answer_type,
        intent: answer.intent,
        sources: answer.sources,
        suggested_actions: answer.suggested_actions,
        answer,
        feedback: null,
      };

      // Push the turn into the SHARED conversation (unified history).
      appendTurn(userMsg, assistantMsg);

      setPhaseSafe("thinking");
      // Brief beat so the "thinking" state is perceptible, then speak.
      window.setTimeout(() => {
        setLastSpoken(spoken);
        setPhaseSafe("speaking");
        if (synthesis?.supported) {
          synthesis.speak(spoken);
        }
        submittingRef.current = false;
        // If synthesis is unsupported, fall straight back to listening.
        if (!synthesis?.supported) {
          processingRef.current = false;
          setPhaseSafe("listening");
          void startListeningSafe();
        }
      }, 120);
    },
    [
      appendTurn,
      buildSpoken,
      conversation,
      recognition,
      resolveQuery,
      setPhaseSafe,
      startListeningSafe,
      stopSpeech,
      synthesis,
    ],
  );

  // Keep submitTranscriptRef pointing at the LATEST submitTranscript so the
  // stable recognition subscription (which only re-subscribes on
  // [recognition]) always calls the current closure — not a stale one that
  // captured an outdated `conversation`. This is the root cause of the
  // real-browser voice bug: the final transcript arrives asynchronously,
  // after conversation state changed, so a stale closure resolved against
  // the old conversation (wrong context / wrong follow-up answer).
  useEffect(() => {
    submitTranscriptRef.current = submitTranscript;
  }, [submitTranscript]);

  // ---- Subscribe to the recognition provider (stable callback) ----
  useEffect(() => {
    if (!recognition) return;
    const unsub = recognition.subscribe(() => {
      // A NEW final transcript arrived → auto-submit (Voice Mode only).
      // Use consumeTranscript() so we read the CURRENT utterance and clear the
      // buffer in one atomic step — the next phrase starts clean and the same
      // spoken phrase is never appended repeatedly (spec §2, §5, §8). This is
      // the one-utterance → one-submission boundary. Call through the ref so
      // we always use the LATEST submitTranscript (current conversation).
      //
      // Build #44 — ONLY accept a final transcript while the state machine is
      // in the LISTENING phase. If we are submitting/thinking/speaking, any
      // final transcript is almost certainly Copilot's OWN speech being picked
      // up by the still-open mic (echo), NOT a real user turn. Dropping it here
      // is the second line of defense (the mic is also stopped on submit, but
      // a final segment can arrive in the gap between commit and stop). This
      // prevents the self-hearing loop that made the greeting/briefing repeat
      // and cut itself off.
      if (
        activeRef.current &&
        phaseRef.current === "listening" &&
        recognition.finalSeq > lastConsumedFinalSeq.current &&
        recognition.transcript
      ) {
        lastConsumedFinalSeq.current = recognition.finalSeq;
        const transcript = recognition.consumeTranscript();
        if (transcript) {
          void submitTranscriptRef.current(transcript);
        }
      }
      // Permission denied during an active session → exit Voice Mode safely.
      if (recognition.permissionState === "denied" && activeRef.current) {
        endVoiceRef.current();
        return;
      }
      // Natural end (phrase complete) with no new final transcript yet →
      // resume listening so the conversational session continues turn after
      // turn. Guarded: only when still active, not processing/speaking, and
      // the session truly ended naturally (not an explicit stop / dispose).
      if (
        activeRef.current &&
        !processingRef.current &&
        !synthesis?.speaking &&
        recognition.endReason === "natural" &&
        phaseRef.current === "listening"
      ) {
        void startListeningSafeRef.current();
      }
      // Transient error recovery: show a hint, then resume listening if still
      // active and nothing is processing.
      if (recognition.error && activeRef.current && !processingRef.current) {
        setError(recognition.error);
        setPhaseSafe("error");
        // Brief beat, then return to listening.
        window.setTimeout(() => {
          if (activeRef.current) {
            setError(null);
            setPhaseSafe("listening");
            void startListeningSafeRef.current();
          }
        }, 800);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognition, synthesis]);

  // ---- Subscribe to the synthesis provider (natural completion → listen) ----
  useEffect(() => {
    if (!synthesis) return;
    const unsub = synthesis.subscribe(() => {
      if (!activeRef.current) return;
      // A NEW speak began → mark speaking.
      if (synthesis.spokenSeq > lastConsumedSpokenSeq.current) {
        lastConsumedSpokenSeq.current = synthesis.spokenSeq;
        setPhaseSafe("speaking");
        return;
      }
      // Speaking stopped.
      if (!synthesis.speaking && phaseRef.current === "speaking") {
        if (synthesis.interrupted) {
          // User interrupted (barge-in) — do not auto-resume from here; the
          // interrupt path already started listening.
          processingRef.current = false;
          return;
        }
        // Natural completion → resume listening. Call through the ref so we
        // use the LATEST startListeningSafe (not a stale closure captured
        // when this subscription was created).
        processingRef.current = false;
        void resumeListeningIfSafeRef.current();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesis]);

  /** Barge-in: user starts speaking (or taps mic) while Copilot is speaking. */
  const interrupt = useCallback(() => {
    if (synthesis?.speaking) synthesis.stop();
    processingRef.current = false;
    submittingRef.current = false;
    setPhaseSafe("listening");
    void startListeningSafe();
  }, [synthesis, setPhaseSafe, startListeningSafe]);

  /** End the Voice Mode session: stop mic + speech, prevent restart. */
  const endVoice = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    processingRef.current = false;
    submittingRef.current = false;
    stopSpeech();
    recognition?.stopListening();
    setPhaseSafe("idle");
  }, [recognition, stopSpeech, setPhaseSafe]);

  // Keep endVoiceRef current so the stable recognition subscription always
  // calls the latest endVoice (permission-denied exit path).
  useEffect(() => {
    endVoiceRef.current = endVoice;
  }, [endVoice]);

  /** Start a Voice Mode session (must be called from a user gesture). */
  const startVoice = useCallback(async () => {
    if (!supported) return;
    if (activeRef.current) return;
    if (!recognition) return;
    if (recognition.permissionState === "denied") {
      setError(
        "Microphone access is turned off. You can enable it in your browser settings or type your question instead.",
      );
      return;
    }
    setActive(true);
    activeRef.current = true;
    setError(null);
    setLastUserTranscript("");
    setLastSpoken("");
    lastConsumedFinalSeq.current = recognition.finalSeq;
    lastConsumedSpokenSeq.current = synthesis?.spokenSeq ?? 0;
    setPhaseSafe("listening");
    const ok = await startListeningSafe();
    if (
      !ok &&
      // Re-read permission through the boolean helper to avoid TS narrowing the
      // property; permission may flip to "denied" during the async start.
      isPermissionDenied(recognition)
    ) {
      // Permission was denied during start — exit Voice Mode safely.
      endVoice();
    }
  }, [
    supported,
    recognition,
    synthesis,
    setPhaseSafe,
    startListeningSafe,
    endVoice,
  ]);

  // CRITICAL: stop everything when the host unmounts / panel closes.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      synthesis?.stop();
      recognition?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state: VoiceConversationState = {
    phase,
    active,
    lastUserTranscript,
    lastSpoken,
    status: STATUS[phase],
    supported,
    error,
  };

  return {
    state,
    startVoice,
    endVoice,
    interrupt,
    stopSpeech,
    /** The live active-state ref (set synchronously in startVoice/endVoice).
     *  Exposed so sibling hooks (dictation) can read the current Voice Mode
     *  state without a stale closure or one-render lag. */
    activeRef,
  };
}
