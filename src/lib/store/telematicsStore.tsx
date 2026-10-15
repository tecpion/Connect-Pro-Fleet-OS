// Connect Pro Fleet — Telematics store (V1, frontend mock).
//
// In-memory store seeded from mockTelematicsState. No persistence, no network.
// Mutations (assignment, alert lifecycle, geofence CRUD) are local UI state so
// the workspace is fully interactive in mock mode. Org-scoped by construction
// (all seed records share TENANT_ID; selectors join only to same-org vehicles).
//
// Developer-later: replace this with Supabase-backed reads/writes + RLS.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  TelematicsDevice,
  TelematicsDeviceAssignment,
  TelematicsPosition,
  TelematicsEvent,
  TelematicsTrip,
  TelematicsAlert,
  TelematicsGeofence,
  TelematicsProviderAdapter,
} from "@/lib/telematicsTypes";
import { mockTelematicsState } from "@/lib/store/seedTelematics";
import { telematicsAdapters } from "@/lib/telematicsAdapters";
import { VerificationProvider } from "@/lib/store/verificationStore";

export interface TelematicsStoreState {
  devices: TelematicsDevice[];
  positions: TelematicsPosition[];
  events: TelematicsEvent[];
  trips: TelematicsTrip[];
  alerts: TelematicsAlert[];
  geofences: TelematicsGeofence[];
  assignmentHistory: TelematicsDeviceAssignment[];
  adapters: TelematicsProviderAdapter[];

  // Mutations (mock, local state)
  assignDevice: (deviceId: string, vehicleId: string) => void;
  removeDevice: (deviceId: string) => void;
  acknowledgeAlert: (alertId: string) => void;
  resolveAlert: (alertId: string, notes: string) => void;
  dismissAlert: (alertId: string) => void;
  addGeofence: (g: TelematicsGeofence) => void;
}

const TelematicsContext = createContext<TelematicsStoreState | null>(null);

export function TelematicsProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState(mockTelematicsState.devices);
  const [positions] = useState(mockTelematicsState.positions);
  const [events] = useState(mockTelematicsState.events);
  const [trips] = useState(mockTelematicsState.trips);
  const [alerts, setAlerts] = useState(mockTelematicsState.alerts);
  const [geofences, setGeofences] = useState(mockTelematicsState.geofences);
  const [assignmentHistory, setAssignmentHistory] = useState(
    mockTelematicsState.assignmentHistory,
  );

  function closeActiveAssignment(deviceId: string, reason: string) {
    setAssignmentHistory((prev) =>
      prev.map((h) =>
        h.device_id === deviceId && h.ended_at === null
          ? {
              ...h,
              ended_at: new Date().toISOString(),
              reason,
            }
          : h,
      ),
    );
  }

  function pushAssignment(deviceId: string, vehicleId: string, reason: string) {
    const id = "asg_" + Math.random().toString(36).slice(2, 9);
    setAssignmentHistory((prev) => [
      {
        id,
        device_id: deviceId,
        vehicle_id: vehicleId,
        started_at: new Date().toISOString(),
        ended_at: null,
        reason,
      },
      ...prev,
    ]);
  }

  const value = useMemo<TelematicsStoreState>(
    () => ({
      devices,
      positions,
      events,
      trips,
      alerts,
      geofences,
      assignmentHistory,
      adapters: telematicsAdapters,

      assignDevice(deviceId, vehicleId) {
        setDevices((prev) => {
          const device = prev.find((d) => d.id === deviceId);
          if (!device) return prev;
          // If device was on another vehicle, close that assignment period.
          if (device.vehicle_id && device.vehicle_id !== vehicleId) {
            closeActiveAssignment(deviceId, "replace");
          } else if (!device.vehicle_id) {
            // new install assignment
          }
          // close any prior active assignment for this device
          closeActiveAssignment(deviceId, "replace");
          pushAssignment(deviceId, vehicleId, "install");
          return prev.map((d) =>
            d.id === deviceId
              ? { ...d, vehicle_id: vehicleId, status: "online" }
              : d,
          );
        });
      },

      removeDevice(deviceId) {
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, vehicle_id: null } : d)),
        );
        closeActiveAssignment(deviceId, "remove");
      },

      acknowledgeAlert(alertId) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? {
                  ...a,
                  status: "acknowledged",
                  acknowledged_at: new Date().toISOString(),
                  acknowledged_by: "stf_current",
                }
              : a,
          ),
        );
      },

      resolveAlert(alertId, notes) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId
              ? { ...a, status: "resolved", resolution_notes: notes }
              : a,
          ),
        );
      },

      dismissAlert(alertId) {
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, status: "dismissed" } : a,
          ),
        );
      },

      addGeofence(g) {
        setGeofences((prev) => [g, ...prev]);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, positions, events, trips, alerts, geofences, assignmentHistory],
  );

  // V1 Customer Verification — mounted inside the TelematicsProvider so App.tsx
  // nesting does not need to change (the App provider tree is at its size limit).
  // Verification is an independent domain; this co-mounting is presentational
  // only and does not couple the two stores.
  return (
    <TelematicsContext.Provider value={value}>
      <VerificationProvider>{children}</VerificationProvider>
    </TelematicsContext.Provider>
  );
}

export function useTelematics(): TelematicsStoreState {
  const ctx = useContext(TelematicsContext);
  if (!ctx) {
    throw new Error("useTelematics must be used within TelematicsProvider");
  }
  return ctx;
}

/** Standalone hook for selectors/tests that need the raw store view. */
export function useTelematicsView() {
  const t = useTelematics();
  return {
    devices: t.devices,
    positions: t.positions,
    trips: t.trips,
    alerts: t.alerts,
    geofences: t.geofences,
    assignmentHistory: t.assignmentHistory,
    adapters: t.adapters,
  };
}

/** Optional variant — returns null when the TelematicsProvider is not mounted
 *  (e.g. in older test harnesses that predate V1 Telematics). Callers (Action
 *  Center, Copilot) degrade gracefully: no telematics attention when null. */
export function useTelematicsOptional(): TelematicsStoreState | null {
  const ctx = useContext(TelematicsContext);
  return ctx ?? null;
}
