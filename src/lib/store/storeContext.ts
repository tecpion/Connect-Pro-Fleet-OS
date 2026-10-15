// Connect Pro Fleet — store context + FleetStore interface (Build #5).
//
// The public `useStore()` API is preserved exactly so components don't change.
// Domain modules (vehicleStore, rentalStore, paymentStore, ...) attach their
// methods to a shared StoreContext value built by StoreProvider. This file
// defines the interface + the React context; StoreProvider assembles it.

import { createContext } from "react";
import type {
  Addon,
  AddonCatalogItem,
  AddonCategory,
  AgreementInstance,
  AgreementRules,
  AgreementTemplate,
  ChargeType,
  CompanyInfo,
  Customer,
  DepositPolicy,
  Driver,
  FinancialTransaction,
  Inspection,
  Invoice,
  InvoiceStatus,
  Location,
  MaintenanceRecord,
  MasterAgreement,
  PaymentMethod,
  VehicleClass,
  Receipt,
  RentalAgreement,
  RentalEvent,
  Reservation,
  Role,
  SettingsAuditEntry,
  Staff,
  StaffAssignment,
  Tenant,
  ThemePreference,
  Vehicle,
} from "../types";
import type { LedgerSummary } from "../ledger";
import type { RentalVehicleExchange } from "./rentalVehicleExchange";
export type { RentalVehicleExchange };
import type {
  OwnershipChangeRecord,
  VehicleOwnershipType,
} from "../ownershipTypes";
import type { RentalDeposit, DepositHistoryEvent } from "../depositTypes";
import type {
  ChargeCategory,
  ChargeLine,
  FeeRule,
  FeeRuleSnapshot,
  FeeTrigger,
  TaxRule,
  TaxRuleSnapshot,
} from "../taxFeeTypes";
import type {
  ArrangementEvent,
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "../paymentArrangementTypes";
import type { PaymentArrangementMethods } from "./paymentArrangementContext";
import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type { TaskMethods } from "./taskContext";
import type { DepositMethods } from "./depositContext";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "../notificationTypes";
import type { NotificationMethods } from "./notificationContext";
import type {
  MaintenanceWorkOrder,
  MaintenanceVendor,
  MaintenanceReceipt,
} from "../maintenanceTypes";
import type { MaintenanceMethods } from "./maintenanceContext";
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
import type { ExpenseMethods } from "./expenseContext";
import type { BankingMethods } from "./bankingContext";
import type {
  FinancialAccount,
  ImportedTransaction,
  FinancialStatement,
  ImportBatch,
  ReconciliationMatch,
  AccountTransfer,
  ReconciliationEvent,
} from "../bankingTypes";

export interface ActivityEntry {
  id: string;
  at: string;
  label: string;
  tone: "neutral" | "available" | "maintenance" | "out";
}

export interface FleetStore
  extends
    PaymentArrangementMethods,
    TaskMethods,
    DepositMethods,
    NotificationMethods,
    MaintenanceMethods,
    ExpenseMethods,
    BankingMethods {
  tenant: Tenant;
  locations: Location[];
  vehicles: Vehicle[];
  reservations: Reservation[];
  customers: Customer[];
  rentals: RentalAgreement[];
  rentalEvents: RentalEvent[];
  drivers: Driver[];
  inspections: Inspection[];
  maintenance: MaintenanceRecord[];
  addons: Addon[];
  staff: Staff[];
  assignments: StaffAssignment[];
  masterAgreements: MasterAgreement[];
  agreementInstances: AgreementInstance[];
  // Financial transaction ledger — append-oriented source of truth.
  transactions: FinancialTransaction[];
  // Invoices organize ledger charges; receipts document ledger payments.
  invoices: Invoice[];
  receipts: Receipt[];
  // Build #8 — operational security deposit lifecycle records + history.
  rentalDeposits: RentalDeposit[];
  depositHistory: DepositHistoryEvent[];
  currentStaffId: string;
  setCurrentStaffId: (id: string) => void;
  // Resolves a creator label ("Name · Role") for a staff id, or a fallback for
  // inbound sources (webhook/marketplace) where no staff member is involved.
  creatorLabel: (staffId: string | null, source?: string) => string;
  // Resolves a customer's full name from a customer id.
  customerName: (id: string) => string;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  addVehicle: (v: Vehicle) => void;
  // Build #6 — vehicle ownership (asset fact). Set/transfer ownership with an
  // audited history record; compensation lives separately on the pairing.
  setVehicleOwnership: (
    vehicleId: string,
    input: {
      ownership_type: VehicleOwnershipType;
      owner_entity_id?: string | null;
      owner_display_name?: string | null;
      ownership_notes?: string | null;
      effective_date?: string | null;
      reason?: string | null;
    },
    staffId?: string,
  ) => void;
  vehicleOwnershipHistory: (vehicleId: string) => OwnershipChangeRecord[];
  ownershipChanges: OwnershipChangeRecord[];
  // Build #8 — operational security deposit lifecycle methods (see DepositMethods).
  // Build #9 — configurable taxes & fees.
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
  // Build #13 — maintenance work orders + vendors + receipts.
  workOrders: MaintenanceWorkOrder[];
  maintenanceVendors: MaintenanceVendor[];
  maintenanceReceipts: MaintenanceReceipt[];
  // Build #14 — accounting expense ledger (separate from rental ledger).
  expenses: ExpenseTransaction[];
  expenseLineItems: ExpenseLineItem[];
  expenseCategories: ExpenseCategory[];
  expenseEvents: ExpenseEvent[];
  expenseReceipts: ExpenseReceipt[];
  expenseReimbursements: ExpenseReimbursement[];
  expenseRules: ExpenseRule[];
  receiptInbox: ReceiptInboxItem[];
  recurringExpenses: RecurringExpense[];
  spendAlerts: SpendAlert[];
  categoryBudgets: CategoryBudget[];
  cashAccounts: CashAccount[];
  cashEntries: CashEntry[];
  addTaxRule: (r: TaxRule) => void;
  updateTaxRule: (id: string, patch: Partial<TaxRule>) => void;
  deactivateTaxRule: (id: string) => void;
  addFeeRule: (r: FeeRule) => void;
  updateFeeRule: (id: string, patch: Partial<FeeRule>) => void;
  deactivateFeeRule: (id: string) => void;
  postFeeCharge: (input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    ruleId: string;
    amount: number;
    chargeCategory: ChargeCategory;
    snapshot: FeeRuleSnapshot;
    description?: string;
    effectiveDate?: string;
    billingPeriod?: string | null;
    includeInVehicleRevenue: boolean;
    chargeGroupId?: string;
    idempotencyKey?: string;
  }) => string;
  postTaxCharge: (input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    ruleId: string;
    amount: number;
    snapshot: TaxRuleSnapshot;
    description?: string;
    effectiveDate?: string;
    billingPeriod?: string | null;
    chargeGroupId?: string;
    idempotencyKey?: string;
  }) => string;
  postStartCharges: (input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    locationId?: string | null;
    effectiveDate: string;
    baseCharges: ChargeLine[];
    taxExempt?: boolean;
  }) => { feeTxnIds: string[]; taxTxnIds: string[] };
  assessTriggeredFee: (input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    locationId?: string | null;
    ruleId: string;
    trigger: FeeTrigger;
    effectiveDate: string;
    rentalDays?: number;
    baseCharges?: ChargeLine[];
    overrideAmount?: number;
    overrideReason?: string;
    taxExempt?: boolean;
  }) => { feeTxnId: string | null; taxTxnIds: string[]; amount: number };
  reverseChargeBundle: (input: {
    rentalId: string;
    customerId: string;
    chargeGroupId: string;
    reason: string;
  }) => string[];
  postPeriodCharges: (input: {
    rentalId: string;
    customerId: string;
    vehicleId?: string | null;
    reservationId?: string | null;
    locationId?: string | null;
    effectiveDate: string;
    billingPeriodId: string;
    periodStart: string;
    periodEnd: string;
    baseAmount: number;
    periodDays: number;
    taxExempt?: boolean;
  }) => {
    baseTxnId: string | null;
    feeTxnIds: string[];
    taxTxnIds: string[];
    feeTotal: number;
    taxTotal: number;
  };
  updateReservation: (id: string, patch: Partial<Reservation>) => void;
  addReservation: (r: Reservation) => void;
  // Adds a payment to a reservation's amount_paid (clamped at the total owed).
  recordPayment: (id: string, amount: number) => void;
  addInspection: (i: Inspection) => void;
  addMaintenance: (m: MaintenanceRecord) => void;
  updateMaintenance: (id: string, patch: Partial<MaintenanceRecord>) => void;
  addAddon: (a: Addon) => void;
  removeAddon: (id: string) => void;
  addAssignment: (a: StaffAssignment) => void;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  // Customer management
  addCustomer: (c: Customer) => void;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  // Rental agreements
  addRental: (r: RentalAgreement) => void;
  updateRental: (id: string, patch: Partial<RentalAgreement>) => void;
  addRentalEvent: (e: RentalEvent) => void;
  // Record a payment against a rental via the authoritative ledger (Build #14:
  // accepts a canonical TenderMethod + optional processor, or a legacy label).
  recordRentalPayment: (
    id: string,
    amount: number,
    method?: string | import("../paymentMethodTypes").TenderMethod,
    opts?: {
      processor?: import("../paymentMethodTypes").PaymentProcessor | null;
      reference?: string;
      notes?: string;
    },
  ) => number;
  applyLateFee: (id: string) => void;
  waiveLateFee: (id: string) => void;
  processWeeklyBilling: () => void;
  // Convert a confirmed reservation into a rental agreement. Transfers
  // customer, vehicle, dates, rate, deposit, amount paid, and add-ons.
  convertReservationToRental: (reservationId: string) => string | null;
  // Complete checkout: marks rental active, vehicle rented, customer active.
  // Build #5: atomic billing-config persistence at checkout.
  startCheckout: (
    id: string,
    data: {
      mileageOut: number;
      fuelOut: number;
      signed: boolean;
      billingConfig?: import("../billingTypes").RentalBillingConfig | null;
    },
  ) => void;
  // Complete return: marks rental completed, vehicle available, applies charges.
  completeReturn: (
    id: string,
    data: {
      mileageIn: number;
      fuelIn: number;
      returnDate: string;
      returnTime: string;
      charges: number;
      depositRefund: number;
    },
  ) => void;
  // --- Build #5: explicit rental lifecycle domain actions ---
  changeRentalRate: (input: {
    rentalId: string;
    newRate: number;
    effectiveDate: string;
    reason?: string;
  }) => void;
  // Exchange the vehicle on an active rental without ending the rental.
  exchangeVehicle: (input: {
    rentalId: string;
    newVehicleId: string;
    reason: string;
    oldMileageIn: number;
    oldFuelIn: number;
    newMileageOut: number;
    newFuelOut: number;
    newVehicleDisposition?: "available" | "maintenance" | "out_of_service";
    rateChange?: { newRate: number; reason: string } | null;
  }) => void;
  vehicleExchanges: (rentalId: string) => RentalVehicleExchange[];
  extendRental: (rentalId: string, days: number) => void;
  /** Build #19 — purge an imported-legacy rental + its migration-only
   *  financial records. Used by import-batch rollback. */
  purgeImportedRental: (rentalId: string) => void;
  activityLog: ActivityEntry[];
  logActivity: (e: ActivityEntry) => void;
  // --- Financial ledger methods ---
  postTransaction: (
    input: Omit<
      FinancialTransaction,
      "id" | "tenant_id" | "created_at" | "created_by"
    > & { created_by?: string | null },
  ) => string;
  recordLedgerPayment: (
    rentalId: string,
    amount: number,
    method: PaymentMethod | import("../paymentMethodTypes").TenderMethod,
    opts?: {
      reference?: string;
      notes?: string;
      effectiveDate?: string;
      processor?: import("../paymentMethodTypes").PaymentProcessor | null;
      paymentSource?: string | null;
    },
  ) => number;
  voidTransaction: (transactionId: string, reason?: string) => void;
  /** Merge metadata into a posted transaction (e.g. tag a damage charge with
   *  damage_claim_id). Non-destructive: existing keys are preserved. */
  tagTransactionMetadata: (
    transactionId: string,
    meta: Record<string, unknown>,
  ) => void;
  rentalFinancials: (rentalId: string) => LedgerSummary;
  rentalLedger: (rentalId: string) => FinancialTransaction[];
  customerLedger: (customerId: string) => FinancialTransaction[];
  postCharge: (
    rentalId: string,
    input: {
      type: ChargeType;
      amount: number;
      description?: string;
      notes?: string;
    },
  ) => string;
  // ---------------------------------------------------------------------------
  // Invoice & receipt methods
  // ---------------------------------------------------------------------------
  generateInvoice: (input: {
    rentalId: string;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    dueDate?: string;
    notes?: string;
  }) => string | null;
  generateCustomerInvoice: (input: {
    customerId: string;
    rentalId?: string | null;
    dueDate?: string;
    notes?: string;
  }) => string | null;
  voidInvoice: (invoiceId: string, reason?: string) => void;
  recordInvoicePayment: (
    invoiceId: string,
    amount: number,
    method: PaymentMethod | import("../paymentMethodTypes").TenderMethod,
    opts?: {
      reference?: string;
      notes?: string;
      processor?: import("../paymentMethodTypes").PaymentProcessor | null;
    },
  ) => void;
  rentalInvoices: (rentalId: string) => Invoice[];
  customerInvoices: (customerId: string) => Invoice[];
  customerReceipts: (customerId: string) => Receipt[];
  receiptForPayment: (paymentTxnId: string) => Receipt | undefined;
  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  companyInfo: CompanyInfo;
  roles: Role[];
  addonCategories: AddonCategory[];
  addonCatalog: AddonCatalogItem[];
  depositPolicies: DepositPolicy[];
  agreementTemplates: AgreementTemplate[];
  agreementRules: AgreementRules;
  settingsAudit: SettingsAuditEntry[];
  updateCompanyInfo: (patch: Partial<CompanyInfo>) => void;
  addLocation: (loc: Location) => void;
  updateLocation: (id: string, patch: Partial<Location>) => void;
  setDefaultLocation: (id: string) => void;
  addStaff: (s: Staff) => void;
  updateStaff: (id: string, patch: Partial<Staff>) => void;
  addRole: (r: Role) => void;
  updateRole: (id: string, patch: Partial<Role>) => void;
  duplicateRole: (id: string) => string | null;
  setUserPermissionOverride: (
    staffId: string,
    key: string,
    value: boolean,
  ) => void;
  clearUserPermissionOverride: (staffId: string, key: string) => void;
  vehicleClasses: VehicleClass[];
  addVehicleClass: (c: VehicleClass) => void;
  updateVehicleClass: (id: string, patch: Partial<VehicleClass>) => void;
  duplicateVehicleClass: (id: string) => string | null;
  assignVehicleClass: (vehicleId: string, classId: string | null) => void;
  addAddonCategory: (c: AddonCategory) => void;
  updateAddonCategory: (id: string, patch: Partial<AddonCategory>) => void;
  addAddonCatalogItem: (a: AddonCatalogItem) => void;
  updateAddonCatalogItem: (
    id: string,
    patch: Partial<AddonCatalogItem>,
  ) => void;
  addDepositPolicy: (d: DepositPolicy) => void;
  updateDepositPolicy: (id: string, patch: Partial<DepositPolicy>) => void;
  setDefaultDepositPolicy: (id: string) => void;
  addAgreementTemplate: (t: AgreementTemplate) => void;
  updateAgreementTemplate: (
    id: string,
    patch: Partial<AgreementTemplate>,
  ) => void;
  uploadAgreementTemplateVersion: (
    id: string,
    file: { name: string; url: string },
  ) => string;
  setDefaultAgreementTemplate: (id: string) => void;
  updateAgreementRules: (patch: Partial<AgreementRules>) => void;
  setUserTheme: (staffId: string, theme: ThemePreference) => void;
  setUserBrandColor: (staffId: string, color: string | null) => void;
  logSettingsChange: (input: {
    action: string;
    detail?: string;
    old_value?: string | null;
    new_value?: string | null;
  }) => void;
}

export const StoreContext = createContext<FleetStore | null>(null);
