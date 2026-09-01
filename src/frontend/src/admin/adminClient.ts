/**
 * Supabase client dedicated to the Valthoris administration.
 *
 * WHY A SECOND CLIENT
 * ───────────────────
 * The normal application authenticates with Internet Identity and never opens
 * a Supabase Auth session (see services/supabaseClient.ts). The administration
 * is the only part of Valthoris that signs in against Supabase Auth, and its
 * session must not be mistaken for — or leak into — the ordinary application
 * state. It therefore uses its own client with its own storage key.
 *
 * The anon key is public by design; it grants nothing on the `governance`
 * schema, which is not exposed through PostgREST and whose RLS policies only
 * answer to an administrator with an AAL2 session. Everything the admin UI
 * reads goes through the `admin-api` Edge Function.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when both Supabase environment variables are present. */
export const isAdminBackendConfigured = Boolean(supabaseUrl && supabaseAnon);

/**
 * The single message shown to a human when anything administrative fails.
 * Technical detail lives in `governance.error_logs`, never in the browser.
 */
export const ADMIN_GENERIC_ERROR =
  'O serviço encontra-se temporariamente indisponível. Tente novamente.';

let client: SupabaseClient | null = null;

/** Returns the administration client, creating it on first use. */
export function getAdminSupabase(): SupabaseClient {
  if (!isAdminBackendConfigured) {
    throw new Error('Administration backend is not configured.');
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnon, {
      auth: {
        // Isolated from any other Supabase session this browser may hold.
        storageKey: 'valthoris.admin.auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Base URL of the administrative Edge Function. */
export function adminApiUrl(path: string): string {
  return `${supabaseUrl}/functions/v1/admin-api${path}`;
}

/** The public anon key, required by the Functions gateway. Never a secret. */
export function adminApiKey(): string {
  return supabaseAnon;
}
