// Connect Pro Fleet — Vehicle Vault store provider (Build #45).
//
// Standalone tenant-scoped context for the Vehicle Document Vault. Coordinates
// with the main store: Cash Expense Record → Expense Ledger (no duplicate
// financial truth), purchase-price conflict detection against vehicle
// acquisition (no competing purchasePrice field). Document numbering uses a
// synchronous VaultNumberRegistry so rapid creation is concurrency-safe.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type {
  VaultDocument,
  VaultEvent,
  VaultDocGroup,
  VaultSignature,
  VaultEventType,
} from "./vaultTypes";
import { useStore } from "./store";
import { uid, TENANT_ID } from "./store/ids";
import { VaultNumberRegistry } from "./vaultNumbering";
import { seedVaultDocs, seedVaultEvents } from "./store/seedVault";
import type {
  VaultStore,
  CreateUploadedDocInput,
  CreateCashExpenseInput,
  CreatePurchaseInput,
} from "./vaultStoreInterface";

const VaultContext = createContext<VaultStore | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

function currentYear(): number {
  return new Date().getFullYear();
}

function groupForCategory(cat: VaultDocument["category"]): VaultDocGroup {
  switch (cat) {
    case "bill_of_sale":
    case "purchase_record":
    case "title":
    case "payment_proof":
      return "purchase_ownership";
    case "receipt":
    case "invoice":
    case "cash_expense_record":
      return "expense_documentation";
    case "maintenance_doc":
      return "maintenance";
    case "damage_doc":
      return "damage_incident";
    case "violation_doc":
      return "violations";
    case "compliance_doc":
      return "compliance";
    default:
      return "other";
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [docs, setDocs] = useState<VaultDocument[]>(seedVaultDocs);
  const [events, setEvents] = useState<VaultEvent[]>(seedVaultEvents);
  const numberRegistry = useRef<VaultNumberRegistry>(
    new VaultNumberRegistry(seedVaultDocs.map((d) => d.document_number)),
  );
  // Always-current docs snapshot so rapid synchronous actions read authoritative
  // state, not the stale closure captured by useMemo.
  const docsRef = useRef(docs);
  docsRef.current = docs;

  function logEvent(
    docId: string,
    type: VaultEventType,
    label: string,
    actorId: string | null,
    meta: Record<string, unknown> | null = null,
  ) {
    setEvents((prev) => [
      ...prev,
      {
        id: uid("ve"),
        tenant_id: TENANT_ID,
        document_id: docId,
        type,
        label,
        at: nowIso(),
        actor_id: actorId,
        meta,
      },
    ]);
  }

  function issueNumber(category: VaultDocument["category"]): string {
    return numberRegistry.current.issue(category, currentYear());
  }

  const value = useMemo<VaultStore>(() => {
    const staffId = store.currentStaffId;

    function createDoc(
      partial: Omit<
        VaultDocument,
        | "id"
        | "tenant_id"
        | "document_number"
        | "version"
        | "created_at"
        | "updated_at"
        | "signatures"
        | "links"
        | "supersedes_doc_id"
        | "superseded_by_doc_id"
        | "void_reason"
        | "status"
      > & {
        status?: VaultDocument["status"];
      },
    ): VaultDocument {
      const num = issueNumber(partial.category);
      const doc: VaultDocument = {
        id: uid("vd"),
        tenant_id: TENANT_ID,
        version: 1,
        status: partial.status ?? "active",
        signatures: [],
        links: {
          expense_id: null,
          acquisition_vehicle_id: null,
          work_order_id: null,
          damage_claim_id: null,
          incident_id: null,
          violation_id: null,
        },
        supersedes_doc_id: null,
        superseded_by_doc_id: null,
        void_reason: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...partial,
        document_number: num,
      };
      setDocs((prev) => [doc, ...prev]);
      const evtType: VaultEventType =
        doc.source === "generated" ? "generated" : "uploaded";
      logEvent(
        doc.id,
        evtType,
        evtType === "generated" ? "Generated" : "Uploaded",
        staffId,
      );
      return doc;
    }

    return {
      vaultDocs: docs,
      vaultEvents: events,

      docById: (id) => docsRef.current.find((d) => d.id === id),
      generatedDocById: (id) => docsRef.current.find((d) => d.id === id),
      vehicleDocs: (vehicleId) =>
        docsRef.current
          .filter((d) => d.vehicle_id === vehicleId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
      eventsFor: (docId) =>
        events
          .filter((e) => e.document_id === docId)
          .sort((a, b) => (a.at < b.at ? 1 : -1)),

      createUploadedDoc: (input: CreateUploadedDocInput) => {
        const doc = createDoc({
          vehicle_id: input.vehicle_id,
          kind: "uploaded",
          category: input.category,
          group: input.group ?? groupForCategory(input.category),
          title: input.title,
          description: input.description ?? null,
          file_name: input.file_name,
          file_url: input.file_url,
          mime_type: input.mime_type ?? null,
          vendor_name: input.vendor_name ?? null,
          vendor_phone: null,
          vendor_email: null,
          vendor_address: null,
          amount: input.amount ?? null,
          expense_date: input.expense_date ?? null,
          payment_method: null,
          expense_category_id: null,
          notes: input.notes ?? null,
          seller_name: null,
          seller_address: null,
          seller_phone: null,
          seller_email: null,
          purchase_date: null,
          purchase_price: null,
          purchase_payment_method: null,
          odometer: null,
          terms: null,
          as_is: false,
          source_platform: null,
          is_internal: false,
          source: input.source ?? "uploaded",
          created_by: staffId,
        });
        return doc.id;
      },

      createCashExpenseRecord: (input: CreateCashExpenseInput) => {
        const doc = createDoc({
          vehicle_id: input.vehicle_id,
          kind: "cash_expense_record",
          category: "cash_expense_record",
          group: "expense_documentation",
          title: input.description,
          description: input.description,
          file_name: null,
          file_url: null,
          mime_type: null,
          vendor_name: input.vendor_name,
          vendor_phone: input.vendor_phone ?? null,
          vendor_email: null,
          vendor_address: null,
          amount: input.amount,
          expense_date: input.expense_date,
          payment_method: input.payment_method,
          expense_category_id: null,
          notes: input.notes ?? null,
          seller_name: null,
          seller_address: null,
          seller_phone: null,
          seller_email: null,
          purchase_date: null,
          purchase_price: null,
          purchase_payment_method: null,
          odometer: null,
          terms: null,
          as_is: false,
          source_platform: null,
          is_internal: false,
          source: "generated",
          created_by: staffId,
          status: "awaiting_signature",
        });
        return doc.id;
      },

      createBillOfSale: (input: CreatePurchaseInput) => {
        const doc = createDoc({
          vehicle_id: input.vehicle_id,
          kind: "bill_of_sale",
          category: "bill_of_sale",
          group: "purchase_ownership",
          title: `Bill of Sale — ${input.seller_name}`,
          description: null,
          file_name: null,
          file_url: null,
          mime_type: null,
          vendor_name: null,
          vendor_phone: null,
          vendor_email: null,
          vendor_address: null,
          amount: null,
          expense_date: null,
          payment_method: null,
          expense_category_id: null,
          notes: null,
          seller_name: input.seller_name,
          seller_address: input.seller_address ?? null,
          seller_phone: input.seller_phone ?? null,
          seller_email: null,
          purchase_date: input.purchase_date,
          purchase_price: input.purchase_price,
          purchase_payment_method: input.purchase_payment_method,
          odometer: input.odometer ?? null,
          terms: input.terms ?? null,
          as_is: input.as_is ?? false,
          source_platform: input.source_platform ?? null,
          is_internal: false,
          source: "generated",
          created_by: staffId,
          status: "awaiting_signature",
        });
        // Link to vehicle acquisition (spec §26).
        setDocs((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  links: {
                    ...d.links,
                    acquisition_vehicle_id: input.vehicle_id,
                  },
                }
              : d,
          ),
        );
        return doc.id;
      },

      createPurchaseRecord: (input: CreatePurchaseInput) => {
        const doc = createDoc({
          vehicle_id: input.vehicle_id,
          kind: "purchase_record",
          category: "purchase_record",
          group: "purchase_ownership",
          title: `Internal Purchase Record — ${input.seller_name}`,
          description: null,
          file_name: null,
          file_url: null,
          mime_type: null,
          vendor_name: null,
          vendor_phone: null,
          vendor_email: null,
          vendor_address: null,
          amount: null,
          expense_date: null,
          payment_method: null,
          expense_category_id: null,
          notes: null,
          seller_name: input.seller_name,
          seller_address: input.seller_address ?? null,
          seller_phone: input.seller_phone ?? null,
          seller_email: null,
          purchase_date: input.purchase_date,
          purchase_price: input.purchase_price,
          purchase_payment_method: input.purchase_payment_method,
          odometer: input.odometer ?? null,
          terms: input.terms ?? null,
          as_is: input.as_is ?? false,
          source_platform: input.source_platform ?? null,
          is_internal: true,
          source: "generated",
          created_by: staffId,
          status: "awaiting_signature",
        });
        setDocs((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  links: {
                    ...d.links,
                    acquisition_vehicle_id: input.vehicle_id,
                  },
                }
              : d,
          ),
        );
        return doc.id;
      },

      signDocument: (
        docId: string,
        sig: Omit<VaultSignature, "signed_at" | "staff_id">,
      ) => {
        setDocs((prev) =>
          prev.map((d) => {
            if (d.id !== docId) return d;
            const signatures = [
              ...d.signatures.filter((s) => s.role !== sig.role),
              { ...sig, signed_at: nowIso(), staff_id: store.currentStaffId },
            ];
            // If a generated record gets its first signature, move to active.
            const status =
              d.status === "awaiting_signature" ? "active" : d.status;
            return { ...d, signatures, status, updated_at: nowIso() };
          }),
        );
        logEvent(
          docId,
          "signed",
          `Signed by ${sig.role}`,
          store.currentStaffId,
        );
      },

      voidDocument: (docId: string, reason: string) => {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  status: "voided",
                  void_reason: reason,
                  updated_at: nowIso(),
                }
              : d,
          ),
        );
        logEvent(docId, "voided", `Voided: ${reason}`, store.currentStaffId, {
          reason,
        });
      },

      reissueDocument: (docId: string, reason: string) => {
        // Create a new version that supersedes the voided original (spec §44).
        const original = docsRef.current.find((d) => d.id === docId);
        if (!original) return "";
        const newNum = issueNumber(original.category);
        const reissued: VaultDocument = {
          ...original,
          id: uid("vd"),
          document_number: newNum,
          version: original.version + 1,
          status: "awaiting_signature",
          signatures: [],
          void_reason: null,
          supersedes_doc_id: original.id,
          superseded_by_doc_id: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        setDocs((prev) => [
          reissued,
          ...prev.map((d) =>
            d.id === docId ? { ...d, superseded_by_doc_id: reissued.id } : d,
          ),
        ]);
        logEvent(
          reissued.id,
          "amended",
          `Reissued from ${original.document_number}: ${reason}`,
          store.currentStaffId,
          { reason, supersedes: original.id },
        );
        return reissued.id;
      },

      archiveDocument: (docId: string) => {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, status: "archived", updated_at: nowIso() }
              : d,
          ),
        );
      },

      linkExpense: (docId: string, expenseId: string) => {
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  links: { ...d.links, expense_id: expenseId },
                  updated_at: nowIso(),
                }
              : d,
          ),
        );
        logEvent(
          docId,
          "linked",
          `Linked to expense ${expenseId}`,
          store.currentStaffId,
        );
      },

      createExpenseFromCashRecord: (docId: string) => {
        const doc = docsRef.current.find((d) => d.id === docId);
        if (!doc || doc.kind !== "cash_expense_record") return null;
        // Use the EXISTING Expense Ledger — no duplicate financial truth.
        const expenseId = store.createExpense({
          description: doc.description ?? doc.title,
          amount: doc.amount ?? 0,
          transaction_date: doc.expense_date ?? nowIso().slice(0, 10),
          payment_method: doc.payment_method ?? "cash",
          vehicle_id: doc.vehicle_id,
          receipt_required: false,
          memo: `From Cash Expense Record ${doc.document_number}`,
        });
        // Link the vault doc to the new expense.
        setDocs((prev) =>
          prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  links: { ...d.links, expense_id: expenseId },
                  updated_at: nowIso(),
                }
              : d,
          ),
        );
        logEvent(
          docId,
          "linked",
          `Created expense ${expenseId}`,
          store.currentStaffId,
        );
        return expenseId;
      },

      deleteDraftIfUnused: (docId: string) => {
        const doc = docsRef.current.find((d) => d.id === docId);
        if (!doc) return false;
        // Only safe unused drafts/uploads may be hard-deleted (spec §53).
        if (doc.status === "active" || doc.status === "voided") return false;
        if (doc.links.expense_id) return false;
        if (doc.links.acquisition_vehicle_id) return false;
        setDocs((prev) => prev.filter((d) => d.id !== docId));
        return true;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, events, store]);

  return (
    <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault must be used within VaultProvider");
  return ctx;
}
