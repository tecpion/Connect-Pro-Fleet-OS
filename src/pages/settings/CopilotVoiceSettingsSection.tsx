// Connect Pro Fleet — Copilot Voice settings (Build #40).
//
// A settings section for Copilot voice: Voice Conversations on/off, Read Aloud
// in Text Mode on/off, and speech preferences (voice selection, rate, pitch).
// Uses the existing CopilotVoiceContext settings + the synthesis provider's
// availableVoices/selectedVoiceLabel so voice/rate/pitch changes take effect.

import { SectionCard } from "@/components/ui-bits";
import { useCopilotVoice } from "@/lib/copilotVoiceContext";
import { cn } from "@/lib/utils";
import { Mic, Headphones, Volume2, Gauge } from "lucide-react";

export function CopilotVoiceSettingsSection() {
  const { settings, setSettings, synthesis } = useCopilotVoice();
  const voices = synthesis?.availableVoices ?? [];
  const selectedLabel = synthesis?.selectedVoiceLabel ?? "Default voice";
  const synthSupported = !!synthesis?.supported;

  return (
    <SectionCard
      title="Copilot Voice"
      icon={<Mic className="h-4 w-4 text-primary" />}
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Control how Fleet Copilot talks back. Voice Conversations are
          hands-free back-and-forth; dictation turns your speech into text in
          the composer; Read Aloud speaks answers in text chat.
        </p>

        {!synthSupported && (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Voice isn't available in this browser yet. You can still type
            questions normally.
          </p>
        )}

        {/* Voice Conversations toggle */}
        <ToggleRow
          icon={<Headphones className="h-4 w-4" />}
          label="Voice Conversations"
          description="Start a hands-free spoken conversation. Copilot listens, answers aloud, and listens again."
          checked={settings.voiceConversationsEnabled}
          onChange={(v) => setSettings({ voiceConversationsEnabled: v })}
        />

        {/* Dictation toggle */}
        <ToggleRow
          icon={<Mic className="h-4 w-4" />}
          label="Dictation"
          description="Tap the mic in the composer to dictate speech into text. You review and send it yourself."
          checked={settings.voiceInputEnabled}
          onChange={(v) => setSettings({ voiceInputEnabled: v })}
        />

        {/* Read Aloud toggle */}
        <ToggleRow
          icon={<Volume2 className="h-4 w-4" />}
          label="Read Aloud in Text Chat"
          description="Show a Read Aloud button on answers in text chat so you can hear them."
          checked={settings.readResponsesAloud}
          onChange={(v) => setSettings({ readResponsesAloud: v })}
        />

        {/* Speech preferences (voice / rate / pitch) */}
        {synthSupported && (
          <div className="space-y-4 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Spoken Voice
              </h3>
            </div>

            {/* Voice selection — curated subset */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Copilot Voice
              </label>
              {voices.length > 0 ? (
                <select
                  value={settings.speechPreferences.voiceId ?? ""}
                  onChange={(e) =>
                    setSettings({
                      speechPreferences: {
                        ...settings.speechPreferences,
                        voiceId: e.target.value || null,
                      },
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  aria-label="Copilot Voice"
                >
                  <option value="">Natural (auto-selected)</option>
                  {voices.slice(0, 12).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.enhanced ? " — enhanced" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Current: {selectedLabel}. No additional voices are available
                  in this browser.
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Using: {selectedLabel}
              </p>
            </div>

            {/* Speaking rate */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Speaking Rate
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={settings.speechPreferences.rate}
                  onChange={(e) =>
                    setSettings({
                      speechPreferences: {
                        ...settings.speechPreferences,
                        rate: Number(e.target.value),
                      },
                    })
                  }
                  className="flex-1"
                  aria-label="Speaking rate"
                />
                <span className="w-12 text-right text-xs text-muted-foreground">
                  {settings.speechPreferences.rate.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Pitch */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Pitch
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={settings.speechPreferences.pitch}
                  onChange={(e) =>
                    setSettings({
                      speechPreferences: {
                        ...settings.speechPreferences,
                        pitch: Number(e.target.value),
                      },
                    })
                  }
                  className="flex-1"
                  aria-label="Pitch"
                />
                <span className="w-12 text-right text-xs text-muted-foreground">
                  {settings.speechPreferences.pitch.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors",
        checked
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-surface hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            checked
              ? "bg-primary/15 text-primary"
              : "bg-muted/40 text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <span
        className={cn(
          "ml-3 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
