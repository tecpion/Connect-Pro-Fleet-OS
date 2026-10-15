// Connect Pro Fleet — Customer Import History store (Build #38 — Customers V1).
//
// Tracks the audit trail for customer CSV imports: file name, imported at/by,
// row counts (created/updated/skipped/failed), and status. Mirrors the
// CustomerNotes/CustomerTags provider pattern. Import history is presentation
// + audit only — it never duplicates customer financial truth.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TENANT_ID, uid } from "./store/ids";

export type CustomerImportStatus = "completed" | "partial" | "failed";

export interface CustomerImportRecord {
  id: string;
  tenant_id: string;
  file_name: string;
  imported_at: string;
  imported_by: string | null;
  row_count: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  status: CustomerImportStatus;
}

export interface CustomerImportHistoryStore {
  history: CustomerImportRecord[];
  recordImport: (input: {
    file_name: string;
    imported_by?: string | null;
    row_count: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  }) => CustomerImportRecord;
}

const CustomerImportHistoryContext =
  createContext<CustomerImportHistoryStore | null>(null);

function deriveStatus(
  created: number,
  updated: number,
  skipped: number,
  failed: number,
): CustomerImportStatus {
  const succeeded = created + updated;
  if (succeeded === 0) return "failed";
  if (failed > 0 || skipped > 0) return "partial";
  return "completed";
}

export function CustomerImportHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [history, setHistory] = useState<CustomerImportRecord[]>([]);

  const recordImport = useCallback(
    (input: {
      file_name: string;
      imported_by?: string | null;
      row_count: number;
      created: number;
      updated: number;
      skipped: number;
      failed: number;
    }) => {
      const rec: CustomerImportRecord = {
        id: uid("cim"),
        tenant_id: TENANT_ID,
        file_name: input.file_name,
        imported_at: new Date().toISOString(),
        imported_by: input.imported_by ?? null,
        row_count: input.row_count,
        created: input.created,
        updated: input.updated,
        skipped: input.skipped,
        failed: input.failed,
        status: deriveStatus(
          input.created,
          input.updated,
          input.skipped,
          input.failed,
        ),
      };
      setHistory((prev) => [rec, ...prev]);
      return rec;
    },
    [],
  );

  const value = useMemo<CustomerImportHistoryStore>(
    () => ({ history, recordImport }),
    [history, recordImport],
  );

  return (
    <CustomerImportHistoryContext.Provider value={value}>
      {children}
    </CustomerImportHistoryContext.Provider>
  );
}

export function useCustomerImportHistory(): CustomerImportHistoryStore {
  const ctx = useContext(CustomerImportHistoryContext);
  if (!ctx)
    throw new Error(
      "useCustomerImportHistory must be used within CustomerImportHistoryProvider",
    );
  return ctx;
}
