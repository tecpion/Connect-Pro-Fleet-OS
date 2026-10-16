// Connect Pro Fleet — Compliance + Verification Supabase repository adapters
// (Phase 3). Split into its own module so repositoryAdapters.ts stays focused.
//
// Concrete repository implementations backed by the typed Supabase client.
// Each delegates to the row/domain mappers and normalizes errors. Used only
// when Supabase is configured; in memory mode the factory returns nulls.

import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceEvent,
} from "../complianceTypes";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationAuditEvent,
  VerificationUsageCharge,
} from "../verificationTypes";
import type { getSupabase } from "./client";
import {
  type ComplianceRepository,
  type VerificationRepository,
  normalizeError,
} from "./repository";
import {
  rowToDocumentRecord,
  documentRecordToRow,
  documentRecordPatchToRow,
  rowToComplianceRequirement,
  complianceRequirementToRow,
  rowToComplianceOverride,
  complianceOverrideToRow,
  rowToComplianceEvent,
  complianceEventToRow,
  rowToVerificationRequest,
  verificationRequestToRow,
  rowToVerificationRequirement,
  verificationRequirementToRow,
  rowToVerificationOverride,
  verificationOverrideToRow,
  rowToVerificationAuditEvent,
  verificationAuditEventToRow,
  rowToVerificationUsageCharge,
  verificationUsageChargeToRow,
} from "./complianceVerificationMappers";
import type {
  ComplianceOverrideRow,
  VerificationRequestRow,
  VerificationRequirementRow,
  VerificationUsageChargeRow,
} from "./dbTypesComplianceVerification";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

// ── Compliance repository adapter ────────────────────────────────

export class SupabaseComplianceRepository implements ComplianceRepository {
  constructor(private db: Db) {}
  async listDocuments(orgId: string): Promise<DocumentRecord[]> {
    const { data, error } = await this.db
      .from("compliance_documents")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToDocumentRecord);
  }
  async listDocumentsForEntity(
    orgId: string,
    entityType: string,
    entityId: string,
  ): Promise<DocumentRecord[]> {
    const { data, error } = await this.db
      .from("compliance_documents")
      .select("*")
      .eq("organization_id", orgId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToDocumentRecord);
  }
  async insertDocument(d: DocumentRecord): Promise<DocumentRecord> {
    const { data, error } = await this.db
      .from("compliance_documents")
      .insert(documentRecordToRow(d))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToDocumentRecord(data);
  }
  async updateDocument(
    orgId: string,
    id: string,
    patch: Partial<DocumentRecord>,
  ): Promise<DocumentRecord> {
    const { data, error } = await this.db
      .from("compliance_documents")
      .update(documentRecordPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToDocumentRecord(data);
  }
  async listRequirements(orgId: string): Promise<ComplianceRequirement[]> {
    const { data, error } = await this.db
      .from("compliance_requirements")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToComplianceRequirement);
  }
  async upsertRequirement(
    r: ComplianceRequirement,
  ): Promise<ComplianceRequirement> {
    const { data, error } = await this.db
      .from("compliance_requirements")
      .upsert(complianceRequirementToRow(r))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToComplianceRequirement(data);
  }
  async listOverrides(orgId: string): Promise<ComplianceOverride[]> {
    const { data, error } = await this.db
      .from("compliance_overrides")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToComplianceOverride);
  }
  async insertOverride(o: ComplianceOverride): Promise<ComplianceOverride> {
    const { data, error } = await this.db
      .from("compliance_overrides")
      .insert(complianceOverrideToRow(o))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToComplianceOverride(data);
  }
  async updateOverride(
    orgId: string,
    id: string,
    patch: Partial<ComplianceOverride>,
  ): Promise<ComplianceOverride> {
    const row: Partial<ComplianceOverrideRow> = {};
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.expires_at !== undefined) row.expires_at = patch.expires_at;
    if (patch.reason !== undefined) row.reason = patch.reason;
    const { data, error } = await this.db
      .from("compliance_overrides")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToComplianceOverride(data);
  }
  async listEvents(orgId: string): Promise<ComplianceEvent[]> {
    const { data, error } = await this.db
      .from("compliance_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToComplianceEvent);
  }
  async insertEvent(e: ComplianceEvent): Promise<ComplianceEvent> {
    const { data, error } = await this.db
      .from("compliance_events")
      .insert(complianceEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToComplianceEvent(data);
  }
}

// ── Verification repository adapter ──────────────────────────────

export class SupabaseVerificationRepository implements VerificationRepository {
  constructor(private db: Db) {}
  async listRequests(orgId: string): Promise<VerificationRequest[]> {
    const { data, error } = await this.db
      .from("verification_requests")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVerificationRequest);
  }
  async insertRequest(v: VerificationRequest): Promise<VerificationRequest> {
    const { data, error } = await this.db
      .from("verification_requests")
      .insert(verificationRequestToRow(v))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationRequest(data);
  }
  async updateRequest(
    orgId: string,
    id: string,
    patch: Partial<VerificationRequest>,
  ): Promise<VerificationRequest> {
    // Build a partial row from only the patched fields so .update() receives a
    // clean Partial<VerificationRequestRow> (no excess/unknown keys).
    const full = verificationRequestToRow({
      ...({} as VerificationRequest),
      ...patch,
    });
    const row: Partial<VerificationRequestRow> = {};
    for (const [k, v] of Object.entries(full)) {
      if (patch[k as keyof VerificationRequest] !== undefined) {
        (row as Record<string, unknown>)[k] = v;
      }
    }
    const { data, error } = await this.db
      .from("verification_requests")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationRequest(data);
  }
  async listRequirements(orgId: string): Promise<VerificationRequirement[]> {
    const { data, error } = await this.db
      .from("verification_requirements")
      .select("*")
      .eq("organization_id", orgId)
      .order("required_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVerificationRequirement);
  }
  async insertRequirement(
    r: VerificationRequirement,
  ): Promise<VerificationRequirement> {
    const { data, error } = await this.db
      .from("verification_requirements")
      .insert(verificationRequirementToRow(r))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationRequirement(data);
  }
  async updateRequirement(
    orgId: string,
    id: string,
    patch: Partial<VerificationRequirement>,
  ): Promise<VerificationRequirement> {
    const row: Partial<VerificationRequirementRow> = {};
    if (patch.removed !== undefined) row.removed = patch.removed;
    if (patch.removed_by_staff_id !== undefined)
      row.removed_by_staff_id = patch.removed_by_staff_id;
    if (patch.removed_at !== undefined) row.removed_at = patch.removed_at;
    const { data, error } = await this.db
      .from("verification_requirements")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationRequirement(data);
  }
  async listOverrides(orgId: string): Promise<VerificationOverride[]> {
    const { data, error } = await this.db
      .from("verification_overrides")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVerificationOverride);
  }
  async insertOverride(o: VerificationOverride): Promise<VerificationOverride> {
    const { data, error } = await this.db
      .from("verification_overrides")
      .insert(verificationOverrideToRow(o))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationOverride(data);
  }
  async listAudit(orgId: string): Promise<VerificationAuditEvent[]> {
    const { data, error } = await this.db
      .from("verification_audit_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVerificationAuditEvent);
  }
  async insertAudit(
    e: VerificationAuditEvent,
  ): Promise<VerificationAuditEvent> {
    const { data, error } = await this.db
      .from("verification_audit_events")
      .insert(verificationAuditEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationAuditEvent(data);
  }
  async listUsageCharges(orgId: string): Promise<VerificationUsageCharge[]> {
    const { data, error } = await this.db
      .from("verification_usage_charges")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToVerificationUsageCharge);
  }
  async insertUsageCharge(
    c: VerificationUsageCharge,
  ): Promise<VerificationUsageCharge> {
    const { data, error } = await this.db
      .from("verification_usage_charges")
      .insert(verificationUsageChargeToRow(c))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationUsageCharge(data);
  }
  async updateUsageCharge(
    orgId: string,
    id: string,
    patch: Partial<VerificationUsageCharge>,
  ): Promise<VerificationUsageCharge> {
    const row: Partial<VerificationUsageChargeRow> = {};
    if (patch.status !== undefined) row.status = patch.status;
    const { data, error } = await this.db
      .from("verification_usage_charges")
      .update(row)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToVerificationUsageCharge(data);
  }
}
