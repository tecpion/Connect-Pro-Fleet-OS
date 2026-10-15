// Connect Pro Fleet — Copilot Edge Function (Deno / Supabase Edge Functions).
//
// Secure server-side proxy for Fleet Copilot natural-language CLASSIFICATION.
// This is the ONLY backend component added for LLM routing — it does NOT begin
// the Fleet domain-store migration. The function is a stateless classifier:
//   1. verify the Supabase user JWT
//   2. resolve user_id + active org membership (tenant isolation)
//   3. rate-limit per user_id + org_id
//   4. call the LLM with a strict JSON schema (classification only)
//   5. validate the structured output server-side
//   6. return { classification } or { classification: null } on any failure
//
// The function NEVER receives tenant business rows, customer records, rental
// records, or financial records — only the query + minimal semantic context.
// The LLM API key lives ONLY in Deno.env.get("COPILOT_OPENAI_API_KEY"); it is
// never shipped to the browser, never in VITE_*, never in localStorage.
//
// On ANY failure (auth, rate limit, timeout, malformed, validation, provider
// error) the function returns { classification: null } so the frontend falls
// back to the deterministic Copilot. The AI service being unavailable must
// NEVER make Fleet Copilot unusable.
//
// Deploy: supabase functions deploy copilot
// Secrets: supabase secrets set COPILOT_OPENAI_API_KEY=sk-...
//          supabase secrets set COPILOT_LLM_MODEL=gpt-4o-mini
//
// PHASE 1 = CLASSIFICATION ONLY. No phrasing mode is implemented here yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateClassification,
  LLM_CONFIDENCE_THRESHOLD,
} from "./_shared/validator.ts";
import { buildSystemPrompt, COPILOT_RESPONSE_SCHEMA } from "./_shared/prompts.ts";

// ---------------------------------------------------------------------------
// Configuration (server-side env only — never exposed to the browser).
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = Deno.env.get("COPILOT_OPENAI_API_KEY");
const LLM_MODEL = Deno.env.get("COPILOT_LLM_MODEL") ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LLM_TIMEOUT_MS = 5000; // hard cap ~5s; deterministic fallback beyond.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Rate limiting (per user_id + org_id). Uses a Postgres-backed counter table
// when available; degrades gracefully to a per-instance in-memory map when the
// table is absent (development only — never the sole production control).
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_REQUESTS = 20; // dev/test allowance per minute per user+org.

// ---------------------------------------------------------------------------
// CORS — same Supabase project origin.
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// ---------------------------------------------------------------------------
// Auth + tenant verification.
// ---------------------------------------------------------------------------

interface VerifiedUser {
  userId: string;
  orgId: string | null;
  email: string | null;
}

/** Verify the bearer JWT and resolve the user + active org membership.
 *  Uses a short-lived service client built from the anon key + the user's JWT
 *  (RLS-scoped) so we never need a service-role key in this function. */
async function verifyUser(authHeader: string | null): Promise<VerifiedUser | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error } = await client.auth.getUser();
  if (error || !userData?.user) return null;
  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  // Resolve active org membership (tenant isolation). The user must have an
  // active membership in at least one organization.
  const { data: memberships } = await client
    .from("organization_memberships")
    .select("organization_id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  const orgId = (memberships && memberships.length > 0)
    ? memberships[0].organization_id
    : null;

  // Reject users with no valid organization membership.
  if (!orgId) return null;

  return { userId, orgId, email };
}

// ---------------------------------------------------------------------------
// Rate limiting (Postgres-backed; in-memory fallback for dev).
// ---------------------------------------------------------------------------

const inMemoryCounts = new Map<string, { count: number; resetAt: number }>();

/** Check + increment the rate limit for a user+org. Returns false if exceeded. */
async function checkRateLimit(
  client: ReturnType<typeof createClient>,
  key: string,
): Promise<boolean> {
  // Try the Postgres-backed counter first. The table is created lazily; if it
  // does not exist yet, fall back to in-memory (development only).
  try {
    const bucket = Math.floor(Date.now() / 1000 / RATE_WINDOW_SECONDS);
    const rowKey = `${key}:${bucket}`;
    // Atomic upsert increment via RPC would be ideal; use a simple read+write
    // guarded by the bucket key. For production, replace with a SECURITY
    // DEFINER RPC or Upstash KV.
    const { data, error } = await client
      .from("copilot_rate_limits")
      .select("count")
      .eq("bucket_key", rowKey)
      .maybeSingle();

    if (!error) {
      const current = (data?.count as number) ?? 0;
      if (current >= RATE_MAX_REQUESTS) return false;
      if (current === 0) {
        await client
          .from("copilot_rate_limits")
          .insert({ bucket_key: rowKey, count: 1 });
      } else {
        await client
          .from("copilot_rate_limits")
          .update({ count: current + 1 })
          .eq("bucket_key", rowKey);
      }
      return true;
    }
  } catch {
    // Table missing or query failed — fall through to in-memory.
  }

  // In-memory fallback (per-instance, development only).
  const now = Date.now();
  const entry = inMemoryCounts.get(key);
  if (!entry || entry.resetAt < now) {
    inMemoryCounts.set(key, { count: 1, resetAt: now + RATE_WINDOW_SECONDS * 1000 });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

// ---------------------------------------------------------------------------
// Safe structured logging (no PII, no query bodies, no keys).
// ---------------------------------------------------------------------------

function hashId(id: string): string {
  // Simple non-cryptographic hash for anonymized logging only.
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return `u${(h >>> 0).toString(16)}`;
}

function logSafe(entry: Record<string, unknown>): void {
  // Structured log to stderr (Supabase captures function logs). Never logs
  // query bodies, customer names, VINs, financial values, or API keys.
  console.log(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// LLM call (classification only).
// ---------------------------------------------------------------------------

interface LlmRequestBody {
  query: string;
  context: {
    lastUserQuery?: string | null;
    priorIntent?: string | null;
    priorEntityLabel?: string | null;
    priorEntityType?: string | null;
  };
  allowedIntents: string[];
}

async function callLlm(
  body: LlmRequestBody,
  signal: AbortSignal,
): Promise<unknown | null> {
  if (!OPENAI_API_KEY) return null;

  const systemPrompt = buildSystemPrompt(body.allowedIntents);
  const userContent = JSON.stringify({
    query: body.query,
    context: body.context,
  });

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      max_tokens: 600,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "copilot_classification",
          strict: true,
          schema: COPILOT_RESPONSE_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler.
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ classification: null, error: "method_not_allowed" }, 405);
  }

  const startedAt = Date.now();
  const authHeader = req.headers.get("authorization");

  // 1. Auth + tenant verification.
  let user: VerifiedUser | null = null;
  try {
    user = await verifyUser(authHeader);
  } catch {
    user = null;
  }
  if (!user) {
    return json({ classification: null, error: "unauthorized" }, 401);
  }

  // 2. Parse + validate input shape.
  let body: LlmRequestBody;
  try {
    const raw = await req.json();
    if (!raw || raw.mode !== "classify") {
      return json({ classification: null, error: "bad_mode" }, 400);
    }
    const query = typeof raw.query === "string" ? raw.query.slice(0, 1000) : "";
    if (!query.trim()) {
      return json({ classification: null, error: "empty_query" }, 400);
    }
    const ctx = raw.context ?? {};
    const context = {
      lastUserQuery:
        typeof ctx.lastUserQuery === "string"
          ? ctx.lastUserQuery.slice(0, 500)
          : null,
      priorIntent: typeof ctx.priorIntent === "string" ? ctx.priorIntent : null,
      priorEntityLabel:
        typeof ctx.priorEntityLabel === "string"
          ? ctx.priorEntityLabel.slice(0, 200)
          : null,
      priorEntityType:
        typeof ctx.priorEntityType === "string" ? ctx.priorEntityType : null,
    };
    const allowedIntents = Array.isArray(raw.allowedIntents)
      ? raw.allowedIntents
          .filter((i: unknown) => typeof i === "string")
          .slice(0, 200)
      : [];
    if (allowedIntents.length === 0) {
      return json({ classification: null, error: "no_allowed_intents" }, 400);
    }
    body = { query, context, allowedIntents };
  } catch {
    return json({ classification: null, error: "bad_request" }, 400);
  }

  // 3. Rate limit (per user + org).
  const rateKey = `${user.userId}:${user.orgId}`;
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let allowed = false;
  try {
    allowed = await checkRateLimit(serviceClient, rateKey);
  } catch {
    allowed = true; // fail open on rate-limit infra failure (fallback path).
  }
  if (!allowed) {
    logSafe({
      event: "copilot_rate_limited",
      user: hashId(user.userId),
      org: user.orgId,
    });
    return json({ classification: null, error: "rate_limited" }, 429);
  }

  // 4. Call the LLM with a hard timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  let modelRaw: unknown = null;
  let modelError: string | null = null;
  try {
    modelRaw = await callLlm(body, controller.signal);
  } catch (e) {
    modelError = e instanceof Error ? e.name : "error";
  } finally {
    clearTimeout(timeout);
  }

  // 5. Validate the structured output server-side.
  let classification = null;
  if (modelRaw) {
    classification = validateClassification(modelRaw, body.allowedIntents);
  }

  const latencyMs = Date.now() - startedAt;
  logSafe({
    event: classification ? "copilot_classified" : "copilot_fallback",
    user: hashId(user.userId),
    org: user.orgId,
    intent: classification?.intent ?? null,
    confidence: classification?.confidence ?? null,
    latency_ms: latencyMs,
    model: LLM_MODEL,
    error: modelError,
  });

  // 6. Return. null classification → frontend deterministic fallback.
  return json({ classification });
});
