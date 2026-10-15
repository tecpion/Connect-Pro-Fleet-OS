// Connect Pro Fleet — Telematics workspace page (V1).
//
// Primary operational workspace for GPS/telematics. Internal sections:
// Live Map · Alerts · Trips · Geofences · Devices. Org-scoped. Mock data only.
// No remote vehicle control (V1 = visibility/monitoring/history/alerts only).

import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { LiveMapTab } from "./LiveMapTab";
import { AlertsTab } from "./AlertsTab";
import { TripsTab } from "./TripsTab";
import { GeofencesTab } from "./GeofencesTab";
import { DevicesTab } from "./DevicesTab";
import { useTelematics } from "@/lib/store/telematicsStore";
import {
  MapPin,
  AlertTriangle,
  Route as TripIcon,
  Shapes,
  Cpu,
} from "lucide-react";
import { useCan } from "@/pages/settings/useCan";

type TabKey = "map" | "alerts" | "trips" | "geofences" | "devices";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "map", label: "Live Map", icon: <MapPin size={15} /> },
  { key: "alerts", label: "Alerts", icon: <AlertTriangle size={15} /> },
  { key: "trips", label: "Trips", icon: <TripIcon size={15} /> },
  { key: "geofences", label: "Geofences", icon: <Shapes size={15} /> },
  { key: "devices", label: "Devices", icon: <Cpu size={15} /> },
];

const VALID = new Set<TabKey>([
  "map",
  "alerts",
  "trips",
  "geofences",
  "devices",
]);

export default function Telematics() {
  const [searchParams] = useSearchParams();
  const t = useTelematics();
  const canView = useCan("telematics.view");

  const initial = (searchParams.get("tab") as TabKey) || "map";
  const [tab, setTab] = useState<TabKey>(VALID.has(initial) ? initial : "map");

  const counts = useMemo(() => {
    const newAlerts = t.alerts.filter((a) => a.status === "new").length;
    const offlineDevices = t.devices.filter(
      (d) => d.status === "offline" || d.status === "disconnected",
    ).length;
    return { newAlerts, offlineDevices };
  }, [t.alerts, t.devices]);

  if (!canView) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You do not have permission to view telematics.
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-7xl space-y-6 p-6"
      data-testid="telematics-page"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Telematics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fleet-wide GPS visibility, trips, geofences, devices & alerts.
            Provider-agnostic.
          </p>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{t.devices.length} devices</span>
          <span>·</span>
          <span>{counts.offlineDevices} offline</span>
          <span>·</span>
          <span>{counts.newAlerts} new alerts</span>
        </div>
      </header>

      <nav
        className="flex flex-wrap gap-1 border-b border-border pb-px"
        role="tablist"
        aria-label="Telematics sections"
      >
        {TABS.map((tb) => {
          const active = tab === tb.key;
          const badge =
            tb.key === "alerts" && counts.newAlerts > 0
              ? counts.newAlerts
              : tb.key === "devices" && counts.offlineDevices > 0
                ? counts.offlineDevices
                : null;
          return (
            <button
              key={tb.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tb.key)}
              className={
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {tb.icon}
              {tb.label}
              {badge != null && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-out px-1 text-[10px] font-semibold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main>
        {tab === "map" && <LiveMapTab />}
        {tab === "alerts" && <AlertsTab />}
        {tab === "trips" && (
          <TripsTab initialVehicleId={searchParams.get("vehicle")} />
        )}
        {tab === "geofences" && <GeofencesTab />}
        {tab === "devices" && <DevicesTab />}
      </main>
    </div>
  );
}
