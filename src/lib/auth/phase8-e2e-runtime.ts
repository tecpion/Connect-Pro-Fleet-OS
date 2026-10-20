// Phase 8 E2E — shared runtime state + step/requireOk/errorDetail helpers.
//
// Mirrors the Phase 7 staged-runner split: a thin context flows from the
// orchestrator (phase8-e2e.server.ts) into each focused step module so the
// runner stays readable. Test-harness only — no product/domain logic changed.
//
// Service role is confined to provisioning and teardown. Every assertion uses
// signed-in publishable-key clients (the Phase8Runtime `a`/`b`), including the
// forged-org isolation probes. The Phase 8 repositories held on this runtime are
// the authenticated Org A adapters built from the signed-in `a` client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Phase4Context } from "./phase4-e2e-builders";
import type { Location, Staff, Driver } from "@/lib/types";
import type { OperationalStaffAssignment } from "@/lib/staffTypes";
import type { Task, TaskEvent, TaskNote } from "@/lib/taskTypes";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "@/lib/notificationTypes";
import type { VehicleClass, AddonCategory, AddonCatalogItem } from "@/lib/settingsTypes";
import type { CompanyInfo } from "@/lib/settingsTypes";
import {
  SupabaseLocationsRepository,
  SupabaseStaffAssignmentsRepository,
} from "@/lib/supabase/phase8OperationalAdapters";
import {
  SupabaseTasksRepository,
  SupabaseNotificationsRepository,
  SupabaseCompanySettingsRepository,
  SupabaseVehicleClassesRepository,
  SupabaseAddonsRepository,
} from "@/lib/supabase/phase8ConfigAdapters";
import type { Phase8Step } from "./phase8-e2e.server";

export type Phase8Client = Pick<
  SupabaseClient,
  "from" | "auth" | "storage" | "rpc"
>;

/** Phase 8 domain fixtures created through the real repository path. */
export interface Phase8Fixtures {
  location: Location;
  staff: Staff;
  assignment: OperationalStaffAssignment;
  driver: Driver;
  task: Task;
  taskEvent: TaskEvent;
  taskNote: TaskNote;
  notification: Notification;
  notificationDelivery: NotificationDelivery;
  notificationPreference: NotificationPreference;
  companyInfo: CompanyInfo;
  vehicleClass: VehicleClass;
  addonCategory: AddonCategory;
  addonItem: AddonCatalogItem;
}

/**
 * Non-secret metadata persisted between staged Phase 8 runs.
 * No credentials live here — only the ids/fixture rows a later stage needs to
 * rebuild a fresh authenticated runtime and re-assert the same Cloud rows.
 * `stages` records which resumable sub-stages have completed so a dependent
 * stage can refuse to run before its prerequisites are satisfied.
 */
export interface Phase8RunMeta {
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
  phase8: Phase8Fixtures;
  users: string[];
  orgs: string[];
  stages: Phase8StageFlags;
}

/** Completion flags for the resumable setup sub-stages. */
export interface Phase8StageFlags {
  init?: boolean;
  "org-a"?: boolean;
  "org-b"?: boolean;
  operational?: boolean;
  "tasks-notifications"?: boolean;
  config?: boolean;
}

export interface Phase8Runtime {
  a: Phase8Client;
  b: Phase8Client;
  admin: Phase8Client;
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
  locations: SupabaseLocationsRepository;
  staffAssignments: SupabaseStaffAssignmentsRepository;
  tasks: SupabaseTasksRepository;
  notifications: SupabaseNotificationsRepository;
  companySettings: SupabaseCompanySettingsRepository;
  vehicleClasses: SupabaseVehicleClassesRepository;
  addons: SupabaseAddonsRepository;
  recordIds: Record<string, string>;
  phase8: Phase8Fixtures;
  users: string[];
  orgs: string[];
}

// step() — runs a check, captures ok/detail, and never throws (requireOk()
// halts prerequisite chains after a required step fails).
export async function step(
  steps: Phase8Step[],
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
 * In-memory run store for the staged Phase 8 E2E runner. A setup stage
 * provisions + persists fixtures and stores the non-secret run meta here;
 * later stages look it up by runId and rebuild a fresh authenticated runtime.
 *
 * Entries expire so a dropped run does not leak fixtures forever: a later
 * cleanup stage (or a fresh setup) can still find the meta until it ages out.
 */
const RUN_TTL_MS = 1000 * 60 * 10;
interface RunEntry {
  meta: Phase8RunMeta;
  expiresAt: number;
}
const runs = new Map<string, RunEntry>();

export function saveRun(meta: Phase8RunMeta): void {
  pruneRuns();
  runs.set(meta.runId, { meta, expiresAt: Date.now() + RUN_TTL_MS });
}

export function loadRun(runId: string): Phase8RunMeta | undefined {
  pruneRuns();
  return runs.get(runId)?.meta;
}

function pruneRuns(): void {
  const now = Date.now();
  for (const [id, entry] of runs) if (entry.expiresAt <= now) runs.delete(id);
}

export type Phase8ClientFactory = (apiKey: string) => Phase8Client;

/**
 * Rebuild a full Phase8Runtime from persisted run meta + fresh authenticated
 * clients. The publishable-key `a`/`b` clients are signed in as Org A / Org B
 * so every later-stage assertion uses the SAME authenticated repository path
 * the app uses — never the service-role admin. Admin is confined to cleanup.
 */
export async function deriveRuntime(
  meta: Phase8RunMeta,
  client: Phase8ClientFactory,
): Promise<Phase8Runtime> {
  const a = client("publishable") as Phase8Client;
  const b = client("publishable") as Phase8Client;
  const admin = client("service") as Phase8Client;

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

  const locations = new SupabaseLocationsRepository(a as never);
  const staffAssignments = new SupabaseStaffAssignmentsRepository(a as never);
  const tasks = new SupabaseTasksRepository(a as never);
  const notifications = new SupabaseNotificationsRepository(a as never);
  const companySettings = new SupabaseCompanySettingsRepository(a as never);
  const vehicleClasses = new SupabaseVehicleClassesRepository(a as never);
  const addons = new SupabaseAddonsRepository(a as never);

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
    locations,
    staffAssignments,
    tasks,
    notifications,
    companySettings,
    vehicleClasses,
    addons,
    recordIds: meta.recordIds,
    phase8: meta.phase8,
    users: meta.users,
    orgs: meta.orgs,
  };
}
