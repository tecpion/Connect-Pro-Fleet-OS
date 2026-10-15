// Connect Pro Fleet — Copilot Voice Mode (Build #38 / #39 / #40 True Voice).
//
// React context that owns the speech-recognition + speech-synthesis provider
// instances and exposes them through hooks. Production uses the browser-native
// adapters; tests inject deterministic mocks via CopilotVoiceProviderOverride.
//
// Voice settings (conversations on/off, dictation on/off, read-aloud on/off,
// auto-play off-by-default, speech preferences) are persisted to localStorage
// so they survive the session/refresh. A future production deployment may move
// these server-side.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { CopilotSpeechRecognitionProvider } from "./copilotVoiceSpeechRecognition";
import type { CopilotSpeechSynthesisProvider } from "./copilotVoiceSpeechSynthesis";
import {
  createBrowserSpeechRecognition,
  isSpeechRecognitionSupported,
} from "./copilotVoiceSpeechRecognition";
import {
  createBrowserSpeechSynthesis,
  isSpeechSynthesisSupported,
  type SpeechPreferences,
} from "./copilotVoiceSpeechSynthesis";
import { applyCopilotLlmRoutingFlag } from "./copilotLlmProvider";

export interface CopilotVoiceSettings {
  /** Build #39/#40 — enables the true Voice Conversation mode (auto-submit/speak). */
  voiceConversationsEnabled: boolean;
  /** Build #38/#40 — push-to-talk dictation mic in the text composer (separate
   *  from Voice Conversation). Dictation places speech into the composer for
   *  review/edit; it never auto-submits. */
  voiceInputEnabled: boolean;
  /** Build #38/#40 — optional Read aloud in Text Mode. Voice Mode always speaks. */
  readResponsesAloud: boolean;
  /** Build #38 — auto-play spoken responses in Text Mode (defaults OFF). */
  autoPlaySpokenResponses: boolean;
  /** Build #40 — speech preferences (voice, rate, pitch) for the synthesis provider. */
  speechPreferences: SpeechPreferences;
  /** Build #50 — internal LLM Copilot Routing feature flag. OFF by default.
   *  OFF = 100% existing deterministic behavior. ON with a mock provider =
   *  test LLM routing integration. ON with a production provider (later) =
   *  server-backed LLM. Not exposed as a normal customer-facing setting. */
  llmRoutingEnabled: boolean;
}

export const DEFAULT_SPEECH_PREFERENCES: SpeechPreferences = {
  voiceId: null,
  rate: 0.97,
  pitch: 1.0,
};

export const DEFAULT_VOICE_SETTINGS: CopilotVoiceSettings = {
  voiceConversationsEnabled: true,
  voiceInputEnabled: true,
  readResponsesAloud: true,
  autoPlaySpokenResponses: false,
  speechPreferences: { ...DEFAULT_SPEECH_PREFERENCES },
  llmRoutingEnabled: false,
};

const STORAGE_KEY = "cpf_copilot_voice_settings";

function loadSettings(): CopilotVoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CopilotVoiceSettings>;
    return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

function saveSettings(s: CopilotVoiceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota / privacy mode */
  }
}

interface VoiceContextValue {
  recognition: CopilotSpeechRecognitionProvider | null;
  synthesis: CopilotSpeechSynthesisProvider | null;
  settings: CopilotVoiceSettings;
  setSettings: (patch: Partial<CopilotVoiceSettings>) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

/** Factory hook used by the provider to construct (or accept an override for)
 *  the recognition provider. Kept as a function so tests can supply a mock. */
export function useRecognitionProvider(
  override: CopilotSpeechRecognitionProvider | null,
): CopilotSpeechRecognitionProvider | null {
  const ref = useRef<CopilotSpeechRecognitionProvider | null>(null);
  if (override) return override;
  if (ref.current === null) {
    ref.current = isSpeechRecognitionSupported()
      ? createBrowserSpeechRecognition()
      : null;
  }
  return ref.current;
}

export function useSynthesisProvider(
  override: CopilotSpeechSynthesisProvider | null,
): CopilotSpeechSynthesisProvider | null {
  const ref = useRef<CopilotSpeechSynthesisProvider | null>(null);
  if (override) return override;
  if (ref.current === null) {
    ref.current = isSpeechSynthesisSupported()
      ? createBrowserSpeechSynthesis()
      : null;
  }
  return ref.current;
}

export interface CopilotVoiceProviderProps {
  children: ReactNode;
  /** Test-only: inject a deterministic recognition provider. */
  recognitionOverride?: CopilotSpeechRecognitionProvider | null;
  /** Test-only: inject a deterministic synthesis provider. */
  synthesisOverride?: CopilotSpeechSynthesisProvider | null;
}

export function CopilotVoiceProvider({
  children,
  recognitionOverride = null,
  synthesisOverride = null,
}: CopilotVoiceProviderProps) {
  const recognition = useRecognitionProvider(recognitionOverride);
  const synthesis = useSynthesisProvider(synthesisOverride);
  const [settings, setSettingsState] = useState<CopilotVoiceSettings>(() =>
    loadSettings(),
  );

  // Build #51 — activate/deactivate the production LLM edge provider whenever
  // the internal feature flag changes. OFF (default) → deterministic provider,
  // 100% existing behavior. ON → edge provider (server-backed classification);
  // any edge failure returns null so resolveCopilotQueryAsync falls back to the
  // deterministic engine. The flag is NOT a customer-facing setting.
  useEffect(() => {
    let active = true;
    applyCopilotLlmRoutingFlag(settings.llmRoutingEnabled).then(() => {
      // no-op; provider state mutated in place. Guard avoids late activation
      // after unmount flips the flag back off.
      if (!active) applyCopilotLlmRoutingFlag(false);
    });
    return () => {
      active = false;
    };
  }, [settings.llmRoutingEnabled]);

  // Build #40 — push speech preferences (voice/rate/pitch) to the synthesis
  // provider whenever they change so the natural voice takes effect.
  useEffect(() => {
    if (!synthesis) return;
    synthesis.setPreferences(settings.speechPreferences);
  }, [synthesis, settings.speechPreferences]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      recognition,
      synthesis,
      settings,
      setSettings: (patch) => {
        setSettingsState((prev) => {
          const next: CopilotVoiceSettings = {
            ...prev,
            ...patch,
            speechPreferences: {
              ...prev.speechPreferences,
              ...(patch.speechPreferences ?? {}),
            },
          };
          saveSettings(next);
          return next;
        });
      },
    }),
    [recognition, synthesis, settings],
  );

  return (
    <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
  );
}

export function useCopilotVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    // Outside a provider (e.g. a unit test of the panel in isolation): degrade
    // gracefully — voice simply unavailable.
    return {
      recognition: null,
      synthesis: null,
      settings: { ...DEFAULT_VOICE_SETTINGS },
      setSettings: () => {},
    };
  }
  return ctx;
}

/** Returns the voice context when one exists above, or null otherwise. Used by
 *  the CopilotPanel wrapper to decide whether to inject its own provider (so a
 *  host page / test harness that already supplies a CopilotVoiceProvider with
 *  mock adapters is not shadowed by a second browser-native provider). */
export function useOptionalCopilotVoice(): VoiceContextValue | null {
  return useContext(VoiceContext);
}
