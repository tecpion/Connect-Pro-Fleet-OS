// Connect Pro Fleet — Build #19 Migration Center.
//
// Setup/admin tooling for established rental companies moving into Connect
// Pro Fleet. Tabs: Overview, Vehicles, Customers, Investors, Active Rentals,
// Historical Financials, Validation Issues, Import History. CSV import
// reuses the same store methods as manual entry.

import { useState } from "react";
import { MigrationOverview } from "@/pages/migration/MigrationOverview";
import { VehicleImportTab } from "@/pages/migration/VehicleImportTab";
import { CustomerImportTab } from "@/pages/migration/CustomerImportTab";
import { InvestorImportTab } from "@/pages/migration/InvestorImportTab";
import { ActiveRentalImport } from "@/pages/migration/ActiveRentalImport";
import { HistoricalFinancialsTab } from "@/pages/migration/HistoricalFinancialsTab";
import { ValidationIssuesTab } from "@/pages/migration/ValidationIssuesTab";
import { ImportHistoryTab } from "@/pages/migration/ImportHistoryTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "vehicles", label: "Vehicles" },
  { key: "customers", label: "Customers" },
  { key: "investors", label: "Investors" },
  { key: "active-rentals", label: "Active Rentals" },
  { key: "historical", label: "Historical Financials" },
  { key: "issues", label: "Validation Issues" },
  { key: "history", label: "Import History" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MigrationCenter() {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-5">
      <div className="border-b border-border pb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Migration Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import vehicles, customers, active rentals, investors, and historical
          financials from your previous system.
        </p>
      </div>

      <div className="-mb-px overflow-x-auto border-b border-border">
        <div className="flex min-w-max gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && <MigrationOverview />}
      {tab === "vehicles" && <VehicleImportTab />}
      {tab === "customers" && <CustomerImportTab />}
      {tab === "investors" && <InvestorImportTab />}
      {tab === "active-rentals" && <ActiveRentalImport />}
      {tab === "historical" && <HistoricalFinancialsTab />}
      {tab === "issues" && <ValidationIssuesTab />}
      {tab === "history" && <ImportHistoryTab />}
    </div>
  );
}
