// Connect Pro Fleet — Copilot customer handlers (Build #29).
//
// Each handler calls authoritative selectors (Build #27 Customer 360) and
// returns structured answer data. Balances are gated by canViewFinancials;
// document numbers masked by canViewSensitiveDocs. No risk score is derived.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
  EntityRef,
} from "./copilotTypes";
import {
  buildCustomerOperationalContext,
  type ViewerPermissions,
} from "./aiContextBuilders";
import { getCustomer360Summary } from "./customer360Selectors";
import { baseAnswer, formatMoney, gateAmount, plural } from "./copilotShared";

function toViewer(perms: CopilotViewerPermissions): ViewerPermissions {
  return { ...perms };
}

export function answerCustomerSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("customer_summary", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  const ctx = buildCustomerOperationalContext(
    custId,
    src.customer360,
    toViewer(perms),
    asOf,
  );
  const sum = ctx.summary;
  return {
    ...base,
    answer_type: "entity",
    summary: `${ctx.customerName} — ${ctx.relationshipStatus}.`,
    facts: [
      {
        label: "Active rental",
        value: sum.activeRental ? sum.activeRental.agreementNumber : "None",
      },
      { label: "Total rentals", value: sum.totalRentals },
      {
        label: "Outstanding balance",
        value: gateAmount(sum.outstandingBalance, perms) ?? "—",
        financial: true,
      },
      {
        label: "Overdue amount",
        value: gateAmount(sum.overdueAmount, perms) ?? "—",
        financial: true,
      },
      { label: "Next payment due", value: sum.nextPaymentDue ?? "—" },
      { label: "Open damage claims", value: sum.openDamageClaims },
      { label: "Open violations", value: sum.openViolations },
      { label: "Compliance", value: sum.complianceStatus },
      { label: "Overdue tasks", value: sum.overdueTasks },
      { label: "Account owner", value: sum.accountOwner ?? "—" },
    ],
    items: ctx.attentionItems.map((a) => ({
      id: `${custId}:${a.type}`,
      title: a.label,
      subtitle: a.detail,
    })),
    sources: [
      {
        source_module: "customers",
        entity_type: "customer",
        entity_id: custId,
        label: ctx.customerName,
        deep_link: `/customers/${custId}`,
      },
    ],
    suggested_actions: [
      {
        label: "View Customer",
        action_type: "view_customer",
        deep_link: `/customers/${custId}`,
      },
    ],
    caveats: ["No risk score is derived — only factual operational counts."],
  };
}

export function answerCustomerPaymentStatus(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("customer_payment_status", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  const sum = getCustomer360Summary(custId, src.customer360, asOf);
  return {
    ...base,
    answer_type: "entity",
    summary: perms.canViewFinancials
      ? `${entity.label} owes ${formatMoney(sum.outstandingBalance)} (${formatMoney(sum.overdueAmount)} overdue).`
      : `${entity.label}'s payment status is available to authorized users only.`,
    facts: [
      {
        label: "Outstanding balance",
        value: gateAmount(sum.outstandingBalance, perms) ?? "—",
        financial: true,
      },
      {
        label: "Overdue amount",
        value: gateAmount(sum.overdueAmount, perms) ?? "—",
        financial: true,
      },
      { label: "Next payment due", value: sum.nextPaymentDue ?? "—" },
    ],
    sources: [
      {
        source_module: "billing",
        entity_type: "customer",
        entity_id: custId,
        label: entity.label,
        deep_link: `/customers/${custId}`,
      },
    ],
  };
}

export function answerCustomerRentalHistory(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("customer_rental_history", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  const s = src.briefing.store;
  const rentals = s.rentals.filter((r) => r.customer_id === custId);
  return {
    ...base,
    answer_type: "list",
    summary: `${rentals.length} ${plural(rentals.length, "rental")} on file.`,
    facts: [{ label: "Total rentals", value: rentals.length }],
    items: rentals.slice(0, 25).map((r) => ({
      id: r.id,
      title: `Rental ${r.agreement_number ?? r.id}`,
      subtitle: r.status,
      occurred_at: r.checkout_date,
      status: r.status,
      deep_link: `/rentals/${r.id}`,
    })),
    sources: rentals.slice(0, 10).map((r) => ({
      source_module: "rentals",
      entity_type: "rental",
      entity_id: r.id,
      label: `Rental ${r.agreement_number ?? r.id}`,
      deep_link: `/rentals/${r.id}`,
    })),
  };
}

export function answerCustomerDamageHistory(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("customer_damage_history", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  const claims = (src.customer360.damageClaims ?? []).filter(
    (c) => c.customer_id === custId,
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      claims.length === 0
        ? "No damage history for this customer."
        : `${claims.length} damage ${plural(claims.length, "claim")} on file.`,
    facts: [{ label: "Damage claims", value: claims.length }],
    items: claims.slice(0, 25).map((c) => ({
      id: c.id,
      title: c.claim_number ?? c.id,
      subtitle: c.claim_status,
      occurred_at: c.created_at,
      status: c.claim_status,
      deep_link: "/damage-claims",
    })),
    sources: claims.slice(0, 10).map((c) => ({
      source_module: "damage",
      entity_type: "damage_claim",
      entity_id: c.id,
      label: c.claim_number ?? c.id,
      deep_link: "/damage-claims",
    })),
    caveats: ["Factual counts only — no character/risk judgment."],
  };
}

export function answerCustomerViolationHistory(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("customer_violation_history", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  const viols = (src.customer360.violations ?? []).filter(
    (v) => v.customer_id === custId,
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      viols.length === 0
        ? "No violation history for this customer."
        : `${viols.length} ${plural(viols.length, "violation")} on file.`,
    facts: [{ label: "Violations", value: viols.length }],
    items: viols.slice(0, 25).map((v) => ({
      id: v.id,
      title: v.violation_type ?? "Violation",
      subtitle: v.status,
      occurred_at: v.occurred_at,
      status: v.status,
      deep_link: "/violations",
    })),
    sources: [],
    caveats: ["Factual counts only — no risk score."],
  };
}

export function answerCustomerCompliance(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("customer_compliance", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  const ctx = buildCustomerOperationalContext(
    custId,
    src.customer360,
    toViewer(perms),
    asOf,
  );
  return {
    ...base,
    answer_type: "entity",
    summary: `Compliance status: ${ctx.summary.complianceStatus}.`,
    facts: [
      { label: "Compliance", value: ctx.summary.complianceStatus },
      ...ctx.documents.map((d) => ({
        label: d.document_type,
        value: `${d.status} / ${d.verification}`,
      })),
    ],
    items: ctx.documents.map((d) => ({
      id: `${custId}:${d.document_type}`,
      title: d.document_type,
      subtitle: `${d.status} / ${d.verification}`,
      status: d.document_number ? "masked" : null,
    })),
    sources: [
      {
        source_module: "compliance",
        entity_type: "customer",
        entity_id: custId,
        label: entity.label,
        deep_link: `/customers/${custId}`,
      },
    ],
    caveats: ["Document numbers are masked — raw values are never exposed."],
  };
}
