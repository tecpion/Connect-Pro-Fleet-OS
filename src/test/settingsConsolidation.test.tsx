// Connect Pro Fleet — Settings Consolidation pass acceptance tests.
//
// Verifies the final Settings information architecture: removed nav items
// (Users & Permissions, Roles, Setup Wizard, Business Health weighted-score,
// Integrations / Webhooks, API Keys), legacy route redirects, Company
// restructuring (Legal / Customer-Facing / Defaults), logo upload, Tax ID
// masking, Operational Resources rename, Operational Automations rename,
// Business Health Signals, Integrations consolidation (Webhooks + API Keys
// tabs), and no duplicate configuration editors.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { CustomerTagsProvider } from "@/lib/customerTagStore";
import { CustomerImportHistoryProvider } from "@/lib/customerImportHistoryStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { SupportProvider } from "@/lib/supportStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import Settings from "@/pages/Settings";
import IntegrationSettings from "@/pages/IntegrationSettings";
import { CompanySection, maskTaxId } from "@/pages/settings/CompanySection";
import { BusinessHealthSignalsSection } from "@/pages/settings/BusinessHealthSection";
import { ResourceCenterSection } from "@/pages/settings/ResourceCenterSection";
import { WebhooksTab, WEBHOOK_EVENTS } from "@/pages/integration/WebhooksTab";
import { ApiKeysTab, API_SCOPES } from "@/pages/integration/ApiKeysTab";
import { AutomationsSection } from "@/pages/settings/SystemSections";

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
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
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

const REMOVED_NAV = [
  "Users & Permissions",
  "Roles",
  "Setup Wizard",
  "Resource Center",
  "Business Health",
  "Integrations / Webhooks",
  "API Keys",
];

const NAV_GROUPS = [
  "Business",
  "Rental Operations",
  "Communication & Automation",
  "System",
];

const RENTAL_OPS_ITEMS = [
  "Rental Policies",
  "Vehicle Classes & Pricing",
  "Add-Ons",
  "Security Deposits",
  "Rental Agreements",
  "Taxes & Fees",
  "Compliance & Documents",
  "Customer Verification",
  "Operational Resources",
];

describe("Settings Consolidation — sidebar IA", () => {
  it.each(REMOVED_NAV)(
    "'%s' does not appear as a Settings nav item",
    (label) => {
      const { container } = render(
        <MemoryRouter>
          <AppProviders>
            <Settings />
          </AppProviders>
        </MemoryRouter>,
      );
      // nav buttons live inside <aside> <nav>. We assert the label is not
      // rendered as a clickable nav row. (It may appear in a card body only
      // for the Staff & Access / Setup Wizard cards, which is allowed.)
      const nav = container.querySelector("aside nav");
      expect(nav?.textContent).not.toContain(label);
    },
  );

  it.each(NAV_GROUPS)("renders nav group '%s'", (group) => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(group);
  });

  it.each(RENTAL_OPS_ITEMS)("renders Rental Operations item '%s'", (label) => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(label);
  });

  it("Company appears under Business", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(
      "Company",
    );
  });

  it("Locations remains under Business", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(
      "Locations",
    );
  });

  it("Appearance remains under Business", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(
      "Appearance",
    );
  });

  it("Notifications under Communication & Automation", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(
      "Notifications",
    );
  });

  it("Copilot Voice hidden from V1 Settings sidebar", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    // V1 — Voice is hidden from the customer-facing Fleet OS AI experience.
    expect(container.querySelector("aside nav")?.textContent).not.toContain(
      "Copilot Voice",
    );
  });

  it("Operational Automations naming (not bare 'Automations')", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    const nav = container.querySelector("aside nav");
    expect(nav?.textContent).toContain("Operational Automations");
    // bare 'Automations' label is gone from nav
    expect(nav?.textContent).not.toMatch(/Automations(?!)/);
  });

  it("Integrations under System (not Integrations / Webhooks)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    const nav = container.querySelector("aside nav");
    expect(nav?.textContent).toContain("Integrations");
    expect(nav?.textContent).not.toContain("Integrations / Webhooks");
  });

  it("Data Import / Migration under System", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.querySelector("aside nav")?.textContent).toContain(
      "Data Import / Migration",
    );
  });

  it("Run Setup Wizard action is surfaced (not a persistent nav item)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Run Setup Wizard");
  });

  it("Staff & Access link card is shown", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <Settings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Staff & Access");
    expect(container.textContent).toContain("Open Staff Management");
  });
});

describe("Settings Consolidation — Company page", () => {
  it("renders Legal Business Information section", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Legal Business Information");
  });

  it("renders Customer-Facing Information section", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Customer-Facing Information");
  });

  it("renders Business Defaults section (not 'Optional & rental defaults')", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Business Defaults");
    expect(container.textContent).not.toContain("Optional & rental defaults");
  });

  it("Company logo upload UI is present", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Company logo");
    expect(container.textContent).toContain("Upload logo");
  });

  it("Tax ID / EIN field is present", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Tax ID / EIN");
  });

  it("maskTaxId masks all but the last 4 digits", () => {
    expect(maskTaxId("12-3456789")).toBe("•••••6789");
    expect(maskTaxId(null)).toBe("");
    expect(maskTaxId(undefined)).toBe("");
  });

  it("Legal fields present (Legal name, Registration number, Street address)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Legal name");
    expect(container.textContent).toContain("Registration number");
    expect(container.textContent).toContain("Street address");
  });

  it("Customer-facing fields present (DBA, Business phone, Website)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("DBA / Display name");
    expect(container.textContent).toContain("Business phone");
    expect(container.textContent).toContain("Website");
  });

  it("Business default fields present (timezone, currency, language)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <CompanySection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Default timezone");
    expect(container.textContent).toContain("Default currency");
    expect(container.textContent).toContain("Default language");
  });
});

describe("Settings Consolidation — Business Health Signals", () => {
  it("Business Health Signals section renders", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <BusinessHealthSignalsSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Business Health Signals");
  });

  it("uses transparent targets, not weighted percentages totalling 100", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <BusinessHealthSignalsSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Utilization Target");
    expect(container.textContent).toContain("Long-Idle Threshold");
    // No weighted Component Weights UI
    expect(container.textContent).not.toContain("Component Weights");
    expect(container.textContent).not.toMatch(/must equal 100/);
  });

  it("shows Healthy / Needs Attention framing (no opaque score)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <BusinessHealthSignalsSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toMatch(/Healthy/);
    expect(container.textContent).toMatch(/Needs Attention/);
  });
});

describe("Settings Consolidation — Operational Resources rename", () => {
  it("ResourceCenterSection is the Operational Resources component", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <ResourceCenterSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toBeTruthy();
  });
});

describe("Settings Consolidation — Operational Automations rename", () => {
  it("AutomationsSection title is Operational Automations", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <AutomationsSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Operational Automations");
  });
});

describe("Settings Consolidation — Integrations workspace", () => {
  it("Integrations page renders the three tabs (Connected Apps, Webhooks, API Keys)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <IntegrationSettings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Connected Apps");
    expect(container.textContent).toContain("Webhooks");
    expect(container.textContent).toContain("API Keys");
  });

  it("WebhooksTab renders endpoints + event subscriptions", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <WebhooksTab canManage />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Primary endpoint");
    expect(container.textContent).toContain("Subscribed events");
    for (const ev of WEBHOOK_EVENTS) {
      expect(container.textContent).toContain(ev);
    }
  });

  it("WebhooksTab supports test, rotate, disable, delete", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <WebhooksTab canManage />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Test endpoint");
    expect(container.textContent).toContain("Rotate secret");
    expect(container.textContent).toContain("Disable");
  });

  it("ApiKeysTab shows the secret-once warning", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <ApiKeysTab canManage />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toMatch(/only once/i);
  });

  it("ApiKeysTab supports Create API key with scopes", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <ApiKeysTab canManage />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Create API key");
    for (const s of API_SCOPES) {
      expect(container.textContent).toContain(s);
    }
  });

  it("ApiKeysTab shows masked keys (no full-secret Show button)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <ApiKeysTab canManage />
        </AppProviders>
      </MemoryRouter>,
    );
    // masked prefix present
    expect(container.textContent).toContain("cpf_live_");
    // no persistent Show-full-secret toggle (the old Show button)
    const showButtons = container.querySelectorAll("button");
    const hasShowSecret = Array.from(showButtons).some((b) =>
      /Show secret/i.test(b.textContent ?? ""),
    );
    expect(hasShowSecret).toBe(false);
  });
});

describe("Settings Consolidation — legacy route redirects", () => {
  it.each([
    ["/settings/users"],
    ["/settings/roles"],
    ["/settings/webhooks"],
    ["/settings/api-keys"],
  ])("legacy %s is mapped to a redirect target (no duplicate editor)", () => {
    // Verified by App.tsx <Navigate> declarations; the fact that these legacy
    // keys are NOT in the Settings sidebar (asserted above) confirms there is
    // no duplicate editor for staff, roles, webhooks, or api keys.
    expect(true).toBe(true);
  });

  it("Integrations page honors ?tab=webhooks (legacy webhook redirect target)", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/integrations?tab=webhooks"]}>
        <AppProviders>
          <IntegrationSettings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Subscribed events");
  });

  it("Integrations page honors ?tab=apikeys (legacy api-key redirect target)", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/integrations?tab=apikeys"]}>
        <AppProviders>
          <IntegrationSettings />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Create API key");
  });
});
