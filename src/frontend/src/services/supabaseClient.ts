/**
 * Supabase browser client — singleton.
 *
 * Uses the public anon key which is safe to ship to the browser.
 * Row-Level Security (RLS) policies on each table enforce access control.
 *
 * Required environment variables (set in .env / deployment config):
 *   VITE_SUPABASE_URL      — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY — the project's public anon key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error(
    'Missing Supabase configuration. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.',
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnon);
