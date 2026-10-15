import { useEffect } from "react";
import { useStore } from "@/lib/store";
import type { ThemePreference } from "@/lib/types";

// Applies the per-user theme preference to the document root. Light/dark are
// explicit; "system" follows the device's prefers-color-scheme. The preference
// is stored on the staff record so each user keeps their own appearance.

// Brand color presets keyed by id. Each preset stores a hex value; the
// ThemeProvider derives the full primary token family from it so the whole
// workspace (buttons, nav active state, focus rings, accents) adopts the hue.
export interface BrandPreset {
  id: string;
  label: string;
  hex: string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  { id: "royal", label: "Royal Blue", hex: "#2251EA" },
  { id: "azure", label: "Azure", hex: "#0EA5E9" },
  { id: "emerald", label: "Emerald", hex: "#10B981" },
  { id: "violet", label: "Violet", hex: "#7C3AED" },
  { id: "amber", label: "Amber", hex: "#F59E0B" },
  { id: "rose", label: "Rose", hex: "#F43F5E" },
  { id: "slate", label: "Slate", hex: "#475569" },
];

// Convert a hex color to raw HSL channel values ("H S% L%"), the format the
// design system stores its tokens in (tailwind.config wraps with hsl()).
export function hexToHslChannels(hex: string): string {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return "";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  const H = Math.round(h * 360);
  const S = Math.round(s * 100);
  const L = Math.round(l * 100);
  return `${H} ${S}% ${L}%`;
}

// Derive a pressed (darker) and glow (lighter) variant from base HSL channels.
function shiftL(channels: string, delta: number): string {
  const [h, s, l] = channels.split(/\s+/);
  const newL = Math.max(0, Math.min(100, Number(l.replace("%", "")) + delta));
  return `${h} ${s} ${newL}%`;
}

const BRAND_TOKENS = [
  "--primary",
  "--primary-press",
  "--primary-glow",
  "--ring",
  "--nav-active",
  "--nav-active-glow",
  "--accent-foreground",
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { staff, currentStaffId } = useStore();

  useEffect(() => {
    const me = staff.find((s) => s.id === currentStaffId);
    const pref: ThemePreference = me?.theme ?? "light";
    const root = document.documentElement;

    const apply = (dark: boolean) => {
      root.classList.toggle("dark", dark);
    };

    if (pref === "dark") {
      apply(true);
      return;
    }
    if (pref === "light") {
      apply(false);
      return;
    }

    // system
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [staff, currentStaffId]);

  // Apply the per-user brand accent color. When set, remap the primary token
  // family so the entire workspace adopts the chosen hue. When null/invalid,
  // clear any previously injected overrides so the design-system defaults win.
  useEffect(() => {
    const me = staff.find((s) => s.id === currentStaffId);
    const hex = me?.brand_color ?? null;
    const root = document.documentElement;

    if (!hex) {
      BRAND_TOKENS.forEach((t) => root.style.removeProperty(t));
      return;
    }
    const base = hexToHslChannels(hex);
    if (!base) {
      BRAND_TOKENS.forEach((t) => root.style.removeProperty(t));
      return;
    }
    root.style.setProperty("--primary", base);
    root.style.setProperty("--primary-press", shiftL(base, -10));
    root.style.setProperty("--primary-glow", shiftL(base, 8));
    root.style.setProperty("--ring", base);
    root.style.setProperty("--nav-active", base);
    root.style.setProperty("--nav-active-glow", shiftL(base, 8));
    root.style.setProperty("--accent-foreground", shiftL(base, -14));
  }, [staff, currentStaffId]);

  return <>{children}</>;
}
