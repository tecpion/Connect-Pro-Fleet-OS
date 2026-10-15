// Connect Pro Fleet — Copilot Voice Mode (Build #38 / #39 True Voice).
//
// Speech-recognition provider abstraction. The browser starts listening ONLY
// after an explicit user action (mic button / "Start Voice"). There is no
// always-listening/background capture outside an active Voice Mode session.
// Audio is never persisted; the browser-native SpeechRecognition API
// transcribes in place and we keep only the final transcript text.
//
// The implementation is replaceable: a future production ServerSpeechToText
// provider would send audio through an approved secure endpoint (no client
// secrets). Only the browser-native adapter is wired here.
//
// Build #39 — lifecycle hardening for true conversational Voice Mode:
//  - Authoritative `desiredActive` flag: the provider knows whether the app
//    wants to be listening, so a natural `onend` (phrase complete) is distinct
//    from an explicit stop / dispose.
//  - Double-start guard: `.start()` is never called while recognition is
//    already active (the classic "recognition has already started" throw).
//  - `aborted` / `already-started` / `no-speech` are handled gracefully rather
//    than surfaced as fatal mic errors.
//  - `continuous` mode so a conversational session keeps listening turn after
//    turn (the hook still controls restart to prevent loops).
//  - A `lastFinalTranscript` snapshot + `finalSeq` counter so the hook can
//    detect "a brand-new final transcript just committed" exactly once.
//
// The provider is created via a factory so tests can inject a deterministic
// mock adapter (see copilotVoiceTestHarness.tsx). Production code calls
// createSpeechRecognition() which probes the browser environment safely.

export type SpeechPermissionState = "granted" | "denied" | "prompt" | "unknown";

/** A reason the recognition session ended (used by the hook to differentiate
 *  natural completion from explicit stop / failure). */
export type SpeechEndReason =
  "natural" | "explicit_stop" | "disposed" | "error";

export interface CopilotSpeechRecognitionProvider {
  /** Whether the browser exposes a usable SpeechRecognition API. */
  readonly supported: boolean;
  /** Current microphone permission state (best-effort). */
  readonly permissionState: SpeechPermissionState;
  /** True while actively capturing/transcribing. */
  readonly isListening: boolean;
  /** Final committed transcript for the CURRENT utterance (reset after
   *  consume). The hook reads this once per finalized utterance, then the
   *  buffer is cleared so the next phrase starts clean — no accumulation
   *  across utterances (spec §3, §5, §8). */
  readonly transcript: string;
  /** Live partial transcript while listening. */
  readonly interimTranscript: string;
  /** Human-readable error, if any. */
  readonly error: string | null;
  /** Monotonic counter bumped each time a NEW final transcript is committed.
   *  Lets the hook detect "a fresh utterance arrived" exactly once. */
  readonly finalSeq: number;
  /** Whether the app wants listening active (distinct from isListening). */
  readonly desiredActive: boolean;
  /** The reason the last session ended. */
  readonly endReason: SpeechEndReason | null;

  /** Explicitly request the microphone and begin listening. Resolves true if
   *  capture started (or was already started). Must be invoked from a user
   *  gesture (caller's job). Never throws for "already started". */
  startListening(): Promise<boolean>;
  /** Stop listening and commit the accumulated transcript. */
  stopListening(): void;
  /** Subscribe to state changes. Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
  /** Release any held resources (drawer closed / route change / unmount). */
  dispose(): void;
  /** Consume + clear the finalized transcript for the current utterance.
   *  Returns the committed text and resets the buffer so the next utterance
   *  begins clean (spec §5, §8 — one utterance → one submission, no
   *  accumulation across restarts). */
  consumeTranscript(): string;
}

/** Browser-native SpeechRecognition constructor candidates. */
function getBrowserCtor(): (new () => unknown) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => unknown;
    webkitSpeechRecognition?: new () => unknown;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether the current browser exposes a usable SpeechRecognition API. */
export function isSpeechRecognitionSupported(): boolean {
  return getBrowserCtor() !== null;
}

/** Human-readable, non-fatal recovery messages by error code. */
function messageForError(code: string): {
  error: string | null;
  denied: boolean;
} {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return {
      denied: true,
      error:
        "Microphone access is turned off. You can enable it in your browser settings or type your question instead.",
    };
  }
  // no-speech fires on any natural conversational pause or brief mic hiccup.
  // It is NOT a real error — treating it as one flashes a misleading "I didn't
  // catch that" error phase (looks like an interrupt blink) and cuts the user
  // off mid-utterance. Treat it as a non-fatal lifecycle event (like `aborted`):
  // no user-facing error, and the natural onend → resume-listening path handles
  // the silent restart. Any pending interim is still committed by onend so
  // partial speech is never lost (spec §6, §38).
  if (code === "no-speech") {
    return { denied: false, error: null };
  }
  if (code === "audio-capture") {
    return {
      denied: false,
      error: "No microphone was found. Try again or type instead.",
    };
  }
  if (code === "network") {
    return {
      denied: false,
      error:
        "Voice recognition couldn't connect. You can try again or continue typing.",
    };
  }
  // `aborted` is fired when WE call stop()/abort() — not a user-facing error.
  // `already-started` / `invalid-state` are lifecycle artifacts we suppress.
  if (
    code === "aborted" ||
    code === "already-started" ||
    code === "invalid-state"
  ) {
    return { denied: false, error: null };
  }
  return {
    denied: false,
    error: "Voice input hit an error. Try again or type instead.",
  };
}

/** Build the production browser-native adapter. Returns null when unsupported. */
export function createBrowserSpeechRecognition(): CopilotSpeechRecognitionProvider | null {
  const Ctor = getBrowserCtor();
  if (!Ctor) return null;

  const state = {
    supported: true,
    permissionState: "unknown" as SpeechPermissionState,
    isListening: false,
    transcript: "",
    interimTranscript: "",
    error: null as string | null,
    finalSeq: 0,
    desiredActive: false,
    endReason: null as SpeechEndReason | null,
  };
  const listeners = new Set<() => void>();
  let recognition: {
    start: () => void;
    stop: () => void;
    abort: () => void;
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((e: unknown) => void) | null;
    onerror: ((e: unknown) => void) | null;
    onend: (() => void) | null;
  } | null = null;
  // Authoritative "is the native recognizer running" flag — guards double-start.
  let nativeActive = false;
  let starting = false;
  // The index of the last final result we have already committed. The Web
  // Speech API re-delivers ALL results on every onresult event (including
  // already-finalized ones), so without tracking this we would re-commit the
  // same final segment on every event → duplicated transcript (spec §2 root
  // cause). Only results with index > lastFinalResultIndex are committed.
  let lastFinalResultIndex = -1;
  // The normalized text of the most recently committed final segment, used for
  // duplicate suppression within the same utterance (spec §4). Some engines
  // re-emit a near-identical final segment; we drop a substantially-identical
  // duplicate rather than appending it again.
  let lastCommittedNorm = "";

  function emit() {
    for (const l of listeners) l();
  }

  function set(patch: Partial<typeof state>) {
    Object.assign(state, patch);
    emit();
  }

  /** Normalize a transcript segment for duplicate comparison (spec §4):
   *  lowercase, trim, collapse repeated whitespace, normalize hyphenation
   *  (co-pilot → copilot), strip trailing punctuation. */
  function normalizeForCompare(text: string): string {
    return text
      .toLowerCase()
      .replace(/co-pilot/g, "copilot")
      .replace(/[.!?,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Commit a finalized speech segment to the current-utterance buffer.
   *  Duplicate-suppressed: a segment substantially identical to the
   *  immediately previous committed segment (same utterance) is dropped so
   *  the same spoken phrase is never appended repeatedly (spec §4, §5). */
  function commitFinal(text: string, resultIndex?: number) {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Track the highest final result index seen so we never re-commit a result
    // the engine re-delivers on a later onresult event.
    if (
      typeof resultIndex === "number" &&
      resultIndex <= lastFinalResultIndex
    ) {
      return;
    }
    const norm = normalizeForCompare(trimmed);
    // Duplicate suppression: if this segment is substantially identical to the
    // last committed segment within the same utterance, drop it.
    if (norm && norm === lastCommittedNorm) {
      if (typeof resultIndex === "number") lastFinalResultIndex = resultIndex;
      return;
    }
    lastCommittedNorm = norm;
    if (typeof resultIndex === "number") lastFinalResultIndex = resultIndex;
    // The transcript holds the CURRENT utterance only (not a running history).
    // Each finalized utterance is consumed once by the hook, then cleared.
    state.transcript = state.transcript
      ? `${state.transcript} ${trimmed}`
      : trimmed;
    state.finalSeq += 1;
  }

  function buildRecognition() {
    if (!Ctor) throw new Error("Speech recognition is unavailable");
    const r = new Ctor() as {
      start: () => void;
      stop: () => void;
      abort: () => void;
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: ((e: unknown) => void) | null;
      onerror: ((e: unknown) => void) | null;
      onend: (() => void) | null;
    };
    r.lang = "en-US";
    r.interimResults = true;
    // continuous=true so a conversational session keeps transcribing across
    // phrases; the hook still owns restart-after-end to prevent loops.
    r.continuous = true;
    r.onresult = (e: unknown) => {
      const event = e as {
        resultIndex?: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      };
      let interim = "";
      const results = event.results;
      const baseIndex = event.resultIndex ?? 0;
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          // Only commit final results we have NOT already committed. The Web
          // Speech API re-delivers all results on each event; without this
          // guard the same final segment is appended repeatedly → duplicated
          // transcript (spec §2 root cause). Pass the absolute index so
          // commitFinal can skip already-seen results.
          commitFinal(text, i);
        } else {
          interim += text;
        }
      }
      // NOTE: a per-utterance reset of the duplicate-suppression baseline is
      // NOT needed here. Fresh utterances start a brand-new recognition
      // session, and lastFinalResultIndex / lastCommittedNorm are already
      // reset to -1 / "" in onend, startListening, and consumeTranscript.
      // An earlier `baseIndex === 0` reset here was actively harmful: it
      // wiped the guard immediately after the first commit, so the re-delivered
      // final on the next event was committed AGAIN → duplicated transcript.
      set({ interimTranscript: interim });
    };
    r.onerror = (e: unknown) => {
      const event = e as { error?: string };
      const code = event.error ?? "unknown";
      const { error, denied } = messageForError(code);
      if (denied) {
        state.desiredActive = false;
        set({
          permissionState: "denied",
          error,
          isListening: false,
          endReason: "error",
        });
        nativeActive = false;
        return;
      }
      if (error) {
        set({ error, endReason: "error" });
      }
      // Non-fatal codes (aborted/already-started/no-speech/network) do not flip
      // desiredActive; the hook decides whether to recover.
    };
    r.onend = () => {
      nativeActive = false;
      starting = false;
      // DO NOT commit pending interim transcript on end (spec §3, §7). Interim
      // results are by definition NOT finalized speech. Previously this block
      // promoted any leftover interim to final on a natural end / no-speech,
      // which caused PARTIAL utterances (e.g. "hey copilot tell me about") to
      // be auto-submitted — Copilot couldn't resolve the fragment and spoke
      // "I couldn't determine which record", flashing the orb to speaking
      // (Interrupt button) and cutting the user off mid-utterance. Only results
      // the browser explicitly marked isFinal=true (committed in onresult) are
      // ever submitted. If the session ends with only interim, that speech was
      // never confirmed and is discarded; the hook resumes listening cleanly.
      lastFinalResultIndex = -1;
      lastCommittedNorm = "";
      const reason: SpeechEndReason =
        state.endReason === "error"
          ? "error"
          : state.desiredActive
            ? "natural"
            : "explicit_stop";
      set({
        isListening: false,
        interimTranscript: "",
        endReason: reason,
      });
    };
    return r;
  }

  return {
    get supported() {
      return state.supported;
    },
    get permissionState() {
      return state.permissionState;
    },
    get isListening() {
      return state.isListening;
    },
    get transcript() {
      return state.transcript;
    },
    get interimTranscript() {
      return state.interimTranscript;
    },
    get error() {
      return state.error;
    },
    get finalSeq() {
      return state.finalSeq;
    },
    get desiredActive() {
      return state.desiredActive;
    },
    get endReason() {
      return state.endReason;
    },
    startListening: () =>
      new Promise<boolean>((resolve) => {
        try {
          // Double-start guard: never call .start() while the native recognizer
          // is already running or mid-start (throws "already started").
          if (nativeActive || starting) {
            resolve(true);
            return;
          }
          if (!recognition) recognition = buildRecognition();
          state.desiredActive = true;
          state.endReason = null;
          state.error = null;
          // Each turn starts clean: clear the prior utterance buffer + the
          // per-utterance final-result tracking so a restarted recognition
          // session never re-emits the previous transcript (spec §8).
          state.transcript = "";
          lastFinalResultIndex = -1;
          lastCommittedNorm = "";
          starting = true;
          // Ask for permission state if the browser exposes it (best-effort).
          if (
            typeof navigator !== "undefined" &&
            navigator.permissions?.query
          ) {
            navigator.permissions
              .query({ name: "microphone" as PermissionName })
              .then((p) =>
                set({ permissionState: p.state as SpeechPermissionState }),
              )
              .catch(() => {});
          }
          recognition.start();
          nativeActive = true;
          starting = false;
          set({ isListening: true, interimTranscript: "" });
          resolve(true);
        } catch {
          starting = false;
          // "already started" lands here too — treat as already-listening.
          if (nativeActive) {
            resolve(true);
            return;
          }
          state.desiredActive = false;
          set({
            isListening: false,
            permissionState: "denied",
            endReason: "error",
            error:
              "Microphone access is turned off. You can enable it in your browser settings or type your question instead.",
          });
          resolve(false);
        }
      }),
    stopListening: () => {
      state.desiredActive = false;
      try {
        recognition?.stop();
      } catch {
        /* noop */
      }
      // If the native recognizer was already stopped, onend won't fire — flip
      // state ourselves so the hook sees the transition.
      if (nativeActive) {
        nativeActive = false;
      } else {
        set({
          isListening: false,
          interimTranscript: "",
          endReason: "explicit_stop",
        });
      }
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    dispose: () => {
      state.desiredActive = false;
      try {
        recognition?.abort();
      } catch {
        /* noop */
      }
      nativeActive = false;
      starting = false;
      recognition = null;
      set({ isListening: false, interimTranscript: "", endReason: "disposed" });
    },
    consumeTranscript: () => {
      // Return the finalized transcript for the current utterance and reset the
      // buffer so the next phrase starts clean (spec §5, §8). The hook calls
      // this exactly once per finalized utterance → one user message.
      const text = state.transcript;
      state.transcript = "";
      lastFinalResultIndex = -1;
      lastCommittedNorm = "";
      return text;
    },
  };
}
