// Connect Pro Fleet — Build #26 compliance store tests (part 2).
// Tests the ComplianceProvider (standalone store) via renderHook against the
// real provider tree, plus the compliance-availability composition (pure).
// Seed fixtures: veh_2 expired registration (blocked), veh_3 insurance
// expiring soon (attention, not blocked), veh_5 has active override for missing
// registration (not blocked while override active), cus_1 DL valid, cus_8 DL
// rejected, rnt_1 agreement verified.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store/StoreProvider";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import {
  getComplianceBlock,
  withCompliance,
} from "@/lib/complianceAvailability";
import { expirationState } from "@/lib/complianceSelectors";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "@/lib/complianceTypes";
import { TENANT_ID } from "@/lib/store/ids";

const NOW = new Date("2026-09-02T12:00:00Z");
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number) => iso(new Date(NOW.getTime() + n * DAY));

// The store-backed compliance checks (complianceBlocksForVehicle etc.) evaluate
// expiration against the real clock (`new Date()`). The seeded veh_3 insurance
// expires 2026-09-10 — "expiring soon" relative to this reference date but
// which the real calendar eventually passes. Freeze the clock to the reference
// date so the blocking assertions stay deterministic regardless of when the
// suite runs. Production compliance logic is unchanged.
beforeAll(() => {
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <ComplianceProvider>{children}</ComplianceProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}
function useHooks() {
  return renderHook(() => useCompliance(), { wrapper }).result;
}

// 6. VEHICLE BLOCKING (seeded fixtures) -------------------------------------

describe("Build #26 — vehicle blocking (store, seeded)", () => {
  it("25. veh_2 expired registration blocks vehicle", () => {
    const r = useHooks();
    const block = r.current.complianceBlocksForVehicle("veh_2");
    expect(block.blocked).toBe(true);
    expect(block.reasons.length).toBeGreaterThan(0);
  });

  it("26. veh_6 valid legacy registration+insurance → not blocked (warning only)", () => {
    const r = useHooks();
    const block = r.current.complianceBlocksForVehicle("veh_6");
    // Legacy virtual docs are valid (not expired) but unverified → attention, not blocked.
    expect(block.blocked).toBe(false);
  });

  it("26b. veh_1 blocked by expired insurance (real doc overrides valid legacy field)", () => {
    const r = useHooks();
    const block = r.current.complianceBlocksForVehicle("veh_1");
    expect(block.blocked).toBe(true);
    expect(block.reasons.some((x) => x.includes("insurance"))).toBe(true);
  });

  it("27. veh_3 insurance expiring soon does NOT block (warning only)", () => {
    const r = useHooks();
    const block = r.current.complianceBlocksForVehicle("veh_3");
    expect(block.blocked).toBe(false);
  });

  it("28. veh_5 missing registration is NOT blocked while override active", () => {
    const r = useHooks();
    const block = r.current.complianceBlocksForVehicle("veh_5");
    // Override cov_1 expires 2026-09-15 — still active at NOW.
    expect(block.blocked).toBe(false);
  });

  it("29. vehicle compliance status reflects blocking", () => {
    const r = useHooks();
    const s = r.current.entityComplianceStatus("vehicle", "veh_2", "Tesla");
    expect(s.status).toBe("blocked");
    expect(s.blockingReasons.length).toBeGreaterThan(0);
  });

  it("30. vehicle compliance status for warning-only vehicle (attention_needed)", () => {
    const r = useHooks();
    const s = r.current.entityComplianceStatus("vehicle", "veh_6", "Corolla");
    expect(s.status).toBe("attention_needed");
    expect(s.blockingReasons.length).toBe(0);
  });

  it("30b. vehicle compliance status for blocked vehicle (veh_2)", () => {
    const r = useHooks();
    const s = r.current.entityComplianceStatus("vehicle", "veh_2", "Tesla");
    expect(s.status).toBe("blocked");
  });
});

// AVAILABILITY COMPOSITION (pure) -------------------------------------------

describe("Build #26 — availability composition", () => {
  const reqs: ComplianceRequirement[] = [
    {
      id: "r",
      tenant_id: TENANT_ID,
      entity_type: "vehicle",
      document_type: "registration",
      required: true,
      blocks_operation_if_missing: true,
      blocks_operation_if_expired: true,
      requires_verification: true,
      warning_days: 30,
      active: true,
      source: "policy",
      applies_to: null,
      created_at: iso(NOW),
      updated_at: iso(NOW),
    },
  ];
  const expiredDoc: DocumentRecord = {
    id: "d",
    tenant_id: TENANT_ID,
    document_type: "registration",
    entity_type: "vehicle",
    entity_id: "veh_x",
    entity_label: "V",
    document_number: null,
    issuer: null,
    state_jurisdiction: null,
    effective_date: null,
    expiration_date: daysFromNow(-5),
    status: "verified",
    verification_status: "verified",
    file_reference: "mem://x",
    original_filename: "x",
    mime_type: null,
    notes: null,
    source: "upload",
    uploaded_by: "stf_1",
    uploaded_at: iso(NOW),
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: "stf_1",
    created_at: iso(NOW),
    updated_at: iso(NOW),
  };
  const veh = { id: "veh_x", status: "available" } as never;

  it("31. getComplianceBlock flags a compliance-blocked vehicle", () => {
    const block = getComplianceBlock("veh_x", "V", reqs, [expiredDoc], [], NOW);
    expect(block.blocked).toBe(true);
    expect(block.reasons.length).toBeGreaterThan(0);
  });

  it("32. withCompliance blocks an otherwise-available vehicle", () => {
    const block = getComplianceBlock("veh_x", "V", reqs, [expiredDoc], [], NOW);
    const result = withCompliance({ ok: true, reason: "" }, veh, block);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Compliance");
  });

  it("33. withCompliance preserves a pre-existing (maintenance) block", () => {
    const block = getComplianceBlock("veh_x", "V", reqs, [expiredDoc], [], NOW);
    const result = withCompliance(
      { ok: false, reason: "Maintenance — in shop" },
      veh,
      block,
    );
    // Maintenance block already fails; compliance does not overwrite it.
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Maintenance — in shop");
  });

  it("34. withCompliance leaves a non-blocked (warning-only) vehicle available", () => {
    const validDoc = { ...expiredDoc, expiration_date: daysFromNow(120) };
    const block = getComplianceBlock("veh_x", "V", reqs, [validDoc], [], NOW);
    expect(block.blocked).toBe(false);
    const result = withCompliance({ ok: true, reason: "" }, veh, block);
    expect(result.ok).toBe(true);
  });

  it("35. override removes compliance block from availability", () => {
    const ov: ComplianceOverride = {
      id: "ov",
      tenant_id: TENANT_ID,
      entity_type: "vehicle",
      entity_id: "veh_x",
      document_type: "registration",
      requirement_id: null,
      reason: "temp",
      created_by: "stf_1",
      created_at: iso(NOW),
      expires_at: null,
      active: true,
    };
    const block = getComplianceBlock(
      "veh_x",
      "V",
      reqs,
      [expiredDoc],
      [ov],
      NOW,
    );
    expect(block.blocked).toBe(false);
    const result = withCompliance({ ok: true, reason: "" }, veh, block);
    expect(result.ok).toBe(true);
  });
});

// STORE MUTATIONS (idempotency, versioning, review) -------------------------

describe("Build #26 — store mutations", () => {
  it("36. addDocument creates a real (non-virtual) record", () => {
    const r = useHooks();
    let id = "";
    act(() => {
      id = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_new",
        entity_label: "New",
        document_type: "registration",
        document_number: "REG-NEW",
        expiration_date: "2027-12-01",
      });
    });
    const doc = r.current.documents.find((d) => d.id === id);
    expect(doc).toBeTruthy();
    expect(doc!.document_number).toBe("REG-NEW");
    expect(doc!.verification_status).toBe("not_reviewed");
    expect(doc!.id.startsWith("virt_")).toBe(false);
  });

  it("37. verifyDocument moves to verified", () => {
    const r = useHooks();
    let id = "";
    act(() => {
      id = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_v",
        entity_label: "V",
        document_type: "registration",
      });
      r.current.verifyDocument(id);
    });
    expect(
      r.current.documents.find((d) => d.id === id)!.verification_status,
    ).toBe("verified");
  });

  it("38. rejectDocument requires reason (throws on empty)", () => {
    const r = useHooks();
    let id = "";
    act(() => {
      id = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_rj",
        entity_label: "V",
        document_type: "registration",
      });
    });
    expect(() => {
      act(() => r.current.rejectDocument(id, { reason: "" }));
    }).toThrow();
  });

  it("39. archiveDocument retains record in history", () => {
    const r = useHooks();
    let id = "";
    act(() => {
      id = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_ar",
        entity_label: "V",
        document_type: "registration",
      });
      r.current.archiveDocument(id);
    });
    const doc = r.current.documents.find((d) => d.id === id);
    expect(doc).toBeTruthy();
    expect(doc!.archived_at).toBeTruthy();
    // documentsForEntity excludes archived.
    expect(r.current.documentsForEntity("vehicle", "veh_ar").length).toBe(0);
  });

  it("40. supersedeDocument archives old and links new", () => {
    const r = useHooks();
    let oldId = "";
    let newId = "";
    act(() => {
      oldId = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_su",
        entity_label: "V",
        document_type: "insurance",
        document_number: "OLD-POL",
      });
      newId = r.current.supersedeDocument(oldId, {
        entity_type: "vehicle",
        entity_id: "veh_su",
        entity_label: "V",
        document_type: "insurance",
        document_number: "NEW-POL",
      });
    });
    const old = r.current.documents.find((d) => d.id === oldId)!;
    const next = r.current.documents.find((d) => d.id === newId)!;
    expect(old.superseded_by_document_id).toBe(newId);
    expect(old.archived_at).toBeTruthy();
    expect(next.supersedes_document_id).toBe(oldId);
  });

  it("41. currentDocument resolves to the new (superseding) record", () => {
    const r = useHooks();
    let oldId = "";
    let newId = "";
    act(() => {
      oldId = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_sc",
        entity_label: "V",
        document_type: "insurance",
        document_number: "OLD",
      });
      newId = r.current.supersedeDocument(oldId, {
        entity_type: "vehicle",
        entity_id: "veh_sc",
        entity_label: "V",
        document_type: "insurance",
        document_number: "NEW",
      });
    });
    const cur = r.current.currentDocument("vehicle", "veh_sc", "insurance");
    expect(cur?.id).toBe(newId);
  });

  it("42. documentHistory returns both old and new", () => {
    const r = useHooks();
    let oldId = "";
    let newId = "";
    act(() => {
      oldId = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_h",
        entity_label: "V",
        document_type: "insurance",
        document_number: "OLD",
      });
      newId = r.current.supersedeDocument(oldId, {
        entity_type: "vehicle",
        entity_id: "veh_h",
        entity_label: "V",
        document_type: "insurance",
        document_number: "NEW",
      });
    });
    const hist = r.current.documentHistory("vehicle", "veh_h", "insurance");
    expect(hist.length).toBe(2);
    expect(hist.some((d) => d.id === oldId)).toBe(true);
    expect(hist.some((d) => d.id === newId)).toBe(true);
  });

  it("43. assignStaff sets assigned_staff_id", () => {
    const r = useHooks();
    let id = "";
    act(() => {
      id = r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_as",
        entity_label: "V",
        document_type: "registration",
      });
      r.current.assignStaff(id, "stf_5");
    });
    expect(
      r.current.documents.find((d) => d.id === id)!.assigned_staff_id,
    ).toBe("stf_5");
  });

  it("44. addOverride records an audit event", () => {
    const r = useHooks();
    const before = r.current.complianceEvents.length;
    act(() => {
      r.current.addOverride({
        entity_type: "vehicle",
        entity_id: "veh_ov",
        document_type: "registration",
        reason: "Audit test override",
      });
    });
    expect(r.current.complianceEvents.length).toBeGreaterThan(before);
    expect(
      r.current.complianceEvents.some((e) => e.type === "override_added"),
    ).toBe(true);
  });

  it("45. revokeOverride deactivates the override", () => {
    const r = useHooks();
    let oid = "";
    act(() => {
      oid = r.current.addOverride({
        entity_type: "vehicle",
        entity_id: "veh_rv",
        document_type: "registration",
        reason: "temp",
      });
      r.current.revokeOverride(oid);
    });
    expect(r.current.overrides.find((o) => o.id === oid)!.active).toBe(false);
  });

  it("46. searchDocuments filters by entity label", () => {
    const r = useHooks();
    act(() => {
      r.current.addDocument({
        entity_type: "vehicle",
        entity_id: "veh_se",
        entity_label: "Searchable Car",
        document_type: "registration",
      });
    });
    expect(
      r.current
        .searchDocuments("Searchable")
        .some((d) => d.entity_label === "Searchable Car"),
    ).toBe(true);
  });

  it("47. addRequirement adds a custom requirement", () => {
    const r = useHooks();
    const before = r.current.requirements.length;
    act(() => {
      r.current.addRequirement({
        entity_type: "vehicle",
        document_type: "emissions",
        required: true,
        blocks_operation_if_missing: false,
        blocks_operation_if_expired: true,
        requires_verification: false,
        warning_days: 14,
      });
    });
    expect(r.current.requirements.length).toBeGreaterThan(before);
    expect(
      r.current.requirements.some(
        (x) => x.document_type === "emissions" && x.source === "custom",
      ),
    ).toBe(true);
  });
});

// NULL SAFETY (store) --------------------------------------------------------

describe("Build #26 — null safety (store)", () => {
  it("48. unknown vehicle compliance status safe (no crash)", () => {
    const r = useHooks();
    const s = r.current.entityComplianceStatus(
      "vehicle",
      "veh_does_not_exist",
      "—",
    );
    expect(s.status).toBeTruthy();
  });

  it("49. unknown customer compliance status safe", () => {
    const r = useHooks();
    const s = r.current.entityComplianceStatus(
      "customer",
      "cus_does_not_exist",
      "—",
    );
    expect(s.status).toBeTruthy();
  });

  it("50. complianceBlocksForVehicle on unknown vehicle does not crash (blocked=missing required)", () => {
    const r = useHooks();
    // Unknown vehicle has no documents → missing required registration → blocked.
    // This is correct behavior, not a crash; the call must not throw.
    const b = r.current.complianceBlocksForVehicle("veh_unknown");
    expect(typeof b.blocked).toBe("boolean");
    expect(Array.isArray(b.reasons)).toBe(true);
  });

  it("51. currentDocument on missing entity returns undefined", () => {
    const r = useHooks();
    expect(
      r.current.currentDocument("vehicle", "veh_missing", "registration"),
    ).toBeUndefined();
  });
});

// EXPIRATION BOUNDARY (deterministic, fixed reference clock) -----------------
// Documents the intended expiration behavior against a frozen reference clock
// so date drift never changes the outcome. Uses the pure `expirationState`
// selector plus the store-backed blocking path.

describe("Build #26 — expiration boundary (fixed clock)", () => {
  const REF = new Date("2026-09-02T12:00:00Z");
  const DAY_MS = 86_400_000;
  const iso = (d: Date) => d.toISOString();
  const baseDoc = (exp: string | null): DocumentRecord =>
    ({
      id: "bd",
      tenant_id: TENANT_ID,
      document_type: "registration",
      entity_type: "vehicle",
      entity_id: "veh_b",
      entity_label: "Boundary Car",
      document_number: null,
      issuer: null,
      state_jurisdiction: null,
      effective_date: null,
      expiration_date: exp,
      status: "verified",
      verification_status: "verified",
      file_reference: "mem://bd",
      original_filename: null,
      mime_type: null,
      notes: null,
      source: "upload",
      uploaded_by: "stf_1",
      uploaded_at: iso(REF),
      reviewed_by: null,
      reviewed_at: null,
      rejected_reason: null,
      archived_at: null,
      supersedes_document_id: null,
      superseded_by_document_id: null,
      location_id: null,
      assigned_staff_id: null,
      created_by: "stf_1",
      created_at: iso(REF),
      updated_at: iso(REF),
    }) as DocumentRecord;

  it("52. expiration before today → expired", () => {
    const doc = baseDoc(iso(new Date(REF.getTime() - 5 * DAY_MS)));
    expect(expirationState(doc, REF, 30)).toBe("expired");
  });

  it("53. expiration exactly today → expired (past midnight)", () => {
    // Expiration date midnight is before the reference noon → expired.
    const doc = baseDoc("2026-09-02T00:00:00Z");
    expect(expirationState(doc, REF, 30)).toBe("expired");
  });

  it("54. expiration tomorrow → expiring soon (within warning window)", () => {
    const doc = baseDoc(iso(new Date(REF.getTime() + 1 * DAY_MS)));
    expect(expirationState(doc, REF, 30)).toBe("expiring_soon");
  });

  it("55. expiration within 30 days → expiring soon (due-soon)", () => {
    const doc = baseDoc(iso(new Date(REF.getTime() + 20 * DAY_MS)));
    expect(expirationState(doc, REF, 30)).toBe("expiring_soon");
  });

  it("56. expiration far future → valid", () => {
    const doc = baseDoc(iso(new Date(REF.getTime() + 200 * DAY_MS)));
    expect(expirationState(doc, REF, 30)).toBe("valid");
  });

  it("57. no expiration date → none", () => {
    const doc = baseDoc(null);
    expect(expirationState(doc, REF, 30)).toBe("none");
  });

  it("58. store blocking path is deterministic under frozen clock (veh_3 not blocked)", () => {
    // veh_3 insurance expires 2026-09-10 — 8 days after the frozen reference
    // (2026-09-02), so it is expiring-soon (warning only), NOT blocked.
    const r = useHooks();
    const block = r.current.complianceBlocksForVehicle("veh_3");
    expect(block.blocked).toBe(false);
  });
});
