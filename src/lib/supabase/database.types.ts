// Connect Pro Fleet — typed Database schema aggregator (Build #22).
//
// Re-exports the row types split across dbTypes*.ts and assembles the
// `Database` interface consumed by the typed Supabase client. When generated
// types are available from `supabase gen types`, they can replace this file;
// the shape is kept compatible.

export type { Json } from "./dbTypesCore";
export * from "./dbTypesCore";
export * from "./dbTypesFinancial";
export * from "./dbTypesMaintenance";
export * from "./dbTypesTasks";
export * from "./dbTypesIntegrations";

import type {
  OrganizationRow,
  ProfileRow,
  RoleRow,
  PermissionRow,
  RolePermissionRow,
  OrganizationMembershipRow,
  OrganizationInvitationRow,
  CustomerRow,
  VehicleRow,
  VehicleClassRow,
  LocationRow,
  ReservationRow,
  RentalRow,
  RentalVehicleExchangeRow,
  BillingPeriodRow,
  BookingRequestRow,
  BookingOutboundEventRow,
  InspectionRow,
  AgreementTemplateRow,
  MasterAgreementRow,
  AgreementInstanceRow,
} from "./dbTypesCore";
import type {
  RentalLedgerTransactionRow,
  PaymentAllocationRow,
  SecurityDepositRow,
  DepositHistoryEventRow,
  ExpenseTransactionRow,
  ExpenseLineItemRow,
  ExpenseCategoryRow,
  ExpenseReceiptRow,
  ExpenseReimbursementRow,
  CashAccountRow,
  CashEntryRow,
  FinancialAccountRow,
  ImportedTransactionRow,
  FinancialStatementRow,
  ImportBatchRow,
  ReconciliationMatchRow,
  AccountTransferRow,
  ReconciliationEventRow,
} from "./dbTypesFinancial";
import type {
  MaintenanceWorkOrderRow,
  MaintenanceVendorRow,
  MaintenanceReceiptRow,
  MaintenanceWorkOrderEventRow,
  DamageClaimRow,
  DamageEvidenceRow,
  DamageClaimEventRow,
  DamageInsuranceClaimRow,
  DamageRecoveryRow,
} from "./dbTypesMaintenance";
import type {
  TaskRow,
  TaskEventRow,
  TaskNoteRow,
  NotificationRow,
  NotificationDeliveryRow,
  NotificationPreferenceRow,
} from "./dbTypesTasks";
import type {
  InvestorRow,
  InvestorVehicleRow,
  PartnershipExpenseRuleRow,
  InvestorSettlementRow,
  MigrationImportBatchRow,
  MigrationIssueRow,
  HistoricalFinancialPeriodRow,
  ConnectProIntegrationConfigRow,
  IntegrationEventRow,
  ExternalEntityReferenceRow,
  IntegrationReviewItemRow,
  IdempotencyKeyRow,
  DocumentSequenceRow,
  ActivityLogRow,
  FileObjectRow,
} from "./dbTypesIntegrations";

// Supabase's generated schema requires each table entity to carry
// Relationships (even when empty) or the typed client falls back to `never`
// for insert/update payloads. We provide all four fields with Insert/Update
// as Partial<Row> so .insert/.update accept partial rows.
//
// `Row` is wrapped in a homomorphic mapped type `RowOf<R>`. The row types are
// declared as `interface`s, which do NOT get an implicit index signature and
// therefore do not satisfy `Record<string, unknown>` — that makes
// `Database['public']` fail the `GenericSchema` constraint, collapsing `Schema`
// to `never` and breaking every `.insert()/.update()` call. A homomorphic
// mapped type over the interface gets an implicit index signature (so it
// satisfies `Record<string, unknown>`) while keeping `keyof` equal to the
// specific row keys (so postgrest-js's `RejectExcessProperties` excess-key
// check still works and partial inserts remain assignable).
type RowOf<R> = { [K in keyof R]: R[K] };
type Entity<R> = {
  Row: RowOf<R>;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      organizations: Entity<OrganizationRow>;
      profiles: Entity<ProfileRow>;
      roles: Entity<RoleRow>;
      permissions: Entity<PermissionRow>;
      role_permissions: Entity<RolePermissionRow>;
      organization_memberships: Entity<OrganizationMembershipRow>;
      organization_invitations: Entity<OrganizationInvitationRow>;
      customers: Entity<CustomerRow>;
      vehicles: Entity<VehicleRow>;
      vehicle_classes: Entity<VehicleClassRow>;
      locations: Entity<LocationRow>;
      reservations: Entity<ReservationRow>;
      rentals: Entity<RentalRow>;
      rental_vehicle_exchanges: Entity<RentalVehicleExchangeRow>;
      billing_periods: Entity<BillingPeriodRow>;
      booking_requests: Entity<BookingRequestRow>;
      booking_outbound_events: Entity<BookingOutboundEventRow>;
      inspections: Entity<InspectionRow>;
      agreement_templates: Entity<AgreementTemplateRow>;
      master_agreements: Entity<MasterAgreementRow>;
      agreement_instances: Entity<AgreementInstanceRow>;
      rental_ledger_transactions: Entity<RentalLedgerTransactionRow>;
      payment_allocations: Entity<PaymentAllocationRow>;
      security_deposits: Entity<SecurityDepositRow>;
      deposit_history_events: Entity<DepositHistoryEventRow>;
      expense_transactions: Entity<ExpenseTransactionRow>;
      expense_line_items: Entity<ExpenseLineItemRow>;
      expense_categories: Entity<ExpenseCategoryRow>;
      expense_receipts: Entity<ExpenseReceiptRow>;
      expense_reimbursements: Entity<ExpenseReimbursementRow>;
      cash_accounts: Entity<CashAccountRow>;
      cash_entries: Entity<CashEntryRow>;
      financial_accounts: Entity<FinancialAccountRow>;
      imported_transactions: Entity<ImportedTransactionRow>;
      financial_statements: Entity<FinancialStatementRow>;
      import_batches: Entity<ImportBatchRow>;
      reconciliation_matches: Entity<ReconciliationMatchRow>;
      account_transfers: Entity<AccountTransferRow>;
      reconciliation_events: Entity<ReconciliationEventRow>;
      maintenance_work_orders: Entity<MaintenanceWorkOrderRow>;
      maintenance_vendors: Entity<MaintenanceVendorRow>;
      maintenance_receipts: Entity<MaintenanceReceiptRow>;
      maintenance_work_order_events: Entity<MaintenanceWorkOrderEventRow>;
      damage_claims: Entity<DamageClaimRow>;
      damage_evidence: Entity<DamageEvidenceRow>;
      damage_claim_events: Entity<DamageClaimEventRow>;
      damage_insurance_claims: Entity<DamageInsuranceClaimRow>;
      damage_recoveries: Entity<DamageRecoveryRow>;
      tasks: Entity<TaskRow>;
      task_events: Entity<TaskEventRow>;
      task_notes: Entity<TaskNoteRow>;
      notifications: Entity<NotificationRow>;
      notification_deliveries: Entity<NotificationDeliveryRow>;
      notification_preferences: Entity<NotificationPreferenceRow>;
      investors: Entity<InvestorRow>;
      investor_vehicles: Entity<InvestorVehicleRow>;
      partnership_expense_rules: Entity<PartnershipExpenseRuleRow>;
      investor_settlements: Entity<InvestorSettlementRow>;
      migration_import_batches: Entity<MigrationImportBatchRow>;
      migration_issues: Entity<MigrationIssueRow>;
      historical_financial_periods: Entity<HistoricalFinancialPeriodRow>;
      connect_pro_integration_configs: Entity<ConnectProIntegrationConfigRow>;
      integration_events: Entity<IntegrationEventRow>;
      external_entity_references: Entity<ExternalEntityReferenceRow>;
      integration_review_items: Entity<IntegrationReviewItemRow>;
      idempotency_keys: Entity<IdempotencyKeyRow>;
      document_sequences: Entity<DocumentSequenceRow>;
      activity_log: Entity<ActivityLogRow>;
      file_objects: Entity<FileObjectRow>;
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: { Args: { org_id: string }; Returns: boolean };
      has_permission: {
        Args: { org_id: string; permission_code: string };
        Returns: boolean;
      };
      next_document_number: {
        Args: {
          org_id: string;
          sequence_type: string;
          prefix: string;
          year_value: number;
        };
        Returns: string;
      };
      post_payment: {
        Args: {
          p_org_id: string;
          p_rental_id: string;
          p_amount: number;
          p_method: string;
          p_tender_method: string | null;
          p_processor: string | null;
          p_payment_source: string | null;
          p_reference: string | null;
          p_external_payment_id: string | null;
          p_external_transaction_id: string | null;
          p_request_key: string | null;
          p_created_by: string | null;
        };
        Returns: { payment_id: string; duplicate: boolean };
      };
    };
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
}
