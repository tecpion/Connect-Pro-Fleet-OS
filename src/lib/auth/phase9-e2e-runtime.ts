// Connect Pro Fleet — Phase 9D live Cloud E2E — shared runtime + helpers.
//
// Mirrors the Phase 8 staged-runner split. A thin context flows from the
// orchestrator (phase9-e2e.server.ts) into each focused step module so the
// runner stays readable. Test-harness only — no product/domain logic changed.
//
// Service role is confined to provisioning and teardown. Every assertion uses
// signed-in publishable-key clients (the Phase9Runtime `a`/`b`), including the
// forged-org isolation probes. The Phase 9 repositories held on this runtime
// are the authenticated Org A adapters built from the signed-in `a` client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Phase4Context } from "./phase4-e2e-builders";
import type {
  RentalEvent,
  MasterAgreement,
  AgreementInstance,
} from "@/lib/types";
import type { Invoice, Receipt } from "@/lib/invoiceTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
  ArrangementEvent,
} from "@/lib/paymentArrangementTypes";
import type { AgreementTemplate } from "@/lib/settingsTypes";
import type { ActivityEntry } from "@/lib/store/storeContext";
import type { FinancialTransaction } from "@/lib/chargeTypes";
import {
  SupabaseRentalEventsRepository,
  SupabaseInvoicesRepository,
  SupabaseReceiptsRepository,
  SupabasePaymentArrangementsRepository,
  SupabaseAgreementsRepository,
  SupabaseActivityAuditRepository,
  type RentalEventsRepository,
  type InvoicesRepository,
  type ReceiptsRepository,
  type PaymentArrangementsRepository,
  type AgreementsRepository,
  type ActivityAuditRepository,
} from "@/lib/supabase/phase9Adapters";
import { SupabaseLedgerRepository } from "@/lib/supabase/repositoryAdapters";
import type { Phase9Step } from "./phase9-e2e.server";

export type Phase9Client = Pick<
  SupabaseClient,
  "from" | "auth" | "storage" | "rpc"
>;

/** Phase 9 domain fixtures created through the real repository path. */
export interface Phase9Fixtures {
  rentalEvent?: RentalEvent;
  invoice?: Invoice;
  paymentTransaction?: FinancialTransaction;
  receipt?: Receipt;
  arrangement?: PaymentArrangement;
  installment?: PaymentArrangementInstallment;
  arrangementEvent?: ArrangementEvent;
  template?: AgreementTemplate;
  masterAgreement?: MasterAgreement;
  agreementInstance?: AgreementInstance;
  activity?: ActivityEntry;
}

/**
 * Non-secret metadata persisted between staged Phase 9D runs.
 * No credentials live here — only the ids/fixture rows a later stage needs to
 * rebuild a fresh authenticated runtime and re-assert the same Cloud rows.
 * `stages` records which resumable sub-stages have completed so a dependent
 * stage can refuse to run before its prerequisites are satisfied.
 */
export interface Phase9RunMeta {
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
  phase9: Phase9Fixtures;
  users: string[];
  orgs: string[];
  stages: Phase9StageFlags;
}

/** Completion flags for the resumable setup sub-stages. */
export interface Phase9StageFlags {
  init?: boolean;
  "org-a"?: boolean;
  "org-b"?: boolean;
  "financial-docs"?: boolean;
  arrangements?: boolean;
  agreements?: boolean;
  activity?: boolean;
}

export interface Phase9Runtime {
  a: Phase9Client;
  b: Phase9Client;
  admin: Phase9Client;
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
  rentalEvents: RentalEventsRepository;
  invoices: InvoicesRepository;
  receipts: ReceiptsRepository;
  paymentArrangements: PaymentArrangementsRepository;
  agreements: AgreementsRepository;
  activityAudit: ActivityAuditRepository;
  ledger: SupabaseLedgerRepository;
  recordIds: Record<string, string>;
  phase9: Phase9Fixtures;
  users: string[];
  orgs: string[];
}

// step() — runs a check, captures ok/detail, and never throws (requireOk()
// halts prerequisite chains after a required step fails).
export async function step(
  steps: Phase9Step[],
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
 * In-memory run store for the staged Phase 9D E2E runner. A setup stage
 * provisions + persists fixtures and stores the non-secret run meta here;
 * later stages look it up by runId and rebuild a fresh authenticated runtime.
 *
 * Entries expire so a dropped run does not leak fixtures forever: a later
 * cleanup stage (or a fresh setup) can still find the meta until it ages out.
 */
const RUN_TTL_MS = 1000 * 60 * 10;
interface RunEntry {
  meta: Phase9RunMeta;
  expiresAt: number;
}
const runs = new Map<string, RunEntry>();

export function saveRun(meta: Phase9RunMeta): void {
  pruneRuns();
  runs.set(meta.runId, { meta, expiresAt: Date.now() + RUN_TTL_MS });
}

export function loadRun(runId: string): Phase9RunMeta | undefined {
  pruneRuns();
  return runs.get(runId)?.meta;
}

function pruneRuns(): void {
  const now = Date.now();
  for (const [id, entry] of runs) if (entry.expiresAt <= now) runs.delete(id);
}

export type Phase9ClientFactory = (apiKey: string) => Phase9Client;

/**
 * Rebuild a full Phase9Runtime from persisted run meta + fresh authenticated
 * clients. The publishable-key `a`/`b` clients are signed in as Org A / Org B
 * so every later-stage assertion uses the SAME authenticated repository path
 * the app uses — never the service-role admin. Admin is confined to cleanup.
 */
export async function deriveRuntime(
  meta: Phase9RunMeta,
  client: Phase9ClientFactory,
): Promise<Phase9Runtime> {
  const a = client("publishable") as Phase9Client;
  const b = client("publishable") as Phase9Client;
  const admin = client("service") as Phase9Client;

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

  const rentalEvents = new SupabaseRentalEventsRepository(a as never);
  const invoices = new SupabaseInvoicesRepository(a as never);
  const receipts = new SupabaseReceiptsRepository(a as never);
  const paymentArrangements = new SupabasePaymentArrangementsRepository(
    a as never,
  );
  const agreements = new SupabaseAgreementsRepository(a as never);
  const activityAudit = new SupabaseActivityAuditRepository(a as never);
  const ledger = new SupabaseLedgerRepository(a as never);

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
    rentalEvents,
    invoices,
    receipts,
    paymentArrangements,
    agreements,
    activityAudit,
    ledger,
    recordIds: meta.recordIds,
    phase9: meta.phase9,
    users: meta.users,
    orgs: meta.orgs,
  };
}
