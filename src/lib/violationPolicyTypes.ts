// Connect Pro Fleet — Tolls & Violations company policy (Build #25).
//
// Minimal structured violation-processing policy added under Company
// Policies. NOT a massive settings build — reuses the existing company
// policy architecture. Used to surface policy before a customer charge and
// to determine default responsibility. A rental's frozen policy snapshot
// (where relevant) takes precedence over today's company policy.

export type DefaultResponsibility =
  "customer" | "company" | "unknown" | "third_party";

export const DEFAULT_RESPONSIBILITY_LABELS: Record<
  DefaultResponsibility,
  string
> = {
  customer: "Customer",
  company: "Company",
  unknown: "Needs Review",
  third_party: "Third Party",
};

/** How inbound toll/violation events are processed. V1 default is
 *  Manual Review — ambiguous records are NEVER auto-charged. */
export type ViolationHandlingMode = "manual_review" | "auto_assign_exact";

export const HANDLING_MODE_LABELS: Record<ViolationHandlingMode, string> = {
  manual_review: "Manual Review",
  auto_assign_exact: "Auto-Assign When Exact Match",
};

export interface ViolationPolicy {
  /** Default responsibility for tolls. */
  default_toll_responsibility: DefaultResponsibility;
  /** Default responsibility for parking tickets. */
  default_parking_responsibility: DefaultResponsibility;
  /** Default responsibility for camera tickets (red-light / speed). */
  default_camera_responsibility: DefaultResponsibility;
  /** Optional company admin fee charged to customer for processing. */
  admin_fee_amount: number;
  /** Charge authority penalties (late penalties) to customer? */
  charge_penalties_to_customer: boolean;
  /** Allow deposit application toward violation charge? */
  allow_deposit_application: boolean;
  /** Require evidence before charging customer. */
  evidence_required_before_charge: boolean;
  /** Auto-create a review task on violation creation. */
  auto_create_review_task: boolean;
  /** Default violation owner staff id (assignment default). */
  default_violation_owner_id: string | null;
  // --- V1 Tolls & Violations Automation ---
  /** How inbound TOLL events are processed. Default manual_review. */
  toll_handling_mode: ViolationHandlingMode;
  /** How inbound non-toll violation events are processed. */
  violation_handling_mode: ViolationHandlingMode;
  /** Per-type administrative fees (separate from the legacy flat fee). When >0
   *  they override admin_fee_amount for that type. Never hardcoded by default. */
  toll_admin_fee: number;
  parking_admin_fee: number;
  camera_admin_fee: number;
  other_admin_fee: number;
}

export function defaultViolationPolicy(): ViolationPolicy {
  return {
    default_toll_responsibility: "customer",
    default_parking_responsibility: "customer",
    default_camera_responsibility: "customer",
    admin_fee_amount: 0,
    charge_penalties_to_customer: true,
    allow_deposit_application: true,
    evidence_required_before_charge: false,
    auto_create_review_task: false,
    default_violation_owner_id: null,
    toll_handling_mode: "manual_review",
    violation_handling_mode: "manual_review",
    toll_admin_fee: 0,
    parking_admin_fee: 0,
    camera_admin_fee: 0,
    other_admin_fee: 0,
  };
}
