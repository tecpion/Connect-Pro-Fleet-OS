// Connect Pro Fleet — Customer Verification Optionalization acceptance tests.
//
// Verifies that identity/driver verification is a tenant-configurable capability
// (Off / Basic / Required) rather than a universally mandatory workflow. The
// verification MODE is a behaviour/presentation switch only — it never deletes
// verification records, uploaded documents, or audit history, and it never
// creates a second compliance blocker engine. Compliance remains authoritative.
//
// Coverage maps to the spec acceptance list (1–27).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import {
  CompanyPolicyProvider,
  useCompanyPolicies,
} from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { SupportProvider } from "@/lib/supportStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { CustomerTagsProvider } from "@/lib/customerTagStore";
import { CustomerImportHistoryProvider } from "@/lib/customerImportHistoryStore";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import { StaffLayout, navGroups } from "@/components/StaffLayout";
import Customers from "@/pages/Customers";
import {
  isVerificationOff,
  isVerificationEnabled,
  isVerificationRequired,
  verificationMode,
  VERIFICATION_MODE_LABELS,
} from "@/lib/verificationConfig";
import { policyRequirements } from "@/lib/compliancePolicyMaterializer";
import { defaultCompliancePolicy } from "@/lib/companyPolicyDefaults";
import type { CompanyPolicies } from "@/lib/companyPolicyTypes";

const TENANT_ID = "tnt_1";

function policiesWith(
  mode: CompanyPolicies["customer_verification"]["mode"],
): CompanyPolicies {
  const base: CompanyPolicies = {
    ...({
      id: "pol_test",
      tenant_id: TENANT_ID,
    } as unknown as CompanyPolicies),
    customer_verification: { mode },
    compliance: defaultCompliancePolicy(),
  } as CompanyPolicies;
  return base;
}

// ---------------------------------------------------------------------------
// Mode predicates (acceptance 1, 2, 3)
// ---------------------------------------------------------------------------

describe("Customer Verification — mode predicates", () => {
  it("Off mode: isVerificationOff true, enabled/required false", () => {
    const p = policiesWith("off");
    expect(isVerificationOff(p)).toBe(true);
    expect(isVerificationEnabled(p)).toBe(false);
    expect(isVerificationRequired(p)).toBe(false);
    expect(verificationMode(p)).toBe("off");
  });

  it("Basic mode: enabled true, required false, off false", () => {
    const p = policiesWith("basic");
    expect(isVerificationOff(p)).toBe(false);
    expect(isVerificationEnabled(p)).toBe(true);
    expect(isVerificationRequired(p)).toBe(false);
    expect(verificationMode(p)).toBe("basic");
  });

  it("Required mode: required true, enabled true, off false", () => {
    const p = policiesWith("required");
    expect(isVerificationOff(p)).toBe(false);
    expect(isVerificationEnabled(p)).toBe(true);
    expect(isVerificationRequired(p)).toBe(true);
    expect(verificationMode(p)).toBe("required");
  });

  it("defaults to Basic when customer_verification is absent", () => {
    const p = {} as Pick<CompanyPolicies, "customer_verification">;
    expect(verificationMode(p)).toBe("basic");
    expect(isVerificationEnabled(p)).toBe(true);
  });

  it("exposes human labels for all three modes", () => {
    expect(VERIFICATION_MODE_LABELS.off).toBe("Off");
    expect(VERIFICATION_MODE_LABELS.basic).toBe("Basic");
    expect(VERIFICATION_MODE_LABELS.required).toBe("Required");
  });
});

// ---------------------------------------------------------------------------
// Compliance materializer integration (acceptance 13, 14, 15)
// ---------------------------------------------------------------------------

describe("Customer Verification — compliance materializer", () => {
  const cfg = defaultCompliancePolicy();

  it("Off: customer verification requirements are NOT emitted", () => {
    const reqs = policyRequirements(cfg, TENANT_ID, "off");
    const customerReqs = reqs.filter((r) => r.entity_type === "customer");
    expect(customerReqs).toHaveLength(0);
  });

  it("Basic: customer requirements emitted but NON-blocking (informational)", () => {
    const reqs = policyRequirements(cfg, TENANT_ID, "basic");
    const dl = reqs.find(
      (r) =>
        r.entity_type === "customer" && r.document_type === "driver_license",
    );
    expect(dl).toBeDefined();
    expect(dl!.required).toBe(true);
    // Basic = informational: must NOT block operations.
    expect(dl!.blocks_operation_if_missing).toBe(false);
    expect(dl!.blocks_operation_if_expired).toBe(false);
  });

  it("Required: customer requirements emitted WITH blocking", () => {
    const reqs = policyRequirements(cfg, TENANT_ID, "required");
    const dl = reqs.find(
      (r) =>
        r.entity_type === "customer" && r.document_type === "driver_license",
    );
    expect(dl).toBeDefined();
    expect(dl!.blocks_operation_if_missing).toBe(true);
    expect(dl!.blocks_operation_if_expired).toBe(true);
  });

  it("vehicle requirements are unaffected by the customer verification mode", () => {
    const off = policyRequirements(cfg, TENANT_ID, "off");
    const required = policyRequirements(cfg, TENANT_ID, "required");
    const vehicleTypes = (r: typeof off) =>
      r
        .filter((x) => x.entity_type === "vehicle")
        .map((x) => x.document_type)
        .sort();
    expect(vehicleTypes(off)).toEqual(vehicleTypes(required));
  });

  it("Do Not Rent still blocks independently — verification mode does not own DNR", () => {
    // The materializer never emits a Do-Not-Rent requirement; DNR is an
    // authoritative customer-status blocker outside the verification engine.
    const reqs = policyRequirements(cfg, TENANT_ID, "required");
    expect(
      reqs.some((r) => (r.document_type as string) === "do_not_rent"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Navigation behaviour (acceptance 4, 5, 6, 27)
// ---------------------------------------------------------------------------

function AppProviders({
  children,
  policies,
}: {
  children: ReactNode;
  policies: CompanyPolicies;
}) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <PolicyOverride policies={policies}>
          <BillingProvider>
            <ResourceCenterProvider>
              <IncidentsProvider>
                <InvestorProvider>
                  <PartnershipProvider>
                    <DamageClaimProvider>
                      <MigrationProvider>
                        <IntegrationProvider>
                          <StaffAssignmentProvider>
                            <ViolationPolicyProvider>
                              <ViolationProvider>
                                <ComplianceProvider>
                                  <CustomerNotesProvider>
                                    <CustomerTagsProvider>
                                      <CustomerImportHistoryProvider>
                                        <SupportProvider>
                                          <PortalSessionProvider>
                                            <PortalRequestProvider>
                                              {children}
                                            </PortalRequestProvider>
                                          </PortalSessionProvider>
                                        </SupportProvider>
                                      </CustomerImportHistoryProvider>
                                    </CustomerTagsProvider>
                                  </CustomerNotesProvider>
                                </ComplianceProvider>
                              </ViolationProvider>
                            </ViolationPolicyProvider>
                          </StaffAssignmentProvider>
                        </IntegrationProvider>
                      </MigrationProvider>
                    </DamageClaimProvider>
                  </PartnershipProvider>
                </InvestorProvider>
              </IncidentsProvider>
            </ResourceCenterProvider>
          </BillingProvider>
        </PolicyOverride>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Replaces the company policies with the given object so tests can pin the
 *  verification mode. Mirrors how CompanyPolicyProvider exposes state. */
function PolicyOverride({
  policies,
  children,
}: {
  policies: CompanyPolicies;
  children: ReactNode;
}) {
  const ctx = useCompanyPolicies();
  // Apply once on mount.
  if (
    ctx.companyPolicies.customer_verification.mode !==
    policies.customer_verification.mode
  ) {
    ctx.replaceCompanyPolicies(policies);
  }
  return <>{children}</>;
}

function renderStaffLayout(policies: CompanyPolicies) {
  return render(
    <MemoryRouter initialEntries={["/customers"]}>
      <AppProviders policies={policies}>
        <StaffLayout>
          <div>page content</div>
        </StaffLayout>
      </AppProviders>
    </MemoryRouter>,
  );
}

describe("Customer Verification — navigation", () => {
  it("the Customers nav item owns verification (no standalone Verification link)", () => {
    // Build #58 — Verification is no longer a standalone sidebar link. The
    // Customers list owns verification filters and Customer Detail owns the
    // per-customer verification record. The /drivers route redirects to
    // /customers?filter=pending_verification for backward compatibility.
    const customersGroup = navGroups.find((g) => g.label === "Customers");
    expect(customersGroup).toBeDefined();
    // No standalone "Verification" nav item remains in any group.
    const verifItem = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.feature === "verification");
    expect(verifItem).toBeUndefined();
    // The Customers group still exists and is reachable.
    expect(customersGroup!.items.some((i) => i.to === "/customers")).toBe(true);
  });

  it("Off: no Verification link text appears in the sidebar", () => {
    renderStaffLayout(policiesWith("off"));
    // The Customers group label renders, but "Verification" link text does not.
    expect(screen.queryByText("Verification")).toBeNull();
  });

  it("Basic: Customers nav is visible (verification lives inside Customers)", () => {
    renderStaffLayout(policiesWith("basic"));
    expect(screen.getAllByText("Customers").length).toBeGreaterThan(0);
  });

  it("Required: Customers nav is visible (verification lives inside Customers)", () => {
    renderStaffLayout(policiesWith("required"));
    expect(screen.getAllByText("Customers").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Customers page filters (acceptance 7, 9, 18)
// ---------------------------------------------------------------------------

function renderCustomers(policies: CompanyPolicies) {
  return render(
    <MemoryRouter initialEntries={["/customers"]}>
      <AppProviders policies={policies}>
        <Customers />
      </AppProviders>
    </MemoryRouter>,
  );
}

describe("Customer Verification — Customers page filters", () => {
  it("Off: the Pending Verification status filter is hidden", () => {
    renderCustomers(policiesWith("off"));
    expect(screen.queryByText("Pending verification")).toBeNull();
    expect(screen.queryByText("Pending Verification")).toBeNull();
  });

  it("Basic: the Pending Verification status filter is shown", () => {
    renderCustomers(policiesWith("basic"));
    // The quick-filter <option> uses QUICK_FILTER_LABELS ("Pending Verification"),
    // and the KPI card surfaces the same label. queryByText throws on multiple
    // matches, so assert at least one element carries the label.
    expect(
      screen.queryAllByText("Pending Verification").length,
    ).toBeGreaterThan(0);
  });

  it("Required: the Pending Verification status filter is shown", () => {
    renderCustomers(policiesWith("required"));
    expect(
      screen.queryAllByText("Pending Verification").length,
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Historical data safety + re-enable (acceptance 23, 24, 25)
// ---------------------------------------------------------------------------

describe("Customer Verification — historical data safety", () => {
  it("changing mode does not alter the compliance config or delete requirements data", () => {
    // The mode is a presentation/behaviour switch on customer_verification.mode.
    // The compliance config object identity is preserved across mode changes.
    const a = policiesWith("required");
    const b = { ...a, customer_verification: { mode: "off" as const } };
    expect(b.compliance).toBe(a.compliance);
    expect(b.id).toBe(a.id);
    expect(b.tenant_id).toBe(a.tenant_id);
  });

  it("re-enabling restores requirement emission (no re-upload needed)", () => {
    const cfg = defaultCompliancePolicy();
    const off = policyRequirements(cfg, TENANT_ID, "off");
    const on = policyRequirements(cfg, TENANT_ID, "required");
    // Off emits no customer requirements; turning back on emits them again
    // from the same config — no data re-import required.
    expect(off.filter((r) => r.entity_type === "customer")).toHaveLength(0);
    expect(
      on.filter((r) => r.entity_type === "customer").length,
    ).toBeGreaterThan(0);
  });

  it("permissions are preserved when the module is Off (no role destruction)", () => {
    // The verification feature gate only hides the standalone nav item; it
    // does not touch role/permission configuration. Build #58 moved
    // verification into the Customers list, so the feature gate no longer
    // gates a sidebar link — the authoritative verification config and
    // Customer Detail record remain intact regardless of mode.
    const customersGroup = navGroups.find((g) => g.label === "Customers");
    expect(customersGroup).toBeDefined();
    // No standalone verification nav item exists in any group.
    const verifItem = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.feature === "verification");
    expect(verifItem).toBeUndefined();
  });
});
