// Connect Pro Fleet — Customer Portal composer (Build #32).
//
// Single composition pass over the authoritative sources. Composes all
// customer-safe projections into one CustomerPortalView so portal pages never
// independently scan entire stores. Reuses the canonical portal selectors:
//   - portalFinancialProjections (vehicle/rental/billing/deposit)
//   - portalDocumentSelectors (documents/notices/company contact)
//   - portalTimeline (customer-safe activity)
//   - portalMetaProjections (agreements/policies/customer profile)
//
// Requires a PortalSession (tenantId + customerId). A session may only access
// ONE customer within ONE tenant. Cross-tenant/cross-customer access is
// denied before any projection runs.

import type { FleetStore } from "./store/storeContext";
import type { BillingContextValue } from "./billingStore";
import type { ComplianceStore } from "./complianceStoreInterface";
import type { PortalSession, CustomerPortalView } from "./portalTypes";
import type { CustomerPortalRequest } from "./portalTypes";
import {
  projectVehicle,
  projectRental,
  getActiveRentals,
  getPastRentals,
  projectBilling,
  projectDeposit,
} from "./portalFinancialProjections";
import {
  portalDocumentViews,
  portalNotices,
  portalCompanyContact,
} from "./portalDocumentSelectors";
import { portalTimeline } from "./portalTimeline";
import {
  portalAgreementViews,
  portalPolicyView,
  portalCustomerProfile,
} from "./portalMetaProjections";
import { assertPortalAccess } from "./portalSessionStore";

export interface PortalSources {
  store: FleetStore;
  billing: BillingContextValue;
  compliance: ComplianceStore;
  requests?: CustomerPortalRequest[];
}

export function buildCustomerPortal(
  session: PortalSession,
  src: PortalSources,
  now: Date = new Date(),
): CustomerPortalView {
  // Enforce the session boundary BEFORE any projection. A session may only
  // access its own customer within its own tenant.
  assertPortalAccess(session, session.tenant_id, session.customer_id);

  const store = src.store;
  const customer = store.customers.find(
    (c) => c.id === session.customer_id && c.tenant_id === session.tenant_id,
  );

  const activeRentals = getActiveRentals(session.customer_id, store);
  const pastRentals = getPastRentals(session.customer_id, store);
  const selectedRentalView = activeRentals[0] ?? null;
  const rentalRecord = selectedRentalView
    ? (store.rentals.find((r) => r.id === selectedRentalView.id) ?? null)
    : null;

  const billing = projectBilling(
    session.customer_id,
    rentalRecord,
    store,
    src.billing.billingPeriods,
    store.paymentArrangements,
    now,
  );
  const vehicle = selectedRentalView?.vehicle ?? null;
  const deposit = projectDeposit(session.customer_id, rentalRecord, store);
  const documents = portalDocumentViews(session, src.compliance);
  const agreements = rentalRecord
    ? portalAgreementViews(rentalRecord, store, src.compliance)
    : [];
  const requests = (src.requests ?? []).filter(
    (r) =>
      r.customer_id === session.customer_id &&
      r.tenant_id === session.tenant_id,
  );
  const notices = portalNotices(
    session,
    store,
    src.billing,
    src.compliance,
    requests,
    now,
  );
  const timeline = portalTimeline(session, store);
  const policies = portalPolicyView(rentalRecord) ?? {
    source: "none" as const,
    payment_cutoff_time: null,
    grace_period_minutes: null,
    late_fee_summary: null,
    deposit_summary: null,
    mileage_summary: null,
    fuel_summary: null,
    return_summary: null,
    extension_summary: null,
    billing_cadence: null,
  };
  const companyContact = portalCompanyContact(store);

  return {
    customer: portalCustomerProfile(customer),
    company_contact: companyContact,
    active_rentals: activeRentals,
    past_rentals: pastRentals,
    selected_rental: selectedRentalView,
    billing,
    deposit,
    documents,
    agreements,
    requests,
    notices,
    timeline,
    policies,
    has_no_active_rental: activeRentals.length === 0,
    as_of: now.toISOString(),
  };
}
