// Connect Pro Fleet — StoreProvider (Build #5).
//
// Assembles the FleetStore value from focused domain modules. The public
// `useStore()` API is preserved exactly so components don't change. The store
// remains ONE coherent data layer — domain modules operate on shared state,
// they don't duplicate it.

import { useEffect, useMemo, type ReactNode } from "react";
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
import { useAuth } from "../supabase/authContext";
import { hydratePhase1Slices } from "../supabase/storeSync";
import {
  hydratePhase2Slices,
  hydrateInspections,
} from "../supabase/phase2StoreSync";
import { hydrateMaintenance } from "../supabase/maintenanceAdapters";
import { hydrateExpenses, hydrateBanking } from "../supabase/phase5StoreSync";
import { hydratePhase8Slices } from "../supabase/phase8StoreSync";
import { hydratePhase9Slices } from "../supabase/phase9StoreSync";
import { setCompanyPoliciesRef } from "./companyPolicyRef";

export function StoreProvider({ children }: { children: ReactNode }) {
  const s = useStoreState();
  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;

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
    s.masterAgreements,
    s.agreementInstances,
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

  // Phase 1: hydrate customers/vehicles/reservations from Cloud when an
  // authenticated org is active. In memory mode hydratePhase1Slices is a
  // no-op and the seeded demo data stays. Runs on org/login change.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydratePhase1Slices(activeOrgId, {
      setCustomers: s.setCustomers,
      setVehicles: s.setVehicles,
      setReservations: s.setReservations,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      // Hydration must never crash the app — if the Cloud read fails (e.g. no
      // session/network in a test env) the seeded in-memory data stays as the
      // UI cache. Swallow the rejection so it does not leak as unhandled.
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Phase 2: hydrate rentals + ledger transactions + security deposits +
  // deposit history + inspections from Cloud on auth/org change. In memory
  // mode hydratePhase2Slices / hydrateInspections are no-ops and the seeded
  // demo data stays. The stale-closure `active` guard cancels async work after
  // an org switch so a slow org-A read never overwrites org-B's cache.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydratePhase2Slices(activeOrgId, {
      setRentals: s.setRentals,
      setTransactions: s.setTransactions,
      setRentalDeposits: s.setRentalDeposits,
      setDepositHistory: s.setDepositHistory,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    void hydrateInspections(activeOrgId, {
      setInspections: s.setInspections,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Phase 7: hydrate maintenance work orders + events + vendors + receipts
  // from Cloud on auth/org change. In memory mode hydrateMaintenance is a
  // no-op and the seeded demo data stays.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateMaintenance(activeOrgId, {
      setWorkOrders: s.setWorkOrders,
      setWorkOrderEvents: s.setWorkOrderEvents,
      setMaintenanceVendors: s.setMaintenanceVendors,
      setMaintenanceReceipts: s.setMaintenanceReceipts,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Phase 5: hydrate expenses from Cloud on auth/org change. In memory mode
  // hydrateExpenses is a no-op and the seeded demo data stays.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateExpenses(activeOrgId, {
      setExpenses: s.setExpenses,
      setExpenseLineItems: s.setExpenseLineItems,
      setExpenseCategories: s.setExpenseCategories,
      setExpenseEvents: s.setExpenseEvents,
      setExpenseReceipts: s.setExpenseReceipts,
      setExpenseReimbursements: s.setExpenseReimbursements,
      setCashAccounts: s.setCashAccounts,
      setCashEntries: s.setCashEntries,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Phase 5: hydrate banking evidence from Cloud on auth/org change. Bank
  // transactions are evidence only — no auto-creation of authoritative records.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateBanking(activeOrgId, {
      setFinancialAccounts: s.setFinancialAccounts,
      setImportedTransactions: s.setImportedTransactions,
      setStatements: s.setStatements,
      setImportBatches: s.setImportBatches,
      setReconciliationMatches: s.setReconciliationMatches,
      setAccountTransfers: s.setAccountTransfers,
      setReconciliationEvents: s.setReconciliationEvents,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Phase 8: hydrate the remaining V1 operational/configuration domains from
  // Cloud on auth/org change — locations, staff, operational assignments,
  // drivers, tasks (+ events/notes), notifications (+ deliveries/preferences),
  // company settings (authoritative org timezone), vehicle classes/pricing,
  // and add-ons. In memory mode hydratePhase8Slices is a no-op and the seeded
  // demo data stays. The stale-closure `active` guard cancels async work after
  // an org switch so a slow org-A read never overwrites org-B's cache.
  //
  // Company settings hydration restores CompanyInfo.timezone verbatim (Phase 6
  // org-timezone remains authoritative) and applies the structured config
  // (companyPolicies/agreementRules/taxRules/feeRules) to the store + the
  // module-level companyPolicyRef so domain methods freeze the hydrated
  // policies at checkout.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydratePhase8Slices(activeOrgId, {
      setLocations: s.setLocations,
      setStaff: s.setStaff,
      // Operational staff assignments are owned by StaffAssignmentProvider
      // (its own useState); the core store only owns legacy reservation-slot
      // StaffAssignment[], which has a different shape, so it is intentionally
      // not wired here.
      setDrivers: s.setDrivers,
      setTasks: s.setTasks,
      setTaskEvents: s.setTaskEvents,
      setTaskNotes: s.setTaskNotes,
      setNotifications: s.setNotifications,
      setNotificationDeliveries: s.setNotificationDeliveries,
      setNotificationPreferences: s.setNotificationPreferences,
      setCompanyInfo: s.setCompanyInfo,
      setVehicleClasses: s.setVehicleClasses,
      setAddonCategories: s.setAddonCategories,
      setAddonCatalog: s.setAddonCatalog,
      applySettingsConfig: (cfg) => {
        if (!active) return;
        // Apply the hydrated structured config to the authoritative store
        // slices. CompanyPolicies live in the CompanyPolicyProvider, so we
        // also push them into the module-level ref so domain methods that
        // freeze policy snapshots at checkout read the hydrated values.
        if (cfg.companyPolicies) setCompanyPoliciesRef(cfg.companyPolicies);
        if (cfg.agreementRules) s.setAgreementRules(() => cfg.agreementRules);
        if (cfg.taxRules) s.setTaxRules(() => cfg.taxRules);
        if (cfg.feeRules) s.setFeeRules(() => cfg.feeRules);
      },
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  // Phase 9: hydrate the durable document/promise/audit/agreement slices from
  // Cloud on auth/org change — rental events, invoices, receipts, payment
  // arrangements (+ installments + events), agreement templates/master
  // agreements/agreement instances, and the activity/audit feed. Agreement
  // templates/master/instances are owned by the core StoreProvider (they live
  // in storeState.ts useState slices; no dedicated provider exists for them),
  // so all Phase 9 slices hydrate here. In memory mode hydratePhase9Slices is a
  // no-op and the seeded demo data stays. The stale-closure `active` guard
  // cancels async work after an org switch so a slow org-A read never
  // overwrites org-B's cache; the StaleOrgGuard also discards results if the
  // org changed mid-flight.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    const guard = { isActive: (id: string) => active && id === activeOrgId };
    void hydratePhase9Slices(
      activeOrgId,
      {
        setRentalEvents: s.setRentalEvents,
        setInvoices: s.setInvoices,
        setReceipts: s.setReceipts,
        setPaymentArrangements: s.setPaymentArrangements,
        setArrangementInstallments: s.setArrangementInstallments,
        setArrangementEvents: s.setArrangementEvents,
        setAgreementTemplates: s.setAgreementTemplates,
        setMasterAgreements: (updater) =>
          s.setMasterAgreementsRef(updater),
        setAgreementInstances: (updater) =>
          s.setAgreementInstancesRef(updater),
        setActivityLog: s.setActivity,
      },
      undefined,
      guard,
    )
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}
