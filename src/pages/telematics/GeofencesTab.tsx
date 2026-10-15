// Connect Pro Fleet — Telematics Geofences tab (V1).
//
// Fleet-owned geofence UX using mock coordinates. Types: allowed, restricted,
// lot, airport, service, custom. Applies-to: all vehicles / class / selected.
// alert_on_enter / alert_on_exit. Org-scoped. No provider geofence API.

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import type { Geofence } from "@/lib/telematicsTypes";
import type { Vehicle } from "@/lib/types";
import { fmtDateOnly } from "@/lib/format";
import { useCan } from "@/pages/settings/useCan";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  ShieldCheck,
  Ban,
  Home,
  Plane,
  Wrench,
  Shapes,
  Plus,
} from "lucide-react";

const TYPE_META: Record<
  Geofence["type"],
  { label: string; icon: React.ReactNode }
> = {
  allowed: { label: "Allowed area", icon: <ShieldCheck size={14} /> },
  restricted: { label: "Restricted area", icon: <Ban size={14} /> },
  lot: { label: "Lot / Home", icon: <Home size={14} /> },
  airport: { label: "Airport", icon: <Plane size={14} /> },
  service: { label: "Service facility", icon: <Wrench size={14} /> },
  custom: { label: "Custom", icon: <Shapes size={14} /> },
};

function appliesLabel(g: Geofence): string {
  if (g.applies_to_all) return "All vehicles";
  if (g.applies_to_class_id) return `Class: ${g.applies_to_class_id}`;
  if (g.applies_to_vehicle_ids && g.applies_to_vehicle_ids.length)
    return `${g.applies_to_vehicle_ids.length} vehicle(s)`;
  return "—";
}

export function GeofencesTab() {
  const { vehicles } = useStore();
  const t = useTelematics();
  const [creating, setCreating] = useState(false);
  const canManage = useCan("telematics.manage");

  return (
    <div data-testid="telematics-geofences">
      <SectionCard
        title="Geofences"
        icon={<Shapes size={16} className="text-primary" />}
        right={
          canManage ? (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-press"
            >
              <Plus size={12} /> New geofence
            </button>
          ) : null
        }
      >
        {t.geofences.length === 0 ? (
          <EmptyState
            title="No geofences defined"
            hint="Define allowed or restricted operating areas for your fleet."
            icon={<Shapes size={26} />}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {t.geofences.map((g) => {
              const meta = TYPE_META[g.type];
              return (
                <li key={g.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-primary">{meta.icon}</span>
                      <div>
                        <div className="text-sm font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {meta.label}
                        </div>
                      </div>
                    </div>
                    <StatusPill tone={g.active ? "available" : "neutral"}>
                      {g.active ? "Active" : "Inactive"}
                    </StatusPill>
                  </div>
                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <dt>Applies to</dt>
                      <dd className="text-foreground">{appliesLabel(g)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Center</dt>
                      <dd className="text-foreground font-mono">
                        {g.center_latitude.toFixed(4)},{" "}
                        {g.center_longitude.toFixed(4)}
                      </dd>
                    </div>
                    {g.radius_meters != null && (
                      <div className="flex justify-between">
                        <dt>Radius</dt>
                        <dd className="text-foreground">{g.radius_meters} m</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt>Alerts</dt>
                      <dd className="text-foreground">
                        {g.alert_on_enter ? "Enter" : ""}
                        {g.alert_on_enter && g.alert_on_exit ? " · " : ""}
                        {g.alert_on_exit ? "Exit" : ""}
                        {!g.alert_on_enter && !g.alert_on_exit ? "—" : ""}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>Created</dt>
                      <dd className="text-foreground">
                        {fmtDateOnly(g.created_at)}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {creating && canManage && (
        <NewGeofenceDialog
          onClose={() => setCreating(false)}
          onCreate={(g) => {
            t.addGeofence(g);
            setCreating(false);
          }}
          vehicles={vehicles}
        />
      )}
    </div>
  );
}

function NewGeofenceDialog({
  onClose,
  onCreate,
  vehicles,
}: {
  onClose: () => void;
  onCreate: (g: Geofence) => void;
  vehicles: Vehicle[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Geofence["type"]>("allowed");
  const [lat, setLat] = useState("25.78");
  const [lng, setLng] = useState("-80.19");
  const [radius, setRadius] = useState("500");
  const [allVehicles, setAllVehicles] = useState(true);

  function submit() {
    const id = "geo_" + Math.random().toString(36).slice(2, 9);
    onCreate({
      id,
      organization_id: "",
      name: name || "Untitled geofence",
      type,
      active: true,
      center_latitude: parseFloat(lat) || 0,
      center_longitude: parseFloat(lng) || 0,
      radius_meters: parseInt(radius, 10) || null,
      applies_to_all: allVehicles,
      applies_to_class_id: null,
      applies_to_vehicle_ids: null,
      alert_on_enter: type === "restricted",
      alert_on_exit: false,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold">New geofence</h3>
        <div className="space-y-3 text-sm">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g. Miami Downtown lot"
            />
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Geofence["type"])}
              className="input"
            >
              {Object.entries(TYPE_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitude">
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Longitude">
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="input"
              />
            </Field>
          </div>
          <Field label="Radius (m)">
            <input
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="input"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={allVehicles}
              onChange={(e) => setAllVehicles(e.target.checked)}
            />
            Apply to all vehicles
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-press"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
