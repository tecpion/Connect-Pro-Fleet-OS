// Connect Pro Fleet — shared internal store state (Build #5).
//
// All useState state + setters live here so domain method modules can operate
// on a single coherent state object without duplicating state across contexts.
// StoreProvider calls useStoreState() once and passes the result to each
// domain module's build*() function, which returns the methods for that domain.

import { useState, useRef } from "react";
import type {
  Addon,
  AddonCatalogItem,
  AddonCategory,
  AgreementInstance,
  AgreementRules,
  AgreementTemplate,
  CompanyInfo,
  Customer,
  DepositPolicy,
  Driver,
  FinancialTransaction,
  Inspection,
  Invoice,
  Location,
  MaintenanceRecord,
  MasterAgreement,
  Receipt,
  RentalAgreement,
  RentalEvent,
  Reservation,
  Role,
  SettingsAuditEntry,
  Staff,
  StaffAssignment,
  Tenant,
  Vehicle,
  VehicleClass,
} from "../types";
import type { ActivityEntry } from "./storeContext";
import type { RentalVehicleExchange } from "./storeContext";
import type { OwnershipChangeRecord } from "../ownershipTypes";
import type { RentalDeposit, DepositHistoryEvent } from "../depositTypes";
import type { TaxRule, FeeRule } from "../taxFeeTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
} from "../paymentArrangementTypes";
import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "../notificationTypes";
import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
} from "../maintenanceTypes";
import type {
  ExpenseTransaction,
  ExpenseLineItem,
  ExpenseCategory,
  ExpenseEvent,
  ExpenseReceipt,
  ExpenseReimbursement,
  CashAccount,
  CashEntry,
  ExpenseRule,
  ReceiptInboxItem,
  RecurringExpense,
  SpendAlert,
  CategoryBudget,
} from "../expenseTypes";
import type {
  FinancialAccount,
  ImportedTransaction,
  FinancialStatement,
  ImportBatch,
  ReconciliationMatch,
  AccountTransfer,
  ReconciliationEvent,
} from "../bankingTypes";
import * as seed from "./seed";
import { uid } from "./ids";
import { getBackendMode } from "../supabase/client";

export interface StoreState {
  // state values
  tenant: Tenant;
  vehicles: Vehicle[];
  reservations: Reservation[];
  customers: Customer[];
  rentals: RentalAgreement[];
  rentalEvents: RentalEvent[];
  inspections: Inspection[];
  maintenance: MaintenanceRecord[];
  addons: Addon[];
  assignments: StaffAssignment[];
  drivers: Driver[];
  transactions: FinancialTransaction[];
  invoices: Invoice[];
  receipts: Receipt[];
  companyInfo: CompanyInfo;
  roles: Role[];
  vehicleClasses: VehicleClass[];
  addonCategories: AddonCategory[];
  addonCatalog: AddonCatalogItem[];
  depositPolicies: DepositPolicy[];
  agreementTemplates: AgreementTemplate[];
  agreementRules: AgreementRules;
  settingsAudit: SettingsAuditEntry[];
  locations: Location[];
  staff: Staff[];
  masterAgreements: MasterAgreement[];
  agreementInstances: AgreementInstance[];
  currentStaffId: string;
  activityLog: ActivityEntry[];
  vehicleExchanges: RentalVehicleExchange[];
  ownershipChanges: OwnershipChangeRecord[];
  // Build #8 — operational security deposit lifecycle records + history.
  rentalDeposits: RentalDeposit[];
  depositHistory: DepositHistoryEvent[];
  /** Synchronous idempotency-key registry for deposit money movements.
   *  Reads s.depositHistory inside a single batched act() are stale, so we
   *  track used keys in a ref that updates synchronously. */
  depositKeys: React.MutableRefObject<Set<string>>;
  // Build #9 — configurable taxes & fees rules.
  taxRules: TaxRule[];
  feeRules: FeeRule[];
  // Build #10 — payment arrangements (promises to pay) + installments + history.
  paymentArrangements: PaymentArrangement[];
  arrangementInstallments: PaymentArrangementInstallment[];
  arrangementEvents: ArrangementEvent[];
  // Build #11 — operational tasks + history + notes.
  tasks: Task[];
  taskEvents: TaskEvent[];
  taskNotes: TaskNote[];
  // Build #12 — staff notifications + delivery + preferences.
  notifications: Notification[];
  notificationDeliveries: NotificationDelivery[];
  notificationPreferences: NotificationPreference[];
  /** Synchronous dedupe-key registry for notifications. Reads of
   *  s.notifications inside a single batched act() are stale, so we track
   *  used dedupe keys in a ref that updates synchronously. */
  notificationKeys: React.MutableRefObject<Set<string>>;
  /** Synchronous email success-lock registry. A SENT email delivery records
   *  its notification id here immediately so retryEmail's success-lock is not
   *  defeated by a stale-closure read of s.notificationDeliveries. */
  sentEmailLocks: React.MutableRefObject<Set<string>>;
  // Build #13 — maintenance work orders + events + vendors + receipts.
  workOrders: MaintenanceWorkOrder[];
  workOrderEvents: MaintenanceWorkOrderEvent[];
  maintenanceVendors: MaintenanceVendor[];
  maintenanceReceipts: MaintenanceReceipt[];
  // Build #14 — accounting expense ledger + categories + reimbursements +
  // receipts + events + petty cash. SEPARATE from the rental financial ledger.
  expenses: ExpenseTransaction[];
  expenseLineItems: ExpenseLineItem[];
  expenseCategories: ExpenseCategory[];
  expenseEvents: ExpenseEvent[];
  expenseReceipts: ExpenseReceipt[];
  expenseReimbursements: ExpenseReimbursement[];
  cashAccounts: CashAccount[];
  cashEntries: CashEntry[];
  /** Synchronous expense-number registry. Reads of s.expenses inside a single
   *  batched act() are stale, so we track used EXP numbers in a ref that updates
   *  synchronously to guarantee unique numbering for rapid creation. */
  expenseNumberKeys: React.MutableRefObject<Set<string>>;
  // Expenses V1 — transaction rules, receipt inbox, recurring templates,
  // spend alerts, category budgets. COMPOSE the existing ledger; no duplicate
  // financial records.
  expenseRules: ExpenseRule[];
  receiptInbox: ReceiptInboxItem[];
  recurringExpenses: RecurringExpense[];
  spendAlerts: SpendAlert[];
  categoryBudgets: CategoryBudget[];
  // Build #15 — banking & reconciliation (imported statements + matches +
  // transfers + events). SEPARATE from rental/expense ledgers — imported
  // activity has zero financial effect until matched or used to create a txn.
  financialAccounts: FinancialAccount[];
  importedTransactions: ImportedTransaction[];
  statements: FinancialStatement[];
  importBatches: ImportBatch[];
  reconciliationMatches: ReconciliationMatch[];
  accountTransfers: AccountTransfer[];
  reconciliationEvents: ReconciliationEvent[];
  /** Synchronous import-fingerprint registry for idempotent imports. */
  importFingerprints: React.MutableRefObject<Set<string>>;
  // setters
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  setReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  setRentals: React.Dispatch<React.SetStateAction<RentalAgreement[]>>;
  setRentalEvents: React.Dispatch<React.SetStateAction<RentalEvent[]>>;
  setInspections: React.Dispatch<React.SetStateAction<Inspection[]>>;
  setMaintenance: React.Dispatch<React.SetStateAction<MaintenanceRecord[]>>;
  setAddons: React.Dispatch<React.SetStateAction<Addon[]>>;
  setAssignments: React.Dispatch<React.SetStateAction<StaffAssignment[]>>;
  setDrivers: React.Dispatch<React.SetStateAction<Driver[]>>;
  setTransactions: React.Dispatch<React.SetStateAction<FinancialTransaction[]>>;
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
  setCompanyInfo: React.Dispatch<React.SetStateAction<CompanyInfo>>;
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  setVehicleClasses: React.Dispatch<React.SetStateAction<VehicleClass[]>>;
  setAddonCategories: React.Dispatch<React.SetStateAction<AddonCategory[]>>;
  setAddonCatalog: React.Dispatch<React.SetStateAction<AddonCatalogItem[]>>;
  setDepositPolicies: React.Dispatch<React.SetStateAction<DepositPolicy[]>>;
  setAgreementTemplates: React.Dispatch<
    React.SetStateAction<AgreementTemplate[]>
  >;
  setMasterAgreements: React.Dispatch<React.SetStateAction<MasterAgreement[]>>;
  setAgreementInstances: React.Dispatch<
    React.SetStateAction<AgreementInstance[]>
  >;
  /** Functional-updater aliases used by Phase 9 hydration (prev => next). */
  setMasterAgreementsRef: (
    updater: (prev: MasterAgreement[]) => MasterAgreement[],
  ) => void;
  setAgreementInstancesRef: (
    updater: (prev: AgreementInstance[]) => AgreementInstance[],
  ) => void;
  setAgreementRules: React.Dispatch<React.SetStateAction<AgreementRules>>;
  setSettingsAudit: React.Dispatch<React.SetStateAction<SettingsAuditEntry[]>>;
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
  setStaff: React.Dispatch<React.SetStateAction<Staff[]>>;
  setCurrentStaffId: React.Dispatch<React.SetStateAction<string>>;
  setActivity: React.Dispatch<React.SetStateAction<ActivityEntry[]>>;
  setVehicleExchanges: React.Dispatch<
    React.SetStateAction<RentalVehicleExchange[]>
  >;
  setOwnershipChanges: React.Dispatch<
    React.SetStateAction<OwnershipChangeRecord[]>
  >;
  setRentalDeposits: React.Dispatch<React.SetStateAction<RentalDeposit[]>>;
  setDepositHistory: React.Dispatch<
    React.SetStateAction<DepositHistoryEvent[]>
  >;
  setTaxRules: React.Dispatch<React.SetStateAction<TaxRule[]>>;
  setFeeRules: React.Dispatch<React.SetStateAction<FeeRule[]>>;
  setPaymentArrangements: React.Dispatch<
    React.SetStateAction<PaymentArrangement[]>
  >;
  setArrangementInstallments: React.Dispatch<
    React.SetStateAction<PaymentArrangementInstallment[]>
  >;
  setArrangementEvents: React.Dispatch<
    React.SetStateAction<ArrangementEvent[]>
  >;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setTaskEvents: React.Dispatch<React.SetStateAction<TaskEvent[]>>;
  setTaskNotes: React.Dispatch<React.SetStateAction<TaskNote[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  setNotificationDeliveries: React.Dispatch<
    React.SetStateAction<NotificationDelivery[]>
  >;
  setNotificationPreferences: React.Dispatch<
    React.SetStateAction<NotificationPreference[]>
  >;
  setWorkOrders: React.Dispatch<React.SetStateAction<MaintenanceWorkOrder[]>>;
  setWorkOrderEvents: React.Dispatch<
    React.SetStateAction<MaintenanceWorkOrderEvent[]>
  >;
  setMaintenanceVendors: React.Dispatch<
    React.SetStateAction<MaintenanceVendor[]>
  >;
  setMaintenanceReceipts: React.Dispatch<
    React.SetStateAction<MaintenanceReceipt[]>
  >;
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseTransaction[]>>;
  setExpenseLineItems: React.Dispatch<React.SetStateAction<ExpenseLineItem[]>>;
  setExpenseCategories: React.Dispatch<React.SetStateAction<ExpenseCategory[]>>;
  setExpenseEvents: React.Dispatch<React.SetStateAction<ExpenseEvent[]>>;
  setExpenseReceipts: React.Dispatch<React.SetStateAction<ExpenseReceipt[]>>;
  setExpenseReimbursements: React.Dispatch<
    React.SetStateAction<ExpenseReimbursement[]>
  >;
  setCashAccounts: React.Dispatch<React.SetStateAction<CashAccount[]>>;
  setCashEntries: React.Dispatch<React.SetStateAction<CashEntry[]>>;
  setExpenseRules: React.Dispatch<React.SetStateAction<ExpenseRule[]>>;
  setReceiptInbox: React.Dispatch<React.SetStateAction<ReceiptInboxItem[]>>;
  setRecurringExpenses: React.Dispatch<
    React.SetStateAction<RecurringExpense[]>
  >;
  setSpendAlerts: React.Dispatch<React.SetStateAction<SpendAlert[]>>;
  setCategoryBudgets: React.Dispatch<React.SetStateAction<CategoryBudget[]>>;
  setFinancialAccounts: React.Dispatch<
    React.SetStateAction<FinancialAccount[]>
  >;
  setImportedTransactions: React.Dispatch<
    React.SetStateAction<ImportedTransaction[]>
  >;
  setStatements: React.Dispatch<React.SetStateAction<FinancialStatement[]>>;
  setImportBatches: React.Dispatch<React.SetStateAction<ImportBatch[]>>;
  setReconciliationMatches: React.Dispatch<
    React.SetStateAction<ReconciliationMatch[]>
  >;
  setAccountTransfers: React.Dispatch<React.SetStateAction<AccountTransfer[]>>;
  setReconciliationEvents: React.Dispatch<
    React.SetStateAction<ReconciliationEvent[]>
  >;
}

export function useStoreState(): StoreState {
  // Private-beta UX rule: a brand-new authenticated Cloud organization must
  // start EMPTY for transactional records (vehicles, customers, rentals,
  // maintenance, tasks, ledger, etc.). Seeded demo data is only appropriate
  // for memory/demo mode. In supabase mode we initialize these slices to []
  // so an empty Cloud result is authoritative — the UI shows real empty
  // states instead of a flash of demo records. Config/defaults (vehicle
  // classes, roles, tax/fee rules, deposit policies, agreement templates,
  // company info) remain seeded as sensible starting defaults the customer
  // configures during onboarding — those are settings, not fake records.
  const isDemo = (() => {
    try {
      return getBackendMode() === "memory";
    } catch {
      return true;
    }
  })();

  const [vehicles, setVehicles] = useState(isDemo ? seed.vehicles : []);
  const [reservations, setReservations] = useState(
    isDemo ? seed.reservations : [],
  );
  const [customers, setCustomers] = useState(isDemo ? seed.customers : []);
  const [rentals, setRentals] = useState(isDemo ? seed.rentals : []);
  const [rentalEvents, setRentalEvents] = useState(
    isDemo ? seed.rentalEvents : [],
  );
  const [inspections, setInspections] = useState(
    isDemo ? seed.inspections : [],
  );
  const [maintenance, setMaintenance] = useState(
    isDemo ? seed.maintenance : [],
  );
  const [addons, setAddons] = useState(isDemo ? seed.addons : []);
  const [assignments, setAssignments] = useState(
    isDemo ? seed.assignments : [],
  );
  const [drivers, setDrivers] = useState(isDemo ? seed.drivers : []);
  const [transactions, setTransactions] = useState(
    isDemo ? seed.transactions : [],
  );
  const [invoices, setInvoices] = useState(isDemo ? seed.invoices : []);
  const [receipts, setReceipts] = useState(isDemo ? seed.receipts : []);
  const [companyInfo, setCompanyInfo] = useState(seed.companyInfo);
  const [roles, setRoles] = useState(seed.roles);
  const [vehicleClasses, setVehicleClasses] = useState(seed.vehicleClasses);
  const [addonCategories, setAddonCategories] = useState(seed.addonCategories);
  const [addonCatalog, setAddonCatalog] = useState(seed.addonCatalog);
  const [depositPolicies, setDepositPolicies] = useState(seed.depositPolicies);
  const [agreementTemplates, setAgreementTemplates] = useState(
    seed.agreementTemplates,
  );
  // Phase 9 — master agreements + agreement instances become durable Cloud
  // slices (owned by the core StoreProvider; no dedicated provider exists).
  // They were previously seeded-only constants; promote them to useState so
  // hydration can replace them with Cloud-authoritative state.
  const [masterAgreements, setMasterAgreements] = useState<MasterAgreement[]>(
    seed.masterAgreements,
  );
  const [agreementInstances, setAgreementInstances] = useState<
    AgreementInstance[]
  >(seed.agreementInstances);
  const [agreementRules, setAgreementRules] = useState(seed.agreementRules);
  const [settingsAudit, setSettingsAudit] = useState(seed.settingsAudit);
  const [locations, setLocations] = useState(seed.locations);
  const [staff, setStaff] = useState(seed.staff);
  const [currentStaffId, setCurrentStaffId] = useState("stf_1");
  const [vehicleExchanges, setVehicleExchanges] = useState<
    RentalVehicleExchange[]
  >([]);
  const [ownershipChanges, setOwnershipChanges] = useState<
    OwnershipChangeRecord[]
  >([]);
  // Build #8 — operational security deposits. Seeded to match existing
  // reservations/rentals so the lifecycle is testable from demo data.
  const [rentalDeposits, setRentalDeposits] = useState<RentalDeposit[]>(
    seed.rentalDeposits,
  );
  const [depositHistory, setDepositHistory] = useState<DepositHistoryEvent[]>(
    seed.depositHistory,
  );
  // Synchronous idempotency registry (ref) — seeded from history so existing
  // keys are honored, and updated immediately on each money movement.
  const depositKeys = useRef<Set<string>>(
    new Set(
      seed.depositHistory.map((e) => e.request_key).filter(Boolean) as string[],
    ),
  );
  // Build #9 — configurable taxes & fees rules.
  const [taxRules, setTaxRules] = useState<TaxRule[]>(seed.taxRules);
  const [feeRules, setFeeRules] = useState<FeeRule[]>(seed.feeRules);
  // Build #10 — payment arrangements (promises to pay).
  const [paymentArrangements, setPaymentArrangements] = useState<
    PaymentArrangement[]
  >(seed.paymentArrangements);
  const [arrangementInstallments, setArrangementInstallments] = useState<
    PaymentArrangementInstallment[]
  >(seed.arrangementInstallments);
  const [arrangementEvents, setArrangementEvents] = useState<
    ArrangementEvent[]
  >(seed.arrangementEvents);
  // Build #11 — operational tasks.
  const [tasks, setTasks] = useState<Task[]>(seed.tasks);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>(seed.taskEvents);
  const [taskNotes, setTaskNotes] = useState<TaskNote[]>(seed.taskNotes);
  // Build #12 — staff notifications + delivery + preferences.
  const [notifications, setNotifications] = useState<Notification[]>(
    seed.notifications,
  );
  const notificationKeys = useRef<Set<string>>(
    new Set(
      seed.notifications.map((n) => n.dedupe_key).filter(Boolean) as string[],
    ),
  );
  const sentEmailLocks = useRef<Set<string>>(new Set());
  const [notificationDeliveries, setNotificationDeliveries] = useState<
    NotificationDelivery[]
  >(seed.notificationDeliveries);
  const [notificationPreferences, setNotificationPreferences] = useState<
    NotificationPreference[]
  >(seed.notificationPreferences);
  // Build #13 — maintenance work orders + events + vendors + receipts.
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>(
    seed.workOrders,
  );
  const [workOrderEvents, setWorkOrderEvents] = useState<
    MaintenanceWorkOrderEvent[]
  >(seed.workOrderEvents);
  const [maintenanceVendors, setMaintenanceVendors] = useState<
    MaintenanceVendor[]
  >(seed.maintenanceVendors);
  const [maintenanceReceipts, setMaintenanceReceipts] = useState<
    MaintenanceReceipt[]
  >(seed.maintenanceReceipts);
  // Build #14 — accounting expense ledger (separate from rental ledger).
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>(seed.expenses);
  const [expenseLineItems, setExpenseLineItems] = useState<ExpenseLineItem[]>(
    seed.expenseLineItems,
  );
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(
    seed.expenseCategories,
  );
  const [expenseEvents, setExpenseEvents] = useState<ExpenseEvent[]>(
    seed.expenseEvents,
  );
  const [expenseReceipts, setExpenseReceipts] = useState<ExpenseReceipt[]>(
    seed.expenseReceipts,
  );
  const [expenseReimbursements, setExpenseReimbursements] = useState<
    ExpenseReimbursement[]
  >(seed.expenseReimbursements);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>(
    seed.cashAccounts,
  );
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(seed.cashEntries);
  // Synchronous expense-number registry (ref) — seeded from existing expenses.
  const expenseNumberKeys = useRef<Set<string>>(
    new Set(seed.expenses.map((e) => e.expense_number)),
  );
  // Expenses V1 — rules, receipt inbox, recurring, alerts, budgets.
  const [expenseRules, setExpenseRules] = useState<ExpenseRule[]>(
    seed.expenseRules,
  );
  const [receiptInbox, setReceiptInbox] = useState<ReceiptInboxItem[]>(
    seed.receiptInbox,
  );
  const [recurringExpenses, setRecurringExpenses] = useState<
    RecurringExpense[]
  >(seed.recurringExpenses);
  const [spendAlerts, setSpendAlerts] = useState<SpendAlert[]>(
    seed.spendAlerts,
  );
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>(
    seed.categoryBudgets,
  );
  // Build #15 — banking & reconciliation state.
  const [financialAccounts, setFinancialAccounts] = useState<
    FinancialAccount[]
  >(seed.financialAccounts);
  const [importedTransactions, setImportedTransactions] = useState<
    ImportedTransaction[]
  >(seed.importedTransactions);
  const [statements, setStatements] = useState<FinancialStatement[]>(
    seed.statements,
  );
  const [importBatches, setImportBatches] = useState<ImportBatch[]>(
    seed.importBatches,
  );
  const [reconciliationMatches, setReconciliationMatches] = useState<
    ReconciliationMatch[]
  >(seed.reconciliationMatches);
  const [accountTransfers, setAccountTransfers] = useState<AccountTransfer[]>(
    seed.accountTransfers,
  );
  const [reconciliationEvents, setReconciliationEvents] = useState<
    ReconciliationEvent[]
  >(seed.reconciliationEvents);
  const importFingerprints = useRef<Set<string>>(
    new Set(seed.importedTransactions.map((t) => t.import_fingerprint)),
  );
  const [activityLog, setActivity] = useState<ActivityEntry[]>([
    {
      id: uid("act"),
      at: "2026-08-24T09:15:00Z",
      label: "Checkout inspection completed — Jeep Wrangler",
      tone: "available",
    },
    {
      id: uid("act"),
      at: "2026-08-23T16:40:00Z",
      label: "Reservation confirmed — Tesla Model 3",
      tone: "available",
    },
    {
      id: uid("act"),
      at: "2026-08-22T11:02:00Z",
      label: "Maintenance scheduled — Ford F-150 brakes",
      tone: "maintenance",
    },
    {
      id: uid("act"),
      at: "2026-08-21T14:20:00Z",
      label: "License blocked — Grace Liu",
      tone: "out",
    },
  ]);

  return {
    tenant: seed.tenant,
    vehicles,
    reservations,
    customers,
    rentals,
    rentalEvents,
    inspections,
    maintenance,
    addons,
    assignments,
    drivers,
    transactions,
    invoices,
    receipts,
    companyInfo,
    roles,
    vehicleClasses,
    addonCategories,
    addonCatalog,
    depositPolicies,
    agreementTemplates,
    agreementRules,
    settingsAudit,
    locations,
    staff,
    masterAgreements,
    agreementInstances,
    currentStaffId,
    activityLog,
    vehicleExchanges,
    ownershipChanges,
    rentalDeposits,
    depositHistory,
    depositKeys,
    taxRules,
    feeRules,
    paymentArrangements,
    arrangementInstallments,
    arrangementEvents,
    tasks,
    taskEvents,
    taskNotes,
    notifications,
    notificationDeliveries,
    notificationPreferences,
    notificationKeys,
    sentEmailLocks,
    workOrders,
    workOrderEvents,
    maintenanceVendors,
    maintenanceReceipts,
    expenses,
    expenseLineItems,
    expenseCategories,
    expenseEvents,
    expenseReceipts,
    expenseReimbursements,
    cashAccounts,
    cashEntries,
    expenseNumberKeys,
    expenseRules,
    receiptInbox,
    recurringExpenses,
    spendAlerts,
    categoryBudgets,
    setExpenseRules,
    setReceiptInbox,
    setRecurringExpenses,
    setSpendAlerts,
    setCategoryBudgets,
    financialAccounts,
    importedTransactions,
    statements,
    importBatches,
    reconciliationMatches,
    accountTransfers,
    reconciliationEvents,
    importFingerprints,
    setVehicles,
    setReservations,
    setCustomers,
    setRentals,
    setRentalEvents,
    setInspections,
    setMaintenance,
    setAddons,
    setAssignments,
    setDrivers,
    setTransactions,
    setInvoices,
    setReceipts,
    setCompanyInfo,
    setRoles,
    setVehicleClasses,
    setAddonCategories,
    setAddonCatalog,
    setDepositPolicies,
    setAgreementTemplates,
    setMasterAgreements,
    setAgreementInstances,
    setMasterAgreementsRef: (updater) =>
      setMasterAgreements((prev) => updater(prev)),
    setAgreementInstancesRef: (updater) =>
      setAgreementInstances((prev) => updater(prev)),
    setAgreementRules,
    setSettingsAudit,
    setLocations,
    setStaff,
    setCurrentStaffId,
    setActivity,
    setVehicleExchanges,
    setOwnershipChanges,
    setRentalDeposits,
    setDepositHistory,
    setTaxRules,
    setFeeRules,
    setPaymentArrangements,
    setArrangementInstallments,
    setArrangementEvents,
    setTasks,
    setTaskEvents,
    setTaskNotes,
    setNotifications,
    setNotificationDeliveries,
    setNotificationPreferences,
    setWorkOrders,
    setWorkOrderEvents,
    setMaintenanceVendors,
    setMaintenanceReceipts,
    setExpenses,
    setExpenseLineItems,
    setExpenseCategories,
    setExpenseEvents,
    setExpenseReceipts,
    setExpenseReimbursements,
    setCashAccounts,
    setCashEntries,
    setFinancialAccounts,
    setImportedTransactions,
    setStatements,
    setImportBatches,
    setReconciliationMatches,
    setAccountTransfers,
    setReconciliationEvents,
  };
}
