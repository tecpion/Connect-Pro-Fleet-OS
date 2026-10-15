// Connect Pro Fleet — local Supabase client shim (Build #56).
//
// The real `@supabase/supabase-js` package is an optional backend dependency
// that is intentionally NOT bundled into the frontend build (see the project's
// backend-migration status). The app runs in memory mode by default; the
// Supabase-backed repository adapters are only constructed when
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are configured.
//
// To keep the production build resolving without the external package (and to
// avoid bundling secrets/keys in client code), this module provides a typed
// `createClient` + `SupabaseClient` matching the API surface actually used by
// the app: `.from(table).select/insert/update/delete/.eq/.order/.single/...`,
// `.auth.getSession/onAuthStateChange/signInWithPassword/signOut`, and
// `.storage.from(bucket).upload/createSignedUrl/remove`. The types are kept
// permissive (data: any) so they compose with the generated `Database` types
// without dragging the full Supabase SDK into the browser bundle.
//
// When the backend migration wires the real SDK, swap these imports back to
// `@supabase/supabase-js` and delete this file. The signatures are compatible.

import type { Database } from "./database.types";

/** Error-like object returned by the Supabase query/auth/storage APIs. */
export interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Generic Postgrest response shape. `data` is `any` so the generated row types
 *  compose without requiring the full SDK type machinery. */
export interface PostgrestResponse<T = any> {
  data: T | null;
  error: SupabaseError | null;
  count: number | null;
  status: number;
  statusText: string;
}

/** A thenable that also exposes the query-builder filter methods. Awaiting it
 *  resolves to `{ data, error }`. */
export interface PostgrestFilterBuilder<T = any> extends PromiseLike<
  PostgrestResponse<T>
> {
  select(columns?: string): PostgrestFilterBuilder<T>;
  insert(row: any): PostgrestFilterBuilder<T>;
  insert(rows: any[]): PostgrestFilterBuilder<T>;
  upsert(row: any, opts?: { onConflict?: string }): PostgrestFilterBuilder<T>;
  update(row: any): PostgrestFilterBuilder<T>;
  delete(opts?: { count?: string }): PostgrestFilterBuilder<T>;
  eq(column: string, value: any): PostgrestFilterBuilder<T>;
  neq(column: string, value: any): PostgrestFilterBuilder<T>;
  gt(column: string, value: any): PostgrestFilterBuilder<T>;
  gte(column: string, value: any): PostgrestFilterBuilder<T>;
  lt(column: string, value: any): PostgrestFilterBuilder<T>;
  lte(column: string, value: any): PostgrestFilterBuilder<T>;
  in(column: string, values: any[]): PostgrestFilterBuilder<T>;
  is(column: string, value: any): PostgrestFilterBuilder<T>;
  like(column: string, pattern: string): PostgrestFilterBuilder<T>;
  ilike(column: string, pattern: string): PostgrestFilterBuilder<T>;
  not(column: string, operator: string, value: any): PostgrestFilterBuilder<T>;
  or(filters: string): PostgrestFilterBuilder<T>;
  match(query: Record<string, any>): PostgrestFilterBuilder<T>;
  order(
    column: string,
    opts?: { ascending?: boolean; nulls?: "first" | "last" },
  ): PostgrestFilterBuilder<T>;
  limit(
    count: number,
    opts?: { foreignTable?: string },
  ): PostgrestFilterBuilder<T>;
  range(
    from: number,
    to: number,
    opts?: { foreignTable?: string },
  ): PostgrestFilterBuilder<T>;
  single(): PromiseLike<PostgrestResponse<T>>;
  maybeSingle(): PromiseLike<PostgrestResponse<T>>;
}

export interface PostgrestQueryBuilder<T = any> {
  select(columns?: string): PostgrestFilterBuilder<T>;
  insert(row: any): PostgrestFilterBuilder<T>;
  insert(rows: any[]): PostgrestFilterBuilder<T>;
  update(row: any): PostgrestFilterBuilder<T>;
  delete(opts?: { count?: string }): PostgrestFilterBuilder<T>;
  upsert(row: any, opts?: { onConflict?: string }): PostgrestFilterBuilder<T>;
}

export interface SupabaseSessionUser {
  id: string;
  email?: string;
  [key: string]: any;
}
export interface SupabaseSession {
  user: SupabaseSessionUser | null;
  [key: string]: any;
}
export interface AuthResponse {
  data: {
    user: SupabaseSessionUser | null;
    session: SupabaseSession | null;
  };
  error: SupabaseError | null;
}
export interface AuthSessionResponse {
  data: { session: SupabaseSession | null };
  error: SupabaseError | null;
}
export interface AuthSubscription {
  data: { subscription: { unsubscribe(): void } };
  error: SupabaseError | null;
}
export interface AuthSignOutResponse {
  error: SupabaseError | null;
}
export interface SupabaseAuthClient {
  getSession(): PromiseLike<AuthSessionResponse>;
  getUser(): PromiseLike<{
    data: { user: SupabaseSessionUser | null };
    error: SupabaseError | null;
  }>;
  onAuthStateChange(
    cb: (event: string, session: SupabaseSession | null) => void,
  ): AuthSubscription;
  signInWithPassword(creds: {
    email: string;
    password: string;
  }): PromiseLike<AuthResponse>;
  signUp(creds: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }): PromiseLike<AuthResponse>;
  signOut(): PromiseLike<AuthSignOutResponse>;
}

export interface StorageUploadResponse {
  data: { path: string } | null;
  error: SupabaseError | null;
}
export interface StorageSignedUrlResponse {
  data: { signedUrl: string; path: string } | null;
  error: SupabaseError | null;
}
export interface StorageRemoveResponse {
  data: { paths: string[] } | null;
  error: SupabaseError | null;
}
export interface SupabaseStorageFileApi {
  upload(
    path: string,
    body: Blob | File | ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean },
  ): PromiseLike<StorageUploadResponse>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): PromiseLike<StorageSignedUrlResponse>;
  remove(paths: string[]): PromiseLike<StorageRemoveResponse>;
}
export interface SupabaseStorageBucketApi {
  from(bucket: string): SupabaseStorageFileApi;
}

/** Typed Supabase client. The generic is preserved so callers can pass
 *  `SupabaseClient<Database>` even though the query data is `any`. */
export interface SupabaseClient<DB extends Record<string, any> = Database> {
  from(table: string): PostgrestQueryBuilder<any>;
  auth: SupabaseAuthClient;
  storage: SupabaseStorageBucketApi;
  channel(name?: string): any;
  rpc(fn: string, args?: Record<string, any>): PostgrestFilterBuilder<any>;
}

export interface SupabaseClientOptions {
  auth?: {
    persistSession?: boolean;
    autoRefreshToken?: boolean;
    detectSessionInUrl?: boolean;
    storage?: any;
    storageKey?: string;
  };
  db?: { schema?: string };
  global?: { headers?: Record<string, string> };
  realtime?: { params?: Record<string, string> };
}

/**
 * Create a Supabase client. The real implementation lives in the optional
 * `@supabase/supabase-js` package (a backend dependency). This shim is only
 * here so the frontend bundle resolves without bundling the SDK. It throws
 * a clear, actionable error if actually invoked — which only happens when a
 * tenant configures `VITE_BACKEND_MODE=supabase` without installing the SDK.
 *
 * To enable the real backend: install `@supabase/supabase-js`, then swap the
 * imports in `client.ts` / `authContext.tsx` back to the package.
 */
export function createClient<DB extends Record<string, any> = Database>(
  _url: string,
  _key: string,
  _options?: SupabaseClientOptions,
): SupabaseClient<DB> {
  throw new Error(
    "Supabase backend is not available in this build. Install @supabase/supabase-js and re-point src/lib/supabase/client.ts + authContext.tsx to the package, or run in memory mode (default).",
  );
}
