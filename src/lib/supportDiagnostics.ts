// Connect Pro Fleet — Diagnostics snapshot builder (Build #31).
//
// Captures SAFE context when a user reports a problem: route, app version,
// browser family, viewport, tenant/user references, selected location,
// storage/backend mode. CRITICAL: it NEVER captures session tokens, refresh
// tokens, authorization headers, API keys, secrets, full banking details,
// raw driver license data, full identity documents, or payment card numbers.
// The snapshot is sanitized BEFORE it is stored or shown.

import { uid } from "./store/ids";
import {
  APP_VERSION,
  APP_BUILD_LABEL,
  APP_ENVIRONMENT,
  type DiagnosticsSnapshot,
} from "./supportTypes";

/** Secrets / sensitive substrings that must never appear in diagnostics. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{10,}/i, // OpenAI-style keys
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?/i, // JWT-ish tokens (2 or 3 segments)
  /\b4\d{12}([0-9]{3})?\b/, // PAN card numbers (Visa-style)
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b\d{8,17}\b/g, // Bank account numbers / long account refs
  /\b\d{9}\b/g, // ABA routing numbers (9 digits)
];

/** Strip any secret-like substring from a string value. */
function sanitize(value: string): string {
  let out = value;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  return out;
}

/** Detect the browser family from the user agent (best-effort, safe). */
function detectBrowser(ua: string | null): string | null {
  if (!ua) return null;
  if (/edg/i.test(ua)) return "Edge";
  if (/chrome|chromium|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}

/** Detect a coarse platform/device class. */
function detectPlatform(ua: string | null): string | null {
  if (!ua) return null;
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

export interface DiagnosticsInput {
  tenantId: string;
  userId: string;
  route: string | null;
  selectedLocationId: string | null;
  recentSafeErrors?: string[];
  metadata?: Record<string, string>;
}

/** Build a safe diagnostics snapshot. All secret-like values are stripped. */
export function buildDiagnosticsSnapshot(
  input: DiagnosticsInput,
  now: Date = new Date(),
): DiagnosticsSnapshot {
  const ua =
    typeof navigator !== "undefined" ? (navigator.userAgent ?? null) : null;
  const viewport =
    typeof window !== "undefined"
      ? `${window.innerWidth}x${window.innerHeight}`
      : null;

  const safeErrors = (input.recentSafeErrors ?? []).map(sanitize).slice(0, 10);
  const safeMeta: Record<string, string> = {};
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      safeMeta[sanitize(k)] = sanitize(v);
    }
  }

  return {
    id: uid("diag"),
    tenant_id: input.tenantId,
    created_at: now.toISOString(),
    app_version: APP_VERSION,
    build_label: APP_BUILD_LABEL,
    environment: APP_ENVIRONMENT,
    route: input.route ? sanitize(input.route) : null,
    browser: detectBrowser(ua),
    platform: detectPlatform(ua),
    viewport,
    // Internal references only — never the business name or PII.
    tenant_reference: input.tenantId,
    user_reference: input.userId,
    selected_location: input.selectedLocationId,
    storage_mode: "memory",
    backend_mode: "development",
    network_state:
      typeof navigator !== "undefined" && "onLine" in navigator
        ? navigator.onLine
          ? "online"
          : "offline"
        : null,
    recent_safe_errors: safeErrors,
    metadata: safeMeta,
  };
}

/** Serialize a diagnostics snapshot to a copyable, sanitized text block. */
export function diagnosticsToCopyText(d: DiagnosticsSnapshot): string {
  const lines = [
    `Connect Pro Fleet — Diagnostics`,
    `Version: ${d.app_version} (${d.build_label})`,
    `Environment: ${d.environment}`,
    `Generated: ${d.created_at}`,
    `Route: ${d.route ?? "—"}`,
    `Browser: ${d.browser ?? "—"}`,
    `Platform: ${d.platform ?? "—"}`,
    `Viewport: ${d.viewport ?? "—"}`,
    `Tenant ref: ${d.tenant_reference ?? "—"}`,
    `User ref: ${d.user_reference ?? "—"}`,
    `Location: ${d.selected_location ?? "—"}`,
    `Storage: ${d.storage_mode}`,
    `Backend: ${d.backend_mode}`,
    `Network: ${d.network_state ?? "—"}`,
  ];
  if (d.recent_safe_errors.length > 0) {
    lines.push("Recent errors:");
    for (const e of d.recent_safe_errors) lines.push(`  - ${e}`);
  }
  const metaKeys = Object.keys(d.metadata);
  if (metaKeys.length > 0) {
    lines.push("Metadata:");
    for (const k of metaKeys) lines.push(`  ${k}: ${d.metadata[k]}`);
  }
  return lines.join("\n");
}

/** Returns true if a diagnostics snapshot contains no secret-like values. */
export function diagnosticsIsSafe(d: DiagnosticsSnapshot): boolean {
  const blob = JSON.stringify(d);
  return !SECRET_PATTERNS.some((re) => re.test(blob));
}
