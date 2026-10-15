// Connect Pro Fleet — seed barrel (Build #5).
// Re-exports all seed data + ids so the provider imports from one place.
// Build #19: merges native + migration-imported rentals/transactions/deposits
// into single coherent arrays.

export { TENANT_ID, uid } from "./ids";
export { tenant, vehicles, staff } from "./seedCore";
export {
  reservations,
  drivers,
  inspections,
  maintenance,
  addons,
  assignments,
  masterAgreements,
  agreementInstances,
} from "./seedReservations";
export { locations, customers } from "./seedCustomers";

// Rentals / transactions / deposits: merge native + migration-imported.
import {
  rentals as _rentals,
  rentalEvents as _rentalEvents,
} from "./seedRentals";
import {
  transactions as _transactions,
  invoices,
  receipts,
} from "./seedFinancials";
import {
  rentalDeposits as _deposits,
  depositHistory as _depositHistory,
} from "./seedDeposits";
import {
  importedRentals,
  importedRentalEvents,
  migrationTransactions,
  migrationDeposits,
  migrationDepositHistory,
  historicalPeriods,
  migrationBatches,
} from "./seedMigration";

export const rentals = [..._rentals, ...importedRentals];
export const rentalEvents = [..._rentalEvents, ...importedRentalEvents];
export const transactions = [..._transactions, ...migrationTransactions];
export const rentalDeposits = [..._deposits, ...migrationDeposits];
export const depositHistory = [..._depositHistory, ...migrationDepositHistory];

export { invoices, receipts };
export {
  importedRentals,
  importedRentalEvents,
  migrationTransactions,
  migrationDeposits,
  migrationDepositHistory,
  historicalPeriods,
  migrationBatches,
};

export { taxRules, feeRules } from "./seedTaxFees";
export {
  paymentArrangements,
  arrangementInstallments,
  arrangementEvents,
} from "./seedPaymentArrangements";
export { tasks, taskEvents, taskNotes } from "./seedTasks";
export {
  notifications,
  notificationDeliveries,
  notificationPreferences,
} from "./seedNotifications";
export {
  workOrders,
  workOrderEvents,
  maintenanceVendors,
  maintenanceReceipts,
} from "./seedMaintenance";
export { expenseCategories } from "./seedExpenseCategories";
export {
  expenses,
  expenseLineItems,
  expenseReimbursements,
  expenseReceipts,
  expenseEvents,
  cashAccounts,
  cashEntries,
} from "./seedExpenses";
export {
  expenseRules,
  receiptInbox,
  recurringExpenses,
  spendAlerts,
  categoryBudgets,
} from "./seedExpensesV1";
export {
  financialAccounts,
  importedTransactions,
  statements,
  importBatches,
  reconciliationMatches,
  accountTransfers,
  reconciliationEvents,
} from "./seedBanking";
export {
  companyInfo,
  vehicleClasses,
  addonCategories,
  addonCatalog,
  depositPolicies,
  agreementTemplates,
  agreementRules,
  settingsAudit,
} from "./seedSettings";
// Build #24 — merge system roles (from seedSettings) with seeded custom roles
// (CSR, Fleet Manager, Bookkeeper, Damage Coordinator) so the Staff Center
// demonstrates editable custom roles alongside protected system roles.
import { roles as _systemRoles } from "./seedSettings";
import { customRoles } from "./seedStaff";
export const roles = [..._systemRoles, ...customRoles];
