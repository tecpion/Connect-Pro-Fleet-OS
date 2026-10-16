// Connect Pro Fleet — Case Center test harness (Build #57).
// Assembles a CaseCenterSources bundle directly from seed data so the pure
// selectors can be tested without mounting the full provider tree.

import { seedCases, seedCaseEvents } from "@/lib/store/seedCaseCenter";
import { rentals, transactions, rentalDeposits } from "@/lib/store/seed";
import { customers } from "@/lib/store/seedCustomers";
import { vehicles, staff } from "@/lib/store/seedCore";
import { tasks } from "@/lib/store/seedTasks";
import { expenses } from "@/lib/store/seedExpenses";
import { seedViolations } from "@/lib/store/seedViolations";
import { seedDamageClaims } from "@/lib/store/seedDamageClaims";
import { seedIncidents } from "@/lib/incidentsStore";
import type { CaseCenterSources } from "@/lib/caseCenterTypes";

export function buildCaseCenterSources(): CaseCenterSources {
  return {
    cases: seedCases,
    caseEvents: seedCaseEvents,
    rentals,
    customers,
    vehicles,
    violations: seedViolations.violations,
    incidents: seedIncidents,
    damageClaims: seedDamageClaims.claims,
    deposits: rentalDeposits,
    expenses,
    customerCharges: transactions,
    payments: transactions,
    tasks,
    staff,
    releaseSnapshots: [],
  };
}
