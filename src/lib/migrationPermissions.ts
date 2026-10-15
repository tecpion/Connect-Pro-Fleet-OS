// Connect Pro Fleet — Build #19 migration permissions.
//
// Granular permissions for the Data Import / Migration Center. Migration is
// sensitive: it can create opening balances, migrate held deposits, and
// import historical financials. Owner gets all by default; manager gets
// limited operational import; normal users get none by default.

import type { PermissionDef } from "./types";

export const MIGRATION_PERMISSIONS: PermissionDef[] = [
  {
    key: "migration.view",
    label: "View Migration Center",
    module: "Migration",
  },
  { key: "migration.import", label: "Import Data", module: "Migration" },
  {
    key: "migration.manage_mapping",
    label: "Manage Column Mapping",
    module: "Migration",
  },
  {
    key: "migration.resolve_duplicates",
    label: "Resolve Import Duplicates",
    module: "Migration",
  },
  {
    key: "migration.import_active_rentals",
    label: "Import Active Rentals",
    module: "Migration",
  },
  {
    key: "migration.create_opening_balances",
    label: "Create Opening Balances",
    module: "Migration",
  },
  {
    key: "migration.import_historical_financials",
    label: "Import Historical Financials",
    module: "Migration",
  },
  {
    key: "migration.rollback",
    label: "Rollback Import Batches",
    module: "Migration",
  },
  {
    key: "migration.view_history",
    label: "View Import History",
    module: "Migration",
  },
];
