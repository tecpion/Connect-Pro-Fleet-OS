// Connect Pro Fleet — integration / sync permissions (Build #21).

import type { PermissionDef } from "./types";

export const INTEGRATION_PERMISSIONS: PermissionDef[] = [
  {
    key: "integrations.view",
    label: "View Integrations",
    module: "Integrations",
  },
  {
    key: "integrations.manage",
    label: "Manage Integrations",
    module: "Integrations",
  },
  {
    key: "integrations.view_events",
    label: "View Event Log",
    module: "Integrations",
  },
  {
    key: "integrations.retry",
    label: "Retry Failed Events",
    module: "Integrations",
  },
  {
    key: "integrations.resolve_reviews",
    label: "Resolve Sync Reviews",
    module: "Integrations",
  },
  {
    key: "integrations.view_payloads",
    label: "View Event Payloads",
    module: "Integrations",
  },
  {
    key: "integrations.payment_sync",
    label: "Payment Sync",
    module: "Integrations",
  },
];
