// Connect Pro Fleet — Customer Notes store context (Build #27).
//
// Standalone React context for structured customer notes. Kept separate from
// the main fleet store (which is at its size ceiling). The ComplianceProvider
// pattern is mirrored: a context + provider + hook, with seed data loaded
// once. Notes are the source of truth for customer-timeline "note" events.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CustomerNote, CustomerNoteType } from "./customerNoteTypes";
import { TENANT_ID } from "./store/ids";
import { uid } from "./store/ids";

/** Seed notes — one pinned operational note + one general note. */
function seedCustomerNotes(): CustomerNote[] {
  const now = "2026-08-10T10:00:00.000Z";
  return [
    {
      id: "note_seed_1",
      tenant_id: TENANT_ID,
      customer_id: "cus_seed_1",
      text: "Prefers pickup after 4 PM.",
      type: "operational",
      pinned: true,
      created_by: null,
      created_at: now,
      updated_at: now,
      updated_by: null,
    },
    {
      id: "note_seed_2",
      tenant_id: TENANT_ID,
      customer_id: "cus_seed_1",
      text: "Long-term renter, reliable with payments.",
      type: "general",
      pinned: false,
      created_by: null,
      created_at: "2026-07-01T09:00:00.000Z",
      updated_at: "2026-07-01T09:00:00.000Z",
      updated_by: null,
    },
  ];
}

export interface CustomerNoteInput {
  text: string;
  type: CustomerNoteType;
  pinned?: boolean;
  created_by?: string | null;
}

export interface CustomerNotesStore {
  notes: CustomerNote[];
  getNotesForCustomer: (customerId: string) => CustomerNote[];
  getPinnedNotes: (customerId: string) => CustomerNote[];
  addNote: (customerId: string, input: CustomerNoteInput) => CustomerNote;
  updateNote: (
    noteId: string,
    patch: Partial<Pick<CustomerNote, "text" | "type" | "pinned">>,
    updatedBy?: string | null,
  ) => void;
  deleteNote: (noteId: string) => void;
}

const CustomerNotesContext = createContext<CustomerNotesStore | null>(null);

export function CustomerNotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<CustomerNote[]>(() => seedCustomerNotes());

  const getNotesForCustomer = useCallback(
    (customerId: string) =>
      notes
        .filter((n) => n.customer_id === customerId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [notes],
  );

  const getPinnedNotes = useCallback(
    (customerId: string) =>
      notes.filter((n) => n.customer_id === customerId && n.pinned),
    [notes],
  );

  const addNote = useCallback(
    (customerId: string, input: CustomerNoteInput): CustomerNote => {
      const now = new Date().toISOString();
      const note: CustomerNote = {
        id: uid("note"),
        tenant_id: TENANT_ID,
        customer_id: customerId,
        text: input.text,
        type: input.type,
        pinned: input.pinned ?? false,
        created_by: input.created_by ?? null,
        created_at: now,
        updated_at: now,
        updated_by: input.created_by ?? null,
      };
      setNotes((prev) => [note, ...prev]);
      return note;
    },
    [],
  );

  const updateNote = useCallback(
    (
      noteId: string,
      patch: Partial<Pick<CustomerNote, "text" | "type" | "pinned">>,
      updatedBy?: string | null,
    ) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                ...patch,
                updated_at: new Date().toISOString(),
                updated_by: updatedBy ?? n.updated_by,
              }
            : n,
        ),
      );
    },
    [],
  );

  const deleteNote = useCallback((noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, []);

  const value = useMemo<CustomerNotesStore>(
    () => ({
      notes,
      getNotesForCustomer,
      getPinnedNotes,
      addNote,
      updateNote,
      deleteNote,
    }),
    [
      notes,
      getNotesForCustomer,
      getPinnedNotes,
      addNote,
      updateNote,
      deleteNote,
    ],
  );

  return (
    <CustomerNotesContext.Provider value={value}>
      {children}
    </CustomerNotesContext.Provider>
  );
}

export function useCustomerNotes(): CustomerNotesStore {
  const ctx = useContext(CustomerNotesContext);
  if (!ctx)
    throw new Error(
      "useCustomerNotes must be used within CustomerNotesProvider",
    );
  return ctx;
}
