// Connect Pro Fleet — StoreProvider (Build #5).
//
// Assembles the FleetStore value from focused domain modules. The public
// `useStore()` API is preserved exactly so components don't change. The store
// remains ONE coherent data layer — domain modules operate on shared state,
// they don't duplicate it.

import { useMemo, type ReactNode } from "react";
import { FleetStore, StoreContext } from "./storeContext";
import { useStoreState } from "./storeState";
import { buildVehicleMethods } from "./vehicleStore";
import { buildCustomerMethods } from "./customerStore";
import { buildReservationMethods } from "./reservationStore";
import { buildRentalMethods } from "./rentalStore";
import { buildRentalLifecycleMethods } from "./rentalLifecycleStore";
import { buildLedgerMethods } from "./ledgerStore";
import { buildLedgerLateFeeMethods } from "./ledgerLateFee";
import { buildInvoiceMethods } from "./invoiceStore";
import { buildSettingsCoreMethods } from "./settingsCoreStore";
import { buildSettingsConfigMethods } from "./settingsConfigStore";
import { buildActivityMethods } from "./activityStore";
import { buildOwnershipMethods } from "./ownershipStore";
import { buildDepositMethods } from "./depositStore";
import { buildDepositReversalMethods } from "./depositReversalStore";
import { buildTaxFeeMethods } from "./taxFeeStore";
import { buildPeriodChargeMethods } from "./periodChargeStore";
import { buildPaymentArrangementMethods } from "./paymentArrangementStore";
import { buildTaskMethods } from "./taskStore";
import { buildNotificationMethods } from "./notificationStore";
import { buildMaintenanceMethods } from "./maintenanceStore";
import { buildExpenseMethods } from "./expenseStore";
import { buildBankingMethods } from "./bankingStore";

export function StoreProvider({ children }: { children: ReactNode }) {
  const s = useStoreState();

  // Depend on the individual state slices (stable references from useState)
  // rather than `s` itself, which is a fresh object every render. Without this
  // the memo recomputes every render, producing a new store object each time
  // and destabilizing every downstream consumer (BillingProvider, etc.).
  const store = useMemo<FleetStore>(() => {
    const arrangements = buildPaymentArrangementMethods(s);
    const ledger = buildLedgerMethods(s, {
      linkPaymentToArrangement: arrangements.linkPaymentToArrangement,
      refreshArrangementStatuses: arrangements.refreshArrangementStatuses,
    });
    const ledgerLateFee = buildLedgerLateFeeMethods(s);
    const deposits = buildDepositMethods(s);
    const depositReversal = buildDepositReversalMethods(s);
    const taxFee = buildTaxFeeMethods(s);
    const periodCharge = buildPeriodChargeMethods(s);
    const invoices = buildInvoiceMethods(s, {
      postPayment: ledger.postPayment,
    });
    const rental = buildRentalMethods(
      s,
      {
        postPayment: ledger.postPayment,
      },
      {
        linkDepositToRental: deposits.linkDepositToRental,
        markRefundPending: deposits.markRefundPending,
      },
      taxFee,
    );
    const lifecycle = buildRentalLifecycleMethods(s);
    const vehicles = buildVehicleMethods(s);
    const customers = buildCustomerMethods(s);
    const reservations = buildReservationMethods(s);
    const settingsCore = buildSettingsCoreMethods(s);
    const settingsConfig = buildSettingsConfigMethods(s);
    const activity = buildActivityMethods(s);
    const ownership = buildOwnershipMethods(s);
    const notifications = buildNotificationMethods(s);
    const tasks = buildTaskMethods(s, { notify: notifications.notify });
    const expense = buildExpenseMethods(s);
    const banking = buildBankingMethods(s, {
      createExpense: expense.createExpense,
    });
    const maintenance = buildMaintenanceMethods(s, {
      notify: notifications.notify,
      resolveSystemTasks: tasks.resolveSystemTasksForEntity,
      syncWorkOrderExpense: expense.syncWorkOrderExpense,
    });

    return {
      tenant: s.tenant,
      locations: s.locations,
      vehicles: s.vehicles,
      reservations: s.reservations,
      customers: s.customers,
      rentals: s.rentals,
      rentalEvents: s.rentalEvents,
      drivers: s.drivers,
      inspections: s.inspections,
      maintenance: s.maintenance,
      addons: s.addons,
      staff: s.staff,
      assignments: s.assignments,
      masterAgreements: s.masterAgreements,
      agreementInstances: s.agreementInstances,
      transactions: s.transactions,
      invoices: s.invoices,
      receipts: s.receipts,
      rentalDeposits: s.rentalDeposits,
      depositHistory: s.depositHistory,
      currentStaffId: s.currentStaffId,
      setCurrentStaffId: s.setCurrentStaffId,
      creatorLabel: (staffId, source) => {
        if (staffId) {
          const st = s.staff.find((x) => x.id === staffId);
          if (st)
            return `${st.full_name} · ${st.role[0].toUpperCase()}${st.role.slice(1)}`;
        }
        if (source === "ghl_webhook") return "Connect Pro";
        if (source === "marketplace") return "Marketplace";
        if (source === "website") return "Website";
        if (source === "referral") return "Referral";
        if (source === "api") return "API";
        return "System";
      },
      customerName: (id) => {
        const c = s.customers.find((x) => x.id === id);
        return c ? `${c.first_name} ${c.last_name}` : "—";
      },

      ...vehicles,
      ...reservations,
      ...customers,
      ...rental,
      ...lifecycle,
      ...ledger,
      ...ledgerLateFee,
      ...invoices,
      ...settingsCore,
      ...settingsConfig,
      ...activity,
      ...ownership,
      ...deposits,
      ...depositReversal,
      ...taxFee,
      ...periodCharge,
      ...arrangements,
      ...tasks,
      ...notifications,
      ...maintenance,
      ...expense,
      ...banking,
      ownershipChanges: s.ownershipChanges,

      // Settings state values (read-only on the public API).
      companyInfo: s.companyInfo,
      roles: s.roles,
      vehicleClasses: s.vehicleClasses,
      addonCategories: s.addonCategories,
      addonCatalog: s.addonCatalog,
      depositPolicies: s.depositPolicies,
      agreementTemplates: s.agreementTemplates,
      agreementRules: s.agreementRules,
      settingsAudit: s.settingsAudit,
      taxRules: s.taxRules,
      feeRules: s.feeRules,
      paymentArrangements: s.paymentArrangements,
      arrangementInstallments: s.arrangementInstallments,
      arrangementEvents: s.arrangementEvents,
      tasks: s.tasks,
      taskEvents: s.taskEvents,
      taskNotes: s.taskNotes,
      notifications: s.notifications,
      notificationDeliveries: s.notificationDeliveries,
      notificationPreferences: s.notificationPreferences,
      workOrders: s.workOrders,
      maintenanceVendors: s.maintenanceVendors,
      maintenanceReceipts: s.maintenanceReceipts,
      expenses: s.expenses,
      expenseLineItems: s.expenseLineItems,
      expenseCategories: s.expenseCategories,
      expenseEvents: s.expenseEvents,
      expenseReceipts: s.expenseReceipts,
      expenseReimbursements: s.expenseReimbursements,
      cashAccounts: s.cashAccounts,
      cashEntries: s.cashEntries,
      expenseRules: s.expenseRules,
      receiptInbox: s.receiptInbox,
      recurringExpenses: s.recurringExpenses,
      spendAlerts: s.spendAlerts,
      categoryBudgets: s.categoryBudgets,
      financialAccounts: s.financialAccounts,
      importedTransactions: s.importedTransactions,
      statements: s.statements,
      importBatches: s.importBatches,
      reconciliationMatches: s.reconciliationMatches,
      accountTransfers: s.accountTransfers,
      reconciliationEvents: s.reconciliationEvents,

      activityLog: s.activityLog,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    s.vehicles,
    s.reservations,
    s.customers,
    s.rentals,
    s.rentalEvents,
    s.inspections,
    s.maintenance,
    s.addons,
    s.assignments,
    s.drivers,
    s.transactions,
    s.invoices,
    s.receipts,
    s.companyInfo,
    s.roles,
    s.vehicleClasses,
    s.addonCategories,
    s.addonCatalog,
    s.depositPolicies,
    s.agreementTemplates,
    s.agreementRules,
    s.settingsAudit,
    s.locations,
    s.staff,
    s.currentStaffId,
    s.activityLog,
    s.vehicleExchanges,
    s.ownershipChanges,
    s.rentalDeposits,
    s.depositHistory,
    s.taxRules,
    s.feeRules,
    s.paymentArrangements,
    s.arrangementInstallments,
    s.arrangementEvents,
    s.tasks,
    s.taskEvents,
    s.taskNotes,
    s.notifications,
    s.notificationDeliveries,
    s.notificationPreferences,
    s.workOrders,
    s.workOrderEvents,
    s.maintenanceVendors,
    s.maintenanceReceipts,
    s.expenses,
    s.expenseLineItems,
    s.expenseCategories,
    s.expenseEvents,
    s.expenseReceipts,
    s.expenseReimbursements,
    s.cashAccounts,
    s.cashEntries,
    s.expenseRules,
    s.receiptInbox,
    s.recurringExpenses,
    s.spendAlerts,
    s.categoryBudgets,
    s.financialAccounts,
    s.importedTransactions,
    s.statements,
    s.importBatches,
    s.reconciliationMatches,
    s.accountTransfers,
    s.reconciliationEvents,
  ]);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}
