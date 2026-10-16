// Connect Pro Fleet — Build #26 compliance domain tests (part 1).
// Pure-function tests for the document lifecycle, expiration, and requirement
// evaluation. Legacy/policy/masking/overrides live in complianceDomain2.test.ts.
// All dates pinned to the 2026 seed timeline (NOW = 2026-09-02).

import { describe, it, expect } from "vitest";
import {
  expirationState,
  getExpiredDocuments,
  getDocumentsExpiringWithin,
  getCurrentDocument,
  getDocumentHistory,
} from "@/lib/complianceSelectors";
import {
  evaluateRequirement,
  getEntityComplianceStatus,
  getVehicleComplianceStatus,
  getCustomerComplianceStatus,
  severityFor,
} from "@/lib/complianceStatus";
import {
  buildDocumentRecord,
  verifyDoc,
  rejectDoc,
  applySupersede,
} from "@/lib/complianceMutationHelpers";
import type {
  DocumentRecord,
  ComplianceRequirement,
} from "@/lib/complianceTypes";
import { TENANT_ID } from "@/lib/store/ids";

const NOW = new Date("2026-09-02T12:00:00Z");
const DAY = 86_400_000;

function iso(d: Date): string {
  return d.toISOString();
}
function daysFromNow(n: number): string {
  return iso(new Date(NOW.getTime() + n * DAY));
}

function baseDoc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  const now = iso(NOW);
  return {
    id: "doc_x",
    tenant_id: TENANT_ID,
    document_type: "registration",
    entity_type: "vehicle",
    entity_id: "veh_x",
    entity_label: "Test Vehicle",
    document_number: null,
    issuer: null,
    state_jurisdiction: null,
    effective_date: null,
    expiration_date: null,
    status: "uploaded",
    verification_status: "not_reviewed",
    file_reference: "mem://docs/x.pdf",
    original_filename: "x.pdf",
    mime_type: "application/pdf",
    notes: null,
    source: "upload",
    uploaded_by: "stf_1",
    uploaded_at: now,
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: "stf_1",
    created_at: now,
    updated_at: now,
    ...over,
  };
}

const req = (
  over: Partial<ComplianceRequirement> = {},
): ComplianceRequirement => ({
  id: "req_x",
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
  ...over,
});

// ---------------------------------------------------------------------------
// 2. DOCUMENT LIFECYCLE
// ---------------------------------------------------------------------------

describe("Build #26 — document lifecycle", () => {
  it("1. addDocument builds an uploaded (not verified) record", () => {
    const d = buildDocumentRecord(
      {
        entity_type: "vehicle",
        entity_id: "veh_1",
        entity_label: "V",
        document_type: "registration",
      },
      TENANT_ID,
      "stf_1",
    );
    expect(d.status).toBe("uploaded");
    expect(d.verification_status).toBe("not_reviewed");
    expect(d.id).toBeTruthy();
  });

  it("2. upload does not equal verified", () => {
    const d = baseDoc();
    expect(d.verification_status).toBe("not_reviewed");
    expect(d.verification_status).not.toBe("verified");
  });

  it("3. verifyDocument moves to verified", () => {
    const docs = verifyDoc([baseDoc({ id: "d1" })], "d1", undefined, "stf_1");
    expect(docs[0].verification_status).toBe("verified");
    expect(docs[0].status).toBe("verified");
    expect(docs[0].reviewed_by).toBe("stf_1");
  });

  it("4. rejectDocument moves to rejected with reason", () => {
    const docs = rejectDoc(
      [baseDoc({ id: "d1" })],
      "d1",
      { reason: "unreadable" },
      "stf_1",
    );
    expect(docs[0].verification_status).toBe("rejected");
    expect(docs[0].rejected_reason).toBe("unreadable");
  });

  it("5. rejection requires a reason (throws on empty)", () => {
    expect(() =>
      rejectDoc([baseDoc({ id: "d1" })], "d1", { reason: "" }, "stf_1"),
    ).toThrow();
    expect(() =>
      rejectDoc([baseDoc({ id: "d1" })], "d1", { reason: "   " }, "stf_1"),
    ).toThrow();
  });

  it("6. supersede archives old record and links both directions", () => {
    const old = baseDoc({ id: "old" });
    const fresh = baseDoc({ id: "new", document_number: "NEW" });
    const docs = applySupersede([old, fresh], "old", "new");
    const o = docs.find((d) => d.id === "old")!;
    const n = docs.find((d) => d.id === "new")!;
    expect(o.superseded_by_document_id).toBe("new");
    expect(o.archived_at).toBeTruthy();
    expect(n.supersedes_document_id).toBe("old");
  });

  it("7. old record retained in history after supersede", () => {
    const old = baseDoc({ id: "old", document_type: "insurance" });
    const fresh = baseDoc({ id: "new", document_type: "insurance" });
    const docs = applySupersede([old, fresh], "old", "new");
    const hist = getDocumentHistory(docs, "vehicle", "veh_x", "insurance");
    expect(hist.length).toBe(2);
  });

  it("8. history ordered newest-first", () => {
    const a = baseDoc({ id: "a", uploaded_at: "2026-01-01T00:00:00Z" });
    const b = baseDoc({ id: "b", uploaded_at: "2026-08-01T00:00:00Z" });
    const hist = getDocumentHistory([a, b], "vehicle", "veh_x", "registration");
    expect(hist[0].id).toBe("b");
    expect(hist[1].id).toBe("a");
  });

  it("9. current document resolver prefers verified over uploaded", () => {
    const uploaded = baseDoc({
      id: "u",
      verification_status: "not_reviewed",
      uploaded_at: "2026-08-20T00:00:00Z",
    });
    const verified = baseDoc({
      id: "v",
      verification_status: "verified",
      uploaded_at: "2026-08-19T00:00:00Z",
    });
    const cur = getCurrentDocument(
      [uploaded, verified],
      "vehicle",
      "veh_x",
      "registration",
    );
    expect(cur?.id).toBe("v");
  });

  it("9b. current document resolver excludes archived/superseded", () => {
    const old = baseDoc({
      id: "old",
      superseded_by_document_id: "new",
      archived_at: iso(NOW),
    });
    const fresh = baseDoc({ id: "new", verification_status: "verified" });
    const cur = getCurrentDocument(
      [old, fresh],
      "vehicle",
      "veh_x",
      "registration",
    );
    expect(cur?.id).toBe("new");
  });

  it("10. archive retains record (not removed from array)", () => {
    const d = baseDoc({ id: "d1", archived_at: iso(NOW) });
    const hist = getDocumentHistory([d], "vehicle", "veh_x", "registration");
    expect(hist.length).toBe(1);
    expect(
      getCurrentDocument([d], "vehicle", "veh_x", "registration"),
    ).toBeUndefined();
  });

  it("11. non-expiring document (null expiration) is valid", () => {
    const d = baseDoc({
      expiration_date: null,
      verification_status: "verified",
    });
    expect(expirationState(d, NOW)).toBe("none");
  });

  it("12. missing file does not crash compliance evaluation", () => {
    const d = baseDoc({
      file_reference: null,
      status: "missing",
      expiration_date: null,
    });
    const r = evaluateRequirement(req(), [d], [], NOW);
    expect(r.reason).toBeTruthy();
  });

  it("13. malformed metadata does not crash", () => {
    const d = baseDoc({
      expiration_date: "not-a-date",
      verification_status: "verified",
    });
    expect(() => expirationState(d, NOW)).not.toThrow();
    expect(expirationState(d, NOW)).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// 3. EXPIRATION
// ---------------------------------------------------------------------------

describe("Build #26 — expiration", () => {
  it("14. future document (beyond warning window) is valid", () => {
    const d = baseDoc({
      expiration_date: daysFromNow(120),
      verification_status: "verified",
    });
    expect(expirationState(d, NOW, 30)).toBe("valid");
  });

  it("15. expiring soon within warning window", () => {
    const d = baseDoc({
      expiration_date: daysFromNow(10),
      verification_status: "verified",
    });
    expect(expirationState(d, NOW, 30)).toBe("expiring_soon");
  });

  it("16. not expiring soon outside warning window", () => {
    const d = baseDoc({
      expiration_date: daysFromNow(45),
      verification_status: "verified",
    });
    expect(expirationState(d, NOW, 30)).toBe("valid");
  });

  it("17. expired (past date)", () => {
    const d = baseDoc({
      expiration_date: daysFromNow(-5),
      verification_status: "verified",
    });
    expect(expirationState(d, NOW, 30)).toBe("expired");
  });

  it("18. custom warning days changes the boundary", () => {
    const d = baseDoc({
      expiration_date: daysFromNow(20),
      verification_status: "verified",
    });
    expect(expirationState(d, NOW, 30)).toBe("expiring_soon");
    expect(expirationState(d, NOW, 7)).toBe("valid");
  });

  it("19. missing expiration safe (none)", () => {
    const d = baseDoc({
      expiration_date: null,
      verification_status: "verified",
    });
    expect(expirationState(d, NOW)).toBe("none");
  });

  it("20. malformed expiration safe (none)", () => {
    const d = baseDoc({
      expiration_date: "garbage",
      verification_status: "verified",
    });
    expect(expirationState(d, NOW)).toBe("none");
  });

  it("21. verified state remains historically verified while derived expiration becomes expired", () => {
    const d = baseDoc({
      verification_status: "verified",
      status: "verified",
      expiration_date: daysFromNow(-5),
    });
    expect(expirationState(d, NOW)).toBe("expired");
    expect(d.verification_status).toBe("verified");
    expect(d.status).toBe("verified");
  });

  it("22. getExpiredDocuments excludes archived", () => {
    const expired = baseDoc({
      id: "e",
      expiration_date: daysFromNow(-5),
      verification_status: "verified",
    });
    const archived = baseDoc({
      id: "a",
      expiration_date: daysFromNow(-5),
      verification_status: "verified",
      archived_at: iso(NOW),
    });
    const out = getExpiredDocuments([expired, archived], NOW);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("e");
  });

  it("23. getDocumentsExpiringWithin excludes already-expired", () => {
    const soon = baseDoc({
      id: "s",
      expiration_date: daysFromNow(10),
      verification_status: "verified",
    });
    const past = baseDoc({
      id: "p",
      expiration_date: daysFromNow(-10),
      verification_status: "verified",
    });
    const out = getDocumentsExpiringWithin([soon, past], NOW, 30);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("s");
  });
});

// ---------------------------------------------------------------------------
// 4. REQUIREMENTS
// ---------------------------------------------------------------------------

describe("Build #26 — requirement evaluation", () => {
  it("24. required document missing → blocked", () => {
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req()],
      [],
      [],
      NOW,
    );
    expect(r.issues[0].reason).toBe("missing_required");
    expect(r.status).toBe("blocked");
  });

  it("25. required + blocking missing → Blocked with reasons", () => {
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req()],
      [],
      [],
      NOW,
    );
    expect(r.status).toBe("blocked");
    expect(r.blockingReasons.length).toBeGreaterThan(0);
  });

  it("26. optional missing → does not block", () => {
    const optional = req({
      required: false,
      blocks_operation_if_missing: false,
      blocks_operation_if_expired: false,
    });
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [optional],
      [],
      [],
      NOW,
    );
    expect(r.blockingReasons.length).toBe(0);
    expect(r.status).not.toBe("blocked");
  });

  it("27. rejected required document fails compliance", () => {
    const d = baseDoc({
      verification_status: "rejected",
      status: "rejected",
      rejected_reason: "bad",
    });
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req()],
      [d],
      [],
      NOW,
    );
    expect(r.issues.some((i) => i.reason === "rejected")).toBe(true);
    expect(r.status).not.toBe("compliant");
  });

  it("28. verified current document satisfies requirement", () => {
    const d = baseDoc({
      verification_status: "verified",
      status: "verified",
      expiration_date: daysFromNow(120),
    });
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req()],
      [d],
      [],
      NOW,
    );
    expect(r.issues.length).toBe(0);
    expect(r.status).toBe("compliant");
  });

  it("29. superseded old document does not satisfy current requirement when replacement exists", () => {
    const old = baseDoc({
      id: "old",
      verification_status: "verified",
      expiration_date: daysFromNow(-10),
      superseded_by_document_id: "new",
      archived_at: iso(NOW),
    });
    const fresh = baseDoc({
      id: "new",
      verification_status: "verified",
      expiration_date: daysFromNow(120),
    });
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req()],
      [old, fresh],
      [],
      NOW,
    );
    expect(r.status).toBe("compliant");
    expect(
      getCurrentDocument([old, fresh], "vehicle", "veh_x", "registration")?.id,
    ).toBe("new");
  });

  it("30. Not Required requirement does not create issue", () => {
    const notReq = req({
      required: false,
      blocks_operation_if_missing: false,
      blocks_operation_if_expired: false,
    });
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [notReq],
      [],
      [],
      NOW,
    );
    expect(r.issues.length).toBe(0);
  });

  it("31. inactive requirement ignored", () => {
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req({ active: false })],
      [],
      [],
      NOW,
    );
    expect(r.issues.length).toBe(0);
    expect(r.status).toBe("compliant");
  });

  it("32. pending-review required doc surfaces issue but not blocking", () => {
    const d = baseDoc({
      verification_status: "not_reviewed",
      expiration_date: daysFromNow(120),
    });
    const r = getEntityComplianceStatus(
      "vehicle",
      "veh_x",
      "V",
      [req({ requires_verification: true })],
      [d],
      [],
      NOW,
    );
    expect(r.issues.some((i) => i.reason === "pending_review")).toBe(true);
    expect(r.blockingReasons.length).toBe(0);
  });

  it("33. severity mapping", () => {
    expect(severityFor("expired")).toBe("critical");
    expect(severityFor("missing_required")).toBe("critical");
    expect(severityFor("failed_inspection")).toBe("critical");
    expect(severityFor("rejected")).toBe("high");
    expect(severityFor("expiring_soon")).toBe("medium");
    expect(severityFor("pending_review")).toBe("normal");
    expect(severityFor("file_missing")).toBe("normal");
  });

  it("56. getVehicle/CustomerComplianceStatus delegate correctly", () => {
    expect(
      getVehicleComplianceStatus("veh_x", "V", [req()], [], [], NOW).status,
    ).toBe("blocked");
    const c = getCustomerComplianceStatus(
      "cus_x",
      "C",
      [req({ entity_type: "customer", document_type: "driver_license" })],
      [],
      [],
      NOW,
    );
    expect(c.status).toBe("blocked");
  });

  it("55. empty requirement list → compliant", () => {
    expect(
      getEntityComplianceStatus("vehicle", "veh_x", "V", [], [], [], NOW)
        .status,
    ).toBe("compliant");
  });

  it("52. missing entity label safe", () => {
    expect(
      getEntityComplianceStatus("vehicle", "veh_x", "", [req()], [], [], NOW)
        .status,
    ).toBeTruthy();
  });
});
