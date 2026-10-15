// Connect Pro Fleet — Customer Tags store (Build #38 — Customers V1).
//
// Lightweight tenant-customizable tags, SEPARATE from lifecycle/standing.
// Tags are NOT authoritative eligibility states — they are operational labels
// (e.g. "Weekly Renter", "Corporate", "Referral"). Mirrors the CustomerNotes
// provider pattern: a standalone context so the main fleet store stays under
// its size ceiling. Tags never affect financial truth or compliance.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { TENANT_ID, uid } from "./store/ids";

export interface CustomerTag {
  id: string;
  tenant_id: string;
  customer_id: string;
  label: string;
  created_at: string;
}

export interface CustomerTagCatalogEntry {
  label: string;
  /** True when this label is a tenant-level catalog tag (suggested). */
  built_in: boolean;
}

const DEFAULT_TAG_CATALOG: string[] = [
  "Weekly Renter",
  "Delivery Driver",
  "Rideshare",
  "Corporate",
  "Referral",
  "Repeat Customer",
  "Cash Customer",
];

export interface CustomerTagsStore {
  tags: CustomerTag[];
  /** Distinct tag labels known to this tenant (catalog + in-use). */
  catalog: CustomerTagCatalogEntry[];
  tagsForCustomer: (customerId: string) => string[];
  addTag: (customerId: string, label: string) => void;
  removeTag: (customerId: string, label: string) => void;
  addCatalogTag: (label: string) => void;
  bulkAddTag: (customerIds: string[], label: string) => number;
  bulkRemoveTag: (customerIds: string[], label: string) => number;
}

const CustomerTagsContext = createContext<CustomerTagsStore | null>(null);

function seedTags(): CustomerTag[] {
  const now = "2026-08-20T09:00:00.000Z";
  return [
    {
      id: "tag_seed_1",
      tenant_id: TENANT_ID,
      customer_id: "cus_1",
      label: "Weekly Renter",
      created_at: now,
    },
    {
      id: "tag_seed_2",
      tenant_id: TENANT_ID,
      customer_id: "cus_8",
      label: "Corporate",
      created_at: now,
    },
    {
      id: "tag_seed_3",
      tenant_id: TENANT_ID,
      customer_id: "cus_5",
      label: "Referral",
      created_at: now,
    },
  ];
}

export function CustomerTagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<CustomerTag[]>(() => seedTags());
  const [catalogLabels, setCatalogLabels] = useState<string[]>(
    () => DEFAULT_TAG_CATALOG,
  );

  const tagsForCustomer = useCallback(
    (customerId: string) =>
      tags
        .filter((t) => t.customer_id === customerId)
        .map((t) => t.label)
        .sort((a, b) => a.localeCompare(b)),
    [tags],
  );

  const catalog = useMemo<CustomerTagCatalogEntry[]>(() => {
    const inUse = Array.from(new Set(tags.map((t) => t.label)));
    const all = Array.from(new Set([...catalogLabels, ...inUse]));
    return all
      .sort((a, b) => a.localeCompare(b))
      .map((label) => ({
        label,
        built_in: catalogLabels.includes(label),
      }));
  }, [tags, catalogLabels]);

  const addTag = useCallback((customerId: string, label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setTags((prev) => {
      const exists = prev.some(
        (t) =>
          t.customer_id === customerId &&
          t.label.toLowerCase() === clean.toLowerCase(),
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          id: uid("tag"),
          tenant_id: TENANT_ID,
          customer_id: customerId,
          label: clean,
          created_at: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const removeTag = useCallback((customerId: string, label: string) => {
    setTags((prev) =>
      prev.filter(
        (t) =>
          !(
            t.customer_id === customerId &&
            t.label.toLowerCase() === label.toLowerCase()
          ),
      ),
    );
  }, []);

  const addCatalogTag = useCallback((label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setCatalogLabels((prev) =>
      prev.some((l) => l.toLowerCase() === clean.toLowerCase())
        ? prev
        : [...prev, clean],
    );
  }, []);

  const bulkAddTag = useCallback((customerIds: string[], label: string) => {
    const clean = label.trim();
    if (!clean) return 0;
    let added = 0;
    setTags((prev) => {
      const next = [...prev];
      for (const cid of customerIds) {
        const exists = next.some(
          (t) =>
            t.customer_id === cid &&
            t.label.toLowerCase() === clean.toLowerCase(),
        );
        if (!exists) {
          next.push({
            id: uid("tag"),
            tenant_id: TENANT_ID,
            customer_id: cid,
            label: clean,
            created_at: new Date().toISOString(),
          });
          added++;
        }
      }
      return next;
    });
    return added;
  }, []);

  const bulkRemoveTag = useCallback((customerIds: string[], label: string) => {
    const clean = label.trim().toLowerCase();
    if (!clean) return 0;
    let removed = 0;
    setTags((prev) => {
      const next = prev.filter((t) => {
        if (t.label.toLowerCase() !== clean) return true;
        if (customerIds.includes(t.customer_id)) {
          removed++;
          return false;
        }
        return true;
      });
      return next;
    });
    return removed;
  }, []);

  const value = useMemo<CustomerTagsStore>(
    () => ({
      tags,
      catalog,
      tagsForCustomer,
      addTag,
      removeTag,
      addCatalogTag,
      bulkAddTag,
      bulkRemoveTag,
    }),
    [
      tags,
      catalog,
      tagsForCustomer,
      addTag,
      removeTag,
      addCatalogTag,
      bulkAddTag,
      bulkRemoveTag,
    ],
  );

  return (
    <CustomerTagsContext.Provider value={value}>
      {children}
    </CustomerTagsContext.Provider>
  );
}

export function useCustomerTags(): CustomerTagsStore {
  const ctx = useContext(CustomerTagsContext);
  if (!ctx)
    throw new Error("useCustomerTags must be used within CustomerTagsProvider");
  return ctx;
}
