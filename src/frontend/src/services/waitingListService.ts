/**
 * Waiting List Service
 *
 * Persists a waiting-list submission to the Supabase `waiting_list` table.
 * The table must exist before any call is made — see the migration at:
 *   supabase/migrations/20260808000000_create_waiting_list.sql
 *
 * The insert uses the anon key.  Row-Level Security on the table allows
 * any anonymous INSERT while blocking SELECT / UPDATE / DELETE for anon
 * callers — only the service-role (server-side) can read entries.
 */

import { supabase } from './supabaseClient';

export interface WaitingListEntry {
  name: string;
  email: string;
  country: string;
  language: string;
  reason: string;
}

/**
 * Submit a waiting-list entry.
 * Throws when a network or database error occurs.
 * Duplicate emails are silently ignored (ON CONFLICT DO NOTHING).
 */
export async function submitWaitingListEntry(entry: WaitingListEntry): Promise<void> {
  const { error } = await supabase
    .from('waiting_list')
    .insert({
      name:     entry.name.trim(),
      email:    entry.email.trim().toLowerCase(),
      country:  entry.country,
      language: entry.language,
      reason:   entry.reason,
    });

  if (error) {
    throw new Error(error.message);
  }
}
