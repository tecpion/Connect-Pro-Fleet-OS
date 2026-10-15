// Connect Pro Fleet — Copilot defense fleet-wide list handlers (Build #52).
//
// Fleet-wide factual evidence questions (lists of rentals/incidents missing
// documentation). Pure selectors over authoritative records. Never fabricate,
// never produce a legal conclusion.

import type {
  CopilotAnswer,
  CopilotAnswerItem,
  CopilotViewerPermissions,
} from "./copilotTypes";
import type { CopilotEngineContext } from "./copilotEngine";
import { baseAnswer, plural } from "./copilotShared";
import type { DefenseSources } from "./defenseTypes";

export function getDefenseSources(
  ctx: CopilotEngineContext,
): DefenseSources | null {
  return ctx.src.defense ?? null;
}

export function defenseFallback(
  intent: import("./copilotTypes").CopilotIntent,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(intent, asOf, perms, "derived");
  return {
    ...base,
    answer_type: "summary",
    summary:
      "I can pull that from the rental defense records. Open a rental or incident and ask again, and I'll show the factual documentation on file.",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: [],
  };
}

/** Rentals missing driver license verification. */
export function answerRentalsMissingLicenseVerification(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback(
      "rentals_missing_license_verification",
      ctx.asOf,
      ctx.perms,
    );
  const base = baseAnswer(
    "rentals_missing_license_verification",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  const missing = src.rentals.filter((r) => {
    const drivers = src.rentalDrivers.filter(
      (d) => d.rental_id === r.id && d.authorization_status === "active",
    );
    if (drivers.length === 0) return true;
    return drivers.some((d) => d.verification_status !== "verified");
  });

  const items: CopilotAnswerItem[] = missing.map((r) => {
    const customer = src.customers.find((c) => c.id === r.customer_id);
    const vehicle = src.vehicles.find((v) => v.id === r.vehicle_id);
    return {
      id: r.id,
      title: r.agreement_number,
      subtitle: customer
        ? `${customer.first_name} ${customer.last_name} — ${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "vehicle"}`
        : "Unknown renter",
      deep_link: `/rentals/${r.id}`,
    };
  });

  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "All active rentals have verified driver licenses on file."
        : `${items.length} ${plural(items.length, "rental")} ${plural(items.length, "is", "are")} missing driver license verification.`,
    facts: [
      { label: "Rentals missing license verification", value: items.length },
    ],
    items,
    sources: items.slice(0, 10).map((i) => ({
      source_module: "Driver",
      entity_type: "rental",
      entity_id: i.id,
      label: i.title ?? "",
      deep_link: i.deep_link ?? null,
    })),
    suggested_actions: [],
    caveats: ["Factual documentation status only — no legal conclusion."],
  };
}

/** Active rentals without a checkout inspection. */
export function answerActiveRentalsWithoutCheckout(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback(
      "active_rentals_without_checkout",
      ctx.asOf,
      ctx.perms,
    );
  const base = baseAnswer(
    "active_rentals_without_checkout",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  const activeStatuses = ["active", "checked_out", "open"];
  const missing = src.rentals.filter((r) => {
    if (!activeStatuses.includes(r.status)) return false;
    return !src.inspections.some(
      (i) =>
        i.inspection_type === "checkout" &&
        (i.reservation_id === r.reservation_id ||
          i.vehicle_id === r.vehicle_id),
    );
  });

  const items: CopilotAnswerItem[] = missing.map((r) => {
    const customer = src.customers.find((c) => c.id === r.customer_id);
    const vehicle = src.vehicles.find((v) => v.id === r.vehicle_id);
    return {
      id: r.id,
      title: r.agreement_number,
      subtitle: customer
        ? `${customer.first_name} ${customer.last_name} — ${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "vehicle"}`
        : "Unknown renter",
      deep_link: `/rentals/${r.id}`,
    };
  });

  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "All active rentals have a checkout inspection on file."
        : `${items.length} active ${plural(items.length, "rental")} ${plural(items.length, "has", "have")} no checkout inspection.`,
    facts: [{ label: "Active rentals without checkout", value: items.length }],
    items,
    sources: items.slice(0, 10).map((i) => ({
      source_module: "Inspection",
      entity_type: "rental",
      entity_id: i.id,
      label: i.title ?? "",
      deep_link: i.deep_link ?? null,
    })),
    suggested_actions: [],
    caveats: ["Factual documentation status only — no legal conclusion."],
  };
}

/** Vehicles released with a maintenance warning (from release snapshots). */
export function answerVehiclesReleasedWithMaintenanceWarning(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback(
      "vehicles_released_with_maintenance_warning",
      ctx.asOf,
      ctx.perms,
    );
  const base = baseAnswer(
    "vehicles_released_with_maintenance_warning",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  const warned = src.releaseSnapshots.filter(
    (s) =>
      s.warnings_present.length > 0 || s.maintenance_open_at_release.length > 0,
  );

  const items: CopilotAnswerItem[] = warned.map((s) => ({
    id: s.rental_id,
    title: s.agreement_number,
    subtitle: `${s.vehicle_label} — released ${s.released_at.slice(0, 10)}`,
    deep_link: `/rentals/${s.rental_id}`,
  }));

  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No vehicles were released with a maintenance warning on file."
        : `${items.length} ${plural(items.length, "vehicle")} ${plural(items.length, "was", "were")} released with a maintenance warning recorded in the release snapshot.`,
    facts: [
      {
        label: "Vehicles released with maintenance warning",
        value: items.length,
      },
    ],
    items,
    sources: items.slice(0, 10).map((i) => ({
      source_module: "Maintenance",
      entity_type: "rental",
      entity_id: i.id,
      label: i.title ?? "",
      deep_link: i.deep_link ?? null,
    })),
    suggested_actions: [],
    caveats: [
      "Based on the immutable release snapshot — reflects maintenance status at release, not current state.",
      "Factual documentation status only — no legal conclusion.",
    ],
  };
}

/** Incidents missing police reports. */
export function answerIncidentsMissingPoliceReports(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getDefenseSources(ctx);
  if (!src)
    return defenseFallback(
      "incidents_missing_police_reports",
      ctx.asOf,
      ctx.perms,
    );
  const base = baseAnswer(
    "incidents_missing_police_reports",
    ctx.asOf,
    ctx.perms,
    "derived",
  );

  const missing = src.incidents.filter((i) => !i.police_report_url);

  const items: CopilotAnswerItem[] = missing.map((inc) => {
    const vehicle = src.vehicles.find((v) => v.id === inc.vehicle_id);
    return {
      id: inc.id,
      title: `${inc.incident_type} — ${inc.occurred_at}`,
      subtitle: vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : "Unknown vehicle",
      status: inc.status,
      deep_link: `/incidents/${inc.id}`,
    };
  });

  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "All incidents have a police report on file."
        : `${items.length} ${plural(items.length, "incident")} ${plural(items.length, "is", "are")} missing a police report.`,
    facts: [{ label: "Incidents missing police reports", value: items.length }],
    items,
    sources: items.slice(0, 10).map((i) => ({
      source_module: "Incident",
      entity_type: "incident",
      entity_id: i.id,
      label: i.title ?? "",
      deep_link: i.deep_link ?? null,
    })),
    suggested_actions: [],
    caveats: ["Factual documentation status only — no legal conclusion."],
  };
}
