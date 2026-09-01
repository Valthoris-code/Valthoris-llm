/**
 * Technical error log of the `ai-chat` Edge Function.
 *
 * The assistant answers a user with one generic sentence when something breaks
 * — that is a UX decision and it stays. What must not stay is the operator
 * being equally in the dark: "an intel source failed" hides whether a key was
 * revoked (HTTP 401), a quota ran out (HTTP 429), an endpoint was retired
 * (HTTP 404) or OpenStreetMap throttled the deployment (HTTP 403).
 *
 * Every failure is therefore written to `governance.error_logs` through the
 * `public.governance_write_error` RPC, which only the service role may execute.
 * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into every Edge
 * Function by the platform and never leave the server.
 *
 * Two rules this module never breaks:
 *   • It never throws. A log write must not turn a partial answer into a
 *     failed one.
 *   • It never records a credential. Only the provider name, the lookup, the
 *     HTTP status and the derived diagnosis are stored — never a URL carrying a
 *     key, never a request body.
 */

// deno-lint-ignore-file no-explicit-any

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface ErrorLogEntry {
  /** Where it happened, e.g. `ai-chat/intel`. */
  source: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  /** Short, stable summary. */
  message: string;
  /** The real technical reason, already free of secrets. */
  detail?: string;
  /** Structured, non-sensitive context (provider, endpoint, HTTP status). */
  context?: Record<string, unknown>;
  /** Correlates the entries produced by a single chat turn. */
  requestId?: string;
}

/** True when this deployment can write to `governance.error_logs`. */
export function isErrorLogConfigured(): boolean {
  return Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));
}

/**
 * Writes one entry. Resolves even when the write failed — the reason is then
 * only in the function logs, which is still better than losing the turn.
 */
export async function writeErrorLog(entry: ErrorLogEntry): Promise<void> {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SERVICE_ROLE_KEY');
  if (!url || !key) return;

  try {
    const response = await fetch(`${url}/rest/v1/rpc/governance_write_error`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_request_id: entry.requestId ?? null,
        p_source: entry.source,
        p_severity: entry.severity ?? 'ERROR',
        p_message: entry.message.slice(0, 500),
        p_detail: (entry.detail ?? '').slice(0, 4_000) || null,
        p_actor_email: null,
        p_context: entry.context ?? {},
      }),
    });
    if (!response.ok) {
      console.error(`[ai-chat] error log write failed with HTTP ${response.status}`);
    }
  } catch (err) {
    console.error('[ai-chat] error log write failed', err instanceof Error ? err.message : err);
  }
}
