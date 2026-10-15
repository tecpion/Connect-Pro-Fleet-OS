// Connect Pro Fleet — Supabase client + environment configuration (Build #22).
//
// Centralized Supabase access. Components/repositories import `getSupabase()`
// rather than instantiating clients. Only the publishable/anon key is used in
// the browser — the service-role key must NEVER be present in client code.
//
// Safe missing-config behavior: when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are absent the client returns null and the app runs in memory mode (dev/test
// only). Production mode (`VITE_BACKEND_MODE=supabase`) with missing config
// surfaces a configuration error instead of silently falling back.

import { createClient, type SupabaseClient } from "./supabaseClientShim";
import type { Database } from "./database.types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Cloud publishes the anon/publishable key as VITE_SUPABASE_PUBLISHABLE_KEY.
// Accept the legacy VITE_SUPABASE_ANON_KEY name too for older configs.
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

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

let client: SupabaseClient<Database> | null = null;

/** The shared typed browser Supabase client, or null when unconfigured. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!hasSupabaseConfig()) return null;
  if (!client) {
    client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
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
