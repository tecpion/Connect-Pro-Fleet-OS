// Connect Pro Fleet — Copilot Voice dev diagnostics (Build #40).
//
// DEVELOPMENT ONLY. Shows the live state of the voice subsystems so engineers
// can debug the conversational state machine, recognition lifecycle, synthesis
// voice selection, and auto-submit/auto-speak wiring. This is NEVER rendered
// in production — it is gated behind an explicit dev flag (localStorage
// `cpf_dev_voice_diag` = "1") so it cannot leak to end users.

import { useEffect, useState } from "react";
import { useCopilotVoice } from "@/lib/copilotVoiceContext";
import { cn } from "@/lib/utils";

export function isVoiceDevDiagnosticsEnabled(): boolean {
  try {
    return localStorage.getItem("cpf_dev_voice_diag") === "1";
  } catch {
    return false;
  }
}

export function CopilotVoiceDevDiagnostics() {
  const { recognition, synthesis, settings } = useCopilotVoice();
  const [enabled, setEnabled] = useState(false);
  const [tick, setTick] = useState(0);

  // Re-read the dev flag + subscribe to provider state so the panel updates.
  useEffect(() => {
    setEnabled(isVoiceDevDiagnosticsEnabled());
    const interval = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to provider state changes so the panel reflects live values.
  useEffect(() => {
    const unsubR = recognition?.subscribe(() => setTick((t) => t + 1));
    const unsubS = synthesis?.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsubR?.();
      unsubS?.();
    };
  }, [recognition, synthesis]);

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  tick; // re-render trigger

  if (!enabled) return null;

  const rows: { label: string; value: string }[] = [
    {
      label: "Recognition supported",
      value: String(recognition?.supported ?? false),
    },
    {
      label: "Recognition listening",
      value: String(recognition?.isListening ?? false),
    },
    {
      label: "Recognition desiredActive",
      value: String(recognition?.desiredActive ?? false),
    },
    {
      label: "Recognition permission",
      value: recognition?.permissionState ?? "n/a",
    },
    {
      label: "Recognition endReason",
      value: recognition?.endReason ?? "n/a",
    },
    {
      label: "Recognition finalSeq",
      value: String(recognition?.finalSeq ?? 0),
    },
    {
      label: "Recognition transcript",
      value: recognition?.transcript?.slice(0, 80) ?? "",
    },
    {
      label: "Recognition interim",
      value: recognition?.interimTranscript?.slice(0, 80) ?? "",
    },
    {
      label: "Recognition error",
      value: recognition?.error ?? "—",
    },
    {
      label: "Synthesis supported",
      value: String(synthesis?.supported ?? false),
    },
    {
      label: "Synthesis speaking",
      value: String(synthesis?.speaking ?? false),
    },
    {
      label: "Synthesis spokenSeq",
      value: String(synthesis?.spokenSeq ?? 0),
    },
    {
      label: "Synthesis interrupted",
      value: String(synthesis?.interrupted ?? false),
    },
    {
      label: "Selected TTS voice",
      value: synthesis?.selectedVoiceLabel ?? "n/a",
    },
    {
      label: "Available voices",
      value: String(synthesis?.availableVoices.length ?? 0),
    },
    {
      label: "Voice Conversations enabled",
      value: String(settings.voiceConversationsEnabled),
    },
    {
      label: "Dictation enabled",
      value: String(settings.voiceInputEnabled),
    },
    {
      label: "Read Aloud enabled",
      value: String(settings.readResponsesAloud),
    },
    {
      label: "Speech rate",
      value: settings.speechPreferences.rate.toFixed(2),
    },
    {
      label: "Speech pitch",
      value: settings.speechPreferences.pitch.toFixed(2),
    },
    {
      label: "Voice ID override",
      value: settings.speechPreferences.voiceId ?? "auto",
    },
  ];

  return (
    <div
      className="fixed bottom-2 right-2 z-[9999] w-72 max-h-[60vh] overflow-y-auto rounded-lg border border-amber-500/40 bg-amber-50/95 p-3 text-[11px] text-amber-900 shadow-lg dark:bg-amber-950/95 dark:text-amber-100"
      aria-hidden="true"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Voice Dev Diagnostics</span>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem("cpf_dev_voice_diag");
            } catch {
              /* noop */
            }
            setEnabled(false);
          }}
          className="text-amber-700 hover:text-amber-900 dark:text-amber-300"
        >
          ✕
        </button>
      </div>
      <dl className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <dt className="shrink-0 font-medium">{r.label}</dt>
            <dd className={cn("truncate text-right", !r.value && "opacity-50")}>
              {r.value || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
