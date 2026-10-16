// Connect Pro Fleet — Build #19 cleanup: vehicle + customer import tests.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { MigrationProvider, useMigration } from "@/lib/migrationStore";
import { InvestorProvider } from "@/lib/investorStore";
import type { ReactNode } from "react";
import { canRollbackVehicle, canRollbackCustomer } from "@/lib/migrationCommit";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <InvestorProvider>
        <MigrationProvider>{children}</MigrationProvider>
      </InvestorProvider>
    </StoreProvider>
  );
}
function useHooks() {
  return renderHook(() => ({ store: useStore(), mig: useMigration() }), {
    wrapper,
  }).result;
}

describe("migration: vehicle import", () => {
  it("creates a vehicle via the store with class + ownership mapping", () => {
    const r = useHooks();
    const before = r.current.store.vehicles.length;
    let res;
    act(() => {
      res = r.current.mig.importVehicle(
        {
          unit_number: "U-999",
          vin: "VINTEST999",
          year: 2021,
          make: "Honda",
          model: "Accord",
          license_plate: "FL-TEST9",
          class_name: "Midsize",
          daily_rate: 50,
          weekly_rate: 350,
          status: "available",
          location: null,
          mileage: 1000,
          ownership_type: "company_owned",
          owner_investor_id: null,
          external_id: "EXT-V-999",
          notes: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(true);
    expect(res!.action).toBe("created");
    expect(r.current.store.vehicles.length).toBe(before + 1);
    const v = r.current.store.vehicles.find((x) => x.vin === "VINTEST999");
    expect(v!.vehicle_class_id).toBe("cls_midsize");
    expect(v!.ownership_type).toBe("company_owned");
  });

  it("detects a VIN duplicate and skips", () => {
    const r = useHooks();
    let res;
    act(() => {
      res = r.current.mig.importVehicle(
        {
          unit_number: null,
          vin: "1C4RJFBG0MC872341",
          year: 2022,
          make: "Jeep",
          model: "Wrangler",
          license_plate: null,
          class_name: null,
          daily_rate: null,
          weekly_rate: null,
          status: null,
          location: null,
          mileage: null,
          ownership_type: null,
          owner_investor_id: null,
          external_id: null,
          notes: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.action).toBe("skipped");
  });

  it("links to an existing vehicle when mode is link", () => {
    const r = useHooks();
    let res;
    act(() => {
      res = r.current.mig.importVehicle(
        {
          unit_number: null,
          vin: "1C4RJFBG0MC872341",
          year: 2022,
          make: "Jeep",
          model: "Wrangler",
          license_plate: null,
          class_name: null,
          daily_rate: null,
          weekly_rate: null,
          status: null,
          location: null,
          mileage: null,
          ownership_type: null,
          owner_investor_id: null,
          external_id: "EXT-LINK-1",
          notes: null,
        },
        "link",
      );
    });
    expect(res!.ok).toBe(true);
    expect(res!.action).toBe("linked");
  });

  it("is idempotent — re-importing the same external id is blocked", () => {
    const r = useHooks();
    act(() => {
      r.current.mig.importVehicle(
        {
          unit_number: "U-IDEM",
          vin: "VINIDEM1",
          year: 2021,
          make: "Toyota",
          model: "Camry",
          license_plate: null,
          class_name: null,
          daily_rate: null,
          weekly_rate: null,
          status: null,
          location: null,
          mileage: null,
          ownership_type: null,
          owner_investor_id: null,
          external_id: "EXT-IDEM-1",
          notes: null,
        },
        "skip",
      );
    });
    const before = r.current.store.vehicles.length;
    let res;
    act(() => {
      res = r.current.mig.importVehicle(
        {
          unit_number: "U-IDEM2",
          vin: "VINIDEM2",
          year: 2021,
          make: "Toyota",
          model: "Corolla",
          license_plate: null,
          class_name: null,
          daily_rate: null,
          weekly_rate: null,
          status: null,
          location: null,
          mileage: null,
          ownership_type: null,
          owner_investor_id: null,
          external_id: "EXT-IDEM-1",
          notes: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(r.current.store.vehicles.length).toBe(before);
  });

  it("blocks external ownership without a resolved owner", () => {
    const r = useHooks();
    let res;
    act(() => {
      res = r.current.mig.importVehicle(
        {
          unit_number: "U-NOOWNER",
          vin: "VINNOOWNER",
          year: 2021,
          make: "Ford",
          model: "F-150",
          license_plate: null,
          class_name: null,
          daily_rate: null,
          weekly_rate: null,
          status: null,
          location: null,
          mileage: null,
          ownership_type: "external_owner",
          owner_investor_id: null,
          external_id: "EXT-NOOWNER",
          notes: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("owner");
  });
});

describe("migration: customer import", () => {
  it("creates a customer via the store", () => {
    const r = useHooks();
    const before = r.current.store.customers.length;
    let res;
    act(() => {
      res = r.current.mig.importCustomer(
        {
          first_name: "Test",
          last_name: "Customer",
          phone: "555-9999",
          email: "testcust@example.com",
          drivers_license: "DL-TEST9",
          license_expiry: null,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: "EXT-C-999",
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(true);
    expect(res!.action).toBe("created");
    expect(r.current.store.customers.length).toBe(before + 1);
  });

  it("detects a phone duplicate and skips", () => {
    const r = useHooks();
    const existingPhone = r.current.store.customers[0].phone;
    let res;
    act(() => {
      res = r.current.mig.importCustomer(
        {
          first_name: "Dup",
          last_name: "Phone",
          phone: existingPhone,
          email: "newphone@example.com",
          drivers_license: null,
          license_expiry: null,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.action).toBe("skipped");
  });

  it("detects an email duplicate and skips", () => {
    const r = useHooks();
    const existingEmail = r.current.store.customers[0].email;
    let res;
    act(() => {
      res = r.current.mig.importCustomer(
        {
          first_name: "Dup",
          last_name: "Email",
          phone: "555-0000",
          email: existingEmail,
          drivers_license: null,
          license_expiry: null,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.action).toBe("skipped");
  });

  it("links to an existing customer when mode is link", () => {
    const r = useHooks();
    const existing = r.current.store.customers[0];
    let res;
    act(() => {
      res = r.current.mig.importCustomer(
        {
          first_name: existing.first_name,
          last_name: existing.last_name,
          phone: existing.phone,
          email: "link@example.com",
          drivers_license: null,
          license_expiry: null,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: "EXT-LINKC",
        },
        "link",
      );
    });
    expect(res!.ok).toBe(true);
    expect(res!.action).toBe("linked");
    expect(res!.customer_id).toBe(existing.id);
  });

  it("is idempotent — re-importing the same external id is blocked", () => {
    const r = useHooks();
    act(() => {
      r.current.mig.importCustomer(
        {
          first_name: "Idem",
          last_name: "Cust",
          phone: "555-IDEM",
          email: "idem@example.com",
          drivers_license: null,
          license_expiry: null,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: "EXT-C-IDEM",
        },
        "skip",
      );
    });
    const before = r.current.store.customers.length;
    let res;
    act(() => {
      res = r.current.mig.importCustomer(
        {
          first_name: "Other",
          last_name: "Name",
          phone: "555-OTHER",
          email: "other@example.com",
          drivers_license: null,
          license_expiry: null,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: "EXT-C-IDEM",
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(r.current.store.customers.length).toBe(before);
  });
});

describe("migration: rollback safety checks", () => {
  it("blocks vehicle rollback when it has a rental", () => {
    const r = useHooks();
    expect(canRollbackVehicle(r.current.store, "veh_1")).toBe(false);
  });
  it("allows vehicle rollback when it has no activity", () => {
    const r = useHooks();
    let newVehId = "";
    act(() => {
      const res = r.current.mig.importVehicle(
        {
          unit_number: "U-RB",
          vin: "VINROLLBACK",
          year: 2021,
          make: "Mazda",
          model: "CX-5",
          license_plate: null,
          class_name: null,
          daily_rate: null,
          weekly_rate: null,
          status: "available",
          location: null,
          mileage: null,
          ownership_type: null,
          owner_investor_id: null,
          external_id: "EXT-RB",
          notes: null,
        },
        "skip",
      );
      newVehId = res.vehicle_id ?? "";
    });
    expect(canRollbackVehicle(r.current.store, newVehId)).toBe(true);
  });
  it("blocks customer rollback when it has a transaction", () => {
    const r = useHooks();
    expect(canRollbackCustomer(r.current.store, "cus_3")).toBe(false);
  });
});
