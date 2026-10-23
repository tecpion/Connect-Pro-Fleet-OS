// Connect Pro Fleet — Settings shell (Settings Consolidation pass).
//
// Final information architecture:
//   BUSINESS — Company, Locations, Appearance
//   RENTAL OPERATIONS — Rental Policies, Vehicle Classes & Pricing, Add-Ons,
//     Security Deposits, Rental Agreements, Taxes & Fees, Compliance & Documents,
//     Customer Verification, Operational Resources
//   COMMUNICATION & AUTOMATION — Notifications, Copilot Voice, Operational Automations
//   SYSTEM — Integrations, Data Import / Migration
//
// Removed from Settings as standalone editors (now authoritative elsewhere):
//   Users & Permissions, Roles → Staff workspace
//   Integrations / Webhooks, API Keys → Integrations workspace
//   Setup Wizard → compact "Run Setup Wizard" action (no permanent nav item)
//   Business Health (weighted-score page) → Business Health Signals
//
// Legacy section keys (users, roles, webhooks, apikeys, setupWizard,
// businessHealth, integrations) still resolve here for deep links but are
// NOT shown as permanent navigation destinations.

import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Building2,
  MapPin,
  Tag,
  Package,
  DollarSign,
  FileSignature,
  Palette,
  Receipt,
  Bell,
  SlidersHorizontal,
  Rocket,
  ShieldCheck,
  Mic,
  UserCheck,
  BookCheck,
  Plug,
  Database,
  Users as UsersIcon,
} from "lucide-react";

import { CompanySection } from "./settings/CompanySection";
import { LocationsSection } from "./settings/LocationsSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { CopilotVoiceSettingsSection } from "./settings/CopilotVoiceSettingsSection";
import { VehicleClassesSection } from "./settings/VehicleClassesSection";
import { AddonsSection } from "./settings/AddonsSection";
import { DepositsSection } from "./settings/DepositsSection";
import { AgreementsSection } from "./settings/AgreementsSection";
import { ResourceCenterSection } from "./settings/ResourceCenterSection";
import { TaxFeesSection } from "./settings/TaxFeesSection";
import { NotificationsSection } from "./settings/NotificationsSection";
import { AutomationsSection } from "./settings/SystemSections";
import { RentalPoliciesSection } from "./settings/RentalPoliciesSection";
import { ViolationsSettingsSection } from "./settings/ViolationsSettingsSection";
import { ComplianceSettingsSection } from "./settings/ComplianceSettingsSection";
import { BusinessHealthSignalsSection } from "./settings/BusinessHealthSection";
import { CompanySetupWizard } from "./settings/CompanySetupWizard";
import { CustomerVerificationSection } from "./settings/CustomerVerificationSection";
import { CustomMenuLinksSection } from "./settings/CustomMenuLinksSection";
import MigrationCenter from "./MigrationCenter";

// ---------------------------------------------------------------------------
// Settings shell — secondary grouped navigation
// ---------------------------------------------------------------------------

type SectionKey =
  | "company"
  | "locations"
  | "appearance"
  | "copilotVoice"
  // legacy keys kept for deep-link compatibility — not shown in nav
  | "users"
  | "roles"
  | "setupWizard"
  | "businessHealth"
  | "integrations"
  | "apikeys"
  | "webhooks"
  // active nav destinations
  | "rentalPolicies"
  | "pricing"
  | "addons"
  | "deposits"
  | "agreements"
  | "resourceCenter"
  | "taxfees"
  | "violations"
  | "compliance"
  | "customerVerification"
  | "notifications"
  | "automations"
  | "migration";

interface NavItem {
  key: SectionKey;
  label: string;
  icon: any;
}
interface NavSection {
  group: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    group: "Business",
    items: [
      { key: "company", label: "Company", icon: Building2 },
      { key: "locations", label: "Locations", icon: MapPin },
      { key: "appearance", label: "Appearance", icon: Palette },
    ],
  },
  {
    group: "Rental Operations",
    items: [
      {
        key: "rentalPolicies",
        label: "Rental Policies",
        icon: SlidersHorizontal,
      },
      { key: "pricing", label: "Vehicle Classes & Pricing", icon: Tag },
      { key: "addons", label: "Add-Ons", icon: Package },
      { key: "deposits", label: "Security Deposits", icon: DollarSign },
      { key: "agreements", label: "Rental Agreements", icon: FileSignature },
      { key: "taxfees", label: "Taxes & Fees", icon: Receipt },
      { key: "compliance", label: "Compliance & Documents", icon: ShieldCheck },
      {
        key: "customerVerification",
        label: "Customer Verification",
        icon: UserCheck,
      },
      {
        key: "resourceCenter",
        label: "Operational Resources",
        icon: BookCheck,
      },
    ],
  },
  {
    group: "Communication & Automation",
    items: [
      { key: "notifications", label: "Notifications", icon: Bell },
      { key: "copilotVoice", label: "Copilot Voice", icon: Mic },
      { key: "automations", label: "Operational Automations", icon: Rocket },
    ],
  },
  {
    group: "System",
    items: [
      { key: "integrations", label: "Integrations", icon: Plug },
      { key: "migration", label: "Data Import / Migration", icon: Database },
    ],
  },
];

export default function Settings() {
  const [section, setSection] = useState<SectionKey>("company");
  const [wizardOpen, setWizardOpen] = useState(false);
  const navigate = useNavigate();

  /** Legacy / consolidated section keys redirect to their authoritative home
   *  instead of rendering a duplicate editor inside Settings. */
  function selectSection(key: SectionKey) {
    switch (key) {
      case "users":
        void navigate("/staff?tab=team");
        return;
      case "roles":
        void navigate("/staff?tab=roles");
        return;
      case "integrations":
        void navigate("/integrations");
        return;
      case "webhooks":
        void navigate("/integrations?tab=webhooks");
        return;
      case "apikeys":
        void navigate("/integrations?tab=api-keys");
        return;
      default:
        setSection(key);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Configure how Connect Pro Fleet works for your business."
      />

      {/* Compact setup-wizard action — no permanent nav item */}
      {!wizardOpen && (
        <SectionCard title="Setup Wizard">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-foreground">
                Review or update your core business setup.
              </p>
              <p className="text-xs text-muted-foreground">
                Company profile, rental model, payments, deposits, and returns
                in a guided flow.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setSection("company");
                setWizardOpen(true);
              }}
              className="shrink-0"
            >
              <Rocket size={15} className="mr-1.5" /> Run Setup Wizard
            </Button>
          </div>
        </SectionCard>
      )}

      {wizardOpen && (
        <SectionCard title="Company Setup Wizard">
          <CompanySetupWizard onClose={() => setWizardOpen(false)} />
        </SectionCard>
      )}

      {/* Staff & Access — link to the authoritative Staff workspace. No
          duplicate editable permissions/roles UI lives inside Settings. */}
      {!wizardOpen && (
        <SectionCard title="Staff & Access">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-foreground">
                Manage team members, roles, permissions, and location access.
              </p>
              <p className="text-xs text-muted-foreground">
                Staff is the authoritative place for team, roles, and access.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate("/staff?tab=team")}
              className="shrink-0"
            >
              <UsersIcon size={15} className="mr-1.5" /> Open Staff Management
            </Button>
          </div>
        </SectionCard>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-60">
          <nav className="space-y-5">
            {NAV.map((grp) => (
              <div key={grp.group}>
                <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {grp.group}
                </p>
                <div className="space-y-0.5">
                  {grp.items.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => selectSection(item.key)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        section === item.key && !wizardOpen
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <item.icon size={16} className="shrink-0" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {section === "company" && !wizardOpen && <CompanySection />}
          {section === "locations" && !wizardOpen && <LocationsSection />}
          {section === "appearance" && !wizardOpen && <AppearanceSection />}
          {section === "copilotVoice" && <CopilotVoiceSettingsSection />}
          {section === "rentalPolicies" && <RentalPoliciesSection />}
          {section === "pricing" && <VehicleClassesSection />}
          {section === "addons" && <AddonsSection />}
          {section === "deposits" && <DepositsSection />}
          {section === "agreements" && <AgreementsSection />}
          {section === "resourceCenter" && <ResourceCenterSection />}
          {section === "taxfees" && <TaxFeesSection />}
          {section === "violations" && <ViolationsSettingsSection />}
          {section === "compliance" && <ComplianceSettingsSection />}
          {section === "businessHealth" && <BusinessHealthSignalsSection />}
          {section === "customerVerification" && (
            <CustomerVerificationSection />
          )}
          {section === "notifications" && <NotificationsSection />}
          {section === "automations" && <AutomationsSection />}
          {section === "migration" && <MigrationCenter />}
        </div>
      </div>
    </div>
  );
}
