/**
 * Supabase browser client — singleton.
 *
 * Uses the public anon key which is safe to ship to the browser.
 * Row-Level Security (RLS) policies on each table enforce access control.
 *
 * Required environment variables (set in .env / deployment config):
 *   VITE_SUPABASE_URL      — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — the project's public anon key
 *
 * The client is created lazily. A missing configuration must never throw while
 * this module is evaluated: that aborts the whole application bundle before
 * React mounts, leaving the user with a blank page instead of the app. Callers
 * that genuinely need Supabase get the error at call time — where it can be
 * caught and surfaced — and the rest of the app keeps working.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Project URL, exported so operational probes can reach the health endpoint. */
export const SUPABASE_URL: string | undefined = supabaseUrl;

/** True when both Supabase environment variables are present. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnon);

export const SUPABASE_CONFIG_ERROR =
  'Missing Supabase configuration. ' +
  'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.';

let client: SupabaseClient | null = null;

/**
 * Return the Supabase client, creating it on first use.
 * Throws when the environment variables are missing.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnon);
  }
  return client;
}

/**
 * Backwards-compatible named export.
 *
 * A proxy keeps `import { supabase } from './supabaseClient'` working unchanged
 * while deferring client creation (and the configuration error) until a
 * property is actually accessed.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const instance = getSupabase();
    const value = Reflect.get(instance as object, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
