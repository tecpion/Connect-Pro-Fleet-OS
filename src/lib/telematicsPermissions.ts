// Connect Pro Fleet — Telematics permissions (V1 Telematics Hub).
//
// Telematics is V1 visibility/monitoring/history/alerts only — NO remote
// vehicle control (starter interrupt, engine disable, immobilization,
// lock/unlock) exists in V1, so there are no permissions for it. The
// permissions below gate read access and alert/device management only.
//
// Financial actions (tolls, damage) still use their authoritative permission;
// telematics perms never bypass a finance permission.

import type { PermissionDef } from "./types";

export const TELEMATICS_PERMISSIONS: PermissionDef[] = [
  { key: "telematics.view", label: "View Telematics", module: "Telematics" },
  {
    key: "telematics.view_map",
    label: "View Live Map / Locations",
    module: "Telematics",
  },
  {
    key: "telematics.view_trips",
    label: "View Trip History",
    module: "Telematics",
  },
  {
    key: "telematics.view_history",
    label: "View Location History",
    module: "Telematics",
  },
  {
    key: "telematics.manage_devices",
    label: "Assign / Replace / Remove Devices",
    module: "Telematics",
  },
  {
    key: "telematics.manage_alerts",
    label: "Acknowledge / Resolve / Dismiss Alerts",
    module: "Telematics",
  },
  {
    key: "telematics.manage_geofences",
    label: "Manage Geofences",
    module: "Telematics",
  },
];
