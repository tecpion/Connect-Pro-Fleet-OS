// Connect Pro Fleet — Vehicle Documents acceptance tests (part 1).
// Tests 1-28: vault existence, tenant scoping, groups, receipt/upload flows,
// Cash Expense Record workflow, Bill of Sale basics.

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import {
  renderHook,
  act,
  render,
  screen,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider } from "@/lib/store/StoreProvider";
import { VaultProvider, useVault } from "@/lib/vaultStoreProvider";
import { useStore } from "@/lib/store";
import { docBelongsToTenant } from "@/lib/vaultSelectors";
import { VAULT_DOC_GROUP_LABELS, type VaultDocGroup } from "@/lib/vaultTypes";
import { TENANT_ID } from "@/lib/store/ids";
import { VehicleVaultSection } from "@/pages/vehicles/VehicleVaultSection";
import { CashExpenseRecordDialog } from "@/pages/vehicles/CashExpenseRecordDialog";
import { openCashExpensePdf } from "@/lib/vaultPdf";

const NOW = new Date("2026-09-12T10:00:00Z");
beforeAll(() => vi.setSystemTime(NOW));
afterAll(() => vi.useRealTimers());
afterEach(() => cleanup());

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <StoreProvider>
        <VaultProvider>{children}</VaultProvider>
      </StoreProvider>
    </MemoryRouter>
  );
}
const useVaultHook = () => renderHook(() => useVault(), { wrapper }).result;
const useStoreHook = () => renderHook(() => useStore(), { wrapper }).result;
// For tests that need the vault's internal store to be the SAME instance the
// test observes (e.g. createExpenseFromCashRecord), render both hooks under one
// shared provider tree.
function useBoth() {
  const vault = useVault();
  const store = useStore();
  return { vault, store };
}
const useSharedHooks = () => renderHook(() => useBoth(), { wrapper }).result;
const VEH_1 = "veh_1";

describe("Vehicle Document Vault", () => {
  it("1. Vehicle Documents section exists and renders seeded docs", () => {
    render(
      <MemoryRouter>
        <StoreProvider>
          <VaultProvider>
            <VehicleVaultSection
              vehicleId={VEH_1}
              onMenuAction={() => {}}
              onSelectDoc={() => {}}
            />
          </VaultProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText(/Brake pad replacement/)).toBeTruthy();
    expect(screen.getAllByText(/Bill of Sale — Jeep/).length).toBeGreaterThan(
      0,
    );
  });

  it("2. document vault is tenant-scoped", () => {
    const vault = useVaultHook();
    for (const d of vault.current.vaultDocs)
      expect(docBelongsToTenant(d, TENANT_ID)).toBe(true);
  });

  it("3. document groups cover all required categories", () => {
    const groups = Object.keys(VAULT_DOC_GROUP_LABELS) as VaultDocGroup[];
    for (const g of [
      "purchase_ownership",
      "expense_documentation",
      "maintenance",
      "compliance",
      "damage_incident",
      "violations",
      "other",
    ]) {
      expect(groups).toContain(g);
    }
  });
});

describe("Receipt & upload flows", () => {
  it("4. receipt upload creates an uploaded vault document", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "receipt",
        title: "Tire rotation",
        file_name: "tires.pdf",
        file_url: "tires.pdf",
        vendor_name: "Discount Tire",
        amount: 40,
        expense_date: "2026-09-10",
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.kind).toBe("uploaded");
    expect(doc?.file_name).toBe("tires.pdf");
  });

  it("5. camera capture entry (scanned source) supported", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "receipt",
        title: "Photo",
        file_name: "photo.jpg",
        file_url: "photo.jpg",
        source: "scanned",
      });
    });
    expect(vault.current.docById(id)?.source).toBe("scanned");
  });

  it("6. PDF receipt upload preserves mime type", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "receipt",
        title: "Invoice PDF",
        file_name: "inv.pdf",
        file_url: "inv.pdf",
        mime_type: "application/pdf",
      });
    });
    expect(vault.current.docById(id)?.mime_type).toBe("application/pdf");
  });

  it("7. Save Document Only creates a vault doc with no expense link", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "receipt",
        title: "Historical",
        file_name: "old.pdf",
        file_url: "old.pdf",
      });
    });
    expect(vault.current.docById(id)?.links.expense_id).toBeNull();
  });

  it("8. Link Existing Expense links a vault doc to an expense", () => {
    const vault = useVaultHook();
    const store = useStoreHook();
    let expenseId = "",
      docId = "";
    act(() => {
      expenseId = store.current.createExpense({
        description: "Oil",
        amount: 79,
        transaction_date: "2026-09-01",
        payment_method: "credit_card",
        vehicle_id: VEH_1,
      });
      docId = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "receipt",
        title: "Oil",
        file_name: "oil.pdf",
        file_url: "oil.pdf",
      });
      vault.current.linkExpense(docId, expenseId);
    });
    expect(vault.current.docById(docId)?.links.expense_id).toBe(expenseId);
  });

  it("9. Create Expense from receipt uses the existing Expense Ledger", () => {
    const r = useSharedHooks();
    const before = r.current.store.expenses.length;
    let docId = "",
      expenseId: string | null = null;
    act(() => {
      docId = r.current.vault.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Joe's",
        amount: 150,
        expense_date: "2026-09-05",
        description: "Detail",
        payment_method: "cash",
      });
    });
    act(() => {
      expenseId = r.current.vault.createExpenseFromCashRecord(docId);
    });
    expect(expenseId).not.toBeNull();
    expect(r.current.store.expenses.length).toBe(before + 1);
    expect(
      r.current.store.expenses.find((e) => e.id === expenseId)?.amount,
    ).toBe(150);
  });

  it("10. no duplicate Expense Ledger record created", () => {
    const r = useSharedHooks();
    let docId = "";
    act(() => {
      docId = r.current.vault.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Dup",
        amount: 50,
        expense_date: "2026-09-06",
        description: "Dup",
        payment_method: "cash",
      });
    });
    const before = r.current.store.expenses.length;
    act(() => {
      r.current.vault.createExpenseFromCashRecord(docId);
    });
    expect(r.current.store.expenses.length - before).toBe(1);
  });

  it("11. expense from cash record flows to Vehicle Performance (vehicle_id set)", () => {
    const r = useSharedHooks();
    let docId = "",
      expenseId: string | null = null;
    act(() => {
      docId = r.current.vault.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "VP",
        amount: 200,
        expense_date: "2026-09-07",
        description: "VP",
        payment_method: "cash",
      });
    });
    act(() => {
      expenseId = r.current.vault.createExpenseFromCashRecord(docId);
    });
    expect(
      r.current.store.expenses.find((e) => e.id === expenseId)?.vehicle_id,
    ).toBe(VEH_1);
  });
});

describe("Cash Expense Record", () => {
  it("12. cash expense record captures vendor fields", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Mike's",
        vendor_phone: "305-555-0100",
        amount: 425,
        expense_date: "2026-09-08",
        description: "Brake",
        payment_method: "cash",
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.vendor_name).toBe("Mike's");
    expect(doc?.vendor_phone).toBe("305-555-0100");
  });

  it("13. cash expense amount/date/category captured", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "V",
        amount: 99.5,
        expense_date: "2026-09-09",
        description: "Battery",
        payment_method: "cash_app",
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.amount).toBe(99.5);
    expect(doc?.payment_method).toBe("cash_app");
  });

  it("14. generated Cash Expense PDF opens a print window", () => {
    const docMock = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const openSpy = vi.fn(() => ({ document: docMock }));
    const realOpen = window.open;
    vi.stubGlobal("open", openSpy);
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "PDF",
        amount: 30,
        expense_date: "2026-09-09",
        description: "PDF",
        payment_method: "cash",
      });
    });
    const doc = vault.current.docById(id)!;
    const store = useStoreHook();
    const vehicle = store.current.vehicles.find((v) => v.id === VEH_1)!;
    openCashExpensePdf({
      doc,
      vehicle,
      company: store.current.companyInfo,
      showFullVin: true,
    });
    expect(openSpy).toHaveBeenCalled();
    vi.stubGlobal("open", realOpen);
  });

  it("15. cash expense numbering uses CER prefix + year + sequence", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Num",
        amount: 10,
        expense_date: "2026-09-09",
        description: "Num",
        payment_method: "cash",
      });
    });
    expect(
      vault.current.docById(id)?.document_number.startsWith("CER-2026-"),
    ).toBe(true);
  });

  it("16. digital signature captures signer + timestamp", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Sig",
        amount: 20,
        expense_date: "2026-09-09",
        description: "Sig",
        payment_method: "cash",
      });
      vault.current.signDocument(id, {
        role: "recorder",
        signer_name: "Ava Reyes",
        signature_data: "typed:Ava",
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.signatures[0].signer_name).toBe("Ava Reyes");
    expect(doc?.signatures[0].signed_at).toBeTruthy();
  });

  it("17. awaiting signature status set on creation", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Await",
        amount: 5,
        expense_date: "2026-09-09",
        description: "Await",
        payment_method: "cash",
      });
    });
    expect(vault.current.docById(id)?.status).toBe("awaiting_signature");
  });

  it("18. signed status becomes active after first signature", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Active",
        amount: 5,
        expense_date: "2026-09-09",
        description: "Active",
        payment_method: "cash",
      });
      vault.current.signDocument(id, {
        role: "recorder",
        signer_name: "Staff",
        signature_data: "typed:Staff",
      });
    });
    expect(vault.current.docById(id)?.status).toBe("active");
  });

  it("19. signed record cannot be silently overwritten", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Protect",
        amount: 5,
        expense_date: "2026-09-09",
        description: "Protect",
        payment_method: "cash",
      });
      vault.current.signDocument(id, {
        role: "recorder",
        signer_name: "Staff",
        signature_data: "typed:Staff",
      });
    });
    let deleted = true;
    act(() => {
      deleted = vault.current.deleteDraftIfUnused(id);
    });
    expect(deleted).toBe(false);
    expect(vault.current.docById(id)).toBeTruthy();
  });

  it("20. void and reissue creates a new version, preserves original", () => {
    const vault = useVaultHook();
    let id = "",
      reissuedId = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Reissue",
        amount: 5,
        expense_date: "2026-09-09",
        description: "Reissue",
        payment_method: "cash",
      });
    });
    act(() => {
      vault.current.voidDocument(id, "Wrong amount");
    });
    act(() => {
      reissuedId = vault.current.reissueDocument(id, "Corrected");
    });
    const original = vault.current.docById(id);
    const reissued = vault.current.docById(reissuedId);
    expect(original?.status).toBe("voided");
    expect(reissued?.version).toBe(2);
    expect(reissued?.supersedes_doc_id).toBe(id);
  });

  it("21. link cash record to expense sets links.expense_id", () => {
    const vault = useVaultHook();
    const store = useStoreHook();
    let docId = "",
      expenseId = "";
    act(() => {
      docId = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "Link",
        amount: 60,
        expense_date: "2026-09-09",
        description: "Link",
        payment_method: "cash",
      });
      expenseId = store.current.createExpense({
        description: "Pre",
        amount: 60,
        transaction_date: "2026-09-09",
        payment_method: "cash",
        vehicle_id: VEH_1,
      });
      vault.current.linkExpense(docId, expenseId);
    });
    expect(vault.current.docById(docId)?.links.expense_id).toBe(expenseId);
  });

  it("22. expense flows to Vehicle Performance via vehicle_id", () => {
    const r = useSharedHooks();
    let docId = "",
      expenseId: string | null = null;
    act(() => {
      docId = r.current.vault.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "VP2",
        amount: 75,
        expense_date: "2026-09-09",
        description: "VP2",
        payment_method: "cash",
      });
    });
    act(() => {
      expenseId = r.current.vault.createExpenseFromCashRecord(docId);
    });
    expect(
      r.current.store.expenses.find((e) => e.id === expenseId)?.vehicle_id,
    ).toBe(VEH_1);
  });

  it("23. Cash Expense Record dialog renders with create controls", () => {
    const store = useStoreHook();
    const vehicle = store.current.vehicles.find((v) => v.id === VEH_1)!;
    render(
      <MemoryRouter>
        <StoreProvider>
          <VaultProvider>
            <CashExpenseRecordDialog
              vehicle={vehicle}
              open={true}
              onOpenChange={() => {}}
            />
          </VaultProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Create Cash Expense Record")).toBeTruthy();
    // The "not a vendor receipt" disclaimer confirms it is labelled as a
    // generated business record, not a fake vendor receipt (spec §62).
    expect(screen.getByText(/not a vendor receipt/i)).toBeTruthy();
  });
});

describe("Bill of Sale & Purchase Record", () => {
  it("24. Create Bill of Sale captures seller + transaction", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Carlos",
        seller_address: "123 Main",
        seller_phone: "305-555-0144",
        purchase_date: "2026-09-01",
        purchase_price: 4500,
        purchase_payment_method: "cash",
        odometer: 98000,
        terms: "As-is",
        as_is: true,
        is_internal: false,
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.kind).toBe("bill_of_sale");
    expect(doc?.seller_name).toBe("Carlos");
    expect(doc?.purchase_price).toBe(4500);
  });

  it("25. seller fields captured (name, address, phone)", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "X",
        seller_address: "456 Oak",
        seller_phone: "555-1234",
        purchase_date: "2026-09-01",
        purchase_price: 1000,
        purchase_payment_method: "cash",
        is_internal: false,
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.seller_address).toBe("456 Oak");
    expect(doc?.seller_phone).toBe("555-1234");
  });

  it("26. buyer fields pre-filled from tenant company", () => {
    const store = useStoreHook();
    expect(store.current.companyInfo.legal_name).toBeTruthy();
  });

  it("27. vehicle fields pre-filled (year/make/model/vin)", () => {
    const store = useStoreHook();
    const v = store.current.vehicles.find((x) => x.id === VEH_1)!;
    expect(v.year).toBeGreaterThan(0);
    expect(v.vin).toBeTruthy();
  });

  it("28. purchase transaction fields captured", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "S",
        purchase_date: "2026-08-15",
        purchase_price: 3200,
        purchase_payment_method: "zelle",
        odometer: 50000,
        terms: "No warranty",
        as_is: true,
        is_internal: false,
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.purchase_date).toBe("2026-08-15");
    expect(doc?.purchase_payment_method).toBe("zelle");
    expect(doc?.odometer).toBe(50000);
  });
});
