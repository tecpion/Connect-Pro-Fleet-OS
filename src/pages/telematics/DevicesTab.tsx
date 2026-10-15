// Connect Pro Fleet — Telematics Devices tab (V1).
//
// Device roster with assignment actions: assign / replace / remove. Assignment
// history is preserved (never silently move a device between vehicles). Provider
// capability differences are surfaced. Org-scoped. No credentials.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useTelematics } from "@/lib/store/telematicsStore";
import {
  selectDeviceRoster,
  type DeviceRosterRow,
} from "@/lib/telematicsSelectors";
import { fmtDateTime, fmtDate, fmtDateOnly } from "@/lib/format";
import { useCan } from "@/pages/settings/useCan";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import {
  TelemetryValue,
  deviceStatusTone,
  CapList,
} from "./TelematicsPrimitives";
import { Cpu, History, Plus, Link2, Unlink } from "lucide-react";

export function DevicesTab() {
  const { vehicles } = useStore();
  const t = useTelematics();
  const canManage = useCan("telematics.manage_devices");
  const [selected, setSelected] = useState<DeviceRosterRow | null>(null);
  const [assignFor, setAssignFor] = useState<DeviceRosterRow | null>(null);

  const rows = useMemo(
    () => selectDeviceRoster({ vehicles }, t),
    [vehicles, t],
  );

  return (
    <div
      className="grid grid-cols-1 gap-6 lg:grid-cols-3"
      data-testid="telematics-devices"
    >
      <div className="lg:col-span-2">
        <SectionCard
          title="Devices"
          icon={<Cpu size={16} className="text-primary" />}
          right={
            canManage ? (
              <span className="text-xs text-muted-foreground">
                Assign / replace / remove from a device
              </span>
            ) : null
          }
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No devices"
              hint="Connect a telematics provider to sync devices."
              icon={<Cpu size={26} />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Provider</th>
                    <th className="py-2 pr-3 font-medium">Device ref</th>
                    <th className="py-2 pr-3 font-medium">Vehicle</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Last seen</th>
                    <th className="py-2 pr-3 font-medium">Installed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={
                        "cursor-pointer border-b border-border/60 hover:bg-surface-2/50 " +
                        (selected?.id === r.id ? "bg-primary/5" : "")
                      }
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.provider}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.providerLabel}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {r.external_device_id}
                        {r.imei_or_serial && (
                          <div className="text-muted-foreground">
                            {r.imei_or_serial}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.vehicle_id ? (
                          <Link
                            to={`/vehicles/${r.vehicle_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-primary hover:text-primary-press"
                          >
                            {r.vehicle_label}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill tone={deviceStatusTone(r.status)}>
                          {r.status}
                        </StatusPill>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {r.last_connected_at
                          ? fmtDateTime(r.last_connected_at)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {fmtDate(r.installed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Detail / assignment history */}
      <div className="space-y-4">
        {selected ? (
          <>
            <SectionCard
              title={selected.external_device_id}
              icon={<Cpu size={16} />}
            >
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <StatusPill tone={deviceStatusTone(selected.status)}>
                    {selected.status}
                  </StatusPill>
                </div>
                <Row
                  label="Provider"
                  value={`${selected.provider} (${selected.providerLabel})`}
                />
                <Row
                  label="IMEI / Serial"
                  value={
                    <span className="font-mono">
                      {selected.imei_or_serial ?? "—"}
                    </span>
                  }
                />
                <Row label="Installed" value={fmtDate(selected.installed_at)} />
                <Row
                  label="Last connection"
                  value={
                    selected.last_connected_at
                      ? fmtDateTime(selected.last_connected_at)
                      : "—"
                  }
                />
                {selected.battery_voltage != null && (
                  <Row
                    label="Battery voltage"
                    value={
                      <TelemetryValue
                        value={selected.battery_voltage}
                        suffix="V"
                      />
                    }
                  />
                )}
                {selected.vehicle_id ? (
                  <Row
                    label="Vehicle"
                    value={
                      <Link
                        className="text-primary hover:text-primary-press"
                        to={`/vehicles/${selected.vehicle_id}`}
                      >
                        {selected.vehicle_label}
                      </Link>
                    }
                  />
                ) : (
                  <Row
                    label="Vehicle"
                    value={
                      <span className="text-muted-foreground">Unassigned</span>
                    }
                  />
                )}

                <div className="pt-1">
                  <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Capabilities
                  </div>
                  <CapList
                    adapter={
                      t.adapters.find(
                        (a) => a.provider === selected.provider,
                      ) ?? null
                    }
                    compact
                  />
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selected.vehicle_id ? (
                      <>
                        <button
                          onClick={() => setAssignFor(selected)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                        >
                          <Link2 size={12} /> Replace
                        </button>
                        <button
                          onClick={() => t.removeDevice(selected.id)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-2"
                        >
                          <Unlink size={12} /> Remove
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setAssignFor(selected)}
                        className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-press"
                      >
                        <Plus size={12} /> Assign to vehicle
                      </button>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
            <SectionCard
              title="Assignment history"
              icon={<History size={16} />}
            >
              <AssignmentHistory deviceId={selected.id} />
            </SectionCard>
          </>
        ) : (
          <EmptyState
            title="No device selected"
            hint="Select a device to see details, capabilities, and assignment history."
            icon={<Cpu size={24} />}
          />
        )}
      </div>

      {assignFor && canManage && (
        <AssignDialog
          device={assignFor}
          onClose={() => setAssignFor(null)}
          vehicles={vehicles}
          onAssign={(vehicleId) => {
            t.assignDevice(assignFor.id, vehicleId);
            setAssignFor(null);
          }}
        />
      )}
    </div>
  );
}

function AssignmentHistory({ deviceId }: { deviceId: string }) {
  const t = useTelematics();
  const history = t.assignmentHistory
    .filter((h) => h.device_id === deviceId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  if (history.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No assignment history.</p>
    );
  }
  return (
    <ul
      className="space-y-2 text-xs"
      data-testid="telematics-assignment-history"
    >
      {history.map((h) => {
        const veh = useStore().vehicles.find((v) => v.id === h.vehicle_id);
        return (
          <li key={h.id} className="rounded border border-border p-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {veh
                  ? `${veh.vin ?? veh.id} · ${veh.make} ${veh.model}`
                  : h.vehicle_id}
              </span>
              <StatusPill tone={h.ended_at ? "neutral" : "available"}>
                {h.ended_at ? "Ended" : "Active"}
              </StatusPill>
            </div>
            <div className="mt-1 text-muted-foreground">
              {fmtDateOnly(h.started_at)} →{" "}
              {h.ended_at ? fmtDateOnly(h.ended_at) : "present"}
              {h.reason && <span className="ml-1">· {h.reason}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AssignDialog({
  device,
  onClose,
  vehicles,
  onAssign,
}: {
  device: DeviceRosterRow;
  onClose: () => void;
  vehicles: import("@/lib/types").Vehicle[];
  onAssign: (vehicleId: string) => void;
}) {
  const [vehicleId, setVehicleId] = useState("");
  const available = vehicles.filter((v) => v.id !== device.vehicle_id);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-semibold">
          {device.vehicle_id ? "Replace device" : "Assign device"}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {device.vehicle_id
            ? "Assigning this device to a new vehicle ends the current assignment period (preserved in history)."
            : "Select a vehicle to assign this telematics device to."}
        </p>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="input mb-4"
        >
          <option value="">Select a vehicle…</option>
          {available.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vin ?? v.id} · {v.make} {v.model} ({v.status})
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            disabled={!vehicleId}
            onClick={() => onAssign(vehicleId)}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-press disabled:opacity-50"
          >
            {device.vehicle_id ? "Replace" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}
