// Connect Pro Fleet — Compliance store provider (Build #26).
//
// Standalone tenant-scoped compliance store (mirrors the Violations provider).
// Company policy (CompliancePolicyConfig inside CompanyPolicies) is the SINGLE
// SOURCE OF TRUTH for which documents are required + the default warning window;
// this store reads it via useCompanyPolicies() and materializes it into
// ComplianceRequirement records (source: "policy"). Custom requirements
// (source: "custom") can be added on top. Compliance status is DERIVED — never
// stored as a boolean. File references are memory-mode only (Build #22 private
// storage is deferred).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DocumentRecord,
  DocumentEntityType,
  DocumentType,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceEvent,
} from "./complianceTypes";
import type {
  AddDocumentInput,
  AddOverrideInput,
  AddRequirementInput,
  ComplianceStore,
  EntityComplianceResult,
  VerifyDocumentInput,
  RejectDocumentInput,
} from "./complianceStoreInterface";
import {
  getEntityComplianceStatus,
  getVehicleComplianceBlockingReasons,
} from "./complianceStatus";
import { getCurrentDocument, getDocumentHistory } from "./complianceSelectors";
import { useCompanyPolicies } from "./store/companyPolicyStore";
import { useStore } from "./store";
import {
  buildDocumentRecord,
  makeEvent,
  applySupersede,
  verifyDoc,
  rejectDoc,
  newId,
  nowIso,
} from "./complianceMutationHelpers";
import { policyRequirements } from "./compliancePolicyMaterializer";
import {
  legacyVehicleDocuments,
  legacyCustomerDocuments,
  mergeLegacyDocuments,
} from "./complianceLegacyFallback";
import {
  seedDocuments,
  seedComplianceOverrides,
  seedComplianceEvents,
} from "./store/seedCompliance";
import { TENANT_ID } from "./store/ids";
import { useComplianceScan } from "./complianceScanWiring";
import {
  hydrateCompliance,
  persistComplianceDocumentInsert,
  persistComplianceDocumentUpdate,
  persistComplianceOverrideInsert,
  persistComplianceEventInsert,
} from "./supabase/storeSync";
import { useAuth } from "./supabase/authContext";

const ComplianceContext = createContext<ComplianceStore | null>(null);

export function ComplianceProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const cfg = companyPolicies.compliance;

  const [documents, setDocuments] = useState<DocumentRecord[]>(seedDocuments);
  const [customReqs, setCustomReqs] = useState<ComplianceRequirement[]>([]);
  const [overrides, setOverrides] = useState<ComplianceOverride[]>(
    seedComplianceOverrides,
  );
  const [events, setEvents] = useState<ComplianceEvent[]>(seedComplianceEvents);

  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;

  // Phase 3: hydrate compliance state from Cloud on auth/org change. In memory
  // mode (no Cloud config) this is a no-op and the seeded demo data stays.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateCompliance(activeOrgId, {
      setDocuments,
      setOverrides,
      setEvents,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      // Hydration must never crash the app — if the Cloud read fails (e.g. no
      // session/network in a test env) the seeded in-memory data stays as the
      // UI cache. Swallow the rejection so it does not leak as unhandled.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeOrgId]);

  const policyReqs = useMemo(
    () =>
      policyRequirements(
        cfg,
        TENANT_ID,
        companyPolicies.customer_verification?.mode ?? "basic",
      ),
    [cfg, companyPolicies.customer_verification],
  );
  const requirements = useMemo(
    () => [...policyReqs, ...customReqs],
    [policyReqs, customReqs],
  );

  // Legacy-field fallback (spec §82–84): synthesize virtual DocumentRecords
  // from existing vehicle/customer convenience fields so compliance can evaluate
  // a known expiration even when no file has been uploaded. Real structured
  // documents always win — mergeLegacyDocuments suppresses a virtual record for
  // any entity+type that already has a real uploaded/verified document. This
  // prevents dual-truth drift: legacy metadata is quick reference only until a
  // structured document exists.
  const mergedDocuments = useMemo(() => {
    const virtual: DocumentRecord[] = [];
    for (const v of store.vehicles) virtual.push(...legacyVehicleDocuments(v));
    for (const c of store.customers)
      virtual.push(...legacyCustomerDocuments(c));
    return mergeLegacyDocuments(documents, virtual);
  }, [documents, store.vehicles, store.customers]);

  const actor = store.currentStaffId ?? "system";

  const addEvent = useCallback(
    (
      documentId: string | null,
      type: ComplianceEvent["type"],
      label: string,
      meta: Record<string, unknown> | null = null,
    ) => {
      const ev = makeEvent(documentId, type, label, actor, TENANT_ID, meta);
      setEvents((prev) => [ev, ...prev]);
      persistComplianceEventInsert(ev);
    },
    [actor],
  );

  const addDocument = useCallback(
    (input: AddDocumentInput): string => {
      const rec = buildDocumentRecord(input, TENANT_ID, actor);
      setDocuments((prev) =>
        input.supersedes_document_id
          ? applySupersede([...prev, rec], input.supersedes_document_id, rec.id)
          : [...prev, rec],
      );
      addEvent(rec.id, "created", `${rec.document_type} uploaded`, {
        document_type: input.document_type,
        entity_id: input.entity_id,
      });
      persistComplianceDocumentInsert(rec);
      return rec.id;
    },
    [actor, addEvent],
  );

  const updateDocument = useCallback(
    (id: string, patch: Partial<DocumentRecord>) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, ...patch, updated_at: nowIso() } : d,
        ),
      );
      persistComplianceDocumentUpdate(TENANT_ID, id, {
        ...patch,
        updated_at: nowIso(),
      });
    },
    [],
  );

  const verifyDocument = useCallback(
    (id: string, input?: VerifyDocumentInput) => {
      setDocuments((prev) => verifyDoc(prev, id, input, actor));
      addEvent(id, "verified", "Document verified");
    },
    [actor, addEvent],
  );

  const rejectDocument = useCallback(
    (id: string, input: RejectDocumentInput) => {
      setDocuments((prev) => rejectDoc(prev, id, input, actor));
      addEvent(id, "rejected", `Document rejected — ${input.reason}`, {
        reason: input.reason,
      });
    },
    [actor, addEvent],
  );

  const archiveDocument = useCallback(
    (id: string) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, archived_at: nowIso(), updated_at: nowIso() }
            : d,
        ),
      );
      addEvent(id, "archived", "Document archived");
    },
    [actor, addEvent],
  );

  const restoreDocument = useCallback((id: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, archived_at: null, updated_at: nowIso() } : d,
      ),
    );
  }, []);

  const supersedeDocument = useCallback(
    (oldId: string, newDoc: AddDocumentInput): string => {
      const id = addDocument({ ...newDoc, supersedes_document_id: oldId });
      addEvent(oldId, "superseded", "Document superseded by new version");
      return id;
    },
    [addDocument, addEvent],
  );

  const assignStaff = useCallback(
    (documentId: string, staffId: string | null) => {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === documentId
            ? { ...d, assigned_staff_id: staffId, updated_at: nowIso() }
            : d,
        ),
      );
      addEvent(documentId, "assignment_changed", "Assignment changed", {
        staffId,
      });
    },
    [addEvent],
  );

  const addRequirement = useCallback((input: AddRequirementInput): string => {
    const id = newId("req");
    const now = nowIso();
    const full: ComplianceRequirement = {
      id,
      tenant_id: TENANT_ID,
      entity_type: input.entity_type,
      document_type: input.document_type,
      required: input.required,
      blocks_operation_if_missing: input.blocks_operation_if_missing,
      blocks_operation_if_expired: input.blocks_operation_if_expired,
      requires_verification: input.requires_verification,
      warning_days: input.warning_days,
      active: true,
      block_behavior: input.block_behavior ?? null,
      manager_override_allowed: input.manager_override_allowed ?? true,
      source: "custom",
      applies_to: input.applies_to ?? null,
      created_at: now,
      updated_at: now,
    };
    setCustomReqs((prev) => [...prev, full]);
    return id;
  }, []);

  const updateRequirement = useCallback(
    (id: string, patch: Partial<ComplianceRequirement>) => {
      setCustomReqs((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, ...patch, updated_at: nowIso() } : r,
        ),
      );
    },
    [],
  );

  const addOverride = useCallback(
    (input: AddOverrideInput): string => {
      const id = newId("cov");
      const full: ComplianceOverride = {
        id,
        tenant_id: TENANT_ID,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        document_type: input.document_type,
        requirement_id: input.requirement_id ?? null,
        reason: input.reason,
        created_by: actor,
        created_at: nowIso(),
        expires_at: input.expires_at ?? null,
        active: true,
      };
      setOverrides((prev) => [...prev, full]);
      addEvent(null, "override_added", `Compliance override added`, {
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        document_type: input.document_type,
        reason: input.reason,
      });
      return id;
    },
    [actor, addEvent],
  );

  const revokeOverride = useCallback(
    (id: string) => {
      setOverrides((prev) =>
        prev.map((o) => (o.id === id ? { ...o, active: false } : o)),
      );
      addEvent(null, "override_added", "Compliance override revoked", {
        overrideId: id,
      });
    },
    [addEvent],
  );

  const documentsForEntity = useCallback(
    (entityType: DocumentEntityType, entityId: string) =>
      documents.filter(
        (d) =>
          d.entity_type === entityType &&
          d.entity_id === entityId &&
          d.archived_at == null,
      ),
    [documents],
  );

  const currentDocument = useCallback(
    (
      entityType: DocumentEntityType,
      entityId: string,
      documentType: DocumentType,
    ) => getCurrentDocument(documents, entityType, entityId, documentType),
    [documents],
  );

  const documentHistory = useCallback(
    (
      entityType: DocumentEntityType,
      entityId: string,
      documentType: DocumentType,
    ) => getDocumentHistory(documents, entityType, entityId, documentType),
    [documents],
  );

  const eventsFor = useCallback(
    (documentId: string | null) =>
      events
        .filter((e) => e.document_id === documentId)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    [events],
  );

  const entityComplianceStatus = useCallback(
    (
      entityType: DocumentEntityType,
      entityId: string,
      entityLabel: string,
    ): EntityComplianceResult => {
      const r = getEntityComplianceStatus(
        entityType,
        entityId,
        entityLabel,
        requirements,
        mergedDocuments,
        overrides,
      );
      return {
        status: r.status,
        issues: r.issues,
        blockingReasons: r.blockingReasons,
      };
    },
    [requirements, mergedDocuments, overrides],
  );

  const vehicleComplianceBlockingReasons = useCallback(
    (vehicleId: string) =>
      getVehicleComplianceBlockingReasons(
        requirements,
        mergedDocuments,
        overrides,
        vehicleId,
      ),
    [requirements, mergedDocuments, overrides],
  );

  const complianceBlocksForVehicle = useCallback(
    (vehicleId: string) => {
      const reasons = getVehicleComplianceBlockingReasons(
        requirements,
        mergedDocuments,
        overrides,
        vehicleId,
      );
      return { blocked: reasons.length > 0, reasons };
    },
    [requirements, mergedDocuments, overrides],
  );

  const searchDocuments = useCallback(
    (query: string): DocumentRecord[] => {
      if (!query.trim()) return documents;
      const q = query.toLowerCase().trim();
      return documents.filter((d) => {
        if (d.entity_label?.toLowerCase().includes(q)) return true;
        if (d.issuer?.toLowerCase().includes(q)) return true;
        if (d.document_number?.toLowerCase().includes(q)) return true;
        if (d.state_jurisdiction?.toLowerCase().includes(q)) return true;
        if (d.original_filename?.toLowerCase().includes(q)) return true;
        return false;
      });
    },
    [documents],
  );

  const { generateComplianceTasks, generateComplianceNotifications } =
    useComplianceScan({
      store,
      cfg,
      requirements,
      mergedDocuments,
      overrides,
    });

  const value = useMemo<ComplianceStore>(
    () => ({
      documents,
      requirements,
      overrides,
      complianceEvents: events,
      documentsForEntity,
      currentDocument,
      documentHistory,
      eventsFor,
      entityComplianceStatus,
      vehicleComplianceBlockingReasons,
      complianceBlocksForVehicle,
      addDocument,
      updateDocument,
      verifyDocument,
      rejectDocument,
      archiveDocument,
      restoreDocument,
      supersedeDocument,
      assignStaff,
      addRequirement,
      updateRequirement,
      addOverride,
      revokeOverride,
      searchDocuments,
      generateComplianceTasks,
      generateComplianceNotifications,
    }),
    [
      documents,
      requirements,
      overrides,
      events,
      documentsForEntity,
      currentDocument,
      documentHistory,
      eventsFor,
      entityComplianceStatus,
      vehicleComplianceBlockingReasons,
      complianceBlocksForVehicle,
      addDocument,
      updateDocument,
      verifyDocument,
      rejectDocument,
      archiveDocument,
      restoreDocument,
      supersedeDocument,
      assignStaff,
      addRequirement,
      updateRequirement,
      addOverride,
      revokeOverride,
      searchDocuments,
      generateComplianceTasks,
      generateComplianceNotifications,
    ],
  );

  return (
    <ComplianceContext.Provider value={value}>
      {children}
    </ComplianceContext.Provider>
  );
}

export function useCompliance(): ComplianceStore {
  const ctx = useContext(ComplianceContext);
  if (!ctx)
    throw new Error("useCompliance must be used within ComplianceProvider");
  return ctx;
}
