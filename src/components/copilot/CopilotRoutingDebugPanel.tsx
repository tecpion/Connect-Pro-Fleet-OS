// Connect Pro Fleet — Copilot INTERNAL routing-debug panel (Build #53).
//
// A compact, collapsible "Routing Debug" section rendered under an assistant
// Copilot turn. INTERNAL / DEBUG only — completely hidden when the internal
// debug flag is OFF. It does NOT alter CopilotAnswer or routing; it only
// displays the routing-debug trace captured alongside the answer.
//
// Privacy: this component renders ONLY safe display labels. It never renders
// API keys, JWTs, Supabase secrets, internal database ids, full VINs, raw
// financial payloads, or unrestricted conversation context. The trace it
// receives (CopilotRoutingDebug) is built by copilotDebug.ts from safe labels
// only.

import { useState } from "react";
import { Bug, ChevronRight } from "lucide-react";
import type { CopilotRoutingDebug } from "@/lib/copilot/copilotDebug";
import { cn } from "@/lib/utils";

export function CopilotRoutingDebugPanel({
  debug,
}: {
  debug: CopilotRoutingDebug;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "mt-2 rounded-md border border-dashed border-border/70 bg-muted/20",
      )}
      data-testid="copilot-routing-debug"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
        aria-expanded={open}
      >
        <Bug className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Routing Debug
        </span>
        <span className="rounded-sm bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">
          Internal
        </span>
        <ChevronRight
          className={cn(
            "ml-auto h-3 w-3 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="space-y-1 border-t border-border/60 px-2.5 py-2">
          <Row label="Provider" value={providerLabel(debug)} />
          {debug.fallbackReason && (
            <Row label="Fallback reason" value={fallbackLabel(debug)} />
          )}
          {debug.normalizedQuery && (
            <Row label="Normalized" value={debug.normalizedQuery} />
          )}
          {debug.domain && <Row label="Domain" value={debug.domain} />}
          {debug.intent && <Row label="Intent" value={debug.intent} />}
          {debug.confidence != null && (
            <Row label="Confidence" value={debug.confidence.toFixed(2)} />
          )}
          {debug.scope && <Row label="Scope" value={debug.scope} />}
          {debug.requestType && (
            <Row label="Request type" value={debug.requestType} />
          )}
          {debug.timeRange && (
            <Row label="Time range" value={debug.timeRange} />
          )}
          {debug.entityHints.length > 0 && (
            <Row
              label="Entity hints"
              value={debug.entityHints
                .map((h) => `${h.type}: ${h.label}`)
                .join(", ")}
            />
          )}
          <Row
            label="Entity"
            value={
              debug.resolvedEntity
                ? `${debug.resolvedEntity.label} (${debug.resolvedEntity.resolution})`
                : "None"
            }
          />
          {debug.followUpContext?.priorIntent && (
            <Row
              label="Prior intent"
              value={debug.followUpContext.priorIntent}
            />
          )}
          {debug.followUpContext?.priorEntityLabel && (
            <Row
              label="Prior entity"
              value={debug.followUpContext.priorEntityLabel}
            />
          )}
          {debug.handler && <Row label="Handler" value={debug.handler} />}
          {debug.latencyMs != null && (
            <Row label="Latency" value={`${debug.latencyMs} ms`} />
          )}
        </div>
      )}
    </div>
  );
}

function providerLabel(debug: CopilotRoutingDebug): string {
  switch (debug.providerPath) {
    case "deterministic":
      return "Deterministic";
    case "llm":
      return "LLM";
    case "llm_fallback":
      return "LLM → deterministic fallback";
  }
}

function fallbackLabel(debug: CopilotRoutingDebug): string {
  switch (debug.fallbackReason) {
    case "provider_off":
      return "Provider off";
    case "low_confidence_or_invalid":
      return "Low confidence / invalid classification";
    case "provider_error":
      return "Provider error / timeout";
    case "dispatch_failure":
      return "Dispatch failure";
    default:
      return debug.fallbackReason ?? "Unknown";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="w-28 shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 break-words font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
