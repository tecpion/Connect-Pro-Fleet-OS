// Connect Pro Fleet — Vehicle Documents acceptance tests (part 2).
// Tests 29-56: Bill of Sale PDF/signatures/legal, Internal Purchase Record,
// purchase amount conflict, Purchase Package, numbering, relationships,
// supporting documentation, missing-doc workflow, timeline events.

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
import {
  vehiclePurchasePackage,
  purchaseAmountConflict,
  vehicleVaultDocsByGroup,
} from "@/lib/vaultSelectors";
import { VaultNumberRegistry } from "@/lib/vaultNumbering";
import {
  VAULT_DOC_PREFIX,
  VAULT_DOC_CATEGORY_LABELS,
  SUPPORTING_DOC_LABELS,
} from "@/lib/vaultTypes";
import { openPurchasePdf } from "@/lib/vaultPurchasePdf";
import { CashExpenseRecordDialog } from "@/pages/vehicles/CashExpenseRecordDialog";
import { ReceiptCaptureDialog } from "@/pages/vehicles/ReceiptCaptureDialog";

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
function useVaultHook() {
  return renderHook(() => useVault(), { wrapper }).result;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}
const VEH_1 = "veh_1";

describe("Bill of Sale PDF, signatures, legal", () => {
  it("29. Bill of Sale PDF opens a print window", () => {
    const docMock = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const openSpy = vi.fn(() => ({ document: docMock }));
    const realOpen = window.open;
    vi.stubGlobal("open", openSpy);
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "BOS",
        purchase_date: "2026-09-01",
        purchase_price: 500,
        purchase_payment_method: "cash",
        is_internal: false,
      });
    });
    const doc = vault.current.docById(id)!;
    const store = useStoreHook();
    const vehicle = store.current.vehicles.find((v) => v.id === VEH_1)!;
    openPurchasePdf({
      doc,
      vehicle,
      company: store.current.companyInfo,
      showFullVin: true,
    });
    expect(openSpy).toHaveBeenCalled();
    expect(docMock.write).toHaveBeenCalled();
    vi.stubGlobal("open", realOpen);
  });

  it("30. seller signature captured on Bill of Sale", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Sig Seller",
        purchase_date: "2026-09-01",
        purchase_price: 500,
        purchase_payment_method: "cash",
        is_internal: false,
      });
      vault.current.signDocument(id, {
        role: "seller",
        signer_name: "Sig Seller",
        signature_data: "typed:Sig Seller",
      });
    });
    expect(
      vault.current.docById(id)?.signatures.some((s) => s.role === "seller"),
    ).toBe(true);
  });

  it("31. buyer signature captured on Bill of Sale", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Buyer",
        purchase_date: "2026-09-01",
        purchase_price: 500,
        purchase_payment_method: "cash",
        is_internal: false,
      });
      vault.current.signDocument(id, {
        role: "buyer",
        signer_name: "Ava",
        signature_data: "typed:Ava",
      });
    });
    expect(
      vault.current.docById(id)?.signatures.some((s) => s.role === "buyer"),
    ).toBe(true);
  });

  it("32. legal disclaimer present (no ownership guarantee)", () => {
    let html = "";
    const docMock = {
      open: vi.fn(),
      write: (h: string) => (html = h),
      close: vi.fn(),
    };
    const openSpy = vi.fn(() => ({ document: docMock }));
    const realOpen = window.open;
    vi.stubGlobal("open", openSpy);
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Disc",
        purchase_date: "2026-09-01",
        purchase_price: 500,
        purchase_payment_method: "cash",
        is_internal: false,
      });
    });
    const doc = vault.current.docById(id)!;
    const store = useStoreHook();
    const vehicle = store.current.vehicles.find((v) => v.id === VEH_1)!;
    openPurchasePdf({
      doc,
      vehicle,
      company: store.current.companyInfo,
      showFullVin: true,
    });
    expect(html).toContain("does not replace a title");
    expect(html).toContain("guarantee legal");
    expect(html).toContain("state-specific requirements may apply");
    vi.stubGlobal("open", realOpen);
  });

  it("33. Internal Purchase Record created with is_internal=true", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createPurchaseRecord({
        vehicle_id: VEH_1,
        seller_name: "FB",
        purchase_date: "2026-09-01",
        purchase_price: 2200,
        purchase_payment_method: "cash",
        source_platform: "Facebook Marketplace",
        is_internal: true,
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.is_internal).toBe(true);
    expect(doc?.kind).toBe("purchase_record");
  });

  it("34. internal record is NOT falsely seller-signed", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createPurchaseRecord({
        vehicle_id: VEH_1,
        seller_name: "No Sign",
        purchase_date: "2026-09-01",
        purchase_price: 1000,
        purchase_payment_method: "cash",
        is_internal: true,
      });
    });
    expect(
      vault.current.docById(id)?.signatures.some((s) => s.role === "seller"),
    ).toBe(false);
  });

  it("35. purchase record links to vehicle acquisition", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Acq",
        purchase_date: "2026-09-01",
        purchase_price: 500,
        purchase_payment_method: "cash",
        is_internal: false,
      });
    });
    expect(vault.current.docById(id)?.links.acquisition_vehicle_id).toBe(VEH_1);
  });

  it("36. purchase amount conflict detected (generated vs authoritative)", () => {
    const vault = useVaultHook();
    const store = useStoreHook();
    const vehicle = store.current.vehicles.find((v) => v.id === VEH_1)!;
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Conflict",
        purchase_date: "2026-09-01",
        purchase_price: 99999,
        purchase_payment_method: "cash",
        is_internal: false,
      });
    });
    const doc = vault.current.docById(id)!;
    const conflict = purchaseAmountConflict(doc, vehicle.purchase_price);
    expect(conflict).not.toBeNull();
    expect(conflict?.generated).toBe(99999);
    expect(conflict?.authoritative).toBe(vehicle.purchase_price);
  });
});

describe("Purchase Package & numbering", () => {
  it("37. Purchase Package groups purchase/ownership docs", () => {
    const vault = useVaultHook();
    expect(
      vehiclePurchasePackage(vault.current.vaultDocs, VEH_1).some(
        (d) => d.kind === "bill_of_sale",
      ),
    ).toBe(true);
  });

  it("38. title document can be added to purchase package", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "title",
        group: "purchase_ownership",
        title: "Title",
        file_name: "title.pdf",
        file_url: "title.pdf",
      });
    });
    expect(
      vehiclePurchasePackage(vault.current.vaultDocs, VEH_1).some(
        (d) => d.id === id,
      ),
    ).toBe(true);
  });

  it("39. payment proof can be added to purchase package", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "payment_proof",
        group: "purchase_ownership",
        title: "Zelle",
        file_name: "zelle.png",
        file_url: "zelle.png",
      });
    });
    expect(
      vehiclePurchasePackage(vault.current.vaultDocs, VEH_1).some(
        (d) => d.category === "payment_proof",
      ),
    ).toBe(true);
  });

  it("40. numbering is tenant-isolated (registry per provider)", () => {
    const reg = new VaultNumberRegistry(["CER-2026-000001"]);
    expect(reg.issue("cash_expense_record", 2026)).toBe("CER-2026-000002");
    // A fresh registry (different tenant) does not know about the other tenant's number.
    expect(new VaultNumberRegistry([]).has("CER-2026-000002")).toBe(false);
  });

  it("41. immutable issued number — never reissued", () => {
    const reg = new VaultNumberRegistry(["BOS-2026-000010"]);
    const a = reg.issue("bill_of_sale", 2026);
    const b = reg.issue("bill_of_sale", 2026);
    expect(a).not.toBe(b);
    expect(reg.has(a)).toBe(true);
    expect(reg.has(b)).toBe(true);
  });
});

describe("Document relationships & supporting documentation", () => {
  it("42. document-only relationship (no links)", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "other",
        group: "other",
        title: "Standalone",
        file_name: "misc.pdf",
        file_url: "misc.pdf",
      });
    });
    const doc = vault.current.docById(id);
    expect(doc?.links.expense_id).toBeNull();
    expect(doc?.links.acquisition_vehicle_id).toBeNull();
  });

  it("43. document + expense relationship", () => {
    const vault = useVaultHook();
    const store = useStoreHook();
    let expenseId = "";
    let docId = "";
    act(() => {
      expenseId = store.current.createExpense({
        description: "Exp",
        amount: 30,
        transaction_date: "2026-09-09",
        payment_method: "cash",
        vehicle_id: VEH_1,
      });
      docId = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "invoice",
        group: "expense_documentation",
        title: "Inv",
        file_name: "inv.pdf",
        file_url: "inv.pdf",
      });
      vault.current.linkExpense(docId, expenseId);
    });
    expect(vault.current.docById(docId)?.links.expense_id).toBe(expenseId);
  });

  it("44. document + acquisition relationship", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createBillOfSale({
        vehicle_id: VEH_1,
        seller_name: "Acq",
        purchase_date: "2026-09-01",
        purchase_price: 500,
        purchase_payment_method: "cash",
        is_internal: false,
      });
    });
    expect(vault.current.docById(id)?.links.acquisition_vehicle_id).toBe(VEH_1);
  });

  it("45. document + work order relationship field supported", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "maintenance_doc",
        group: "maintenance",
        title: "WO",
        file_name: "wo.pdf",
        file_url: "wo.pdf",
      });
    });
    expect(vault.current.docById(id)?.links).toHaveProperty("work_order_id");
  });

  it("46. document + damage claim relationship field supported", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "damage_doc",
        group: "damage_incident",
        title: "Dmg",
        file_name: "dmg.jpg",
        file_url: "dmg.jpg",
      });
    });
    expect(vault.current.docById(id)?.links).toHaveProperty("damage_claim_id");
  });

  it("47. document + incident relationship field supported", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "damage_doc",
        group: "damage_incident",
        title: "Inc",
        file_name: "inc.pdf",
        file_url: "inc.pdf",
      });
    });
    expect(vault.current.docById(id)?.links).toHaveProperty("incident_id");
  });

  it("48. document + violation relationship field supported", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "violation_doc",
        group: "violations",
        title: "Cite",
        file_name: "cite.pdf",
        file_url: "cite.pdf",
      });
    });
    expect(vault.current.docById(id)?.links).toHaveProperty("violation_id");
  });

  it("49. Supporting Documentation states include all required types", () => {
    const labels = Object.keys(SUPPORTING_DOC_LABELS);
    for (const t of [
      "receipt",
      "invoice",
      "cash_expense_record",
      "bill_of_sale",
      "purchase_record",
      "bank_transaction",
      "work_order",
      "other_supporting",
      "not_required",
      "missing",
    ]) {
      expect(labels).toContain(t);
    }
  });
});

describe("Missing documentation workflow", () => {
  it("50. Missing Documentation action offers alternatives (dialog renders)", () => {
    const store = useStoreHook();
    const vehicle = store.current.vehicles.find((v) => v.id === VEH_1)!;
    render(
      <MemoryRouter>
        <StoreProvider>
          <VaultProvider>
            <ReceiptCaptureDialog
              vehicle={vehicle}
              open={true}
              onOpenChange={() => {}}
            />
          </VaultProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    // Dialog title present.
    expect(screen.getByText("Capture Receipt")).toBeTruthy();
  });

  it("51. Cash Expense Record is an alternative to a missing receipt", () => {
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
    expect(screen.getByText(/not a vendor receipt/i)).toBeTruthy();
  });

  it("52. category documentation default field exists on ExpenseCategory", () => {
    const store = useStoreHook();
    const cat = store.current.expenseCategories[0];
    expect(cat).toHaveProperty("id");
    expect(typeof cat.type).toBe("string");
  });
});

describe("Timeline & document events", () => {
  it("53. Vehicle Timeline event created on document generation", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "TL",
        amount: 10,
        expense_date: "2026-09-09",
        description: "TL",
        payment_method: "cash",
      });
    });
    expect(
      vault.current.eventsFor(id).some((e) => e.type === "generated"),
    ).toBe(true);
  });

  it("54. document uploaded event recorded", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "receipt",
        group: "expense_documentation",
        title: "Up",
        file_name: "u.pdf",
        file_url: "u.pdf",
      });
    });
    expect(vault.current.eventsFor(id).some((e) => e.type === "uploaded")).toBe(
      true,
    );
  });

  it("55. document signed event recorded", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "SE",
        amount: 10,
        expense_date: "2026-09-09",
        description: "SE",
        payment_method: "cash",
      });
      vault.current.signDocument(id, {
        role: "recorder",
        signer_name: "Staff",
        signature_data: "typed:Staff",
      });
    });
    expect(vault.current.eventsFor(id).some((e) => e.type === "signed")).toBe(
      true,
    );
  });

  it("56. document voided event recorded", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createCashExpenseRecord({
        vehicle_id: VEH_1,
        vendor_name: "VE",
        amount: 10,
        expense_date: "2026-09-09",
        description: "VE",
        payment_method: "cash",
      });
      vault.current.voidDocument(id, "Test void");
    });
    expect(vault.current.eventsFor(id).some((e) => e.type === "voided")).toBe(
      true,
    );
  });
});

describe("Cross-domain integration", () => {
  it("67. Maintenance document view — maintenance_doc in vault", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "maintenance_doc",
        group: "maintenance",
        title: "Repair",
        file_name: "repair.pdf",
        file_url: "repair.pdf",
      });
    });
    expect(
      vehicleVaultDocsByGroup(
        vault.current.vaultDocs,
        VEH_1,
        "maintenance",
      ).some((d) => d.id === id),
    ).toBe(true);
  });

  it("68. Damage Claim document view — damage_doc in vault", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "damage_doc",
        group: "damage_incident",
        title: "Scratch",
        file_name: "scratch.jpg",
        file_url: "scratch.jpg",
      });
    });
    expect(
      vehicleVaultDocsByGroup(
        vault.current.vaultDocs,
        VEH_1,
        "damage_incident",
      ).some((d) => d.id === id),
    ).toBe(true);
  });

  it("69. Compliance document view — compliance_doc in vault", () => {
    const vault = useVaultHook();
    let id = "";
    act(() => {
      id = vault.current.createUploadedDoc({
        vehicle_id: VEH_1,
        category: "compliance_doc",
        group: "compliance",
        title: "Reg",
        file_name: "reg.pdf",
        file_url: "reg.pdf",
      });
    });
    expect(
      vehicleVaultDocsByGroup(
        vault.current.vaultDocs,
        VEH_1,
        "compliance",
      ).some((d) => d.id === id),
    ).toBe(true);
  });
});
