// Connect Pro Fleet — Vehicle Vault store interface (Build #45).
//
// The Vault store is a standalone tenant-scoped context (the main fleet store
// is at its size ceiling). It coordinates with the main store for expense
// creation (Cash Expense Record → Expense Ledger) and vehicle acquisition
// (purchase-price conflict detection), but never duplicates financial truth.

import type {
  VaultDocument,
  VaultEvent,
  VaultDocCategory,
  VaultDocGroup,
  VaultSignature,
  VaultDocSource,
} from "./vaultTypes";
import type { TenderMethod } from "./paymentMethodTypes";

export interface CreateUploadedDocInput {
  vehicle_id: string;
  category: VaultDocCategory;
  group?: VaultDocGroup;
  title: string;
  description?: string | null;
  file_name: string;
  file_url: string;
  mime_type?: string | null;
  vendor_name?: string | null;
  amount?: number | null;
  expense_date?: string | null;
  notes?: string | null;
  source?: VaultDocSource;
}

export interface CreateCashExpenseInput {
  vehicle_id: string;
  vendor_name: string;
  vendor_phone?: string | null;
  amount: number;
  expense_date: string;
  description: string;
  payment_method: TenderMethod;
  notes?: string | null;
}

export interface CreatePurchaseInput {
  vehicle_id: string;
  seller_name: string;
  seller_address?: string | null;
  seller_phone?: string | null;
  purchase_date: string;
  purchase_price: number;
  purchase_payment_method: string;
  odometer?: number | null;
  terms?: string | null;
  as_is?: boolean;
  source_platform?: string | null;
  is_internal: boolean;
}

export interface VaultStore {
  vaultDocs: VaultDocument[];
  vaultEvents: VaultEvent[];

  // selectors
  docById: (id: string) => VaultDocument | undefined;
  generatedDocById: (id: string) => VaultDocument | undefined;
  vehicleDocs: (vehicleId: string) => VaultDocument[];
  eventsFor: (docId: string) => VaultEvent[];

  // creation
  createUploadedDoc: (input: CreateUploadedDocInput) => string;
  createCashExpenseRecord: (input: CreateCashExpenseInput) => string;
  createBillOfSale: (input: CreatePurchaseInput) => string;
  createPurchaseRecord: (input: CreatePurchaseInput) => string;

  // lifecycle
  signDocument: (
    docId: string,
    sig: Omit<VaultSignature, "signed_at" | "staff_id">,
  ) => void;
  voidDocument: (docId: string, reason: string) => void;
  reissueDocument: (docId: string, reason: string) => string;
  archiveDocument: (docId: string) => void;
  linkExpense: (docId: string, expenseId: string) => void;
  createExpenseFromCashRecord: (docId: string) => string | null;
  deleteDraftIfUnused: (docId: string) => boolean;
}
