// Connect Pro Fleet — Supabase client + environment configuration (Build #22).
//
// Centralized Cloud access. Components/repositories import `getSupabase()`
// rather than instantiating clients. Only the publishable/anon key is used in
// the browser — the service-role key must NEVER be present in client code.
//
// Safe missing-config behavior: when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are absent the client returns null and the app runs in memory mode (dev/test
// only). When Cloud is configured, the real @supabase/supabase-js client is
// constructed with the opaque-key fetch handling Cloud requires.

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Use import.meta.env for the browser (Vite build-time replacement) and fall
// back to process.env for SSR (server-side rendering), matching the generated
// Cloud client contract.
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (typeof process !== "undefined" ? process.env?.SUPABASE_URL : undefined);
// Cloud publishes the anon/publishable key as VITE_SUPABASE_PUBLISHABLE_KEY.
// Accept the legacy VITE_SUPABASE_ANON_KEY name too for older configs.
const SUPABASE_ANON_KEY =
  ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)) ||
  (typeof process !== "undefined"
    ? process.env?.SUPABASE_PUBLISHABLE_KEY
    : undefined);

export type BackendMode = "memory" | "supabase";

/** Resolved backend mode. `supabase` whenever Cloud config is present (URL +
 *  publishable key). Tests/dev without config stay in `memory` mode. */
export function getBackendMode(): BackendMode {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return "supabase";
  }
  return "memory";
}

/** True when a usable Cloud config is present. */
export function hasSupabaseConfig(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// Cloud injects new-format `sb_publishable_*` / `sb_secret_*` keys. They are
// opaque strings, NOT JWTs: send the key in the `apikey` header and delete the
// `Authorization: Bearer <key>` header the SDK adds, or PostgREST fails.
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) =>
        headers.set(key, value),
      );
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

let client: SupabaseClient<Database> | null = null;

/** The shared typed browser Cloud client, or null when unconfigured. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!hasSupabaseConfig()) return null;
  if (!client) {
    client = createSupabaseClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { fetch: createSupabaseFetch(SUPABASE_ANON_KEY!) },
      auth: {
        storage: typeof window !== "undefined" ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Reset the cached client (used by tests). */
export function _resetSupabaseClient(): void {
  client = null;
}

/** Production guard: in supabase mode with missing config, surface an error
 *  rather than silently degrading to ephemeral memory. Returns a message when
 *  configuration is required but missing, otherwise null. */
export function requireSupabaseConfig(): string | null {
  if (getBackendMode() !== "supabase") return null;
  if (!hasSupabaseConfig()) {
    return "Cloud backend mode is enabled but VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing. Configure the environment for development.";
  }
  return null;
}
