// Connect Pro Fleet — Copilot Voice Mode (Build #38).
//
// useCopilotVoiceInput: a hook binding the speech-recognition provider to the
// Copilot composer. Push-to-talk only — listening starts on an explicit user
// tap and stops on tap/Stop/dismissal. The final transcript is placed into the
// composer for review/edit BEFORE send (V1 never auto-executes from raw voice).
//
// The hook also handles:
//  - stop listening when the panel unmounts (audio capture must not persist).
//  - "interrupt": if the user starts listening while synthesis is speaking,
//    speech playback is stopped first (natural conversational turn-taking).
//  - safe no-op when recognition is unsupported.

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type RefObject,
} from "react";
import type {
  CopilotSpeechRecognitionProvider,
  SpeechPermissionState,
} from "./copilotVoiceSpeechRecognition";
import type { CopilotSpeechSynthesisProvider } from "./copilotVoiceSpeechSynthesis";
import type { CopilotVoiceSettings } from "./copilotVoiceContext";

export interface VoiceInputState {
  supported: boolean;
  isListening: boolean;
  interimTranscript: string;
  transcript: string;
  permissionState: SpeechPermissionState;
  error: string | null;
}

export function useCopilotVoiceInput(opts: {
  recognition: CopilotSpeechRecognitionProvider | null;
  synthesis: CopilotSpeechSynthesisProvider | null;
  settings: CopilotVoiceSettings;
  /** Called with the final transcript to drop into the composer. */
  onTranscript: (text: string) => void;
  /** A live ref whose `.current` is true while Voice Conversation Mode is
   *  active. While true, the dictation hook must NOT consume the recognition
   *  transcript — the voice-conversation hook owns the finalized utterance and
   *  auto-submits it. Without this guard both hooks subscribe to the same
   *  provider and the dictation hook steals the finalized transcript before
   *  Voice Mode can auto-submit (spec §5 — one utterance → one submission).
   *  A ref (not a boolean) is used so the value is read live at consume time,
   *  with no one-render lag. */
  disabledRef?: RefObject<boolean>;
}): {
  state: VoiceInputState;
  toggle: () => void;
  stop: () => void;
} {
  const { recognition, synthesis, settings, onTranscript, disabledRef } = opts;
  const [state, setState] = useState<VoiceInputState>(() => ({
    supported: !!recognition?.supported,
    isListening: false,
    interimTranscript: "",
    transcript: "",
    permissionState: recognition?.permissionState ?? "unknown",
    error: null,
  }));
  const lastTranscriptRef = useRef<string>("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  // Resolve the live disabled flag from the shared ref (Voice Mode active).
  // Read at consume time so there is no one-render lag.
  const isVoiceModeActive = () => !!disabledRef?.current;

  // Subscribe to the provider so UI reflects live state changes.
  useEffect(() => {
    if (!recognition) return;
    const unsub = recognition.subscribe(() => {
      setState({
        supported: recognition.supported,
        isListening: recognition.isListening,
        interimTranscript: recognition.interimTranscript,
        transcript: recognition.transcript,
        permissionState: recognition.permissionState,
        error: recognition.error,
      });
      // When Voice Conversation Mode is active, the dictation hook must NOT
      // consume the transcript — the voice-conversation hook owns the
      // finalized utterance and auto-submits it. Consuming here would steal
      // the buffer (clearing it) before Voice Mode can submit (spec §5).
      if (isVoiceModeActive()) return;
      // When listening stops with a new finalized transcript, consume it once
      // and drop it into the composer (dictation mode). consumeTranscript
      // clears the buffer so the same phrase is never appended repeatedly
      // (spec §2, §5 — one utterance → one composer population).
      const t = recognition.transcript;
      if (!recognition.isListening && t && t !== lastTranscriptRef.current) {
        lastTranscriptRef.current = t;
        onTranscriptRef.current(recognition.consumeTranscript());
      }
    });
    // Sync initial.
    setState({
      supported: recognition.supported,
      isListening: recognition.isListening,
      interimTranscript: recognition.interimTranscript,
      transcript: recognition.transcript,
      permissionState: recognition.permissionState,
      error: recognition.error,
    });
    return () => {
      unsub();
    };
  }, [recognition]);

  // CRITICAL: stop capture when the panel/owner unmounts (no background mic).
  useEffect(() => {
    return () => {
      recognition?.dispose();
    };
    // dispose on unmount only; recognition identity is stable for the panel's
    // lifetime (provided by the voice context).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    recognition?.stopListening();
  }, [recognition]);

  const toggle = useCallback(() => {
    if (!recognition || !recognition.supported) return;
    if (!settings.voiceInputEnabled) return;
    if (recognition.isListening) {
      recognition.stopListening();
      return;
    }
    // Interrupt any ongoing speech before listening (natural turn-taking).
    if (synthesis?.speaking) synthesis.stop();
    lastTranscriptRef.current = recognition.transcript;
    void recognition.startListening();
  }, [recognition, synthesis, settings.voiceInputEnabled]);

  return { state, toggle, stop };
}
