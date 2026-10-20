// Phase 7 E2E — shared runtime state + step/requireOk/errorDetail helpers.
// Mirrors the Phase 5 split: a thin context flows from the orchestrator
// (phase7-e2e.server.ts) into each focused step module so the runner stays
// readable. Test-harness only — no product/domain logic changed.
//
// Service role is confined to provisioning and teardown. Every assertion uses
// signed-in publishable-key clients (the Phase5Runtime `a`/`b`), including the
// forged-org isolation probes. The maintenance/booking/inspection repositories
// held on this runtime are the authenticated Org A adapters.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Phase4Context } from "./phase4-e2e-builders";
import type { FinancialTransaction } from "@/lib/chargeTypes";
import type { RentalDeposit, DepositHistoryEvent } from "@/lib/depositTypes";
import type { BookingRequest } from "@/lib/bookingRequestTypes";
import type { Inspection } from "@/lib/inspectionTypes";
import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
} from "@/lib/maintenanceTypes";
import {
  SupabaseRentalRepository,
  SupabaseLedgerRepository,
  SupabaseDepositRepository,
  SupabaseBookingRequestRepository,
  SupabaseInspectionRepository,
} from "@/lib/supabase/repositoryAdapters";
import { SupabaseMaintenanceRepository } from "@/lib/supabase/maintenanceAdapters";
import type { Phase7Step } from "./phase7-e2e.server";

export type Phase7Client = Pick<
  SupabaseClient,
  "from" | "auth" | "storage" | "rpc"
>;

/** Phase 7 domain fixtures created through the real repository path. */
export interface Phase7Fixtures {
  charge: FinancialTransaction;
  payment: FinancialTransaction;
  deposit: RentalDeposit;
  depositHistory: DepositHistoryEvent;
  booking: BookingRequest;
  inspection: Inspection;
  workOrder: MaintenanceWorkOrder;
  workOrderEvent: MaintenanceWorkOrderEvent;
  vendor: MaintenanceVendor;
  receipt: MaintenanceReceipt;
}

export interface Phase7Runtime {
  a: Phase7Client;
  b: Phase7Client;
  admin: Phase7Client;
  orgA: string;
  orgB: string;
  userAId: string;
  userBId: string;
  emailA: string;
  password: string;
  stamp: string;
  ctx: Phase4Context;
  now: string; // ISO timestamp
  date: string; // YYYY-MM-DD slice
  rentals: SupabaseRentalRepository;
  ledger: SupabaseLedgerRepository;
  deposits: SupabaseDepositRepository;
  bookingRequests: SupabaseBookingRequestRepository;
  inspections: SupabaseInspectionRepository;
  maintenance: SupabaseMaintenanceRepository;
  recordIds: Record<string, string>;
  phase7: Phase7Fixtures;
  users: string[];
  orgs: string[];
}

// step() — runs a check, captures ok/detail, and never throws (requireOk()
// halts prerequisite chains after a required step fails).
export async function step(
  steps: Phase7Step[],
  name: string,
  check: () => Promise<boolean> | boolean,
): Promise<boolean> {
  try {
    const ok = await check();
    steps.push({ step: name, ok, detail: ok ? undefined : "Assertion failed" });
    return ok;
  } catch (error) {
    steps.push({ step: name, ok: false, detail: errorDetail(error) });
    return false;
  }
}

export function requireOk(ok: boolean): void {
  if (!ok)
    throw new Error("Required fixture failed; dependent assertions cannot run");
}

export function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  )
    return (error as { message: string }).message;
  return String(error);
}
