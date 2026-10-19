// Phase 5 E2E — shared runtime state + step/requireOk/errorDetail helpers.
// Mirrors the Phase 4 split: a thin context flows from the orchestrator into
// each focused step module so the runner stays focused.
//
// Test-harness only — no product/domain logic changed. The orchestrator
// (phase5-e2e.server.ts) constructs the runtime via provisionAndSetup();
// step modules consume it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { phase5Fixtures } from "./phase5-e2e-fixtures";
import type { Phase4Context } from "./phase4-e2e-builders";
import {
  SupabaseExpenseRepository,
  SupabaseBankingRepository,
  SupabaseInvestorRepository,
} from "@/lib/supabase/phase5Adapters";
import {
  SupabaseLedgerRepository,
  SupabaseDepositRepository,
  SupabaseVehicleRepository,
  SupabaseRentalRepository,
} from "@/lib/supabase/repositoryAdapters";
import type { Phase5Step } from "./phase5-e2e.server";

export type Phase5Client = Pick<SupabaseClient, "from" | "auth" | "storage">;
export type Phase5Fixtures = ReturnType<typeof phase5Fixtures>;

export interface Phase5Runtime {
  a: Phase5Client;
  b: Phase5Client;
  admin: Phase5Client;
  orgA: string;
  orgB: string;
  userAId: string;
  userBId: string;
  emailA: string;
  password: string;
  stamp: string;
  ctx: Phase4Context;
  fixtures: Phase5Fixtures;
  claimId: string;
  recordIds: Record<string, string>;
  documents: { bucket: string; path: string }[];
  users: string[];
  orgs: string[];
  expenses: SupabaseExpenseRepository;
  banking: SupabaseBankingRepository;
  investor: SupabaseInvestorRepository;
  ledger: SupabaseLedgerRepository;
  deposits: SupabaseDepositRepository;
  vehicles: SupabaseVehicleRepository;
  rentals: SupabaseRentalRepository;
}

// step() — identical semantics to the single-file version: runs a check,
// captures ok/detail, and never throws (requireOk() halts prerequisite
// chains after a required step fails).
export async function step(
  steps: Phase5Step[],
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
