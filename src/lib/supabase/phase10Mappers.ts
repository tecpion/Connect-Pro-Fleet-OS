// Connect Pro Fleet — Phase 10B Lead row ↔ domain mappers.
//
// Maps between the Phase 10B LeadRow (dbTypesPhase10) and the Lead domain
// object (leadTypes). JSON columns cast through `unknown` because the flexible
// Json union isn't directly assignable. No rental-operational fields live on a
// Lead; the mapper never touches Customer/Reservation/Rental state.

import type { Lead, LeadSource, LeadStatus } from "../leadTypes";
import type { LeadRow } from "./dbTypesPhase10";

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function toObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    organization_id: r.organization_id,
    first_name: r.first_name,
    last_name: r.last_name,
    phone: r.phone,
    email: r.email,
    source: r.source as LeadSource,
    status: r.status as LeadStatus,
    tags: toStringArray(r.tags),
    crm_opportunity_id: r.crm_opportunity_id,
    crm_pipeline_stage: r.crm_pipeline_stage,
    lead_source: r.lead_source,
    intake_data: toObject(r.intake_data),
    notes: r.notes,
    converted_booking_request_id: r.converted_booking_request_id,
    converted_at: r.converted_at,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function leadToRow(l: Lead): LeadRow {
  return {
    id: l.id,
    organization_id: l.organization_id,
    first_name: l.first_name,
    last_name: l.last_name,
    phone: l.phone,
    email: l.email,
    source: l.source,
    status: l.status,
    tags: l.tags,
    crm_opportunity_id: l.crm_opportunity_id,
    crm_pipeline_stage: l.crm_pipeline_stage,
    lead_source: l.lead_source,
    intake_data: l.intake_data as unknown as Json,
    notes: l.notes,
    converted_booking_request_id: l.converted_booking_request_id,
    converted_at: l.converted_at,
    created_by: l.created_by,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

export function leadPatchToRow(patch: Partial<Lead>): Partial<LeadRow> {
  const row: Partial<LeadRow> = {};
  if (patch.first_name !== undefined) row.first_name = patch.first_name;
  if (patch.last_name !== undefined) row.last_name = patch.last_name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.crm_opportunity_id !== undefined)
    row.crm_opportunity_id = patch.crm_opportunity_id;
  if (patch.crm_pipeline_stage !== undefined)
    row.crm_pipeline_stage = patch.crm_pipeline_stage;
  if (patch.lead_source !== undefined) row.lead_source = patch.lead_source;
  if (patch.intake_data !== undefined)
    row.intake_data = patch.intake_data as unknown as Json;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.converted_booking_request_id !== undefined)
    row.converted_booking_request_id = patch.converted_booking_request_id;
  if (patch.converted_at !== undefined) row.converted_at = patch.converted_at;
  return row;
}