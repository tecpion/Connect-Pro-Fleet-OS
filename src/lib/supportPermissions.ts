// Connect Pro Fleet — Support Center permissions (Build #31).
//
// Tenant-facing support permissions. Rental-company Owners/Managers are NOT
// platform administrators — these keys gate what a tenant user may do with
// the in-app Support Center (view/create/comment on tickets), never granting
// cross-tenant or platform-admin visibility.

import type { PermissionDef } from "./types";

export const SUPPORT_PERMISSIONS: PermissionDef[] = [
  {
    key: "support.view",
    label: "View Support Center",
    module: "Support",
  },
  {
    key: "support.create",
    label: "Create Support Requests",
    module: "Support",
  },
  {
    key: "support.comment",
    label: "Comment on Support Requests",
    module: "Support",
  },
  {
    key: "support.view_all_company_tickets",
    label: "View All Company Support Requests",
    module: "Support",
  },
];
