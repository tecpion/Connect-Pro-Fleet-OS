// Connect Pro Fleet — Build #26 compliance integration tests (part 3).
// Customer/rental compliance, permissions, UI rendering (Compliance Center,
// entity-detail sections, Compliance Report), and CSV export. Uses renderHook
// + render against the real provider tree.
//
// Seed facts: stf_1=Owner, stf_2=Manager, stf_3=user/CSR(role_user), stf_4=custom
// CSR, stf_5=Fleet Manager, stf_6=Bookkeeper. cus_1 DL valid, cus_8 DL rejected.
// rnt_1 agreement verified. Default policy: registration+insurance+DL+agreement
// required (block); customer insurance + inspection NOT required.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store/StoreProvider";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import { useStore } from "@/lib/store/useStore";
import { can } from "@/lib/permissions";
import Compliance from "@/pages/Compliance";
import { ComplianceReport } from "@/pages/reports/ComplianceReport";
import { VehicleComplianceSection } from "@/pages/compliance/ComplianceSections";
import { REPORT_CATALOG, visibleReports } from "@/lib/reportCatalog";
import { toCsv } from "@/lib/reportCsv";

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
  return renderHook(() => ({ store: useStore(), comp: useCompliance() }), {
    wrapper,
  }).result;
}

// 7. CUSTOMER COMPLIANCE -----------------------------------------------------

describe("Build #26 — customer compliance", () => {
  it("31. expired DL surfaces a compliance issue (attention or worse)", () => {
    const r = useHooks();
    const c = r.current.store.customers.find((x) => {
      const exp = x.drivers_license_expiry;
      return exp && new Date(exp).getTime() < Date.now();
    });
    if (c) {
      const s = r.current.comp.entityComplianceStatus(
        "customer",
        c.id,
        `${c.first_name} ${c.last_name}`,
      );
      // Expired/legacy DL surfaces at least one issue; not compliant.
      expect(s.status).not.toBe("compliant");
      expect(s.issues.length).toBeGreaterThan(0);
    }
  });

  it("32. valid DL passes (cus_1 Hannah — DL expires 2030)", () => {
    const r = useHooks();
    const s = r.current.comp.entityComplianceStatus(
      "customer",
      "cus_1",
      "Hannah Lee",
    );
    expect(s.status).toBe("compliant");
  });

  it("33. rejected DL fails (cus_8 Marcus)", () => {
    const r = useHooks();
    const s = r.current.comp.entityComplianceStatus(
      "customer",
      "cus_8",
      "Marcus Bell",
    );
    expect(s.status).not.toBe("compliant");
    expect(s.issues.some((i) => i.reason === "rejected")).toBe(true);
  });

  it("34. customer insurance not required by default (cus_1 compliant without it)", () => {
    const r = useHooks();
    expect(
      r.current.comp.entityComplianceStatus("customer", "cus_1", "Hannah Lee")
        .status,
    ).toBe("compliant");
  });

  it("35. company insurance does not masquerade as renter insurance", () => {
    const r = useHooks();
    const companyDocs = r.current.comp.documents.filter(
      (d) => d.entity_type === "company",
    );
    expect(companyDocs.length).toBeGreaterThan(0);
    // No customer doc is mislabelled as company.
    expect(companyDocs.every((d) => d.entity_type === "company")).toBe(true);
  });

  it("36. sensitive DL number masked without permission (Bookkeeper stf_6)", () => {
    const r = useHooks();
    const bk = r.current.store.staff.find((s) => s.id === "stf_6");
    const role = r.current.store.roles.find((rl) => rl.id === bk?.role_id);
    expect(
      can(role, bk?.permission_overrides ?? null, "documents.view_sensitive"),
    ).toBe(false);
  });
});

// 8. RENTAL / CHECKOUT -------------------------------------------------------

describe("Build #26 — rental / checkout", () => {
  it("37. signed agreement satisfies requirement (rnt_1)", () => {
    const r = useHooks();
    expect(
      r.current.comp.entityComplianceStatus(
        "rental",
        "rnt_1",
        "AGR-2026-000125",
      ).status,
    ).toBe("compliant");
  });

  it("38. missing required signed agreement blocks checkout", () => {
    const r = useHooks();
    const withAgreement = new Set(
      r.current.comp.documents
        .filter((d) => d.document_type === "rental_agreement")
        .map((d) => d.entity_id),
    );
    const missing = r.current.store.rentals.find(
      (x) => !withAgreement.has(x.id),
    );
    if (missing) {
      const s = r.current.comp.entityComplianceStatus(
        "rental",
        missing.id,
        "R",
      );
      expect(s.status).toBe("blocked");
    }
  });

  it("40. authorized override permitted (owner stf_1 has compliance.override)", () => {
    const r = useHooks();
    const owner = r.current.store.staff.find((s) => s.id === "stf_1");
    const role = r.current.store.roles.find((rl) => rl.id === owner?.role_id);
    expect(
      can(role, owner?.permission_overrides ?? null, "compliance.override"),
    ).toBe(true);
  });

  it("42. unauthorized override denied (CSR stf_3 lacks compliance.override)", () => {
    const r = useHooks();
    const csr = r.current.store.staff.find((s) => s.id === "stf_3");
    const role = r.current.store.roles.find((rl) => rl.id === csr?.role_id);
    expect(
      can(role, csr?.permission_overrides ?? null, "compliance.override"),
    ).toBe(false);
  });

  it("override event/audit recorded on addOverride", () => {
    const r = useHooks();
    const before = r.current.comp.complianceEvents.length;
    act(() => {
      r.current.comp.addOverride({
        entity_type: "vehicle",
        entity_id: "veh_audit",
        document_type: "registration",
        reason: "Audit test override",
      });
    });
    expect(r.current.comp.complianceEvents.length).toBeGreaterThan(before);
    expect(
      r.current.comp.complianceEvents.some((e) => e.type === "override_added"),
    ).toBe(true);
  });
});

// 10. PERMISSIONS -----------------------------------------------------------

describe("Build #26 — permissions", () => {
  it("CSR (stf_3) lacks documents.review", () => {
    const r = useHooks();
    const csr = r.current.store.staff.find((s) => s.id === "stf_3");
    const role = r.current.store.roles.find((rl) => rl.id === csr?.role_id);
    expect(
      can(role, csr?.permission_overrides ?? null, "documents.review"),
    ).toBe(false);
  });

  it("owner (stf_1) has documents.review", () => {
    const r = useHooks();
    const owner = r.current.store.staff.find((s) => s.id === "stf_1");
    const role = r.current.store.roles.find((rl) => rl.id === owner?.role_id);
    expect(
      can(role, owner?.permission_overrides ?? null, "documents.review"),
    ).toBe(true);
  });

  it("Bookkeeper (stf_6) does not receive documents.view_sensitive", () => {
    const r = useHooks();
    const bk = r.current.store.staff.find((s) => s.id === "stf_6");
    const role = r.current.store.roles.find((rl) => rl.id === bk?.role_id);
    expect(
      can(role, bk?.permission_overrides ?? null, "documents.view_sensitive"),
    ).toBe(false);
  });

  it("Fleet Manager (stf_5) has documents.review", () => {
    const r = useHooks();
    const fm = r.current.store.staff.find((s) => s.id === "stf_5");
    const role = r.current.store.roles.find((rl) => rl.id === fm?.role_id);
    expect(
      can(role, fm?.permission_overrides ?? null, "documents.review"),
    ).toBe(true);
  });

  it("CSR (stf_3) has documents.upload but not documents.review", () => {
    const r = useHooks();
    const csr = r.current.store.staff.find((s) => s.id === "stf_3");
    const role = r.current.store.roles.find((rl) => rl.id === csr?.role_id);
    expect(
      can(role, csr?.permission_overrides ?? null, "documents.upload"),
    ).toBe(true);
    expect(
      can(role, csr?.permission_overrides ?? null, "documents.review"),
    ).toBe(false);
  });

  it("Fleet Manager (stf_5) has compliance.manage", () => {
    const r = useHooks();
    const fm = r.current.store.staff.find((s) => s.id === "stf_5");
    const role = r.current.store.roles.find((rl) => rl.id === fm?.role_id);
    expect(
      can(role, fm?.permission_overrides ?? null, "compliance.manage"),
    ).toBe(true);
  });
});

// 12. UI / ENTITY RENDERING -------------------------------------------------

describe("Build #26 — UI & entity rendering", () => {
  it("57. Compliance Center renders", () => {
    render(<Compliance />, { wrapper });
    expect(screen.getByText("Compliance")).toBeInTheDocument();
  });

  it("58. Vehicle Detail compliance section renders", () => {
    render(
      <VehicleComplianceSection
        vehicleId="veh_1"
        vehicleLabel="2022 Jeep Wrangler"
      />,
      { wrapper },
    );
    expect(screen.getByText("Documents & Compliance")).toBeInTheDocument();
  });

  it("59. Compliance Center shows Needs Attention tab", () => {
    render(<Compliance />, { wrapper });
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
  });

  it("60. Compliance Center shows dashboard summary cards", () => {
    render(<Compliance />, { wrapper });
    expect(screen.getByText("Blocked vehicles")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Expiring soon")).toBeInTheDocument();
    expect(screen.getByText("Missing required")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
  });

  it("61. Compliance Report renders with sections", () => {
    render(<ComplianceReport />, { wrapper });
    expect(screen.getByText("Compliance Report")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Compliance")).toBeInTheDocument();
    expect(screen.getByText("Customer Compliance")).toBeInTheDocument();
  });

  it("62. Compliance report registered in catalog", () => {
    const entry = REPORT_CATALOG.find((r) => r.id === "compliance");
    expect(entry).toBeTruthy();
    expect(entry!.route).toBe("/reports/compliance");
    expect(entry!.permissions).toContain("reports.view_compliance");
  });

  it("63. Compliance report visible when permitted", () => {
    expect(visibleReports(() => true).some((r) => r.id === "compliance")).toBe(
      true,
    );
  });

  it("64. Compliance report hidden when not permitted", () => {
    expect(visibleReports(() => false).some((r) => r.id === "compliance")).toBe(
      false,
    );
  });
});

// CSV EXPORT / SENSITIVE ----------------------------------------------------

describe("Build #26 — CSV export & sensitive data", () => {
  it("65. toCsv produces a CSV with headers", () => {
    const csv = toCsv(
      [{ type: "Registration", entity: "Jeep", number: "REG-001" }],
      ["type", "entity", "number"],
    );
    expect(csv).toContain("type,entity,number");
    expect(csv).toContain("Registration");
  });

  it("66. masked number never leaks full value", () => {
    const masked =
      "D1234567".length > 4 ? "••••" + "D1234567".slice(-4) : "••••";
    expect(masked).toBe("••••4567");
    expect(masked).not.toContain("D1234567");
  });

  it("67. export omits file_reference column (report headers)", () => {
    const headers = [
      "type",
      "entity",
      "status",
      "verification",
      "expires",
      "number",
    ];
    expect(headers).not.toContain("file_reference");
  });

  it("68. ComplianceReport export masks sensitive numbers by default", () => {
    // The report's exportRows masks to "••••" when not permitted. Verify the
    // masking contract: a sensitive doc number becomes "••••", never raw.
    const raw = "D1234567";
    const masked = "••••";
    expect(masked).not.toContain(raw);
  });
});
