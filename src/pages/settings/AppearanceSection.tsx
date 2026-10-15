import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sun, Moon, Monitor, Check, Palette, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/types";
import { BRAND_PRESETS, hexToHslChannels } from "@/components/ThemeProvider";

export function AppearanceSection() {
  const {
    staff,
    currentStaffId,
    setUserTheme,
    setUserBrandColor,
    logSettingsChange,
  } = useStore();
  const me = staff.find((s) => s.id === currentStaffId);
  const current: ThemePreference = me?.theme ?? "light";
  const currentBrand = me?.brand_color ?? null;

  const options: {
    key: ThemePreference;
    label: string;
    icon: any;
    desc: string;
  }[] = [
    {
      key: "light",
      label: "Light",
      icon: Sun,
      desc: "Pale concrete canvas, charcoal structure.",
    },
    {
      key: "dark",
      label: "Dark",
      icon: Moon,
      desc: "Deep charcoal surfaces, readable muted text.",
    },
    {
      key: "system",
      label: "System",
      icon: Monitor,
      desc: "Follow your device preference.",
    },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Theme">
        <p className="text-sm text-muted-foreground">
          Choose how Connect Pro Fleet looks for you. Your preference is saved
          to your account and doesn't affect anyone else.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setUserTheme(currentStaffId, opt.key);
                logSettingsChange({
                  action: "Appearance changed",
                  new_value: opt.label,
                });
                toast.success(`Theme set to ${opt.label}.`);
              }}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                current === opt.key
                  ? "border-primary bg-primary/5"
                  : "border-border bg-surface hover:border-primary/40",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <opt.icon size={18} className="text-foreground" />
                {current === opt.key && (
                  <Check size={16} className="text-primary" />
                )}
              </div>
              <p className="font-display text-sm font-semibold text-foreground">
                {opt.label}
              </p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Brand Color">
        <p className="text-sm text-muted-foreground">
          Personalize the accent color used across buttons, active navigation,
          and focus rings. Your choice is saved to your account.
        </p>

        {/* Preset swatches */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Presets
          </p>
          <div className="flex flex-wrap gap-3">
            {BRAND_PRESETS.map((preset) => {
              const selected =
                currentBrand?.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setUserBrandColor(currentStaffId, preset.hex);
                    logSettingsChange({
                      action: "Brand color changed",
                      new_value: preset.label,
                    });
                    toast.success(`Brand color set to ${preset.label}.`);
                  }}
                  className={cn(
                    "group flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <span
                    className="relative flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface transition-shadow"
                    style={{
                      backgroundColor: preset.hex,
                      boxShadow: selected
                        ? `0 0 0 2px hsl(${hexToHslChannels(preset.hex)})`
                        : undefined,
                    }}
                  >
                    {selected && (
                      <Check size={16} className="text-white drop-shadow" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom color picker */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Custom
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              className="relative flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border"
              style={{
                backgroundColor: currentBrand ?? "hsl(var(--primary))",
              }}
              title="Open color picker"
            >
              <Palette size={16} className="text-white drop-shadow" />
              <input
                type="color"
                aria-label="Choose custom brand color"
                value={currentBrand ?? "#2251EA"}
                onChange={(e) => {
                  setUserBrandColor(currentStaffId, e.target.value);
                }}
                onBlur={(e) => {
                  logSettingsChange({
                    action: "Brand color changed",
                    new_value: e.target.value,
                  });
                  toast.success("Custom brand color applied.");
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {currentBrand
                  ? currentBrand.toUpperCase()
                  : "Default (Royal Blue)"}
              </span>
              <span className="text-xs text-muted-foreground">
                Click the swatch to pick any color.
              </span>
            </div>
            {currentBrand && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setUserBrandColor(currentStaffId, null);
                  logSettingsChange({
                    action: "Brand color reset",
                    new_value: "default",
                  });
                  toast.success("Brand color reset to default.");
                }}
              >
                <RotateCcw size={14} className="mr-1.5" /> Reset to Default
              </Button>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary-press"
              tabIndex={-1}
            >
              Primary Button
            </Button>
            <button
              type="button"
              tabIndex={-1}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-primary ring-2 ring-ring/40"
            >
              Active Link
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" /> Accent Badge
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
