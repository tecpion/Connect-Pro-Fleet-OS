// Connect Pro Fleet — Customer Portal meta projections (Build #32).
//
// Agreements, policies, customer profile. All DERIVED from authoritative
// sources. Frozen rental policy snapshot preferred over current company
// policy so later company changes never rewrite an active rental's terms.

import type { FleetStore } from "./store/storeContext";
import type { ComplianceStore } from "./complianceStoreInterface";
import type { RentalAgreement, Customer } from "./types";
import type {
  PortalAgreementView,
  PortalPolicyView,
  PortalCustomerProfile,
} from "./portalTypes";

export function portalAgreementViews(
  rental: RentalAgreement,
  store: FleetStore,
  compliance?: ComplianceStore,
): PortalAgreementView[] {
  const agreements: PortalAgreementView[] = [];
  // Rental agreement documents attached to the rental entity (compliance store).
  const docs = compliance?.documents ?? [];
  for (const d of docs) {
    if (d.entity_type !== "rental" || d.entity_id !== rental.id) continue;
    if (
      d.document_type === "rental_agreement" ||
      d.document_type === "extension_agreement"
    ) {
      agreements.push({
        id: d.id,
        agreement_type: d.document_type,
        agreement_type_label:
          d.document_type === "extension_agreement"
            ? "Extension Agreement"
            : "Rental Agreement",
        status: d.status,
        status_label: d.status === "verified" ? "Signed" : "Signature pending",
        signed_date: d.uploaded_at ?? rental.checkout_date ?? null,
        version: d.issuer ?? "1.0",
        file_reference: d.file_reference ?? null,
        requires_signature: d.status !== "verified" && !rental.checkout_date,
      });
    }
  }
  // Fallback: a rental with a checkout_date has an implied signed agreement
  // even if no document record exists yet.
  if (agreements.length === 0 && rental.checkout_date) {
    agreements.push({
      id: `${rental.id}-rental-agreement`,
      agreement_type: "rental_agreement",
      agreement_type_label: "Rental Agreement",
      status: "active",
      status_label: "Signed",
      signed_date: rental.checkout_date,
      version: "1.0",
      file_reference: null,
      requires_signature: false,
    });
  }
  return agreements;
}

function describeMileagePolicy(m: {
  type: string;
  allowance: number;
  overage_rate: number;
}): string {
  if (m.type === "unlimited") return "Unlimited mileage";
  return `${m.allowance} miles ${m.type.replace("_", " ")}, $${m.overage_rate}/mi over`;
}

function describeFuelPolicy(f: { type: string }): string {
  const labels: Record<string, string> = {
    same_level: "Return at the same fuel level",
    full_to_full: "Full to full",
    prepaid: "Prepaid fuel",
    included: "Fuel included",
    custom: "Custom fuel policy",
  };
  return labels[f.type] ?? "Fuel policy applies";
}

function describeLatePolicy(
  lf: {
    enabled: boolean;
    type: string;
    fixed_amount: number;
    percentage: number;
  },
  cutoff: string | null,
  grace: number,
): string {
  if (!lf.enabled) return "No late fee";
  const fee =
    lf.type === "fixed"
      ? `$${lf.fixed_amount} late fee`
      : lf.type === "percentage"
        ? `${lf.percentage}% late fee`
        : "Late fee applies";
  const graceStr = grace ? ` after ${grace} min grace` : "";
  const cutoffStr = cutoff ? ` if unpaid by ${cutoff}` : "";
  return `${fee}${cutoffStr}${graceStr}`;
}

export function portalPolicyView(
  rental: RentalAgreement | null,
): PortalPolicyView | null {
  if (!rental) return null;
  const snap = rental.policy_snapshot ?? null;
  return {
    source: snap ? "rental_snapshot" : "company_current",
    payment_cutoff_time:
      snap?.payment_cutoff_time ?? rental.payment_cutoff_time ?? null,
    grace_period_minutes:
      snap?.grace_period_minutes ?? rental.grace_period ?? null,
    late_fee_summary: snap
      ? describeLatePolicy(
          snap.late_fee,
          snap.payment_cutoff_time,
          snap.grace_period_minutes,
        )
      : null,
    deposit_summary: snap
      ? snap.deposit.requirement === "not_required"
        ? "No deposit required"
        : `$${snap.deposit.amount} deposit`
      : rental.deposit_amount
        ? `$${rental.deposit_amount} deposit`
        : null,
    mileage_summary: snap ? describeMileagePolicy(snap.mileage) : null,
    fuel_summary: snap ? describeFuelPolicy(snap.fuel) : null,
    return_summary: snap?.returns.return_cutoff_time
      ? `Return by ${snap.returns.return_cutoff_time}`
      : rental.scheduled_return_time
        ? `Return by ${rental.scheduled_return_time}`
        : "Return by end of day",
    extension_summary: snap
      ? "Contact the rental company to request an extension."
      : null,
    billing_cadence:
      snap?.billing_cadence ?? rental.billing_config?.billing_frequency ?? null,
  };
}

export function portalCustomerProfile(
  customer: Customer | undefined,
): PortalCustomerProfile {
  if (!customer) {
    return {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      address: null,
      city: null,
      state: null,
      zip: null,
    };
  }
  return {
    first_name: customer.first_name,
    last_name: customer.last_name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
  };
}
