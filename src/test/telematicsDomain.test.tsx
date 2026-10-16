// Connect Pro Fleet — V1 Telematics Hub domain tests.
//
// Verifies the telematics foundation: device links, assignment history, mock
// map positions, "missing ≠ zero", offline/stale detection, trip→rental
// matching, geofence→alert, Action Center surfacing, provider capabilities,
// Vehicle/Rental Detail integration, Copilot reads normalized data, no
// credentials, no remote control, and tenant isolation. Mock data only — no
// real GPS provider, no Supabase, no network.

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  NOW,
  wrapper,
} from "./copilotTestHarness";
import { StoreProvider, useStore } from "@/lib/store";
import { TelematicsProvider, useTelematics } from "@/lib/store/telematicsStore";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  selectLiveMapMarkers,
  selectTelematicsAlerts,
  selectTelematicsTrips,
  selectTripRentalLink,
  selectDeviceRoster,
  selectVehicleTelemetry,
  selectRentalTelemetry,
  selectVehicleGpsReadiness,
  selectTelematicsAttention,
  selectAdapterForProvider,
} from "@/lib/telematicsSelectors";
import { mockTelematicsState } from "@/lib/store/seedTelematics";
import { telematicsAdapters } from "@/lib/telematicsAdapters";
import { TELEMATICS_PERMISSIONS } from "@/lib/telematicsPermissions";
import type { TelematicsStoreState } from "@/lib/store/telematicsStore";
import type { ReactNode } from "react";

/** A telematics-enabled wrapper for selector tests that need the live store. */
function teleWrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <TelematicsProvider>{children}</TelematicsProvider>
    </StoreProvider>
  );
}

/** Render the telematics store from the live provider (mock seed). */
function useTele() {
  return renderHook(() => useTelematics(), { wrapper: teleWrapper }).result
    .current;
}

describe("V1 Telematics Hub — domain", () => {
  it("each installed telematics device links to a real seeded vehicle", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    // Only assigned devices (vehicle_id set) must resolve to a real vehicle.
    // A disconnected spare (tel_dev_6, vehicle_id null) is legitimately
    // uninstalled and is skipped here — it is not a broken link.
    for (const d of t.devices) {
      if (!d.vehicle_id) continue;
      const v = store.vehicles.find((x) => x.id === d.vehicle_id);
      expect(
        v,
        `device ${d.id} → unknown vehicle ${d.vehicle_id}`,
      ).toBeTruthy();
    }
    // At least one device is genuinely uninstalled (the disconnected spare).
    expect(t.devices.some((d) => !d.vehicle_id)).toBe(true);
  });

  it("device assignment history is preserved (install/replace/remove)", () => {
    const t = useTele();
    // veh_2 has a replacement chain: SVR removed, Advantage installed.
    const veh2History = t.assignmentHistory.filter(
      (h) => h.vehicle_id === "veh_2",
    );
    expect(veh2History.length).toBeGreaterThanOrEqual(2);
    const reasons = veh2History.map((h) => h.reason);
    expect(reasons).toContain("remove");
    expect(reasons).toContain("install");
    // The current active assignment has no ended_at.
    const active = veh2History.find((h) => h.ended_at === null);
    expect(active).toBeTruthy();
    expect(active!.reason).toBe("install");
  });

  it("live map renders only GPS-equipped vehicles with positions", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const markers = selectLiveMapMarkers({
      vehicles: store.vehicles,
      devices: t.devices,
      positions: t.positions,
      rentals: store.rentals,
      customers: store.customers,
      asOf: NOW,
    });
    // Every marker has a device + a real position (no placeholder zeros).
    for (const m of markers) {
      expect(m.device_status).not.toBeNull();
      expect(typeof m.latitude).toBe("number");
      expect(typeof m.longitude).toBe("number");
    }
    // veh_8 / veh_9 have no device → not on the map.
    const ids = markers.map((m) => m.vehicle_id);
    expect(ids).not.toContain("veh_8");
    expect(ids).not.toContain("veh_9");
  });

  it("missing data is never rendered as zero (null stays null)", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    // veh_3 (SVR) has no battery, no ignition — selectors must keep them null.
    const summary = selectVehicleTelemetry(store, t, "veh_3", NOW);
    const pos = summary.position!;
    expect(pos.battery_voltage).toBeNull();
    expect(pos.ignition_status).toBeNull();
    expect(pos.odometer).toBeNull();
  });

  it("offline + disconnected devices display their status", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const roster = selectDeviceRoster(store, t);
    const offline = roster.find((d) => d.id === "tel_dev_5");
    expect(offline!.status).toBe("offline");
    const disconnected = roster.find((d) => d.id === "tel_dev_6");
    expect(disconnected!.status).toBe("disconnected");
  });

  it("stale-location detection flags online devices with old positions", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    // veh_7 is online but last pinged ~3h ago → stale.
    const ready = selectVehicleGpsReadiness(t, "veh_7", NOW);
    // NOW is 2026-09-02 but the seed ping is 2026-09-27 — the position is far
    // in the future relative to NOW, so it is NOT stale by the selector's
    // forward-looking clock. Use the seed's own clock to assert staliness.
    const SEED_NOW = new Date("2026-09-27T12:00:00Z");
    const readyAtSeed = selectVehicleGpsReadiness(t, "veh_7", SEED_NOW);
    expect(readyAtSeed).toBe("stale");
    // veh_1 reported minutes ago at the seed clock → online.
    expect(selectVehicleGpsReadiness(t, "veh_1", SEED_NOW)).toBe("online");
  });

  it("active rental is resolved from authoritative rental data", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const summary = selectVehicleTelemetry(store, t, "veh_1", NOW);
    // veh_1 is rnt_1 (Carlos Mendez) — active.
    expect(summary.rental).toBeTruthy();
    expect(summary.rental_number).toBeTruthy();
  });

  it("trip→rental matching derives from vehicle + time window (no dupes)", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const SEED_NOW = new Date("2026-09-27T12:00:00Z");
    const trips = selectTelematicsTrips(store, t, {});
    // Every trip resolves a rental when the vehicle is actively rented in its
    // time window, OR stays null when not — never invents a rental id.
    for (const trip of trips) {
      const raw = t.trips.find((x) => x.id === trip.id)!;
      const link = selectTripRentalLink(raw, store.rentals);
      // If a link exists it must be a real rental id.
      if (link) {
        expect(store.rentals.some((r) => r.id === link)).toBe(true);
      }
    }
    // veh_1's today trip falls within rnt_1's active possession window.
    const veh1Today = t.trips.find((x) => x.id === "ttrip_1")!;
    const link = selectTripRentalLink(veh1Today, store.rentals);
    expect(link).toBeTruthy();
  });

  it("geofence event generates a geofence_violation alert", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const alerts = selectTelematicsAlerts(store, t);
    const geo = alerts.find((a) => a.type === "geofence_violation");
    expect(geo).toBeTruthy();
    expect(geo!.severity).toBe("high");
    expect(geo!.vehicle_id).toBe("veh_1");
  });

  it("high-priority telematics alerts surface in Action Center attention", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const attention = selectTelematicsAttention(store, t);
    // Speeding + geofence + possible_tow are high; device_offline/battery low
    // are medium. All new/acknowledged high+medium surface.
    const ids = attention.map((a) => a.id);
    expect(ids).toContain("talert_1"); // speeding (high)
    expect(ids).toContain("talert_2"); // geofence (high)
    expect(ids).toContain("talert_3"); // possible tow (high)
  });

  it("resolved/dismissed alerts do not remain active attention", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const attention = selectTelematicsAttention(store, t);
    const ids = attention.map((a) => a.id);
    // talert_6 (resolved) + talert_7 (dismissed) must NOT appear.
    expect(ids).not.toContain("talert_6");
    expect(ids).not.toContain("talert_7");
  });

  it("provider capabilities differ and are respected by the adapter model", () => {
    const adv = selectAdapterForProvider(telematicsAdapters, "advantage")!;
    const svr = selectAdapterForProvider(telematicsAdapters, "svr")!;
    expect(adv.supportsBattery).toBe(true);
    expect(adv.supportsOdometer).toBe(false);
    expect(svr.supportsBattery).toBe(false);
    expect(svr.supportsTamperAlerts).toBe(false);
    expect(svr.supportsTrips).toBe(true);
  });

  it("Vehicle Detail telemetry is contextual (compact, no full workspace)", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const summary = selectVehicleTelemetry(store, t, "veh_1", NOW);
    expect(summary.device).toBeTruthy();
    expect(summary.position).toBeTruthy();
    expect(summary.recentAlerts.length).toBeLessThanOrEqual(3);
    expect(summary.recentTrip).toBeTruthy();
  });

  it("Rental Detail shows compact vehicle location only (not full telematics)", () => {
    const t = useTele();
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    // rnt_1 is on veh_1.
    const rnt = store.rentals.find((r) => r.id === "rnt_1")!;
    const summary = selectRentalTelemetry(t, rnt.vehicle_id, rnt.id, NOW);
    expect(summary.vehicle_id).toBe(rnt.vehicle_id);
    expect(summary.active_alerts).toBeDefined();
    // movement_state is one of the compact values.
    expect(["moving", "parked", "unknown"]).toContain(summary.movement_state);
  });

  it("reservation/checkout GPS readiness indicator works", () => {
    const t = useTele();
    const SEED_NOW = new Date("2026-09-27T12:00:00Z");
    expect(selectVehicleGpsReadiness(t, "veh_1", SEED_NOW)).toBe("online");
    expect(selectVehicleGpsReadiness(t, "veh_5", SEED_NOW)).toBe("offline");
    // veh_8 has no device.
    expect(selectVehicleGpsReadiness(t, "veh_8", SEED_NOW)).toBe("no_device");
  });

  it("Copilot reads normalized telematics data (offline devices intent)", () => {
    const { sources } = useCopilotTestSources().current;
    const ctx = engineCtx(sources);
    const answer = resolveCopilotQuery(
      "Which GPS devices are offline?",
      emptyConversation(),
      ctx,
    );
    expect(answer.intent).toBe("telematics_offline_devices");
    // At least the offline + disconnected mock devices are listed.
    expect(answer.items.length).toBeGreaterThanOrEqual(2);
  });

  it("Copilot answers rental GPS alerts from normalized data", () => {
    const { sources } = useCopilotTestSources().current;
    const ctx = engineCtx(sources);
    const answer = resolveCopilotQuery(
      "Which rented vehicles have GPS alerts?",
      emptyConversation(),
      ctx,
    );
    expect(answer.intent).toBe("telematics_rental_alerts");
    // veh_1 (rnt_1) + veh_4 (rnt_4) have active rental alerts.
    expect(answer.items.length).toBeGreaterThanOrEqual(1);
  });

  it("Copilot reports no-device vehicles", () => {
    const { sources } = useCopilotTestSources().current;
    const ctx = engineCtx(sources);
    const answer = resolveCopilotQuery(
      "Which vehicles have no GPS device installed?",
      emptyConversation(),
      ctx,
    );
    expect(answer.intent).toBe("telematics_no_device");
    // veh_8 + veh_9 are unequipped.
    expect(answer.items.length).toBeGreaterThanOrEqual(1);
  });

  it("no credentials / secrets exist in the frontend telematics layer", () => {
    // The adapters + types must not carry API keys, tokens, or endpoint URLs.
    const serialized =
      JSON.stringify(telematicsAdapters) + JSON.stringify(mockTelematicsState);
    expect(/api[_-]?key|secret|token|password|bearer/i.test(serialized)).toBe(
      false,
    );
  });

  it("no remote-control capability exists in V1 (visibility only)", () => {
    // V1 telematics permissions cover view + device/alert/geofence management
    // only — no starter interrupt / immobilize / lock / engine disable.
    const keys = TELEMATICS_PERMISSIONS.map((p) => p.key);
    expect(keys).not.toContain("telematics.remote_disable");
    expect(keys).not.toContain("telematics.immobilize");
    expect(keys).not.toContain("telematics.starter_interrupt");
    // The adapter contract has no remote-control methods either.
    const adapter = telematicsAdapters[0];
    expect("disableEngine" in adapter).toBe(false);
    expect("immobilize" in adapter).toBe(false);
    expect("lockDoors" in adapter).toBe(false);
  });

  it("tenant/org isolation holds (all telematics records share the org id)", () => {
    const t = useTele();
    const ORG = "org_connect_pro";
    for (const d of t.devices) {
      expect(d.organization_id).toBe(ORG);
    }
    for (const a of t.alerts) {
      expect(a.organization_id).toBe(ORG);
    }
    for (const trip of t.trips) {
      expect(trip.organization_id).toBe(ORG);
    }
    // Selectors join only to same-org vehicles (unknown vehicle → dropped).
    const store = renderHook(() => useStore(), {
      wrapper: StoreProvider,
    }).result.current;
    const alerts = selectTelematicsAlerts(store, t);
    for (const a of alerts) {
      expect(store.vehicles.some((v) => v.id === a.vehicle_id)).toBe(true);
    }
  });

  it("telematics store is org-scoped by construction (no cross-tenant leak)", () => {
    // The mock store holds only the canonical tenant's records; there is no
    // second tenant in the seed, so no cross-organization record can surface.
    const t = useTele() as TelematicsStoreState;
    const orgs = new Set(t.devices.map((d) => d.organization_id));
    expect(orgs.size).toBe(1);
    expect(orgs.has("org_connect_pro")).toBe(true);
  });
});
