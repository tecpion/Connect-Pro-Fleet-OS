// Connect Pro Fleet — Integrations: Telematics Providers section (V1).
//
// Mock provider cards (Advantage GPS, SVR, Custom) showing connection state,
// capabilities, and device counts. NO real credentials, NO live connections,
// NO provider API calls. The cards render the provider-agnostic capability
// surface from the telematics adapters so the UI hides/mark unsupported
// features. Production devs later wire real authentication here.

import { useTelematicsOptional } from "@/lib/store/telematicsStore";
import { TELEMATICS_PROVIDER_LABELS } from "@/lib/telematicsTypes";
import type { TelematicsProviderAdapter } from "@/lib/telematicsTypes";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { CapList } from "@/pages/telematics/TelematicsPrimitives";
import { Satellite, Check, X, Plug } from "lucide-react";

/** A connection-state pill for a mock provider. */
function ConnectionState({ adapter }: { adapter: TelematicsProviderAdapter }) {
  // Mock connection state: "connected" if the adapter says so, else "not
  // connected". We never claim a live sync or surface credentials.
  const tone = adapter.connected ? "available" : "neutral";
  const label = adapter.connected ? "Connected" : "Not connected";
  return <StatusPill tone={tone as never}>{label}</StatusPill>;
}

export function TelematicsProvidersSection() {
  // Optional so older Integrations test harnesses that predate V1 Telematics
  // still render the rest of Integrations without crashing.
  const tele = useTelematicsOptional();
  const adapters = tele?.adapters ?? [];

  return (
    <SectionCard
      title="Telematics Providers"
      right={<span className="text-xs text-muted-foreground">Mock mode</span>}
      data-testid="telematics-providers-section"
    >
      <p className="mb-4 text-sm text-muted-foreground">
        GPS / telematics providers supply normalized position, trip, and alert
        data. Fleet OS owns the experience. No live credentials are stored —
        configuration is mock only until a production provider is connected.
      </p>

      {adapters.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <Plug size={18} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No telematics providers available.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {adapters.map((adapter) => {
            const deviceCount = tele
              ? tele.devices.filter((d) => d.provider === adapter.provider)
                  .length
              : 0;
            return (
              <div
                key={adapter.provider}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
                data-testid={`telematics-provider-card-${adapter.provider}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                      <Satellite size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {TELEMATICS_PROVIDER_LABELS[adapter.provider]}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {deviceCount} device{deviceCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <ConnectionState adapter={adapter} />
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Capabilities
                  </p>
                  <CapList adapter={adapter} compact />
                </div>

                <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {adapter.connected ? (
                      <Check size={11} className="text-status-available" />
                    ) : (
                      <X size={11} />
                    )}
                    {adapter.connected
                      ? "Domain contract active"
                      : "Not configured"}
                  </span>
                  <span>Mock mode — no live sync</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Production configuration (account identifier, credentials, webhook
        status, real last sync) is added by a developer later — no credentials
        exist in the frontend.
      </p>
    </SectionCard>
  );
}
