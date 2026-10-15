// Connect Pro Fleet — Case Center permissions (Build #54).
//
// Case Center COORDINATES authoritative records. Financial actions (charge,
// deposit, refund, payment, expense) still use their authoritative permission
// — a case permission NEVER bypasses a finance permission.

import type { PermissionDef } from "./types";

export const CASE_PERMISSIONS: PermissionDef[] = [
  { key: "case.view", label: "View Case Center", module: "Case Center" },
  { key: "case.create", label: "Create Cases", module: "Case Center" },
  { key: "case.edit", label: "Edit Cases", module: "Case Center" },
  { key: "case.assign", label: "Assign Cases", module: "Case Center" },
  {
    key: "case.determine_responsibility",
    label: "Determine Responsibility",
    module: "Case Center",
  },
  { key: "case.resolve", label: "Resolve Cases", module: "Case Center" },
  { key: "case.close", label: "Close Cases", module: "Case Center" },
  {
    key: "case.upload_evidence",
    label: "Upload Case Evidence",
    module: "Case Center",
  },
];
