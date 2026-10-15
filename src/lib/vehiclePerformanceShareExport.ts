// Connect Pro Fleet — Vehicle Performance share card PNG export.
//
// Generates a PNG image of the shareable Performance Card using AUTHORITATIVE
// system data only (the ShareCard built from VehiclePerformance). No free-text
// overrides of financial amounts. Private metrics (financing, lender, JV split,
// investor payout, customer data) are NEVER included — only the metrics
// explicitly selected in Share View appear.
//
// Approach: render the card as an inline SVG (crisp text, correct tenant
// colors/logo), draw it onto a <canvas> via an Image, and export the canvas as
// a PNG blob download. No external image library — uses the browser's native
// canvas. Branded with tenant colors; "Powered by Connect Pro Fleet" shown by
// default and omitted entirely when the tenant is entitled and disables it.
//
// Browser limitation: SVG → canvas requires the SVG to be loaded as a data URL
// image. This works in all modern browsers but is blocked if the SVG references
// cross-origin images. Tenant logos are embedded as <image> with the logo URL;
// if a logo fails to load (CORS/missing), the card renders without it.

import type { ShareCard } from "./vehiclePerformanceComparison";
import { SHARE_CARD_METRIC_LABELS } from "./vehiclePerformanceComparison";
import { fmtMoney, fmtPct } from "./format";

/** Sanitize a vehicle label into a safe filename slug. */
export function shareCardFilename(card: ShareCard): string {
  const slug = card.vehicleLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `connect-pro-fleet-${slug || "vehicle"}-performance.png`;
}

/** Default tenant brand color (teal) used when brand colors are disabled or
 *  no explicit brand color is supplied. */
export const DEFAULT_BRAND_COLOR = "#0F6B5C";

interface RenderOptions {
  /** Tenant brand color hex (used when useBrandColors). */
  brandColor?: string;
  /** Tenant logo URL (used when useBusinessLogo). */
  logoUrl?: string | null;
  /** Tenant business name (shown under logo / as fallback). */
  businessName?: string;
}

/** Format a metric value for the card based on its key. */
function metricValue(card: ShareCard, key: string): string {
  switch (key) {
    case "grossRevenue":
      return fmtMoney(card.grossRevenue);
    case "cashCollected":
      return fmtMoney(card.cashCollected);
    case "totalExpenses":
      return fmtMoney(card.totalExpenses);
    case "netContribution":
      return fmtMoney(card.netContribution);
    case "purchasePrice":
      return fmtMoney(card.purchasePrice);
    case "lifetimeReturn":
      return card.lifetimeReturn == null ? "—" : fmtPct(card.lifetimeReturn);
    case "timeInFleet":
      return `${card.timeInFleetDays}d`;
    default:
      return "—";
  }
}

/** Build the SVG markup for the share card. */
function buildCardSvg(
  card: ShareCard,
  opts: RenderOptions,
  width = 640,
): string {
  const brand = opts.brandColor || DEFAULT_BRAND_COLOR;
  const showLogo = card.options.useBusinessLogo && opts.logoUrl;
  const showName =
    (card.options.useBusinessLogo || !opts.logoUrl) && !!opts.businessName;
  const metrics = card.options.metrics;

  // Gross Revenue is always the visual hero when included.
  const grossHero = metrics.includes("grossRevenue");
  const supporting = metrics.filter((m) => m !== "grossRevenue");

  const pad = 40;
  const heroHeight = grossHero ? 150 : 0;
  let y = pad + (showLogo || showName ? 50 : 0);

  const parts: string[] = [];
  parts.push(
    `<rect x="0" y="0" width="${width}" height="100" fill="${brand}" rx="0" ry="0"/>`,
  );

  // Header band: logo / business name.
  if (showLogo) {
    parts.push(
      `<image href="${escapeXml(opts.logoUrl!)}" x="${pad}" y="18" height="34" preserveAspectRatio="xMinYMid meet"/>`,
    );
  }
  if (showName) {
    parts.push(
      `<text x="${pad}" y="${showLogo ? 70 : 44}" font-family="Inter, sans-serif" font-size="18" font-weight="600" fill="#ffffff">${escapeXml(opts.businessName!)}</text>`,
    );
  }

  // Vehicle label + plate.
  y = 130;
  parts.push(
    `<text x="${pad}" y="${y}" font-family="Inter, sans-serif" font-size="22" font-weight="700" fill="#1B2430">${escapeXml(card.vehicleLabel)}</text>`,
  );
  if (card.plate) {
    parts.push(
      `<text x="${pad}" y="${y + 24}" font-family="ui-monospace, monospace" font-size="13" fill="#6b7280">${escapeXml(card.plate)}</text>`,
    );
  }

  y += 50;

  // Gross Revenue hero.
  if (grossHero) {
    parts.push(
      `<text x="${pad}" y="${y}" font-family="Inter, sans-serif" font-size="11" font-weight="600" letter-spacing="2" fill="${brand}">GROSS REVENUE GENERATED</text>`,
    );
    parts.push(
      `<text x="${pad}" y="${y + 48}" font-family="ui-monospace, monospace" font-size="52" font-weight="700" fill="${brand}">${escapeXml(fmtMoney(card.grossRevenue))}</text>`,
    );
    y += heroHeight;
  }

  // Supporting metrics in a 2-column grid.
  const colW = (width - pad * 2) / 2;
  const rowH = 56;
  for (let i = 0; i < supporting.length; i++) {
    const m = supporting[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = pad + col * colW;
    const ry = y + row * rowH;
    parts.push(
      `<text x="${x}" y="${ry}" font-family="Inter, sans-serif" font-size="11" font-weight="600" fill="#6b7280">${escapeXml(SHARE_CARD_METRIC_LABELS[m])}</text>`,
    );
    parts.push(
      `<text x="${x}" y="${ry + 22}" font-family="ui-monospace, monospace" font-size="20" font-weight="600" fill="#1B2430">${escapeXml(metricValue(card, m))}</text>`,
    );
  }
  const gridRows = Math.ceil(supporting.length / 2);
  y += gridRows * rowH + 20;

  // Footer: Powered by Connect Pro Fleet (only when shown).
  let height = y + (card.options.showConnectProBranding ? 40 : 20);
  // Ensure minimum height.
  height = Math.max(height, 360);

  // Branding footer.
  if (card.options.showConnectProBranding) {
    parts.push(
      `<rect x="0" y="${height - 36}" width="${width}" height="36" fill="#F2F4F3"/>`,
    );
    parts.push(
      `<text x="${width / 2}" y="${height - 13}" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#9ca3af">Powered by Connect Pro Fleet</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${parts.join("")}</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface ExportResult {
  ok: boolean;
  /** Error message when ok is false. */
  error?: string;
}

/**
 * Generate and download the share card PNG. Resolves when the download has
 * been triggered (or an error occurred). In jsdom/test environments without
 * canvas support, returns { ok: false, error } so callers can show a
 * recoverable error without crashing.
 */
export async function downloadShareCardPng(
  card: ShareCard,
  opts: RenderOptions = {},
): Promise<ExportResult> {
  // Guard: this requires a real browser DOM with canvas support. In jsdom/test
  // environments (no canvas 2D context), return a recoverable error instead of
  // crashing so the caller can surface a message and preserve Share View state.
  if (typeof document === "undefined") {
    return {
      ok: false,
      error: "Image export is not available in this environment.",
    };
  }
  try {
    const svg = buildCardSvg(card, opts);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.crossOrigin = "anonymous";

    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });

    if (!loaded) {
      URL.revokeObjectURL(url);
      return { ok: false, error: "Could not render the card image." };
    }

    const width = img.width || 640;
    const height = img.height || 400;
    const scale = 2; // crisp retina output
    const c = document.createElement("canvas");
    c.width = width * scale;
    c.height = height * scale;
    const ctx = c.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return { ok: false, error: "Canvas is not supported in this browser." };
    }
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);

    const pngBlob: Blob | null = await new Promise((resolve) =>
      c.toBlob((b) => resolve(b), "image/png"),
    );
    if (!pngBlob) {
      return { ok: false, error: "Could not generate the PNG." };
    }

    // Trigger download.
    const dlUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = shareCardFilename(card);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke on next tick so the download can start.
    setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown export error.";
    return { ok: false, error: msg };
  }
}
