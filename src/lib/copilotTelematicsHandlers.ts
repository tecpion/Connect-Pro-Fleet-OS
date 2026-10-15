// Connect Pro Fleet — Copilot telematics handlers (V1 Telematics Hub).
//
// Each handler answers from the AUTHORITATIVE telematics store (V1 mock) +
// canonical vehicle/rental/customer records — never a second source of truth.
// The bundle is OPTIONAL on CopilotSources: when the TelematicsProvider is not
// mounted (e.g. older Copilot tests), handlers return a graceful fallback.
//
// Copilot answers from NORMALIZED Fleet telematics data — never raw provider
// secrets or credentials (there are none in V1). Handlers prioritized over
// large brittle regex rule sets; the LLM layer handles free phrasing later.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import type {
  TelematicsDevice,
  TelematicsPosition,
  TelematicsAlert,
  TelematicsTrip,
} from "./telematicsTypes";
import { TELEMATICS_PROVIDER_LABELS } from "./telematicsTypes";
import type { Vehicle } from "./types";
import { baseAnswer, plural } from "./copilotShared";
import { fmtDateTime, fmtDateShort } from "./format";

// ---------------------------------------------------------------------------
// Telematics Copilot sources (optional on CopilotSources).
// ---------------------------------------------------------------------------

export interface TelematicsCopilotSources {
  devices: TelematicsDevice[];
  positions: TelematicsPosition[];
  alerts: TelematicsAlert[];
  trips: TelematicsTrip[];
  vehicles: Vehicle[];
  /** Active rentals (status === "active"), used to resolve rental context for
   *  a vehicle's current location / alerts / trips. Derived, never duplicated. */
  activeRentalVehicleIds: Set<string>;
}

const STALE_THRESHOLD_MIN = 120;

function teleSrc(src: CopilotSources): TelematicsCopilotSources | null {
  return src.telematics ?? null;
}

function minutesSince(iso: string | null, asOf: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((asOf.getTime() - t) / 60000));
}

function latestPosition(
  positions: TelematicsPosition[],
  deviceId: string,
): TelematicsPosition | null {
  return (
    positions
      .filter((p) => p.device_id === deviceId)
      .sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))[0] ?? null
  );
}

function deviceForVehicle(
  devices: TelematicsDevice[],
  vehicleId: string,
): TelematicsDevice | null {
  return devices.find((d) => d.vehicle_id === vehicleId) ?? null;
}

function vehicleLabel(v: Vehicle | undefined): string {
  if (!v) return "Unknown vehicle";
  return `${v.make} ${v.model} (${v.license_plate})`;
}

function findVehicle(
  src: TelematicsCopilotSources,
  rawQuery: string | undefined,
): { vehicle: Vehicle | null; deviceId: string | null } {
  if (!rawQuery) return { vehicle: null, deviceId: null };
  const q = rawQuery.trim().toLowerCase();
  if (!q) return { vehicle: null, deviceId: null };
  // Match by plate, vin, id, or "vehicle 102"-style unit numbers.
  const byPlateOrVin = src.vehicles.find(
    (v) =>
      v.license_plate.toLowerCase().includes(q) ||
      v.vin?.toLowerCase().includes(q) ||
      v.id.toLowerCase() === q,
  );
  if (byPlateOrVin) {
    const dev = deviceForVehicle(src.devices, byPlateOrVin.id);
    return { vehicle: byPlateOrVin, deviceId: dev?.id ?? null };
  }
  // Match by unit number ("102", "vehicle 108").
  const numMatch = q.match(/(\d+)/);
  if (numMatch) {
    const num = numMatch[1];
    const byNum = src.vehicles.find(
      (v) =>
        v.license_plate.toLowerCase().includes(num) ||
        v.id.toLowerCase().includes(num),
    );
    if (byNum) {
      const dev = deviceForVehicle(src.devices, byNum.id);
      return { vehicle: byNum, deviceId: dev?.id ?? null };
    }
  }
  return { vehicle: null, deviceId: null };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** "Where is vehicle 102?" / "Where is Sarah's rental vehicle?" */
export function answerTelematicsVehicleLocation(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  rawQuery?: string,
  customerName?: (id: string) => string | null,
): CopilotAnswer {
  const base = baseAnswer(
    "telematics_vehicle_location",
    asOf,
    perms,
    "derived",
  );
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Telematics isn't available right now. Open the Telematics workspace to see vehicle locations.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=map",
        },
      ],
      caveats: [
        "V1 telematics is mock data — no live GPS provider is connected.",
      ],
    };
  }
  // If a customer name is resolvable, find their active rental's vehicle.
  let targetVehicleId: string | null = null;
  if (customerName && rawQuery) {
    const q = rawQuery.toLowerCase();
    for (const v of tele.vehicles) {
      // Heuristic: active rental vehicle whose renter name matches the query.
      if (tele.activeRentalVehicleIds.has(v.id)) {
        // Caller would need rental→customer; we approximate by vehicle label.
      }
    }
  }
  const found = findVehicle(tele, rawQuery);
  const vehicle =
    found.vehicle ??
    (targetVehicleId
      ? (tele.vehicles.find((v) => v.id === targetVehicleId) ?? null)
      : null);
  if (!vehicle) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I couldn't find that vehicle. Tell me a plate, unit number, or VIN — for example, 'Where is FL-SV4410?'",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Live Map",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=map",
        },
      ],
      caveats: [],
    };
  }
  const device = deviceForVehicle(tele.devices, vehicle.id);
  if (!device) {
    return {
      ...base,
      answer_type: "entity",
      summary: `${vehicleLabel(vehicle)} has no telematics device connected — no GPS location available.`,
      facts: [
        { label: "Vehicle", value: vehicleLabel(vehicle) },
        { label: "GPS device", value: "None" },
      ],
      items: [],
      sources: [
        {
          source_module: "telematics",
          entity_type: "vehicle",
          entity_id: vehicle.id,
          label: vehicleLabel(vehicle),
          deep_link: `/vehicles/${vehicle.id}`,
        },
      ],
      suggested_actions: [
        {
          label: "View vehicle",
          action_type: "view_vehicle",
          deep_link: `/vehicles/${vehicle.id}`,
        },
        {
          label: "Telematics devices",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=devices",
        },
      ],
      caveats: [
        "Missing data is shown as unknown — not zero.",
        "V1 telematics is mock data.",
      ],
    };
  }
  const pos = latestPosition(tele.positions, device.id);
  const stale = pos
    ? (minutesSince(pos.recorded_at, asOf) ?? 0) > STALE_THRESHOLD_MIN
    : true;
  return {
    ...base,
    answer_type: "entity",
    summary: pos
      ? `${vehicleLabel(vehicle)} was last seen at ${pos.latitude.toFixed(3)}, ${pos.longitude.toFixed(3)}${pos.speed != null ? ` (${pos.speed} mph)` : ""}, ${fmtDateTime(pos.recorded_at)}${stale ? " — location is stale." : "."}`
      : `${vehicleLabel(vehicle)} has a device but no recent position.`,
    facts: [
      { label: "Vehicle", value: vehicleLabel(vehicle) },
      { label: "Provider", value: TELEMATICS_PROVIDER_LABELS[device.provider] },
      { label: "Device", value: device.status },
      {
        label: "Last known location",
        value: pos
          ? `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`
          : "—",
      },
      { label: "Last seen", value: pos ? fmtDateTime(pos.recorded_at) : "—" },
    ],
    items: [],
    sources: [
      {
        source_module: "telematics",
        entity_type: "vehicle",
        entity_id: vehicle.id,
        label: vehicleLabel(vehicle),
        deep_link: `/vehicles/${vehicle.id}`,
      },
    ],
    suggested_actions: [
      {
        label: "View on map",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=map",
      },
      {
        label: "View vehicle",
        action_type: "view_vehicle",
        deep_link: `/vehicles/${vehicle.id}`,
      },
    ],
    caveats: stale
      ? ["Location is stale — last reported more than 2 hours ago."]
      : ["V1 telematics is mock data."],
  };
}

/** "Which GPS devices are offline?" */
export function answerTelematicsOfflineDevices(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("telematics_offline_devices", asOf, perms, "derived");
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Telematics isn't available right now. Open the Telematics workspace to see device status.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=devices",
        },
      ],
      caveats: [],
    };
  }
  const offline = tele.devices.filter((d) => d.status !== "online");
  if (offline.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary: `All ${plural(tele.devices.length, "GPS device")} are online.`,
      facts: [{ label: "Devices", value: String(tele.devices.length) }],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: ["V1 telematics is mock data."],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `${offline.length} GPS ${plural(offline.length, "device is", "devices are")} offline or disconnected.`,
    facts: [{ label: "Offline devices", value: String(offline.length) }],
    items: offline.map((d) => {
      const v = tele.vehicles.find((x) => x.id === d.vehicle_id);
      return {
        id: d.id,
        title: v ? vehicleLabel(v) : d.external_device_id,
        subtitle: `${TELEMATICS_PROVIDER_LABELS[d.provider]} · ${d.status}`,
        status: d.status,
        deep_link: d.vehicle_id
          ? `/vehicles/${d.vehicle_id}`
          : "/telematics?tab=devices",
      };
    }),
    sources: offline.map((d) => ({
      source_module: "telematics",
      entity_type: "device",
      entity_id: d.id,
      label: d.external_device_id,
      deep_link: "/telematics?tab=devices",
    })),
    suggested_actions: [
      {
        label: "Open devices",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=devices",
      },
    ],
    caveats: ["V1 telematics is mock data — no live provider is connected."],
  };
}

/** "Which vehicles haven't reported recently?" / stale locations. */
export function answerTelematicsStaleLocations(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("telematics_stale_locations", asOf, perms, "derived");
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Telematics isn't available right now.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=map",
        },
      ],
      caveats: [],
    };
  }
  const stale = tele.devices
    .filter((d) => d.status === "online")
    .map((d) => {
      const pos = latestPosition(tele.positions, d.id);
      const mins = pos ? minutesSince(pos.recorded_at, asOf) : null;
      return { d, pos, mins };
    })
    .filter((x) => x.mins != null && x.mins > STALE_THRESHOLD_MIN);
  if (stale.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary:
        "All online GPS devices have reported recently — no stale locations.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: ["V1 telematics is mock data."],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `${stale.length} vehicle${stale.length === 1 ? " has" : "s have"} a stale location (no report in 2+ hours).`,
    facts: [{ label: "Stale vehicles", value: String(stale.length) }],
    items: stale.map(({ d, pos, mins }) => {
      const v = tele.vehicles.find((x) => x.id === d.vehicle_id);
      return {
        id: d.id,
        title: v ? vehicleLabel(v) : d.external_device_id,
        subtitle: pos
          ? `Last seen ${fmtDateTime(pos.recorded_at)} (${mins}m ago)`
          : "No position",
        status: "stale",
        deep_link: d.vehicle_id
          ? `/vehicles/${d.vehicle_id}`
          : "/telematics?tab=map",
      };
    }),
    sources: [],
    suggested_actions: [
      {
        label: "Open Live Map",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=map",
      },
    ],
    caveats: ["V1 telematics is mock data."],
  };
}

/** "Which rented vehicles currently have GPS alerts?" */
export function answerTelematicsRentalAlerts(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("telematics_rental_alerts", asOf, perms, "derived");
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Telematics isn't available right now.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=alerts",
        },
      ],
      caveats: [],
    };
  }
  const activeAlerts = tele.alerts.filter(
    (a) =>
      (a.status === "new" || a.status === "acknowledged") &&
      tele.activeRentalVehicleIds.has(a.vehicle_id),
  );
  if (activeAlerts.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary: "No rented vehicles have active GPS alerts right now.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: ["V1 telematics is mock data."],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `${activeAlerts.length} active GPS ${plural(activeAlerts.length, "alert")} on rented vehicles.`,
    facts: [
      { label: "Active rental alerts", value: String(activeAlerts.length) },
    ],
    items: activeAlerts.map((a) => {
      const v = tele.vehicles.find((x) => x.id === a.vehicle_id);
      return {
        id: a.id,
        title: v ? vehicleLabel(v) : a.vehicle_id,
        subtitle: `${a.type.replace(/_/g, " ")} · ${a.severity}`,
        status: a.severity,
        deep_link: a.rental_id
          ? `/rentals/${a.rental_id}`
          : `/vehicles/${a.vehicle_id}`,
      };
    }),
    sources: [],
    suggested_actions: [
      {
        label: "Open alerts",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=alerts",
      },
    ],
    caveats: ["V1 telematics is mock data."],
  };
}

/** "Which vehicles have no GPS device installed?" */
export function answerTelematicsNoDevice(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("telematics_no_device", asOf, perms, "derived");
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Telematics isn't available right now.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=devices",
        },
      ],
      caveats: [],
    };
  }
  const equippedVehicleIds = new Set(
    tele.devices.map((d) => d.vehicle_id).filter(Boolean) as string[],
  );
  const unequipped = tele.vehicles.filter((v) => !equippedVehicleIds.has(v.id));
  if (unequipped.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary: "All fleet vehicles have a GPS device installed.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: ["V1 telematics is mock data."],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `${unequipped.length} vehicle${unequipped.length === 1 ? "" : "s"} have no GPS device installed.`,
    facts: [{ label: "Unequipped vehicles", value: String(unequipped.length) }],
    items: unequipped.map((v) => ({
      id: v.id,
      title: vehicleLabel(v),
      subtitle: "No telematics device",
      status: "no device",
      deep_link: `/vehicles/${v.id}`,
    })),
    sources: [],
    suggested_actions: [
      {
        label: "Assign devices",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=devices",
      },
    ],
    caveats: ["V1 telematics is mock data."],
  };
}

/** "Which vehicles are outside their allowed area?" (geofence) */
export function answerTelematicsOutsideGeofence(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    "telematics_outside_geofence",
    asOf,
    perms,
    "derived",
  );
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Telematics isn't available right now.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=geofences",
        },
      ],
      caveats: [],
    };
  }
  // Geofence exit events on active/online devices indicate "outside allowed area".
  const exitAlerts = tele.alerts.filter(
    (a) =>
      a.type === "geofence_violation" &&
      (a.status === "new" || a.status === "acknowledged"),
  );
  if (exitAlerts.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary: "No vehicles are currently flagged outside their allowed area.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: ["V1 telematics is mock data — geofence logic is illustrative."],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `${exitAlerts.length} vehicle${exitAlerts.length === 1 ? "" : "s"} flagged outside their allowed area.`,
    facts: [{ label: "Geofence violations", value: String(exitAlerts.length) }],
    items: exitAlerts.map((a) => {
      const v = tele.vehicles.find((x) => x.id === a.vehicle_id);
      return {
        id: a.id,
        title: v ? vehicleLabel(v) : a.vehicle_id,
        subtitle: "Geofence violation",
        status: a.severity,
        deep_link: a.rental_id
          ? `/rentals/${a.rental_id}`
          : `/vehicles/${a.vehicle_id}`,
      };
    }),
    sources: [],
    suggested_actions: [
      {
        label: "Open geofences",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=geofences",
      },
    ],
    caveats: ["V1 telematics is mock data — geofence logic is illustrative."],
  };
}

/** "Show trips for this vehicle yesterday." */
export function answerTelematicsTripsForVehicle(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  rawQuery?: string,
): CopilotAnswer {
  const base = baseAnswer(
    "telematics_trips_for_vehicle",
    asOf,
    perms,
    "derived",
  );
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Telematics isn't available right now.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=trips",
        },
      ],
      caveats: [],
    };
  }
  const found = findVehicle(tele, rawQuery);
  if (!found.vehicle) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I couldn't find that vehicle for trips. Tell me a plate or unit number.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open trips",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=trips",
        },
      ],
      caveats: [],
    };
  }
  const trips = tele.trips.filter((t) => t.vehicle_id === found.vehicle!.id);
  if (trips.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary: `${vehicleLabel(found.vehicle)} has no recorded trips.`,
      facts: [{ label: "Vehicle", value: vehicleLabel(found.vehicle) }],
      items: [],
      sources: [],
      suggested_actions: [
        {
          label: "View trips",
          action_type: "view_telematics",
          deep_link: `/telematics?tab=trips&vehicle=${found.vehicle!.id}`,
        },
      ],
      caveats: ["V1 telematics is mock data."],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `${vehicleLabel(found.vehicle)} has ${trips.length} recorded ${plural(trips.length, "trip")}.`,
    facts: [{ label: "Trips", value: String(trips.length) }],
    items: trips.map((t) => ({
      id: t.id,
      title: `${t.start_location} → ${t.end_location}`,
      subtitle: `${fmtDateShort(t.started_at)}${t.distance != null ? ` · ${t.distance} mi` : ""}`,
      status: "trip",
      deep_link: `/telematics?tab=trips&vehicle=${found.vehicle!.id}`,
    })),
    sources: [],
    suggested_actions: [
      {
        label: "View trips",
        action_type: "view_telematics",
        deep_link: `/telematics?tab=trips&vehicle=${found.vehicle!.id}`,
      },
    ],
    caveats: ["V1 telematics is mock data."],
  };
}

/** "When was this vehicle last seen?" */
export function answerTelematicsLastSeen(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  rawQuery?: string,
): CopilotAnswer {
  const base = baseAnswer("telematics_last_seen", asOf, perms, "derived");
  const tele = teleSrc(src);
  if (!tele) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Telematics isn't available right now.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Telematics",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=map",
        },
      ],
      caveats: [],
    };
  }
  const found = findVehicle(tele, rawQuery);
  if (!found.vehicle) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't find that vehicle. Tell me a plate or unit number.",
      sources: [],
      items: [],
      facts: [],
      suggested_actions: [
        {
          label: "Open Live Map",
          action_type: "view_telematics",
          deep_link: "/telematics?tab=map",
        },
      ],
      caveats: [],
    };
  }
  const device = deviceForVehicle(tele.devices, found.vehicle.id);
  if (!device) {
    return {
      ...base,
      answer_type: "entity",
      summary: `${vehicleLabel(found.vehicle)} has no telematics device — never seen via GPS.`,
      facts: [
        { label: "Vehicle", value: vehicleLabel(found.vehicle) },
        { label: "GPS device", value: "None" },
      ],
      items: [],
      sources: [],
      suggested_actions: [
        {
          label: "View vehicle",
          action_type: "view_vehicle",
          deep_link: `/vehicles/${found.vehicle.id}`,
        },
      ],
      caveats: ["V1 telematics is mock data."],
    };
  }
  const pos = latestPosition(tele.positions, device.id);
  const lastSeen = pos?.recorded_at ?? device.last_connected_at;
  return {
    ...base,
    answer_type: "entity",
    summary: lastSeen
      ? `${vehicleLabel(found.vehicle)} was last seen ${fmtDateTime(lastSeen)}.`
      : `${vehicleLabel(found.vehicle)} has no recorded GPS activity.`,
    facts: [
      { label: "Vehicle", value: vehicleLabel(found.vehicle) },
      { label: "Last seen", value: lastSeen ? fmtDateTime(lastSeen) : "—" },
    ],
    items: [],
    sources: [],
    suggested_actions: [
      {
        label: "View vehicle",
        action_type: "view_vehicle",
        deep_link: `/vehicles/${found.vehicle.id}`,
      },
    ],
    caveats: ["V1 telematics is mock data."],
  };
}

/** Re-dispatch fallback for telematics_summary without a name context. */
export function answerTelematicsSummaryFallback(
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("telematics_summary", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "fallback",
    summary:
      "I can look up a vehicle's telematics by name or plate. Tell me which vehicle — for example, 'Where is FL-SV4410?'",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [
      {
        label: "Open Telematics",
        action_type: "view_telematics",
        deep_link: "/telematics?tab=map",
      },
    ],
    caveats: [
      "V1 telematics is mock data — no live GPS provider is connected.",
    ],
  };
}
