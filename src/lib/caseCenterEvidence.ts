// Connect Pro Fleet — Case evidence requirements (Build #55).
//
// Case-type-aware evidence requirements so the Evidence tab shows only the
// evidence RELEVANT to a case category — never a wall of "Not on file" for
// evidence that doesn't apply. Each requirement is classified as Required or
// Supporting. Irrelevant evidence is omitted entirely (not shown as missing).
//
// This is a presentation-layer mapping over the authoritative evidence_links —
// it does not duplicate or store any records.

import type { CaseCategory } from "./caseCenterTypes";

export type EvidenceTier = "required" | "supporting";

export interface EvidenceRequirement {
  /** Stable key used to resolve status from caseRecord.evidence_links. */
  key: EvidenceKey;
  label: string;
  tier: EvidenceTier;
}

export type EvidenceKey =
  | "rental_record"
  | "agreement"
  | "original_charge"
  | "payment"
  | "refund_approval"
  | "customer_communication"
  | "incident"
  | "damage_claim"
  | "checkout_inspection"
  | "return_inspection"
  | "photos"
  | "repair_estimate"
  | "insurance_claim"
  | "toll_notice"
  | "possession_match"
  | "customer_charge"
  | "payment_recovery"
  | "police_report"
  | "post_incident_inspection"
  | "vault_docs"
  | "uploaded_evidence"
  | "maintenance_followup"
  | "tow_receipt";

/** Evidence requirements per case category. Only relevant evidence is listed —
 *  irrelevant evidence is NOT shown as "Not on file". */
export const CASE_EVIDENCE_REQUIREMENTS: Record<
  CaseCategory,
  EvidenceRequirement[]
> = {
  tolls_tickets: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    { key: "toll_notice", label: "Toll Notice", tier: "required" },
    { key: "possession_match", label: "Possession Match", tier: "required" },
    { key: "customer_charge", label: "Customer Charge", tier: "required" },
    {
      key: "payment_recovery",
      label: "Payment / Recovery",
      tier: "supporting",
    },
    {
      key: "customer_communication",
      label: "Customer Communication",
      tier: "supporting",
    },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
  damage_claims: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    { key: "incident", label: "Incident", tier: "supporting" },
    { key: "damage_claim", label: "Damage Claim", tier: "required" },
    {
      key: "checkout_inspection",
      label: "Checkout Inspection",
      tier: "required",
    },
    {
      key: "return_inspection",
      label: "Return Inspection",
      tier: "supporting",
    },
    { key: "photos", label: "Photos", tier: "required" },
    { key: "repair_estimate", label: "Repair Estimate", tier: "supporting" },
    { key: "insurance_claim", label: "Insurance Claim", tier: "supporting" },
    {
      key: "post_incident_inspection",
      label: "Post-Incident Inspection",
      tier: "supporting",
    },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
  customer_violations: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    { key: "agreement", label: "Agreement / Policy", tier: "required" },
    {
      key: "checkout_inspection",
      label: "Checkout Inspection",
      tier: "supporting",
    },
    { key: "return_inspection", label: "Return Inspection", tier: "required" },
    { key: "photos", label: "Photos", tier: "required" },
    { key: "customer_charge", label: "Customer Charge", tier: "supporting" },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
  deposits_refunds: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    { key: "original_charge", label: "Original Charge", tier: "required" },
    { key: "payment", label: "Payment", tier: "supporting" },
    { key: "refund_approval", label: "Refund Approval", tier: "required" },
    {
      key: "customer_communication",
      label: "Customer Communication",
      tier: "supporting",
    },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
  disputes: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    { key: "original_charge", label: "Original Charge", tier: "required" },
    { key: "customer_charge", label: "Customer Charge", tier: "required" },
    { key: "payment", label: "Payment", tier: "supporting" },
    {
      key: "customer_communication",
      label: "Customer Communication",
      tier: "required",
    },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
  roadside_recovery: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    { key: "tow_receipt", label: "Tow / Vendor Receipt", tier: "required" },
    {
      key: "maintenance_followup",
      label: "Maintenance Follow-Up",
      tier: "supporting",
    },
    { key: "customer_charge", label: "Customer Charge", tier: "supporting" },
    { key: "photos", label: "Photos", tier: "supporting" },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
  general: [
    { key: "rental_record", label: "Rental Record", tier: "required" },
    {
      key: "customer_communication",
      label: "Customer Communication",
      tier: "supporting",
    },
    {
      key: "uploaded_evidence",
      label: "Uploaded Evidence",
      tier: "supporting",
    },
  ],
};

export type EvidenceStatus = "on_file" | "missing" | "not_applicable";

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, string> = {
  on_file: "On file",
  missing: "Missing",
  not_applicable: "Not applicable",
};

/** Inputs needed to resolve evidence status — the authoritative case record
 *  plus its linked records (resolved by the caller). Keeping this a pure
 *  function keeps CaseDetail lean and the resolution testable. */
export interface EvidenceResolutionInputs {
  rental_id: string | null;
  customer_charge_ids: string[];
  payment_ids: string[];
  deposit_application_ids: string[];
  refund_ids: string[];
  expense_ids: string[];
  insurance_claim_refs: string[];
  violation_present: boolean;
  violation_number: string | null;
  incident_present: boolean;
  damage_claim_present: boolean;
  damage_claim_number: string | null;
  inspection_ids: string[];
  vault_doc_refs: string[];
  uploaded_file_refs: string[];
  possession_match: string | null;
  maintenance_work_order_id: string | null;
}

export interface EvidenceResolutionResult {
  status: EvidenceStatus;
  value: string;
  link: string | null;
}

/** Resolve a single evidence requirement's status from authoritative links.
 *  Pure — no React, no store access. */
export function resolveEvidenceStatus(
  key: EvidenceKey,
  i: EvidenceResolutionInputs,
): EvidenceResolutionResult {
  const count = (n: number, label: string) =>
    n > 0 ? `${n} ${label}` : "Missing";
  switch (key) {
    case "rental_record":
    case "agreement":
      return {
        status: i.rental_id ? "on_file" : "missing",
        value: i.rental_id ? "On file" : "Missing",
        link: i.rental_id ? `/rentals/${i.rental_id}` : null,
      };
    case "original_charge":
    case "customer_charge":
      return {
        status: i.customer_charge_ids.length > 0 ? "on_file" : "missing",
        value: count(i.customer_charge_ids.length, "linked"),
        link: null,
      };
    case "payment":
      return {
        status: i.payment_ids.length > 0 ? "on_file" : "missing",
        value: count(i.payment_ids.length, "linked"),
        link: null,
      };
    case "payment_recovery": {
      const n = i.payment_ids.length + i.deposit_application_ids.length;
      return {
        status: n > 0 ? "on_file" : "missing",
        value: count(n, "linked"),
        link: null,
      };
    }
    case "refund_approval":
      return {
        status: i.refund_ids.length > 0 ? "on_file" : "missing",
        value: count(i.refund_ids.length, "linked"),
        link: null,
      };
    case "incident":
      return {
        status: i.incident_present ? "on_file" : "missing",
        value: i.incident_present ? "On file" : "Missing",
        link: i.incident_present ? "/incidents-violations" : null,
      };
    case "damage_claim":
      return {
        status: i.damage_claim_present ? "on_file" : "missing",
        value: i.damage_claim_number ?? "Missing",
        link: i.damage_claim_present ? "/damage-claims" : null,
      };
    case "checkout_inspection":
    case "return_inspection":
    case "post_incident_inspection":
      return {
        status: i.inspection_ids.length > 0 ? "on_file" : "missing",
        value: count(i.inspection_ids.length, "linked"),
        link: null,
      };
    case "photos":
    case "customer_communication":
    case "tow_receipt":
      return {
        status: i.uploaded_file_refs.length > 0 ? "on_file" : "missing",
        value: count(i.uploaded_file_refs.length, "files"),
        link: null,
      };
    case "repair_estimate":
      return {
        status: i.expense_ids.length > 0 ? "on_file" : "missing",
        value: i.expense_ids.length > 0 ? "On file" : "Missing",
        link: null,
      };
    case "insurance_claim":
      return {
        status: i.insurance_claim_refs.length > 0 ? "on_file" : "missing",
        value: i.insurance_claim_refs.length > 0 ? "On file" : "Missing",
        link: null,
      };
    case "toll_notice":
      return {
        status:
          i.violation_present || i.vault_doc_refs.length > 0
            ? "on_file"
            : "missing",
        value: i.violation_number
          ? i.violation_number
          : i.vault_doc_refs.length > 0
            ? `${i.vault_doc_refs.length} docs`
            : "Missing",
        link: null,
      };
    case "possession_match": {
      const pm = i.possession_match;
      if (!pm) return { status: "missing", value: "Missing", link: null };
      return {
        status: pm === "matched" ? "on_file" : "missing",
        value:
          pm === "matched"
            ? "Matched"
            : pm === "ambiguous"
              ? "Ambiguous — review"
              : "No match",
        link: null,
      };
    }
    case "police_report":
      return {
        status: i.vault_doc_refs.length > 0 ? "on_file" : "missing",
        value: count(i.vault_doc_refs.length, "docs"),
        link: null,
      };
    case "vault_docs":
      return {
        status: i.vault_doc_refs.length > 0 ? "on_file" : "missing",
        value: count(i.vault_doc_refs.length, "documents"),
        link: null,
      };
    case "uploaded_evidence":
      return {
        status: i.uploaded_file_refs.length > 0 ? "on_file" : "missing",
        value: count(i.uploaded_file_refs.length, "files"),
        link: null,
      };
    case "maintenance_followup":
      return {
        status: i.maintenance_work_order_id ? "on_file" : "missing",
        value: i.maintenance_work_order_id ? "Work order linked" : "Missing",
        link: null,
      };
    default:
      return { status: "not_applicable", value: "Not applicable", link: null };
  }
}
