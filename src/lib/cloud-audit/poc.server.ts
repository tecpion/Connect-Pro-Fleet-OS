// Cloud audit proof-of-concept — server-only runtime logic.
// Uses SEPARATE poc_* tables that do NOT touch any Fleet OS V1 workflow.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";

// Fixed UUIDs so the proof is re-runnable (idempotent cleanup + reseed).
const ORG1 = "11111111-1111-1111-1111-111111111111";
const ORG2 = "22222222-2222-2222-2222-222222222222";
const EMAIL1 = "poc.org1@example.test";
const EMAIL2 = "poc.org2@example.test";
const PASSWORD = "PocProof!2026";

type Step = { name: string; pass: boolean; detail: string };

function publishableClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function ensureUser(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (data?.user) return data.user.id;
  // Already registered from a prior run — sign in to recover the id.
  const c = publishableClient();
  const { data: sd, error: se } = await c.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (sd?.user) return sd.user.id;
  throw new Error(
    `ensureUser(${email}) failed: create=${error?.message} signin=${se?.message}`,
  );
}

async function signIn(email: string) {
  const c = publishableClient();
  const { data, error } = await c.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

async function statusIs(id: string, expected: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("poc_reservations")
    .select("status")
    .eq("id", id)
    .single();
  return data?.status === expected;
}

export async function runProof() {
  const steps: Step[] = [];
  const record = (name: string, pass: boolean, detail: string) =>
    steps.push({ name, pass, detail });

  const created = {
    users: [] as string[],
    orgs: [ORG1, ORG2],
    customer: "",
    vehicle: "",
    reservation: "",
    file: "",
  };

  // ---- idempotent cleanup of any prior run ----
  await supabaseAdmin
    .from("poc_reservations")
    .delete()
    .in("org_id", [ORG1, ORG2]);
  await supabaseAdmin.from("poc_vehicles").delete().in("org_id", [ORG1, ORG2]);
  await supabaseAdmin.from("poc_customers").delete().in("org_id", [ORG1, ORG2]);
  await supabaseAdmin
    .from("poc_memberships")
    .delete()
    .in("org_id", [ORG1, ORG2]);
  await supabaseAdmin.from("poc_orgs").delete().in("id", [ORG1, ORG2]);
  await supabaseAdmin.storage
    .from("poc-private")
    .remove([`${ORG1}/secret.txt`, `${ORG2}/secret.txt`]);

  // ---- 1. authentication: two test users ----
  const u1 = await ensureUser(EMAIL1);
  const u2 = await ensureUser(EMAIL2);
  created.users = [u1, u2];
  record("auth.create-users", true, `org1-user=${u1} org2-user=${u2}`);

  // ---- 2. organizations ----
  const { error: oerr } = await supabaseAdmin.from("poc_orgs").upsert([
    { id: ORG1, name: "POC Org Alpha", slug: "poc-alpha" },
    { id: ORG2, name: "POC Org Beta", slug: "poc-beta" },
  ]);
  record("db.create-orgs", !oerr, oerr?.message || "2 orgs upserted");

  // ---- 3. memberships (user→org) ----
  const { error: merr } = await supabaseAdmin.from("poc_memberships").upsert([
    { org_id: ORG1, user_id: u1, status: "active" },
    { org_id: ORG2, user_id: u2, status: "active" },
  ]);
  record("db.create-memberships", !merr, merr?.message || "2 memberships");

  // ---- 4. one customer, one vehicle, one reservation in Org Alpha ----
  const custId = crypto.randomUUID();
  const vehId = crypto.randomUUID();
  const resId = crypto.randomUUID();
  await supabaseAdmin.from("poc_customers").insert({
    id: custId,
    org_id: ORG1,
    name: "Test Customer",
    email: "customer@example.test",
  });
  await supabaseAdmin.from("poc_vehicles").insert({
    id: vehId,
    org_id: ORG1,
    make: "Toyota",
    model: "Camry",
    license_plate: "POC-001",
  });
  await supabaseAdmin.from("poc_reservations").insert({
    id: resId,
    org_id: ORG1,
    customer_id: custId,
    vehicle_id: vehId,
    start_date: "2026-11-01",
    end_date: "2026-11-05",
    status: "confirmed",
  });
  created.customer = custId;
  created.vehicle = vehId;
  created.reservation = resId;
  record(
    "db.create-records",
    true,
    `customer=${custId} vehicle=${vehId} reservation=${resId}`,
  );

  // ---- 5. RLS: user1 (Org Alpha) reads own reservation -> expect 1 ----
  const c1 = await signIn(EMAIL1);
  const { data: r1, error: e1 } = await c1.from("poc_reservations").select("*");
  record(
    "rls.user1-read-own",
    !e1 && (r1?.length ?? 0) === 1,
    `got ${r1?.length ?? 0} rows; err=${e1?.message || "none"}`,
  );

  // ---- 6. RLS: user2 (Org Beta) reads -> expect 0 (isolation) ----
  const c2 = await signIn(EMAIL2);
  const { data: r2, error: e2 } = await c2.from("poc_reservations").select("*");
  record(
    "rls.user2-read-isolated",
    !e2 && (r2?.length ?? 0) === 0,
    `got ${r2?.length ?? 0} rows; err=${e2?.message || "none"}`,
  );

  // ---- 7. cross-org UPDATE blocked: user2 tries to modify Org Alpha's reservation ----
  await c2
    .from("poc_reservations")
    .update({ status: "stolen" })
    .eq("id", resId);
  const unchanged = await statusIs(resId, "confirmed");
  record(
    "rls.user2-update-blocked",
    unchanged,
    `status still "confirmed" after cross-org update attempt`,
  );

  // ---- 8. cross-org INSERT blocked: user2 tries to insert into Org Alpha ----
  const { error: insErr } = await c2.from("poc_reservations").insert({
    id: crypto.randomUUID(),
    org_id: ORG1,
    vehicle_id: vehId,
    start_date: "2026-12-01",
    end_date: "2026-12-02",
    status: "x",
  });
  record(
    "rls.user2-insert-blocked",
    !!insErr,
    `err=${insErr?.message || "no error (unexpected)"}`,
  );

  // ---- 9. persistence: sign out user1, sign back in, data still present ----
  await c1.auth.signOut();
  const c1b = await signIn(EMAIL1);
  const { data: r1b } = await c1b.from("poc_reservations").select("*");
  record(
    "persistence.after-relogin",
    (r1b?.length ?? 0) === 1,
    `got ${r1b?.length ?? 0} rows after logout+login`,
  );

  // ---- 10. private file upload (Org Alpha only) ----
  const filePath = `${ORG1}/secret.txt`;
  const { error: upErr } = await c1b.storage
    .from("poc-private")
    .upload(filePath, "top-secret org1 payload", {
      contentType: "text/plain",
      upsert: true,
    });
  record("storage.user1-upload", !upErr, `err=${upErr?.message || "none"}`);

  const { data: dl1, error: dl1Err } = await c1b.storage
    .from("poc-private")
    .download(filePath);
  record(
    "storage.user1-download",
    !dl1Err && !!dl1,
    `err=${dl1Err?.message || "none"}`,
  );

  // user2 (Org Beta) must NOT be able to download Org Alpha's file
  const { data: dl2, error: dl2Err } = await c2.storage
    .from("poc-private")
    .download(filePath);
  record(
    "storage.user2-blocked",
    !!dl2Err || !dl2,
    `err=${dl2Err?.message || "no error - got data (unexpected)"}`,
  );
  created.file = filePath;

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.filter((s) => !s.pass);
  return { created, steps, passed, failed, total: steps.length };
}
