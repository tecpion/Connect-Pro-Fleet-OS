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

/**
 * Non-secret metadata persisted between staged Phase 7 runs.
 * No credentials live here — only the ids/fixture rows a later stage needs to
 * rebuild a fresh authenticated runtime and re-assert the same Cloud rows.
 * `stages` records which resumable sub-stages have completed so a dependent
 * stage can refuse to run before its prerequisites are satisfied.
 */
export interface Phase7RunMeta {
  runId: string;
  orgA: string;
  orgB: string;
  userAId: string;
  userBId: string;
  emailA: string;
  emailB: string;
  password: string;
  stamp: string;
  ctx: Phase4Context;
  now: string;
  date: string;
  recordIds: Record<string, string>;
  phase7: Phase7Fixtures;
  users: string[];
  orgs: string[];
  stages: Phase7StageFlags;
}

/** Completion flags for the resumable setup sub-stages. */
export interface Phase7StageFlags {
  init?: boolean;
  "org-a"?: boolean;
  "org-b"?: boolean;
  base?: boolean;
  auth?: boolean;
  "rental-core"?: boolean;
  booking?: boolean;
  maintenance?: boolean;
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
  emailB: string;
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

/**
 * In-memory run store for the staged Phase 7 E2E runner. A setup stage
 * provisions + persists fixtures and stores the non-secret run meta here;
 * later stages look it up by runId and rebuild a fresh authenticated runtime.
 *
 * Entries expire so a dropped run does not leak fixtures forever: a later
 * cleanup stage (or a fresh setup) can still find the meta until it ages out.
 */
const RUN_TTL_MS = 1000 * 60 * 10;
interface RunEntry {
  meta: Phase7RunMeta;
  expiresAt: number;
}
const runs = new Map<string, RunEntry>();

export function saveRun(meta: Phase7RunMeta): void {
  pruneRuns();
  runs.set(meta.runId, { meta, expiresAt: Date.now() + RUN_TTL_MS });
}

export function loadRun(runId: string): Phase7RunMeta | undefined {
  pruneRuns();
  return runs.get(runId)?.meta;
}

function pruneRuns(): void {
  const now = Date.now();
  for (const [id, entry] of runs) if (entry.expiresAt <= now) runs.delete(id);
}

export type Phase7ClientFactory = (apiKey: string) => Phase7Client;

/**
 * Rebuild a full Phase7Runtime from persisted run meta + fresh authenticated
 * clients. The publishable-key `a`/`b` clients are signed in as Org A / Org B
 * so every later-stage assertion uses the SAME authenticated repository path
 * the app uses — never the service-role admin. Admin is confined to cleanup.
 */
export async function deriveRuntime(
  meta: Phase7RunMeta,
  client: Phase7ClientFactory,
): Promise<Phase7Runtime> {
  const a = client("publishable") as Phase7Client;
  const b = client("publishable") as Phase7Client;
  const admin = client("service") as Phase7Client;

  // Re-authenticate the publishable clients as Org A / Org B so RLS is the
  // real gate for every read/update/forged-insert probe in this stage.
  const sa = await a.auth.signInWithPassword({
    email: meta.emailA,
    password: meta.password,
  });
  if (sa.error || sa.data.user?.id !== meta.userAId)
    throw new Error(
      `Org A re-auth failed: ${sa.error?.message ?? "user mismatch"}`,
    );
  const sb = await b.auth.signInWithPassword({
    email: meta.emailB,
    password: meta.password,
  });
  if (sb.error || sb.data.user?.id !== meta.userBId)
    throw new Error(
      `Org B re-auth failed: ${sb.error?.message ?? "user mismatch"}`,
    );

  const rentals = new SupabaseRentalRepository(a as never);
  const ledger = new SupabaseLedgerRepository(a as never);
  const deposits = new SupabaseDepositRepository(a as never);
  const bookingRequests = new SupabaseBookingRequestRepository(a as never);
  const inspections = new SupabaseInspectionRepository(a as never);
  const maintenance = new SupabaseMaintenanceRepository(a as never);

  return {
    a,
    b,
    admin,
    orgA: meta.orgA,
    orgB: meta.orgB,
    userAId: meta.userAId,
    userBId: meta.userBId,
    emailA: meta.emailA,
    emailB: meta.emailB,
    password: meta.password,
    stamp: meta.stamp,
    ctx: meta.ctx,
    now: meta.now,
    date: meta.date,
    rentals,
    ledger,
    deposits,
    bookingRequests,
    inspections,
    maintenance,
    recordIds: meta.recordIds,
    phase7: meta.phase7,
    users: meta.users,
    orgs: meta.orgs,
  };
}
