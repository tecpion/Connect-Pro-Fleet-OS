// Connect Pro Fleet — Copilot defense entity-scoped handlers (Build #52).
//
// Entity-scoped factual evidence questions (defense record, documentation
// package, driver authorization, release insurance/maintenance). Historical
// questions use the immutable Release Snapshot + incident-driver historical
// authorization — NOT current state. Pure selectors. Never fabricate, never
// produce a legal conclusion.

import type {
  CopilotAnswer,
  CopilotViewerPermissions,
  EntityRef,
} from "./copilotTypes";
import type { CopilotEngineContext } from "./copilotEngine";
import { baseAnswer, plural } from "./copilotShared";
import { disambiguationAnswer, resolveEntities } from "./copilotResolver";
import type { DefenseSources } from "./defenseTypes";
import { buildRentalDefenseRecord } from "./rentalDefenseRecord";
import {
  buildDocumentationReadiness,
  buildIncidentDocumentationPackage,
} from "./documentationReadiness";
import {
  getDefenseSources,
  defenseFallback,
} from "./copilotDefenseListHandlers";

const LEGAL_CONCLUSION_TERMS = [
  "graves",
  "protected",
  "liability",
  "liable",
  "legally compliant",
  "legal score",
];

function customerNameFn(src: DefenseSources): (id: string) => string {
  return (id: string) => {
    const c = src.customers.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "Unknown";
  };
}

function resolveRentalEntity(
  query: string,
  ctx: CopilotEngineContext,
): { entity: EntityRef | null; answer: CopilotAnswer | null } {
  const { refs, ambiguous } = resolveEntities(query, ctx.src);
  const rentals = refs.filter((r) => r.type === "rental");
  if (ambiguous && rentals.length > 1) {
    return {
      entity: null,
      answer: disambiguationAnswer(
        rentals,
        "rental_defense_record",
        ctx.asOf,
        ctx.perms,
      ),
    };
  }
  if (rentals.length === 1) return { entity: rentals[0], answer: null };
  return { entity: null, answer: null };
}

/** Authorized additional driver check (entity-scoped). */
export function answerAuthorizedDriverCheck(
  entity: EntityRef,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback("authorized_driver_check", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "authorized_driver_check",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  const rentalId = entity.type === "rental" ? entity.id : null;
  const rental = rentalId ? src.rentals.find((r) => r.id === rentalId) : null;
  if (!rental) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I couldn't find that rental. Which rental agreement do you mean?",
    };
  }

  const drivers = src.rentalDrivers.filter((d) => d.rental_id === rental.id);
  const additional = drivers.filter(
    (d) => d.role === "additional" && d.authorization_status === "active",
  );
  const customer = src.customers.find((c) => c.id === rental.customer_id);
  const renterName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : "renter";

  return {
    ...base,
    answer_type: "summary",
    summary:
      additional.length > 0
        ? `Yes — ${rental.agreement_number} (${renterName}) has ${additional.length} authorized additional ${plural(additional.length, "driver")}: ${additional.map((d) => d.full_name).join(", ")}.`
        : `No — ${rental.agreement_number} (${renterName}) has no authorized additional drivers on file. Only the primary renter is recorded.`,
    facts: [
      { label: "Authorized additional drivers", value: additional.length },
      { label: "Primary renter", value: renterName },
    ],
    items: drivers.map((d) => ({
      id: d.id,
      title: d.full_name,
      subtitle: `${d.role === "primary" ? "Primary" : "Additional"} — ${d.authorization_status}${d.relationship ? ` (${d.relationship})` : ""}`,
    })),
    sources: [
      {
        source_module: "Driver",
        entity_type: "rental",
        entity_id: rental.id,
        label: rental.agreement_number,
        deep_link: `/rentals/${rental.id}`,
      },
    ],
    suggested_actions: [],
    caveats: [
      "A person is authorized only when an active driver record exists — not merely because their name appears in a field.",
      "Factual documentation status only — no legal conclusion.",
    ],
  };
}

/** Generate documentation package (entity-scoped: rental or incident). */
export function answerGenerateDocumentationPackage(
  entity: EntityRef | null,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback(
      "generate_documentation_package",
      ctx.asOf,
      ctx.perms,
    );
  const base = baseAnswer(
    "generate_documentation_package",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  let rentalId: string | null = null;
  let incidentId: string | null = null;
  if (entity) {
    // EntityRef.type is currently "customer" | "vehicle" | "rental"; the
    // incident branch is reached only when the resolver widens to incidents.
    // Cast keeps the incident-scoped package path intact without a dead
    // comparison the type system flags as unreachable.
    const etype = entity.type as string;
    if (etype === "rental") rentalId = entity.id;
    else if (etype === "incident") {
      incidentId = entity.id;
      const inc = src.incidents.find((i) => i.id === incidentId);
      if (inc?.reservation_id) {
        const rental = src.rentals.find(
          (r) => r.reservation_id === inc.reservation_id,
        );
        if (rental) rentalId = rental.id;
      }
    }
  }
  if (!rentalId) {
    const { entity: rentEntity, answer } = resolveRentalEntity(query, ctx);
    if (answer) return answer;
    if (rentEntity) rentalId = rentEntity.id;
  }
  if (!rentalId) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I can compile the incident documentation package. Which rental or accident do you mean? For example, 'Create the documentation package for Hannah's rental.'",
    };
  }

  const pkg = buildIncidentDocumentationPackage(
    rentalId,
    incidentId,
    src,
    customerNameFn(src),
  );

  return {
    ...base,
    answer_type: "list",
    summary: `Documentation package for ${pkg.rental_id}: ${pkg.on_file_count} of ${pkg.items.length} items on file. ${pkg.not_on_file_count} item(s) show "Not on file".`,
    facts: [
      { label: "Items on file", value: pkg.on_file_count },
      { label: "Items not on file", value: pkg.not_on_file_count },
    ],
    items: pkg.items.map((it) => ({
      id: `${pkg.rental_id}:${it.index}`,
      title: it.label,
      subtitle:
        it.status === "on_file"
          ? `On file — ${it.source_module}`
          : "Not on file",
      deep_link: null,
    })),
    sources: [
      {
        source_module: "Documentation Package",
        entity_type: "rental",
        entity_id: pkg.rental_id,
        label: "Incident Documentation Package",
        deep_link: `/rentals/${pkg.rental_id}`,
      },
    ],
    suggested_actions: [],
    caveats: [
      "Missing items are shown as 'Not on file' — no document is fabricated.",
      "Factual documentation index only — no legal conclusion.",
    ],
  };
}

/** Rental defense record (entity-scoped). */
export function answerRentalDefenseRecord(
  entity: EntityRef | null,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback("rental_defense_record", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "rental_defense_record",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  let rentalId: string | null = entity?.type === "rental" ? entity.id : null;
  if (!rentalId) {
    const { entity: rentEntity, answer } = resolveRentalEntity(query, ctx);
    if (answer) return answer;
    if (rentEntity) rentalId = rentEntity.id;
  }
  if (!rentalId) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I can show the rental defense record. Which rental do you mean? For example, 'Show me the defense record for Hannah's rental.'",
    };
  }

  const record = buildRentalDefenseRecord(rentalId, src, customerNameFn(src));
  if (!record) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't find that rental's defense record.",
    };
  }

  return {
    ...base,
    answer_type: "summary",
    summary: `Defense record for ${record.agreement_number} (${record.renter.primary_renter_name}): ${record.authorized_drivers.length} driver(s) recorded, checkout ${record.checkout ? "on file" : "missing"}, release snapshot ${record.release_snapshot ? "captured" : "not captured"}, ${record.incidents.length} incident(s).`,
    facts: [
      { label: "Agreement", value: record.agreement_number },
      { label: "Primary renter", value: record.renter.primary_renter_name },
      { label: "Authorized drivers", value: record.authorized_drivers.length },
      {
        label: "Checkout inspection",
        value: record.checkout ? "On file" : "Missing",
      },
      {
        label: "Release snapshot",
        value: record.release_snapshot ? "Captured" : "Not captured",
      },
      { label: "Incidents", value: record.incidents.length },
    ],
    items: record.incidents.map((inc) => ({
      id: inc.incident_id,
      title: `${inc.incident_type} — ${inc.occurred_at}`,
      subtitle: inc.driver_authorization
        ? `Driver: ${inc.actual_driver_name ?? "unknown"} (${inc.driver_authorization})`
        : "Driver not recorded",
      status: inc.status,
      deep_link: `/incidents/${inc.incident_id}`,
    })),
    sources: [
      {
        source_module: "Rental Record",
        entity_type: "rental",
        entity_id: record.rental_id,
        label: record.agreement_number,
        deep_link: `/rentals/${record.rental_id}`,
      },
    ],
    suggested_actions: [],
    caveats: [
      "Factual documentation record only — no legal conclusion.",
      "Historical (at-release) and current state are shown distinctly where relevant.",
    ],
  };
}

/** Driver authorization check (historical — from incident driver fact). */
export function answerDriverAuthorizationCheck(
  entity: EntityRef | null,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback("driver_authorization_check", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "driver_authorization_check",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  let incidentId: string | null = null;
  let rentalId: string | null = null;
  if (entity) {
    const etype = entity.type as string;
    if (etype === "incident") incidentId = entity.id;
    else if (etype === "rental") rentalId = entity.id;
  }
  if (!incidentId && !rentalId) {
    const { entity: rentEntity, answer } = resolveRentalEntity(query, ctx);
    if (answer) return answer;
    if (rentEntity) rentalId = rentEntity.id;
  }

  let incident = incidentId
    ? src.incidents.find((i) => i.id === incidentId)
    : null;
  if (!incident && rentalId) {
    const rental = src.rentals.find((r) => r.id === rentalId);
    if (rental) {
      incident = src.incidents.find(
        (i) =>
          i.reservation_id === rental.reservation_id ||
          i.vehicle_id === rental.vehicle_id,
      );
    }
  }
  if (!incident) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I can check driver authorization from the incident record. Which rental or incident do you mean?",
    };
  }

  const driver = incident.incident_driver;
  if (!driver) {
    return {
      ...base,
      answer_type: "summary",
      summary: `The incident on ${incident.occurred_at} does not have a recorded driver. No driver authorization fact is on file.`,
      caveats: ["Factual documentation status only — no legal conclusion."],
    };
  }

  return {
    ...base,
    answer_type: "summary",
    summary: `At the time of the incident on ${incident.occurred_at}, the driver was ${driver.actual_driver_name}. Authorization status as of the incident: ${driver.authorization_at_incident}. This is a historical fact — later revocation does not alter it.`,
    facts: [
      { label: "Driver", value: driver.actual_driver_name },
      {
        label: "Authorization at incident",
        value: driver.authorization_at_incident,
      },
      { label: "Incident date", value: incident.occurred_at },
    ],
    sources: [
      {
        source_module: "Incident",
        entity_type: "incident",
        entity_id: incident.id,
        label: `${incident.incident_type} — ${incident.occurred_at}`,
        deep_link: `/incidents/${incident.id}`,
      },
    ],
    suggested_actions: [],
    caveats: [
      "Authorization is captured AS OF the incident date — later revocation does not alter the historical fact.",
      "Factual documentation only — no legal conclusion.",
    ],
  };
}

/** Release insurance status (historical — from release snapshot). */
export function answerReleaseInsuranceStatus(
  entity: EntityRef | null,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback("release_insurance_status", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "release_insurance_status",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  let rentalId: string | null = entity?.type === "rental" ? entity.id : null;
  if (!rentalId) {
    const { entity: rentEntity, answer } = resolveRentalEntity(query, ctx);
    if (answer) return answer;
    if (rentEntity) rentalId = rentEntity.id;
  }
  if (!rentalId) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I can show the insurance status at release from the release snapshot. Which rental do you mean?",
    };
  }

  const snapshot = src.releaseSnapshots.find((s) => s.rental_id === rentalId);
  if (!snapshot) {
    return {
      ...base,
      answer_type: "summary",
      summary:
        "No release snapshot exists for this rental, so the insurance status at release is not on file.",
      caveats: ["Factual documentation status only — no legal conclusion."],
    };
  }

  const atRelease = snapshot.compliance_at_release;
  return {
    ...base,
    answer_type: "summary",
    summary: `At release on ${snapshot.released_at.slice(0, 10)}, insurance status was ${atRelease.insurance_status}${atRelease.insurance_expiration ? ` (current through ${atRelease.insurance_expiration})` : ""}. This is the historical fact — current insurance may differ.`,
    facts: [
      { label: "Insurance at release", value: atRelease.insurance_status },
      {
        label: "Insurance expiration at release",
        value: atRelease.insurance_expiration ?? "Not on file",
      },
      { label: "Released at", value: snapshot.released_at },
    ],
    sources: [
      {
        source_module: "Release Snapshot",
        entity_type: "rental",
        entity_id: snapshot.rental_id,
        label: snapshot.agreement_number,
        deep_link: `/rentals/${snapshot.rental_id}`,
      },
    ],
    suggested_actions: [],
    caveats: [
      "From the immutable release snapshot — reflects insurance status at release, not current state.",
      "Factual documentation only — no legal conclusion.",
    ],
  };
}

/** Release safety maintenance (historical — from release snapshot). */
export function answerReleaseSafetyMaintenance(
  entity: EntityRef | null,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback("release_safety_maintenance", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "release_safety_maintenance",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  let rentalId: string | null = entity?.type === "rental" ? entity.id : null;
  if (!rentalId) {
    const { entity: rentEntity, answer } = resolveRentalEntity(query, ctx);
    if (answer) return answer;
    if (rentEntity) rentalId = rentEntity.id;
  }
  if (!rentalId) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I can show the safety maintenance status at checkout from the release snapshot. Which rental do you mean?",
    };
  }

  const snapshot = src.releaseSnapshots.find((s) => s.rental_id === rentalId);
  if (!snapshot) {
    return {
      ...base,
      answer_type: "summary",
      summary:
        "No release snapshot exists for this rental, so the maintenance status at release is not on file.",
      caveats: ["Factual documentation status only — no legal conclusion."],
    };
  }

  const openItems = snapshot.maintenance_open_at_release;
  const safetyOpen = snapshot.safety_critical_maintenance_open;
  return {
    ...base,
    answer_type: "summary",
    summary: safetyOpen
      ? `At release on ${snapshot.released_at.slice(0, 10)}, there ${plural(openItems.length, "was", "were")} ${openItems.length} open maintenance ${plural(openItems.length, "item")}, including safety-critical items. This is the historical fact.`
      : `At release on ${snapshot.released_at.slice(0, 10)}, there ${plural(openItems.length, "was", "were")} ${openItems.length} open maintenance ${plural(openItems.length, "item")} and no safety-critical items were open. This is the historical fact.`,
    facts: [
      { label: "Open maintenance at release", value: openItems.length },
      {
        label: "Safety-critical open at release",
        value: safetyOpen ? "Yes" : "No",
      },
      { label: "Released at", value: snapshot.released_at },
    ],
    items: openItems.map((m) => ({
      id: m.work_order_id,
      title: m.title,
      subtitle: `${m.maintenance_type} — ${m.work_order_number}${m.safety_critical ? " (safety-critical)" : ""}`,
    })),
    sources: [
      {
        source_module: "Release Snapshot",
        entity_type: "rental",
        entity_id: snapshot.rental_id,
        label: snapshot.agreement_number,
        deep_link: `/rentals/${snapshot.rental_id}`,
      },
    ],
    suggested_actions: [],
    caveats: [
      "From the immutable release snapshot — reflects maintenance status at release, not current state.",
      "Factual documentation only — no legal conclusion.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Legal-conclusion guard
// ---------------------------------------------------------------------------

/** Detect whether a query asks for a legal conclusion. Copilot must NOT
 *  assert Graves protection / liability / "legally compliant". */
export function isLegalConclusionQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return LEGAL_CONCLUSION_TERMS.some((t) => lower.includes(t));
}

/** A factual summary + legal-review recommendation for legal-conclusion
 *  questions. Never asserts a legal conclusion. */
export function answerLegalConclusionRefusal(
  query: string,
  entity: EntityRef | null,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  const base = baseAnswer(
    "rental_defense_record",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  let rentalId: string | null = entity?.type === "rental" ? entity.id : null;
  let docSummary = "";
  if (src && !rentalId) {
    const { entity: rentEntity } = resolveRentalEntity(query, ctx);
    if (rentEntity) rentalId = rentEntity.id;
  }
  if (src && rentalId) {
    const readiness = buildDocumentationReadiness(
      rentalId,
      null,
      src,
      customerNameFn(src),
    );
    const complete = readiness.rental.items.filter(
      (i) => i.status === "complete",
    ).length;
    const missing = readiness.rental.items.filter(
      (i) => i.status === "missing",
    ).length;
    docSummary = ` For ${rentalId}, ${complete} documentation item(s) are complete and ${missing} are missing.`;
  }

  return {
    ...base,
    answer_type: "summary",
    summary: `I can't provide a legal conclusion about liability or Graves Amendment protection — that's a legal determination for your counsel. What I can do is summarize the factual documentation on file.${docSummary} I'd recommend legal review of the available records.`,
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: [
      "Copilot records facts only — it does not determine legal liability or Graves protection.",
      "Recommend legal review of the factual documentation.",
    ],
  };
}

export { defenseFallback, getDefenseSources };
export type { CopilotViewerPermissions };
