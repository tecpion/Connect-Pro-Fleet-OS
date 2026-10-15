// Connect Pro Fleet — Customer Portal document + notices + company contact (Build #32).
//
// Customer-safe document projection from the authoritative ComplianceStore.
// Sensitive document numbers (DL, policy #) are masked. Missing required
// documents surface as "Needed". Notices are DERIVED from actual billing
// obligations + document expiry + request status — never fabricated.

import type { FleetStore } from "./store/storeContext";
import type { BillingContextValue } from "./billingStore";
import type { ComplianceStore } from "./complianceStoreInterface";
import type {
  PortalDocumentView,
  PortalNotice,
  PortalCompanyContact,
  PortalSession,
} from "./portalTypes";
import { PORTAL_DOCUMENT_STATUS_LABELS } from "./portalTypes";
import { documentTypeLabel } from "./complianceTypes";
import { getPaymentObligations } from "./billingSelectors";
import { fmtMoney, fmtDateShort } from "./format";
import { maskDocumentNumber } from "./portalMasking";
import type { CustomerPortalRequest } from "./portalTypes";

export function portalDocumentViews(
  session: PortalSession,
  compliance: ComplianceStore,
): PortalDocumentView[] {
  const docs = compliance.documents.filter(
    (d) =>
      d.entity_type === "customer" &&
      d.entity_id === session.customer_id &&
      d.tenant_id === session.tenant_id,
  );
  return docs.map((d) => ({
    id: d.id,
    document_type: d.document_type,
    document_type_label: documentTypeLabel(d.document_type),
    status: d.status,
    status_label: PORTAL_DOCUMENT_STATUS_LABELS[d.status] ?? d.status,
    document_number_masked: d.document_number
      ? maskDocumentNumber(d.document_number)
      : null,
    issuer: d.issuer ?? null,
    expiration_date: d.expiration_date ?? null,
    file_reference: d.file_reference ?? null,
    rejected_reason: d.rejected_reason ?? null,
    uploaded_at: d.uploaded_at ?? null,
    reviewed_at: d.reviewed_at ?? null,
  }));
}

export function portalNotices(
  session: PortalSession,
  store: FleetStore,
  billing: BillingContextValue,
  compliance: ComplianceStore,
  requests: CustomerPortalRequest[],
  now: Date = new Date(),
): PortalNotice[] {
  const notices: PortalNotice[] = [];
  const obligations = getPaymentObligations(
    store.rentals.filter(
      (r) =>
        r.customer_id === session.customer_id &&
        r.tenant_id === session.tenant_id,
    ),
    billing.billingPeriods,
    store.transactions,
    now,
  );
  for (const ob of obligations) {
    if (ob.bucket === "late") {
      notices.push({
        id: `notice_late_${ob.rentalId}_${ob.period.id}`,
        priority: "action_needed",
        title: "Your payment is past due",
        detail: `${fmtMoney(ob.amountDue)} was due ${fmtDateShort(ob.period.due_at)}.`,
        deep_link: "/portal/payments",
      });
    } else if (ob.bucket === "due_today") {
      notices.push({
        id: `notice_due_${ob.rentalId}_${ob.period.id}`,
        priority: "important",
        title: "Payment due today",
        detail: `${fmtMoney(ob.amountDue)} is due today.`,
        deep_link: "/portal/payments",
      });
    } else if (ob.bucket === "due_tomorrow") {
      notices.push({
        id: `notice_due_tom_${ob.rentalId}_${ob.period.id}`,
        priority: "important",
        title: "Payment due tomorrow",
        detail: `${fmtMoney(ob.amountDue)} is due tomorrow.`,
        deep_link: "/portal/payments",
      });
    }
  }
  // Document expiring soon / expired / rejected
  for (const d of compliance.documents) {
    if (
      d.entity_type !== "customer" ||
      d.entity_id !== session.customer_id ||
      d.tenant_id !== session.tenant_id
    )
      continue;
    if (d.status === "expiring_soon") {
      notices.push({
        id: `notice_doc_expiring_${d.id}`,
        priority: "important",
        title: `${documentTypeLabel(d.document_type)} expiring soon`,
        detail: d.expiration_date
          ? `Expires ${fmtDateShort(d.expiration_date)}`
          : null,
        deep_link: "/portal/documents",
      });
    } else if (d.status === "expired") {
      notices.push({
        id: `notice_doc_expired_${d.id}`,
        priority: "action_needed",
        title: `${documentTypeLabel(d.document_type)} expired`,
        detail: "Please upload a renewed document.",
        deep_link: "/portal/documents",
      });
    } else if (d.status === "rejected") {
      notices.push({
        id: `notice_doc_rejected_${d.id}`,
        priority: "action_needed",
        title: `${documentTypeLabel(d.document_type)} needs replacement`,
        detail: d.rejected_reason ?? null,
        deep_link: "/portal/documents",
      });
    }
  }
  // Request status notices
  for (const req of requests) {
    if (req.status === "approved") {
      notices.push({
        id: `notice_req_approved_${req.id}`,
        priority: "update",
        title: `${req.request_type === "extension" ? "Extension" : "Request"} approved`,
        detail: req.staff_response,
        deep_link: "/portal/requests",
      });
    } else if (req.status === "under_review") {
      notices.push({
        id: `notice_req_review_${req.id}`,
        priority: "update",
        title: "Your request is under review",
        detail: null,
        deep_link: "/portal/requests",
      });
    }
  }
  return notices;
}

export function portalCompanyContact(store: FleetStore): PortalCompanyContact {
  const info = store.companyInfo;
  const defaultLoc =
    store.locations.find((l) => l.is_default) ?? store.locations[0];
  const businessName = info.dba || info.legal_name || "Connect Pro Fleet";
  return {
    name: businessName,
    phone: defaultLoc?.phone ?? info.business_phone ?? null,
    email: info.support_email ?? info.business_email ?? null,
    business_hours_summary: null,
    address:
      defaultLoc?.address ??
      [info.street, info.city, info.state].filter(Boolean).join(", ") ??
      null,
    after_hours_contact: null,
  };
}
