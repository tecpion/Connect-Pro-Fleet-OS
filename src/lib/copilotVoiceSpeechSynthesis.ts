// Connect Pro Fleet — Copilot Voice Mode (Build #38 / #39 / #40 True Voice).
//
// Speech-synthesis (text-to-speech) provider abstraction. Reads the safe,
// user-facing spoken text aloud. The spoken text is ALWAYS produced by
// buildCopilotSpokenResponse (see copilotVoiceSpeech.ts) — never raw structured
// data, source IDs, URLs, or private metadata.
//
// V1 uses the browser-native SpeechSynthesis API when available; a future
// production provider could route through an approved server endpoint (neural
// TTS). The provider abstraction supports swapping in a secure server-backed
// provider without changing the conversational state machine.
//
// Build #40 — natural voice quality:
//  - Voice selection: inspects speechSynthesis.getVoices(), scores by language
//    match, locale, localService, and known enhanced-quality indicators, and
//    selects the best available English voice (never just voices[0]).
//  - Rate/pitch: tuned toward natural cadence (rate ~0.97, pitch ~1.0).
//  - Sentence chunking: long responses are split into natural sentence chunks
//    so pacing feels conversational rather than one giant robotic utterance.
//  - User voice choice: a curated subset of compatible voices is exposed for
//    settings; an explicit voiceId overrides the auto-selected default.

export interface SpeechVoice {
  /** Stable voice URI used as the id. */
  id: string;
  /** Human-friendly display name. */
  name: string;
  /** BCP-47 language tag (e.g. "en-US"). */
  lang: string;
  /** Whether the voice runs locally (on-device) vs. a network service. */
  localService: boolean;
  /** Best-effort "is this a premium/enhanced voice?" heuristic. */
  enhanced: boolean;
}

export interface SpeechPreferences {
  /** Override the auto-selected voice by URI; null = auto-select best. */
  voiceId: string | null;
  /** Speech rate (0.5–2.0); defaults to ~0.97 for natural cadence. */
  rate: number;
  /** Speech pitch (0–2.0); defaults to ~1.0. */
  pitch: number;
}

export const DEFAULT_SPEECH_PREFERENCES: SpeechPreferences = {
  voiceId: null,
  rate: 0.97,
  pitch: 1.0,
};

export interface CopilotSpeechSynthesisProvider {
  readonly supported: boolean;
  readonly speaking: boolean;
  /** Monotonic counter bumped each time a speak() begins. */
  readonly spokenSeq: number;
  /** True if the last stop was an explicit interrupt (not natural completion). */
  readonly interrupted: boolean;
  /** Curated, user-selectable voices (friendly labels). */
  readonly availableVoices: SpeechVoice[];
  /** Label of the currently selected voice (for display / diagnostics). */
  readonly selectedVoiceLabel: string;
  speak(text: string): void;
  stop(): void;
  pause(): void;
  resume(): void;
  subscribe(listener: () => void): () => void;
  /** Update voice/rate/pitch preferences at runtime. */
  setPreferences(prefs: Partial<SpeechPreferences>): void;
}

/** Whether the browser exposes a usable SpeechSynthesis API. */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Known enhanced / natural voice name fragments (best-effort heuristic). */
const ENHANCED_MARKERS = [
  "enhanced",
  "natural",
  "premium",
  "neural",
  "google",
  "siri",
  "aria",
  "jenny",
  "guy",
  "zira",
];

/** Score a voice for natural-voice selection (higher = preferred). */
function scoreVoice(v: SpeechVoice, targetLang: string): number {
  let score = 0;
  const lang = v.lang.toLowerCase();
  const target = targetLang.toLowerCase();
  // Exact locale match beats language-only match.
  if (lang === target) score += 100;
  else if (lang.startsWith(target.split("-")[0])) score += 50;
  // Local (on-device) voices are preferred — lower latency, more reliable.
  if (v.localService) score += 20;
  // Enhanced / natural / premium voices sound better.
  if (v.enhanced) score += 30;
  // Prefer common high-quality voice families.
  const name = v.name.toLowerCase();
  if (name.includes("samantha")) score += 5;
  if (name.includes("alex")) score += 3;
  return score;
}

/** Detect whether a voice name hints at enhanced/natural quality. */
function isEnhancedVoice(name: string): boolean {
  const n = name.toLowerCase();
  return ENHANCED_MARKERS.some((m) => n.includes(m));
}

/** Map a native SpeechSynthesisVoice to our SpeechVoice shape. */
function toSpeechVoice(v: {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}): SpeechVoice {
  return {
    id: v.voiceURI,
    name: v.name,
    lang: v.lang,
    localService: v.localService,
    enhanced: isEnhancedVoice(v.name),
  };
}

/** Pick the best available English voice from a list, or null if none. */
export function pickBestVoice(
  voices: SpeechVoice[],
  targetLang = "en-US",
): SpeechVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  if (pool.length === 0) return null;
  let best: SpeechVoice | null = null;
  let bestScore = -1;
  for (const v of pool) {
    const s = scoreVoice(v, targetLang);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

/** Split a spoken response into natural sentence chunks for better pacing.
 *  Splits on sentence terminators (., !, ?) and semicolons, keeping each chunk
 *  short enough for natural prosody. Merges tiny fragments. */
export function chunkSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Split on terminators while preserving them, then clean up.
  const parts = trimmed
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [trimmed];
  // Merge very short fragments (< 8 chars) into the previous chunk for flow.
  const merged: string[] = [];
  for (const p of parts) {
    if (merged.length > 0 && p.length < 8) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${p}`;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

/** Build the production browser-native speech-synthesis adapter. Returns null
 *  when unsupported. */
export function createBrowserSpeechSynthesis(): CopilotSpeechSynthesisProvider | null {
  if (!isSpeechSynthesisSupported()) return null;
  const synth = window.speechSynthesis;
  const state = {
    speaking: false,
    spokenSeq: 0,
    interrupted: false,
  };
  const prefs: SpeechPreferences = { ...DEFAULT_SPEECH_PREFERENCES };
  const listeners = new Set<() => void>();
  let voices: SpeechVoice[] = [];
  let selectedVoice: SpeechSynthesisVoice | null = null;
  // Track the current chunk queue so stop() cancels cleanly.
  let currentQueue: string[] = [];
  let queueIndex = 0;
  // Watchdog timers for the Chrome "dropped utterance" race + 15s pause bug.
  let startWatchdog: ReturnType<typeof setTimeout> | null = null;
  let resumeTimer: ReturnType<typeof setInterval> | null = null;
  // Guard against retrying the same dropped chunk forever.
  let retryingChunk = false;

  function emit() {
    for (const l of listeners) l();
  }

  function clearWatchdog() {
    if (startWatchdog !== null) {
      clearTimeout(startWatchdog);
      startWatchdog = null;
    }
  }

  function clearResumeTimer() {
    if (resumeTimer !== null) {
      clearInterval(resumeTimer);
      resumeTimer = null;
    }
  }

  /** Refresh the voice list from the browser (may load asynchronously). */
  function refreshVoices() {
    try {
      const native = synth.getVoices();
      if (native && native.length > 0) {
        voices = native.map(toSpeechVoice);
        resolveSelectedVoice();
      }
    } catch {
      /* voices unavailable in this environment */
    }
  }

  /** Resolve which native voice to use based on prefs + best-available. */
  function resolveSelectedVoice() {
    try {
      const native = synth.getVoices();
      if (!native || native.length === 0) {
        selectedVoice = null;
        return;
      }
      if (prefs.voiceId) {
        const match = native.find((v) => v.voiceURI === prefs.voiceId);
        if (match) {
          selectedVoice = match;
          return;
        }
      }
      // Auto-select the best English voice.
      const speechVoices = native.map(toSpeechVoice);
      const best = pickBestVoice(speechVoices);
      selectedVoice = best
        ? (native.find((v) => v.voiceURI === best.id) ?? null)
        : null;
    } catch {
      selectedVoice = null;
    }
  }

  // Load voices (they often arrive async via onvoiceschanged).
  refreshVoices();
  try {
    synth.onvoiceschanged = () => {
      refreshVoices();
      emit();
    };
  } catch {
    /* some environments don't support onvoiceschanged */
  }

  function finishSpeaking() {
    clearWatchdog();
    clearResumeTimer();
    state.speaking = false;
    state.interrupted = false;
    emit();
  }

  /** Speak the next chunk in the queue. Defends against Chrome silently
   *  dropping an utterance (the cancel→speak race) via a start watchdog. */
  function speakNext() {
    if (queueIndex >= currentQueue.length) {
      finishSpeaking();
      return;
    }
    // Lazily resolve the voice if it wasn't ready at construction time.
    if (!selectedVoice) resolveSelectedVoice();
    const chunk = currentQueue[queueIndex];
    const u = new SpeechSynthesisUtterance(chunk);
    // Apply the selected voice + natural rate/pitch.
    if (selectedVoice) {
      try {
        u.voice = selectedVoice;
      } catch {
        /* voice assignment may fail in some envs */
      }
    }
    u.rate = clamp(prefs.rate, 0.5, 2.0);
    u.pitch = clamp(prefs.pitch, 0, 2.0);
    u.lang = selectedVoice?.lang ?? "en-US";
    let started = false;
    u.onstart = () => {
      started = true;
      retryingChunk = false;
      clearWatchdog();
      state.speaking = true;
      emit();
    };
    u.onend = () => {
      clearWatchdog();
      clearResumeTimer();
      queueIndex += 1;
      // Continue to the next chunk (natural chaining).
      if (queueIndex < currentQueue.length) {
        speakNext();
      } else {
        finishSpeaking();
      }
    };
    u.onerror = () => {
      clearWatchdog();
      clearResumeTimer();
      // If the chunk never started (dropped by Chrome's cancel→speak race),
      // retry it ONCE on a fresh tick before giving up on it.
      if (!started && !retryingChunk) {
        retryingChunk = true;
        try {
          synth.cancel();
        } catch {
          /* noop */
        }
        setTimeout(speakNext, 0);
        return;
      }
      retryingChunk = false;
      // Skip to the next chunk on a hard error so the conversation never stalls.
      queueIndex += 1;
      if (queueIndex < currentQueue.length) {
        speakNext();
      } else {
        finishSpeaking();
      }
    };
    try {
      synth.speak(u);
      // Extra safety: some Chromium versions wake their audio thread when resume()
      // is pinged immediately after speak(), preventing silent drops.
      try {
        if (synth.paused) synth.resume();
      } catch {
        /* noop */
      }
    } catch {
      clearWatchdog();
      clearResumeTimer();
      state.speaking = false;
      emit();
      return;
    }
    // Watchdog: if onstart doesn't fire within 600ms, Chrome silently dropped
    // the utterance (the classic cancel→speak race). Retry once on a fresh
    // tick; if it still fails, advance so Voice Mode never stalls on
    // "Speaking…" with no audio.
    clearWatchdog();
    startWatchdog = setTimeout(() => {
      if (started) return;
      if (retryingChunk) {
        retryingChunk = false;
        queueIndex += 1;
        if (queueIndex < currentQueue.length) {
          speakNext();
        } else {
          finishSpeaking();
        }
        return;
      }
      retryingChunk = true;
      try {
        synth.cancel();
      } catch {
        /* noop */
      }
      setTimeout(speakNext, 0);
    }, 600);
    // Chrome pauses long utterances after ~15s; nudge resume() periodically as a
    // safety net while speaking.
    clearResumeTimer();
    resumeTimer = setInterval(() => {
      try {
        if (synth.speaking) synth.resume();
      } catch {
        /* noop */
      }
    }, 10000);
  }

  return {
    get supported() {
      return true;
    },
    get speaking() {
      return state.speaking;
    },
    get spokenSeq() {
      return state.spokenSeq;
    },
    get interrupted() {
      return state.interrupted;
    },
    get availableVoices() {
      // Curated: English voices only, deduplicated by name.
      const english = voices.filter((v) =>
        v.lang.toLowerCase().startsWith("en"),
      );
      const seen = new Set<string>();
      const curated: SpeechVoice[] = [];
      for (const v of english) {
        if (seen.has(v.name)) continue;
        seen.add(v.name);
        curated.push(v);
      }
      return curated;
    },
    get selectedVoiceLabel() {
      return selectedVoice?.name ?? "Default voice";
    },
    speak: (text: string) => {
      if (!text || !text.trim()) return;
      // Stop anything currently speaking (per spec: new question → stop prior).
      try {
        synth.cancel();
      } catch {
        /* noop */
      }
      clearWatchdog();
      clearResumeTimer();
      const chunks = chunkSentences(text);
      currentQueue = chunks;
      queueIndex = 0;
      retryingChunk = false;
      state.spokenSeq += 1;
      state.interrupted = false;
      state.speaking = true;
      emit();
      // CRITICAL FIX: defer the first speak() to the NEXT macrotask. Chrome's
      // speechSynthesis silently drops an utterance when cancel() and speak()
      // run in the same synchronous tick — onstart/onend never fire, so no audio
      // plays and `speaking` sticks on true (the orb freezes on "Speaking…").
      // Scheduling on a fresh tick lets Chrome clear its internal queue first.
      setTimeout(speakNext, 0);
    },
    stop: () => {
      clearWatchdog();
      clearResumeTimer();
      try {
        synth.cancel();
      } catch {
        /* noop */
      }
      if (state.speaking) {
        state.interrupted = true;
      }
      currentQueue = [];
      queueIndex = 0;
      retryingChunk = false;
      state.speaking = false;
      emit();
    },
    pause: () => {
      try {
        synth.pause();
      } catch {
        /* noop */
      }
    },
    resume: () => {
      try {
        synth.resume();
      } catch {
        /* noop */
      }
    },
    setPreferences: (patch: Partial<SpeechPreferences>) => {
      Object.assign(prefs, patch);
      resolveSelectedVoice();
      emit();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** Clamp a number to a range. */
function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
